"""Image sizes of the assets (for the quality check). Read from the file header only and cached by (mtime, size), so
the NAS is not hit for every scan; the first fill runs in the background after a scan."""
from __future__ import annotations

import io
import json
import threading
from pathlib import Path

from PIL import Image

from . import config, logs

log = logs.get("dims")
_lock = threading.Lock()
_cache: dict[str, list] | None = None


def _file() -> Path:
    return config.CACHE_DIR / "dims.json"


def _load() -> dict[str, list]:
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(_file().read_text("utf-8"))
        except (OSError, ValueError):
            _cache = {}
    return _cache


def peek(path: str, mtime: int, size: int) -> tuple[int, int] | None:
    """Known size without any file access."""
    e = _load().get(path)
    return (e[2], e[3]) if e and e[0] == mtime and e[1] == size else None


def measure(path: str, mtime: int, size: int) -> tuple[int, int] | None:
    got = peek(path, mtime, size)
    if got:
        return got
    try:
        with open(path, "rb") as fh:                # the file head is enough for width and height: no full read from the NAS
            head = fh.read(65536)
        try:
            w, h = Image.open(io.BytesIO(head)).size
        except Exception:  # noqa: BLE001 – header longer than 64 KB (large EXIF/ICC) or not an image: open the file itself
            with Image.open(path) as im:
                w, h = im.size
    except Exception:  # noqa: BLE001 – a broken image simply has no size
        return None
    with _lock:
        _load()[path] = [mtime, size, w, h]
    return w, h


def save() -> None:
    try:
        _file().parent.mkdir(parents=True, exist_ok=True)
        with _lock:
            _file().write_text(json.dumps(_load()), "utf-8")
    except OSError:
        pass


def fill(items: list[dict], persist: bool = True) -> int:
    """Measure every existing slot that has no size yet (called in a thread after the scan). Returns how many were measured."""
    n = 0
    for it in items:
        for sl in it["slots"].values():
            if sl.get("exists") and "w" not in sl and sl.get("path"):
                d = measure(sl["path"], sl["mtime"], sl["size"])
                if d:
                    sl["w"], sl["h"] = d
                    n += 1
    if n and persist:
        save()
        log.info("Bildgrößen gelesen: %d", n)
    return n
