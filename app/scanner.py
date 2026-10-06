"""Scans Plex libraries and compares them with the Kometa assets folder."""
from __future__ import annotations

import asyncio
import time
from pathlib import Path

from . import config, kometa, providers
from .plex import Plex, PlexError

STATE: dict = {
    "items": [],
    "scanned_at": None,
    "running": False,
    "error": None,
    "progress": "",
}
_lock = asyncio.Lock()


def _movie_folder(md: dict) -> str:
    for media in md.get("Media", []):
        for part in media.get("Part", []):
            if part.get("file"):
                return kometa.media_folder_name(part["file"], True)
    return ""


def _build_slots(item: dict, index: kometa.AssetIndex, folders: bool) -> None:
    item["slots"] = {}
    item["missing"] = 0
    wanted = [None] if item["type"] == "movie" else [None] + [s["number"] for s in item["seasons"]]
    for season in wanted:
        found = index.find(item["folder"], season)
        item["slots"][kometa.slot_key(season)] = (
            {"exists": True, "mtime": int(found.stat().st_mtime), "path": str(found)} if found else {"exists": False}
        )
        if not found:
            item["missing"] += 1


async def scan() -> None:
    if _lock.locked():
        return
    async with _lock:
        cfg = config.get()
        STATE.update(running=True, error=None, progress="Verbinde mit Plex …")
        try:
            if not cfg["plex"]["url"] or not cfg["plex"]["token"]:
                raise PlexError("Plex ist noch nicht verbunden")
            plex = Plex(cfg["plex"]["url"], cfg["plex"]["token"], cfg["client_id"])
            root = Path(cfg["assets"]["path"])
            folders = cfg["assets"]["asset_folders"]
            index = await asyncio.to_thread(kometa.AssetIndex, root, folders, cfg["assets"]["search_depth"])
            items: list[dict] = []
            try:
                for lib in cfg["libraries"]:
                    if not lib.get("enabled"):
                        continue
                    STATE["progress"] = f"Scanne {lib['title']} …"
                    raw = await plex.items(lib["key"])
                    seasons_by_show: dict[str, list[dict]] = {}
                    locations: dict[str, list[str]] = {}
                    if lib["type"] == "show":
                        for s in await plex.seasons(lib["key"]):
                            if cfg["assets"]["ignore_specials"] and s.get("index") == 0:
                                continue
                            if s.get("index") is None:
                                continue
                            seasons_by_show.setdefault(str(s.get("parentRatingKey")), []).append({
                                "number": int(s["index"]), "title": s.get("title", ""),
                                "rating_key": str(s["ratingKey"]), "thumb": s.get("thumb", ""),
                            })
                        need = [str(m["ratingKey"]) for m in raw if not m.get("Location")]
                        if need:
                            STATE["progress"] = f"Lese Pfade ({lib['title']}) …"
                            locations = await plex.show_locations(need)
                    for md in raw:
                        rk = str(md["ratingKey"])
                        if lib["type"] == "movie":
                            folder = _movie_folder(md)
                        else:
                            locs = [l.get("path") for l in md.get("Location", [])] or locations.get(rk, [])
                            folder = kometa.media_folder_name(locs[0], False) if locs else ""
                        seasons = sorted(seasons_by_show.get(rk, []), key=lambda s: s["number"])
                        item = {
                            "id": rk, "rating_key": rk, "library": lib["key"], "library_title": lib["title"],
                            "type": lib["type"], "title": md.get("title", ""),
                            "original_title": md.get("originalTitle", ""), "year": md.get("year"),
                            "folder": folder, "thumb": md.get("thumb", ""),
                            "ids": providers.ids_from_guids(md.get("Guid", [])),
                            "seasons": seasons, "updated": md.get("updatedAt", 0),
                        }
                        _build_slots(item, index, folders)
                        items.append(item)
            finally:
                await plex.close()
            items.sort(key=lambda i: i["title"].casefold())
            STATE.update(items=items, scanned_at=int(time.time()), progress="")
        except Exception as e:  # noqa: BLE001
            STATE.update(error=str(e) or e.__class__.__name__, progress="")
        finally:
            STATE["running"] = False


def refresh_item(item_id: str) -> None:
    """Re-evaluate assets of one item after an upload (no Plex call)."""
    cfg = config.get()
    item = next((i for i in STATE["items"] if i["id"] == item_id), None)
    if not item:
        return
    index = kometa.AssetIndex(Path(cfg["assets"]["path"]), cfg["assets"]["asset_folders"], cfg["assets"]["search_depth"])
    _build_slots(item, index, cfg["assets"]["asset_folders"])


def summary() -> dict:
    items = STATE["items"]
    total = sum(len(i["slots"]) for i in items)
    missing = sum(i["missing"] for i in items)
    return {
        "items": len(items), "slots": total, "missing": missing,
        "complete_items": sum(1 for i in items if not i["missing"]),
        "scanned_at": STATE["scanned_at"], "running": STATE["running"],
        "error": STATE["error"], "progress": STATE["progress"],
    }


async def loop() -> None:
    await asyncio.sleep(2)
    last = 0.0
    while True:
        cfg = config.get()
        interval = max(0, int(cfg.get("scan_interval_minutes") or 0)) * 60
        if cfg["onboarded"] and interval and time.time() - last >= interval:
            last = time.time()
            await scan()
        await asyncio.sleep(15)
