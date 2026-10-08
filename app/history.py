"""Coverage history per world: one data point per scan (at most one per hour), kept for about a year."""
from __future__ import annotations

import json
import threading
import time

from . import config

_lock = threading.Lock()
MAX_POINTS = 400


def _file():
    return config.CONFIG_DIR / "history.json"


def _read() -> dict:
    try:
        return json.loads(_file().read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def record(world_id: str, items: int, slots: int, missing: int) -> None:
    now = int(time.time())
    with _lock:
        data = _read()
        pts = data.setdefault(world_id, [])
        if pts and now - pts[-1][0] < 3600:
            pts[-1] = [now, items, slots, missing]      # a rescan within the hour replaces the last point
        else:
            pts.append([now, items, slots, missing])
        data[world_id] = pts[-MAX_POINTS:]
        try:
            config.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            _file().write_text(json.dumps(data), "utf-8")
        except OSError:
            pass


def get(world_id: str, days: int = 90) -> list[list[int]]:
    cutoff = time.time() - days * 86400
    return [p for p in _read().get(world_id, []) if p[0] >= cutoff]
