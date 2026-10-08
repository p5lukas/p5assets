"""Trash with undo: replaced or deleted posters (and cleaned-up orphan folders) are kept for 30 days.

Layout: ``<config>/trash/<group id>/meta.json`` plus ``data/<n>`` per stored file or folder. One group = one operation
(e.g. "Poster ersetzt", incl. its Coming-Soon mirror copies), so one click restores everything of it."""
from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path

from . import config, logs

KEEP_DAYS = 30
MAX_BYTES = 2 * 1024**3
log = logs.get("trash")


def _root() -> Path:
    return config.CONFIG_DIR / "trash"


def _size(p: Path) -> int:
    try:
        if p.is_file():
            return p.stat().st_size
        return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
    except OSError:
        return 0


def begin(reason: str, **ctx) -> str:
    """Start a group (one undoable operation). ctx: item_id, world, title, slot …"""
    gid = f"{int(time.time())}-{uuid.uuid4().hex[:6]}"
    d = _root() / gid
    (d / "data").mkdir(parents=True, exist_ok=True)
    meta = {"id": gid, "ts": int(time.time()), "reason": reason, "files": [], "created": [], **ctx}
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")
    return gid


def _load(gid: str) -> dict:
    if not gid.replace("-", "").isalnum():
        raise ValueError("Ungültiger Eintrag")
    p = _root() / gid / "meta.json"
    if not p.is_file():
        raise FileNotFoundError(gid)
    return json.loads(p.read_text("utf-8"))


def _save(meta: dict) -> None:
    (_root() / meta["id"] / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")


def stash(gid: str, path: Path, move: bool, label: str = "") -> None:
    """Keep ``path`` in the group: copied (the caller overwrites it next) or moved (deleted / cleaned up)."""
    meta = _load(gid)
    n = len(meta["files"])
    dst = _root() / gid / "data" / str(n)
    if path.is_dir():
        (shutil.move if move else shutil.copytree)(str(path), str(dst))
    else:
        (shutil.move if move else shutil.copy2)(str(path), str(dst))
    meta["files"].append({"n": n, "orig": str(path), "dir": dst.is_dir(), "label": label, "size": _size(dst)})
    _save(meta)


def note_created(gid: str, path: Path) -> None:
    """A file that this operation wrote (it is removed again when the operation is undone)."""
    meta = _load(gid)
    if str(path) not in meta["created"]:
        meta["created"].append(str(path))
        _save(meta)


def discard_if_empty(gid: str) -> None:
    try:
        m = _load(gid)
        if not m["files"] and not m.get("created"):
            shutil.rmtree(_root() / gid, ignore_errors=True)
    except (FileNotFoundError, ValueError):
        pass


def listing(everything: bool = False) -> list[dict]:
    """Groups for the trash list. A group that only created new files (nothing was replaced) has nothing to bring back: it
    stays reachable for the "Rückgängig" notice right after the action, but is not listed (``everything`` includes it)."""
    out = []
    if _root().is_dir():
        for d in _root().iterdir():
            try:
                m = json.loads((d / "meta.json").read_text("utf-8"))
            except (OSError, ValueError):
                continue
            if not m.get("files") and not (everything and m.get("created")):
                continue
            m["size"] = sum(f.get("size", 0) for f in m["files"])
            m["expires"] = m["ts"] + KEEP_DAYS * 86400
            out.append(m)
    return sorted(out, key=lambda m: -m["ts"])


def restore(gid: str) -> dict:
    """Put everything of the group back. Whatever is there now is kept in a new group first (so a restore can be undone, too)."""
    meta = _load(gid)
    back = begin("restore", item_id=meta.get("item_id"), world=meta.get("world"), title=meta.get("title"), slot=meta.get("slot"), type=meta.get("type"))
    origs = {f["orig"] for f in meta["files"]}
    for c in meta.get("created", []):          # written by the operation, not part of the old state: take it away again
        p = Path(c)
        if c not in origs and p.exists():
            stash(back, p, move=True, label="vor Wiederherstellung")
    for f in meta["files"]:
        src = _root() / gid / "data" / str(f["n"])
        dst = Path(f["orig"])
        if not src.exists():
            continue
        if dst.exists():
            if dst.is_dir() != f["dir"]:
                raise ValueError(f"{dst.name}: am Ziel liegt etwas anderes")
            stash(back, dst, move=True, label="vor Wiederherstellung")
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
    shutil.rmtree(_root() / gid, ignore_errors=True)
    discard_if_empty(back)
    log.info("Wiederhergestellt: %s (%s)", meta.get("title") or gid, meta.get("reason"))
    return meta


def remove(gid: str) -> None:
    _load(gid)
    shutil.rmtree(_root() / gid, ignore_errors=True)


def empty() -> int:
    n = len(listing())
    shutil.rmtree(_root(), ignore_errors=True)
    return n


def purge() -> None:
    """Older than 30 days go; the whole trash stays below the size limit (oldest first)."""
    groups = listing(everything=True)
    now = time.time()
    for g in groups:
        if g["expires"] < now:
            shutil.rmtree(_root() / g["id"], ignore_errors=True)
    groups = listing(everything=True)
    total = sum(g["size"] for g in groups)
    for g in sorted(groups, key=lambda m: m["ts"]):
        if total <= MAX_BYTES:
            break
        shutil.rmtree(_root() / g["id"], ignore_errors=True)
        total -= g["size"]
        log.info("Papierkorb: %s entfernt (Größenlimit)", g.get("title") or g["id"])
