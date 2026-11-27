"""History of poster changes ("Verlauf"): every time a poster is set, replaced or deleted, one line with a small picture of the new version.

``<config>/changes.jsonl`` holds the lines, ``<config>/changes/<id>.jpg`` the pictures (small copies of the thumbnails). The old version of a replaced
poster is in the trash (30 days), so "restore" in the history works as long as the trash still has it."""
from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from pathlib import Path

from . import config, logs, thumbs, trash

MAX_ENTRIES = 5000
SOURCES = ("upload", "builder", "online", "plex", "import", "copy", "all", "delete", "restore")
log = logs.get("changes")
_lock = threading.Lock()


def _file() -> Path:
    return config.CONFIG_DIR / "changes.jsonl"


def _dir() -> Path:
    return config.CONFIG_DIR / "changes"


def record(*, source: str, world: str | None, item_id: str | None, title: str, slot: str, type_: str, gid: str | None = None, path: Path | str | None = None) -> None:
    """Add one line. Never raises: the history must not break saving a poster."""
    try:
        eid = f"{int(time.time())}-{uuid.uuid4().hex[:6]}"
        has_pic = False
        if path and Path(path).is_file():
            try:
                _dir().mkdir(parents=True, exist_ok=True)
                small = thumbs.get(Path(path))
                if small != Path(path):                           # thumbs.get falls back to the original when it cannot make a thumbnail: no multi-MB copies
                    shutil.copyfile(small, _dir() / f"{eid}.jpg")
                    has_pic = True
            except OSError:
                pass
        line = {"id": eid, "ts": int(time.time()), "source": source if source in SOURCES else "upload", "world": world, "item_id": item_id,
                "title": title, "slot": slot, "type": type_, "gid": gid, "pic": has_pic}
        with _lock:
            _file().parent.mkdir(parents=True, exist_ok=True)
            with _file().open("a", encoding="utf-8") as f:
                f.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception as e:  # noqa: BLE001
        log.warning("History entry not written: %s", e)


def _all() -> list[dict]:
    try:
        lines = _file().read_text("utf-8").splitlines()
    except OSError:
        return []
    out = []
    for ln in lines:
        try:
            out.append(json.loads(ln))
        except ValueError:
            continue
    return out


def listing(world: str = "", q: str = "", source: str = "", limit: int = 60, offset: int = 0) -> dict:
    q = q.strip().casefold()
    rows = [e for e in reversed(_all()) if (not world or e.get("world") == world) and (not source or e.get("source") == source)
            and (not q or q in (e.get("title") or "").casefold())]
    page = rows[offset:offset + limit]
    for e in page:
        e["can_restore"], e["before"] = False, None
        if e.get("gid"):
            try:
                meta = json.loads((trash._root() / e["gid"] / "meta.json").read_text("utf-8"))
            except (OSError, ValueError):
                continue
            files = [f for f in meta.get("files", []) if not f.get("dir")]
            e["can_restore"] = bool(files) or bool(meta.get("created"))
            e["before"] = files[0]["n"] if files else None          # number of the old picture in the trash (None = there was none before)
    return {"entries": page, "total": len(rows)}


def picture(eid: str) -> Path | None:
    if not eid.replace("-", "").isalnum():
        return None
    p = _dir() / f"{eid}.jpg"
    return p if p.is_file() else None


def prune() -> None:
    """Keep the newest MAX_ENTRIES lines and drop the pictures of the others."""
    with _lock:
        rows = _all()
        if len(rows) <= MAX_ENTRIES:
            return
        keep = rows[-MAX_ENTRIES:]
        tmp = _file().with_suffix(".tmp")
        tmp.write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in keep) + "\n", "utf-8")
        tmp.replace(_file())
        wanted = {f"{e['id']}.jpg" for e in keep}
        for p in _dir().glob("*.jpg"):
            if p.name not in wanted:
                p.unlink(missing_ok=True)
