"""Posters of Plex collections as Kometa assets: ``<collections folder>/<name of the collection>/poster.jpg``.

Kometa names the folder exactly like the collection in Plex. The collections folder of a world is set in the settings, or found by itself:
a folder called "Collections" inside the world's assets folder."""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

from . import config, kometa, trash, uploads
from .i18n import tr


def root_for(world: dict) -> Path | None:
    """The collections folder of a world (it must exist), or None."""
    base = Path(world.get("assets_path") or "")
    given = (world.get("collections_dir") or "").strip()
    if given:
        p = Path(given)
        p = p if p.is_absolute() else base / p
        return p if p.is_dir() else None
    try:
        for child in base.iterdir():
            if child.is_dir() and child.name.casefold() == "collections":
                return child
    except OSError:
        pass
    return None


def valid_name(name: str) -> bool:
    """A collection name that can be one folder name (no path parts)."""
    return bool(name.strip()) and name not in (".", "..") and not re.search(r"[/\\\x00-\x1f]", name) and len(name) <= 200


def folder_of(root: Path, name: str) -> Path | None:
    """The folder of a collection: the name, exactly like in Plex (upper / lower case does not matter)."""
    try:
        with os.scandir(root) as it:
            for e in it:
                if e.is_dir() and e.name.casefold() == name.casefold():
                    return Path(e.path)
    except OSError:
        pass
    return None


def poster_of(folder: Path) -> Path | None:
    try:
        for e in sorted(folder.iterdir(), key=lambda x: x.name.casefold()):
            if e.is_file() and e.stem.casefold() == "poster" and e.suffix.lower() in kometa.IMAGE_EXTS:
                return e
    except OSError:
        pass
    return None


def state(world: dict, name: str) -> dict | None:
    """None = this world has no collections folder; else whether the folder and the poster exist ("v" = file date for the picture's address)."""
    root = root_for(world)
    if root is None:
        return None
    folder = folder_of(root, name)
    poster = poster_of(folder) if folder else None
    return {"folder": bool(folder), "exists": bool(poster), "v": int(poster.stat().st_mtime) if poster else 0}


def write_poster(world: dict, name: str, data: bytes, create: bool, undo: dict) -> tuple[Path | None, str]:
    """Store the poster of a collection. Returns (path, reason): path None with reason "folder" when the folder is missing and may not be created yet."""
    root = root_for(world)
    if root is None:
        raise ValueError(tr("Für diese Welt ist kein Collection-Ordner bekannt (Einstellungen → Welten)"))
    if not valid_name(name):
        raise ValueError(tr("Der Name der Collection lässt sich nicht als Ordnername verwenden"))
    folder = folder_of(root, name)
    if folder is None:
        if not create:
            return None, "folder"
        folder = root / name
    body, ext = uploads.normalize_image(data, config.get()["assets"]["convert_to_jpg"])
    gid = trash.begin("replace", item_id=None, world=world.get("id"), title=name, slot="poster", type="collection")
    undo["gid"] = gid
    folder.mkdir(parents=True, exist_ok=True)
    kept = set()
    for cand in [poster_of(folder), *(folder / f"poster{e}" for e in kometa.IMAGE_EXTS)]:
        if cand and cand.is_file() and cand not in kept:
            kept.add(cand)
            trash.stash(gid, cand, move=False, label="poster")
    target = folder / f"poster{ext}"
    trash.note_created(gid, target)
    tmp = target.with_name(f".{target.name}.{uuid.uuid4().hex[:6]}.tmp")
    tmp.write_bytes(body)
    tmp.replace(target)
    for e in kometa.IMAGE_EXTS:                                       # another spelling of the same poster is replaced, not kept beside it
        other = folder / f"poster{e}"
        if other != target and other.exists():
            other.unlink()
    return target, ""
