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


_cache: dict = {"sig": None, "data": {"marks": {}}, "by_item": {}}      # the file is read again only when it changed (lists ask for the marks of every title)


def _sig():
    try:
        st = _file().stat()
        return (str(_file()), st.st_mtime_ns, st.st_size)
    except OSError:
        return (str(_file()), None, 0)


def _index(data: dict) -> dict:
    by: dict[str, list] = {}
    for m in data["marks"].values():
        by.setdefault(m["item_id"], []).append(m)
    return by


def _load() -> dict:
    sig = _sig()
    if _cache["sig"] != sig:
        try:
            data = json.loads(_file().read_text("utf-8"))
        except (OSError, ValueError):
            data = {}
        data = data if isinstance(data.get("marks"), dict) else {"marks": {}}
        _cache.update(sig=sig, data=data, by_item=_index(data))
    return _cache["data"]


def _save(data: dict) -> None:
    f = _file()
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    os.replace(tmp, f)
    _cache.update(sig=_sig(), data=data, by_item=_index(data))


def version():
    """Changes whenever a mark changes (for caches of the lists)."""
    return _sig()


def for_item(item_id: str) -> list[dict]:
    with _lock:
        _load()
        return _cache["by_item"].get(item_id, [])


def key(item_id: str, slot: str) -> str:
    return f"{item_id}|{slot}"


def marks() -> dict:
    with _lock:
        return dict(_load()["marks"])           # a copy: marks change in worker threads while lists are walked in the event loop


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


def touch(item_id: str, slot: str) -> None:
    """A look was tried (and failed): count it as checked, so failing marks do not hold up the others."""
    with _lock:
        data = _load()
        m = data["marks"].get(key(item_id, slot))
        if m:
            m["checked"] = int(time.time())
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
