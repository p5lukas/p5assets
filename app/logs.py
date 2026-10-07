"""Application log: rotating file in /config/logs plus console, secrets are redacted. Also the read API used by the UI."""
from __future__ import annotations

import logging
import re
import sys
from collections import deque
from logging.handlers import RotatingFileHandler
from pathlib import Path

from . import config

LOG_DIR = config.CONFIG_DIR / "logs"
LOG_NAME = "p5assets.log"
FORMAT = "[%(asctime)s] [%(levelname)s] %(name)s | %(message)s"
DATEFMT = "%Y-%m-%d %H:%M:%S"
_LINE = re.compile(r"^\[(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(?P<level>[A-Z]+)\] (?P<src>[^|]*?) \| (?P<msg>.*)$")
_FILE_OK = re.compile(r"^p5assets\.log(\.\d+)?$")


class AlertCounter(logging.Handler):
    """Remembers warnings/errors (in memory, since start) so the UI can show "n new" without parsing the log file."""

    def __init__(self) -> None:
        super().__init__(logging.WARNING)
        self.seq = 0
        self.events: deque[tuple[int, bool]] = deque(maxlen=1000)   # (sequence number, is_error)

    def emit(self, record: logging.LogRecord) -> None:
        self.seq += 1
        self.events.append((self.seq, record.levelno >= logging.ERROR))


alerts = AlertCounter()


def alert_state(since: int = 0) -> dict:
    """Warnings/errors newer than ``since`` (a sequence number the browser remembers from its last visit of the log page)."""
    if since > alerts.seq:   # app restarted since the browser last looked
        since = 0
    new = [e for s, e in alerts.events if s > since]
    errors = sum(1 for e in new if e)
    return {"seq": alerts.seq, "errors": errors, "warnings": len(new) - errors}


class Redactor(logging.Filter):
    """Never let tokens / API keys end up in the log."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            cfg = config.get()
            secrets = [cfg["plex"]["token"], cfg["apis"]["tmdb"], cfg["apis"]["tvdb"], cfg["apis"]["tvdb_pin"], cfg["apis"]["fanart"],
                       *[a.get("api_key", "") for a in cfg["arr"]]]
            msg = record.getMessage()
            for s in secrets:
                if s and len(s) >= 4:
                    msg = msg.replace(s, "***")
            msg = re.sub(r"(X-Plex-Token=|api_key=|apikey=)[^&\s]+", r"\1***", msg, flags=re.I)
            record.msg, record.args = msg, ()
        except Exception:  # noqa: BLE001 – logging must never break the app
            pass
        return True


def setup() -> None:
    root = logging.getLogger("p5assets")
    if root.handlers:
        return
    root.setLevel(logging.DEBUG)
    root.propagate = False
    fmt = logging.Formatter(FORMAT, DATEFMT)
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        fh = RotatingFileHandler(LOG_DIR / LOG_NAME, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        fh.setFormatter(fmt)
        root.addHandler(fh)
    except OSError:
        pass  # read-only config dir: console only
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    root.addHandler(ch)
    root.addHandler(alerts)
    root.addFilter(Redactor())
    for h in root.handlers:
        h.addFilter(Redactor())


def get(name: str) -> logging.Logger:
    return logging.getLogger(f"p5assets.{name}")


# ------------------------------------------------------------ read API ---

def files() -> list[dict]:
    out = []
    if LOG_DIR.is_dir():
        for p in sorted(LOG_DIR.iterdir()):
            if _FILE_OK.match(p.name):
                st = p.stat()
                out.append({"name": p.name, "size": st.st_size, "mtime": int(st.st_mtime)})
    return out or [{"name": LOG_NAME, "size": 0, "mtime": 0}]


def path_of(name: str) -> Path:
    if not _FILE_OK.match(name or ""):
        raise ValueError("Ungültige Logdatei")
    return LOG_DIR / name


def parse(text: str) -> list[dict]:
    entries: list[dict] = []
    for line in text.splitlines():
        m = _LINE.match(line)
        if m:
            entries.append({"ts": m["ts"], "level": m["level"], "src": m["src"].strip(), "msg": m["msg"]})
        elif entries and line.strip():
            entries[-1]["msg"] += "\n" + line  # traceback / continuation
        elif line.strip():
            entries.append({"ts": "", "level": "INFO", "src": "", "msg": line})
    return entries


def read(name: str, tail: int = 1000, offset: int | None = None) -> dict:
    """tail=N: last N entries (offset=None). With an offset only the new data since then is returned (live mode)."""
    p = path_of(name)
    if not p.is_file():
        return {"entries": [], "offset": 0, "reset": True, "total": 0, "size": 0}
    size = p.stat().st_size
    with p.open("rb") as f:
        if offset is not None and 0 <= offset <= size:
            f.seek(offset)
            entries = parse(f.read().decode("utf-8", "replace"))
            return {"entries": entries, "offset": size, "reset": False, "total": len(entries), "size": size}
        # initial load (or the file was rotated / cleared): read a generous tail and keep the last N entries
        limit = 8_000_000 if tail > 5000 else 1_500_000
        f.seek(max(0, size - limit))
        data = f.read().decode("utf-8", "replace")
        if size > limit:
            data = data.split("\n", 1)[-1]
    entries = parse(data)
    return {"entries": entries[-tail:], "offset": size, "reset": True, "total": len(entries), "size": size}


def clear(name: str) -> None:
    p = path_of(name)
    if not p.exists():
        return
    if name == LOG_NAME:
        p.write_text("", "utf-8")  # keep the file: the handler holds it open
    else:
        p.unlink()
