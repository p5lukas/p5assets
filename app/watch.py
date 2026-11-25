""""Später suchen": titles (or tiles) the user marked because a better poster is expected, e.g. a textless one that is not there yet.

``<config>/watch.json`` keeps, per marked tile, which pictures were known when it was marked (or last looked at) and which textless ones came
later ("new"). The check only reports; nothing is ever taken over by itself."""
from __future__ import annotations

import json
import os
import threading
import time

from . import config, logs

log = logs.get("watch")
_lock = threading.Lock()
CHECK_EVERY = 24 * 3600          # a marked tile is looked at once a day at most
MAX_MARKS = 300


def _file():
    return config.CONFIG_DIR / "watch.json"


def _load() -> dict:
    try:
        data = json.loads(_file().read_text("utf-8"))
    except (OSError, ValueError):
        data = {}
    return data if isinstance(data.get("marks"), dict) else {"marks": {}}


def _save(data: dict) -> None:
    f = _file()
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    os.replace(tmp, f)


def key(item_id: str, slot: str) -> str:
    return f"{item_id}|{slot}"


def marks() -> dict:
    with _lock:
        return _load()["marks"]


def mark(item_id: str, slot: str, seen: list[str]) -> bool:
    with _lock:
        data = _load()
        k = key(item_id, slot)
        if k not in data["marks"] and len(data["marks"]) >= MAX_MARKS:
            return False
        data["marks"][k] = {"item_id": item_id, "slot": slot, "added": int(time.time()), "checked": int(time.time()), "seen": seen[:500], "new": []}
        _save(data)
    return True


def unmark(item_id: str, slot: str | None = None) -> None:
    """Take the mark away (of one tile, or of every tile of the title)."""
    with _lock:
        data = _load()
        gone = [k for k, m in data["marks"].items() if m["item_id"] == item_id and (slot is None or m["slot"] == slot)]
        for k in gone:
            del data["marks"][k]
        if gone:
            _save(data)


def dismiss(item_id: str, slot: str) -> None:
    """The user has looked at the new ones: they count as known now."""
    with _lock:
        data = _load()
        m = data["marks"].get(key(item_id, slot))
        if m:
            m["seen"] = list(dict.fromkeys([*m["seen"], *(n["url"] for n in m["new"])]))[:500]
            m["new"] = []
            _save(data)


def due(now: float | None = None) -> list[dict]:
    now = now or time.time()
    return [m for m in marks().values() if now - m.get("checked", 0) >= CHECK_EVERY]


def record_check(item_id: str, slot: str, found: list[dict]) -> list[dict]:
    """Store the result of a look: the textless pictures not known before become "new". Returns the ones that are new now."""
    with _lock:
        data = _load()
        m = data["marks"].get(key(item_id, slot))
        if not m:
            return []
        known = set(m["seen"]) | {n["url"] for n in m["new"]}
        fresh = [f for f in found if f["url"] not in known]
        m["new"] = (m["new"] + fresh)[-30:]
        m["checked"] = int(time.time())
        _save(data)
    return fresh


def textless(images: list[dict]) -> list[dict]:
    return [{"url": i["url"], "preview": i.get("preview") or i["url"], "source": i.get("source", "")} for i in images if i.get("lang") == "xx" and i.get("url")]
