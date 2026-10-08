"""Receiving images (single files, folders, zips) and writing Kometa-conform assets."""
from __future__ import annotations

import io
import shutil
import time
import uuid
import zipfile
from pathlib import Path, PurePosixPath

from PIL import Image, ImageOps

from . import config, kometa, trash

MAX_ZIP_ENTRIES = 5000
MAX_ZIP_BYTES = 2 * 1024**3
MAX_IMAGE_PIXELS = 120_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def safe_rel(name: str) -> str:
    parts = [p for p in PurePosixPath(name.replace("\\", "/")).parts if p not in ("", ".", "..", "/")]
    return "/".join(parts)


def _skip(rel: str) -> bool:
    return any(p.startswith(".") or p == "__MACOSX" for p in rel.split("/"))


def normalize_image(data: bytes, convert_to_jpg: bool) -> tuple[bytes, str]:
    """Validate the image and return (bytes, extension). PNG/JPG are kept as they are."""
    try:
        img = Image.open(io.BytesIO(data))
        fmt = (img.format or "").upper()
        img.verify()
    except Exception as e:  # noqa: BLE001
        raise ValueError("Keine gültige Bilddatei") from e
    if fmt == "JPEG":
        return data, ".jpg"
    if fmt == "PNG" and not convert_to_jpg:
        return data, ".png"
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    buf = io.BytesIO()
    if fmt == "PNG" or convert_to_jpg or img.mode in ("RGBA", "LA", "P") and fmt != "WEBP":
        img = img.convert("RGB")
        img.save(buf, "JPEG", quality=95)
        return buf.getvalue(), ".jpg"
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.save(buf, "JPEG", quality=95)
    return buf.getvalue(), ".jpg"


def write_assets(item: dict, slots: list[str], data: bytes, undo: dict | None = None) -> list[Path]:
    """Store one image for several slots of a title (poster, Season00 …) in the assets folder of the item's
    world. Every file is named Kometa-conform; previous files of the same slot are replaced. Coming-Soon
    placeholders ({edition-Coming Soon}) are mirrored into the real Radarr/Sonarr folder as well. Returns the primary files."""
    cfg = config.get()
    acfg = cfg["assets"]
    root = Path(item["assets_path"])
    if not item.get("folder"):
        raise ValueError("Für diesen Titel ist kein Ordnername bekannt")
    if not root.is_dir():
        raise ValueError(f"Assets-Ordner {root} existiert nicht (im Container gemountet?)")
    body, ext = normalize_image(data, acfg["convert_to_jpg"])
    depth = item.get("search_depth", 3)
    index = kometa.get_index(root, acfg["asset_folders"], depth)
    from . import scanner  # late import: scanner does not import uploads, keeps the module graph simple
    if not index.knows(item["folder"]):
        # new title (or a folder created outside p5assets since the last scan): look again once before creating one
        index = kometa.get_index(root, acfg["asset_folders"], depth, fresh=True)
    # the "where do new folders go" heuristic walks all titles – only needed for a title without a folder
    base = index.base_dir(item["folder"], root) if index.knows(item["folder"]) else (scanner.preferred_base(item) or root)

    # everything this call replaces is kept in the trash for 30 days: one group = one undoable operation
    gid = trash.begin("replace", item_id=item.get("id"), world=item.get("world"), title=item.get("title"), slot=", ".join(slots), type=item.get("type"))
    if undo is not None:
        undo["gid"] = gid

    def put(folder: str, folder_base: Path) -> list[Path]:
        existing = index.slots(folder)
        out: list[Path] = []
        for slot in slots:
            season = kometa.parse_slot_key(slot)
            target = kometa.asset_target(folder_base, folder, season, acfg["asset_folders"], ext)
            target.parent.mkdir(parents=True, exist_ok=True)
            kept: set[Path] = set()
            for cand in [existing.get(slot), *(target.with_suffix(e) for e in kometa.IMAGE_EXTS)]:
                if cand and cand.is_file() and cand not in kept:
                    kept.add(cand); trash.stash(gid, cand, move=False, label=slot)
            trash.note_created(gid, target)
            tmp = target.with_name(f".{target.name}.{uuid.uuid4().hex[:6]}.tmp")
            tmp.write_bytes(body)
            tmp.replace(target)
            # remove the previous file of this slot (other extension / spelling)
            old = existing.get(slot)
            if old and old != target and old.exists():
                old.unlink()
            for ext2 in kometa.IMAGE_EXTS:
                other = target.with_suffix(ext2)
                if other != target and other.exists() and other.stem == target.stem:
                    other.unlink()
            index.note_written(folder, target)
            out.append(target)
        return out

    written = put(item["folder"], base)
    for mirror in item.get("mirror_folders") or []:
        put(mirror, index.base_dir(mirror, base))  # next to the primary folder unless it already exists elsewhere
    return written


def mirror_files(item: dict, slot: str) -> list[Path]:
    """Existing files of a slot in the mirror folders (used to keep deletes in sync)."""
    cfg = config.get()
    root = Path(item["assets_path"])
    index = kometa.get_index(root, cfg["assets"]["asset_folders"], item.get("search_depth", 3))
    return [p for m in item.get("mirror_folders") or [] if (p := index.slots(m).get(slot))]


def write_asset(item: dict, slot: str, data: bytes) -> Path:
    return write_assets(item, [slot], data)[0]


# ------------------------------------------------------------- staging ---

def _session_dir(sid: str) -> Path:
    if not sid.isalnum():
        raise ValueError("Ungültige Session")
    return config.STAGING_DIR / sid


def cleanup_staging(max_age: int = 6 * 3600) -> None:
    if not config.STAGING_DIR.is_dir():
        return
    for d in config.STAGING_DIR.iterdir():
        try:
            if time.time() - d.stat().st_mtime > max_age:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass


def new_session() -> str:
    cleanup_staging()
    sid = uuid.uuid4().hex[:16]
    _session_dir(sid).mkdir(parents=True, exist_ok=True)
    return sid


def stage_file(sid: str, filename: str, data: bytes) -> list[dict]:
    """Stage a single file or expand a zip. Returns entry dicts."""
    base = _session_dir(sid)
    rel = safe_rel(filename)
    entries: list[dict] = []
    if not rel:
        return entries
    if rel.lower().endswith(".zip"):
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as e:
            raise ValueError(f"{rel}: keine gültige ZIP-Datei") from e
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > MAX_ZIP_ENTRIES or sum(i.file_size for i in infos) > MAX_ZIP_BYTES:
            raise ValueError(f"{rel}: ZIP ist zu groß")
        for info in infos:
            inner = safe_rel(info.filename)
            if not inner or _skip(inner) or Path(inner).suffix.lower() not in kometa.UPLOAD_EXTS:
                continue
            entries.append(_store(base, inner, zf.read(info)))
        return entries
    if _skip(rel) or Path(rel).suffix.lower() not in kometa.UPLOAD_EXTS:
        return entries
    entries.append(_store(base, rel, data))
    return entries


def _store(base: Path, rel: str, data: bytes) -> dict:
    fid = uuid.uuid4().hex[:12]
    (base / f"{fid}.bin").write_bytes(data)
    kind, season = kometa.guess_slot(rel)
    title, year = kometa.guess_title(rel)
    return {"id": fid, "name": rel, "kind": kind, "season": season, "title": title, "year": year, "size": len(data)}


def staged_bytes(sid: str, fid: str) -> bytes:
    if not fid.isalnum():
        raise ValueError("Ungültige Datei")
    p = _session_dir(sid) / f"{fid}.bin"
    if not p.is_file():
        raise FileNotFoundError(fid)
    return p.read_bytes()


def drop_session(sid: str) -> None:
    shutil.rmtree(_session_dir(sid), ignore_errors=True)
