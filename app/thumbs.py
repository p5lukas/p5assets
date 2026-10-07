"""Small preview images for lists and tiles.

The dashboard shows hundreds of posters at once; the originals are often 1-3 MB each. Lists therefore use a small
JPEG (default 360 px wide) that is created once and kept in ``/config/cache/thumbs``. Preview dialog and downloads
always use the original file."""
from __future__ import annotations

import hashlib
import io
import os
import threading
import time
from pathlib import Path

from PIL import Image, ImageOps

from . import config, logs

WIDTH = 360
QUALITY = 74
MAX_CACHE_BYTES = 600 * 1024 * 1024
log = logs.get("thumbs")
_lock = threading.Lock()


def _dir() -> Path:
    return config.CACHE_DIR / "thumbs"


def thumb_path(src: Path, width: int = WIDTH) -> Path:
    st = src.stat()
    key = hashlib.sha1(f"{src}|{st.st_mtime_ns}|{st.st_size}|{width}|{QUALITY}".encode()).hexdigest()
    return _dir() / key[:2] / f"{key}.jpg"


def get(src: Path, width: int = WIDTH) -> Path:
    """Path of the cached preview (created on first use). Falls back to the original if it cannot be read."""
    out = thumb_path(src, width)
    if out.is_file():
        return out
    with _lock:  # a page load asks for many at once: one at a time keeps CPU and RAM low
        if out.is_file():
            return out
        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(src) as im:
                im.draft("RGB", (width * 2, width * 3))  # JPEG: decode at reduced size, much faster
                im = ImageOps.exif_transpose(im)
                if im.mode not in ("RGB", "L"):
                    bg = Image.new("RGB", im.size, (0, 0, 0))
                    bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
                    im = bg
                if im.width > width:
                    im = im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS)
                tmp = out.with_name(out.name + f".{os.getpid()}.tmp")
                im.convert("RGB").save(tmp, "JPEG", quality=QUALITY, optimize=True)
                tmp.replace(out)
        except Exception as e:  # noqa: BLE001
            log.warning("Vorschaubild für %s nicht möglich (%s) – Original wird verwendet", src.name, e)
            return src
    return out


def prune(max_bytes: int = MAX_CACHE_BYTES) -> None:
    """Keep the cache below a size limit: the least recently created files go first (old versions of replaced posters too)."""
    root = _dir()
    if not root.is_dir():
        return
    files = []
    for p in root.rglob("*.jpg"):
        try:
            st = p.stat()
            files.append((st.st_mtime, st.st_size, p))
        except OSError:
            pass
    total = sum(f[1] for f in files)
    if total <= max_bytes:
        return
    for _, size, p in sorted(files):
        try:
            p.unlink()
        except OSError:
            continue
        total -= size
        if total <= max_bytes * 0.8:
            break
    log.info("Vorschaubild-Cache bereinigt (%.0f MB)", total / 1048576)
