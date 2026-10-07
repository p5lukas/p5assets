"""Scans Plex / Sonarr / Radarr per world and compares them with the Kometa assets folders."""
from __future__ import annotations

import asyncio
import hashlib
from collections import Counter
import time
from pathlib import Path

from . import arr, config, kometa, logs, providers, thumbs
from .plex import Plex, PlexError

STATE: dict = {
    "items": [],
    "scanned_at": None,
    "running": False,
    "error": None,
    "warnings": [],
    "progress": "",
}
_lock = asyncio.Lock()
log = logs.get("scan")


def _movie_folder(md: dict) -> str:
    for media in md.get("Media", []):
        for part in media.get("Part", []):
            if part.get("file"):
                return kometa.media_folder_name(part["file"], True)
    return ""


def _item_id(world: str, kind: str, folder: str, fallback: str) -> str:
    base = f"{kind}|{folder.casefold()}" if folder else f"x|{fallback}"
    return f"{world}-{hashlib.sha1(base.encode()).hexdigest()[:10]}"


def _rel(p: Path, root: Path) -> str:
    try:
        return str(p.relative_to(root))
    except ValueError:
        return str(p)


def _slot_info(f: Path, root: Path) -> dict:
    st = f.stat()
    return {"exists": True, "mtime": int(st.st_mtime), "size": st.st_size, "file": _rel(f, root), "path": str(f)}


def build_slots(item: dict, index: kometa.AssetIndex, ignore_specials: bool) -> None:
    """Compute slot state. Known slots count towards "missing"; further existing seasons are extras."""
    files = index.slots(item["folder"])
    known = ["poster"]
    if item["type"] == "show":
        for s in item["seasons"]:
            if ignore_specials and s["number"] == 0:
                continue
            known.append(kometa.slot_key(s["number"]))
    slots: dict = {}
    for key in known:
        f = files.get(key)
        if f:
            slots[key] = _slot_info(f, index.root)
        else:
            season = None if key == "poster" else int(key.split("-")[1])
            thumb = item["thumb"] if season is None else next((x["thumb"] for x in item["seasons"] if x["number"] == season), "")
            slots[key] = {"exists": False, "plex_thumb": bool(thumb)}
    if item["type"] == "show":
        for key, f in files.items():
            if key not in slots:
                slots[key] = {**_slot_info(f, index.root), "extra": True}
    # copies in the mirror folders (Coming-Soon placeholders), shown in the preview
    for mirror in item.get("mirror_folders") or []:
        for key, f in index.slots(mirror).items():
            if key in slots and slots[key].get("exists"):
                slots[key].setdefault("mirrors", []).append(_rel(f, index.root))
    item["slots"] = slots
    item["dupes"] = [_rel(p, index.root) for p in index.duplicates(item["folder"])] if item["folder"] else []
    item["missing"] = sum(1 for k in known if not slots[k]["exists"])


def _ids_keys(item: dict) -> list[tuple]:
    return [(item["type"], k, v) for k, v in item["ids"].items() if v]


async def _plex_items(cfg: dict, world: dict, plex: Plex, warnings: list[str]) -> list[dict]:
    items: list[dict] = []
    for lib in cfg["libraries"]:
        if not lib.get("enabled") or lib.get("world") != world["id"]:
            continue
        STATE["progress"] = f"{world['name']}: scanne {lib['title']} …"
        raw = await plex.items(lib["key"])
        seasons_by_show: dict[str, list[dict]] = {}
        locations: dict[str, list[str]] = {}
        if lib["type"] == "show":
            for s in await plex.seasons(lib["key"]):
                if s.get("index") is None:
                    continue
                seasons_by_show.setdefault(str(s.get("parentRatingKey")), []).append({
                    "number": int(s["index"]), "title": s.get("title", ""),
                    "rating_key": str(s["ratingKey"]), "thumb": s.get("thumb", ""),
                })
            need = [str(m["ratingKey"]) for m in raw if not m.get("Location")]
            if need:
                STATE["progress"] = f"{world['name']}: lese Pfade ({lib['title']}) …"
                locations = await plex.show_locations(need)
        for md in raw:
            rk = str(md["ratingKey"])
            if lib["type"] == "movie":
                folder = _movie_folder(md)
            else:
                locs = [l.get("path") for l in md.get("Location", [])] or locations.get(rk, [])
                folder = kometa.media_folder_name(locs[0], False) if locs else ""
            items.append({
                "rating_key": rk, "library_title": lib["title"], "type": lib["type"],
                "title": md.get("title", ""), "original_title": md.get("originalTitle", ""),
                "year": md.get("year"), "folder": folder, "thumb": md.get("thumb", ""),
                "ids": providers.ids_from_guids(md.get("Guid", [])),
                "seasons": sorted(seasons_by_show.get(rk, []), key=lambda s: s["number"]),
                "in_plex": True, "sources": ["Plex"], "custom": False,
            })
    return items


async def _arr_items(cfg: dict, world: dict, warnings: list[str]) -> list[dict]:
    out: list[dict] = []
    for inst in cfg["arr"]:
        if inst.get("world") != world["id"] or not inst.get("url") or not inst.get("api_key"):
            continue
        STATE["progress"] = f"{world['name']}: lese {inst['name']} …"
        try:
            entries = await arr.fetch(inst)
            if inst.get("hide_unmonitored"):
                hidden = sum(1 for e in entries if not e["monitored"])
                entries = [e for e in entries if e["monitored"]]
                log.info("%s: %d nicht überwachte Titel ausgeblendet", inst["name"], hidden)
            out.extend(entries)
        except arr.ArrError as e:
            warnings.append(f"{inst['name']}: {e}")
    return out


def _merge(plex_items: list[dict], arr_items: list[dict]) -> list[dict]:
    items = list(plex_items)
    by_key: dict[tuple, dict] = {}
    by_folder: dict[tuple, dict] = {}
    for it in items:
        for k in _ids_keys(it):
            by_key.setdefault(k, it)
        if it["folder"]:
            by_folder.setdefault((it["type"], it["folder"].casefold()), it)
    for a in arr_items:
        target = None
        for k in _ids_keys(a):
            if k in by_key:
                target = by_key[k]; break
        if not target and a["folder"]:
            target = by_folder.get((a["type"], a["folder"].casefold()))
        if target:
            if a["source"] not in target["sources"]:
                target["sources"].append(a["source"])
            # a title that is already in Plex counts as monitored if any instance monitors it
            target["monitored"] = bool(target.get("monitored")) or a["monitored"]
            target.setdefault("has_files", a["has_files"])
            target.setdefault("available", a["available"])
            if not target["folder"]:
                target["folder"] = a["folder"]
            if a["folder"] and a["folder"] not in target.setdefault("arr_folders", []):
                target["arr_folders"].append(a["folder"])
            known = {s["number"] for s in target["seasons"]}
            for n in a["seasons"]:
                if n not in known:
                    target["seasons"].append({"number": n, "title": "", "rating_key": None, "thumb": ""})
            target["seasons"].sort(key=lambda s: s["number"])
            for k, v in a["ids"].items():
                target["ids"].setdefault(k, v)
            continue
        new = {
            "rating_key": None, "library_title": "", "type": a["type"], "title": a["title"], "original_title": "",
            "year": a["year"], "folder": a["folder"], "thumb": "", "ids": dict(a["ids"]),
            "seasons": [{"number": n, "title": "", "rating_key": None, "thumb": ""} for n in a["seasons"]],
            "in_plex": False, "sources": [a["source"]], "custom": False,
            "monitored": a["monitored"], "has_files": a["has_files"], "available": a["available"],
            "arr_folders": [a["folder"]] if a["folder"] else [],
        }
        items.append(new)
        for k in _ids_keys(new):
            by_key.setdefault(k, new)
        if new["folder"]:
            by_folder.setdefault((new["type"], new["folder"].casefold()), new)
    return items


def _prep(it: dict) -> None:
    """Search helpers computed once per title, so typing in the search box does not normalise thousands of titles."""
    it["_nt"] = kometa.normalize(it["title"])
    it["_fl"] = (it["folder"] or "").casefold()
    it["letter"] = kometa.letter_of(it["title"])


def custom_item(entry: dict) -> dict:
    return {
        "rating_key": None, "library_title": "", "type": entry["type"], "title": entry.get("title") or entry["folder"],
        "original_title": "", "year": None, "folder": entry["folder"], "thumb": "", "ids": {}, "seasons": [],
        "in_plex": False, "sources": ["Eigener Ordner"], "custom": True, "custom_id": entry["id"],
    }


def _finish(world: dict, items: list[dict], index: kometa.AssetIndex, ignore_specials: bool) -> list[dict]:
    seen: set[str] = set()
    for i, it in enumerate(items):
        iid = f"{world['id']}-c{it['custom_id']}" if it["custom"] else _item_id(
            world["id"], it["type"], it["folder"], it["rating_key"] or str(i))
        while iid in seen:
            iid += "x"
        seen.add(iid)
        it.update(id=iid, world=world["id"], assets_path=world["assets_path"], search_depth=world.get("search_depth", 3), updated=0,
                  mirror_folders=kometa.coming_soon_mirrors(it["folder"], it.get("arr_folders", [])) if world.get("mirror_coming_soon", True) else [])
        build_slots(it, index, ignore_specials)
        _prep(it)
    return items


async def scan() -> None:
    if _lock.locked():
        return
    async with _lock:
        cfg = config.get()
        STATE.update(running=True, error=None, warnings=[], progress="Starte Scan …")
        t0 = time.time()
        log.info("Scan gestartet (%d Welt(en))", len(cfg["worlds"]))
        try:
            warnings: list[str] = []
            plex: Plex | None = None
            if cfg["plex"]["url"] and cfg["plex"]["token"]:
                plex = Plex(cfg["plex"]["url"], cfg["plex"]["token"], cfg["client_id"])
            elif any(l.get("enabled") for l in cfg["libraries"]):
                raise PlexError("Plex ist noch nicht verbunden")
            all_items: list[dict] = []
            try:
                for world in cfg["worlds"]:
                    STATE["progress"] = f"{world['name']}: lese Assets-Ordner …"
                    index = await asyncio.to_thread(
                        kometa.get_index, Path(world["assets_path"]), cfg["assets"]["asset_folders"],
                        world.get("search_depth", 3), True)
                    plex_items = await _plex_items(cfg, world, plex, warnings) if plex else []
                    arr_items = await _arr_items(cfg, world, warnings)
                    items = _merge(plex_items, arr_items)
                    have = {(i["type"], i["folder"].casefold()) for i in items if i["folder"]}
                    for entry in cfg["custom"]:
                        if entry["world"] == world["id"] and (entry["type"], entry["folder"].casefold()) not in have:
                            items.append(custom_item(entry))
                    done = _finish(world, items, index, cfg["assets"]["ignore_specials"])
                    all_items.extend(done)
                    log.info("Welt „%s“: %d Titel (%d aus Plex, %d nur Sonarr/Radarr/Ordner), %d Slots fehlen, Assets-Ordner %s",
                             world["name"], len(done), sum(1 for i in done if i["in_plex"]), sum(1 for i in done if not i["in_plex"]),
                             sum(i["missing"] for i in done), world["assets_path"])
                    if not Path(world["assets_path"]).is_dir():
                        warnings.append(f"{world['name']}: Assets-Ordner {world['assets_path']} nicht gefunden")
            finally:
                if plex:
                    await plex.close()
            all_items.sort(key=lambda i: i["title"].casefold())
            STATE.update(items=all_items, scanned_at=int(time.time()), progress="", warnings=warnings)
            for w in warnings:
                log.warning("Scan: %s", w)
            log.info("Scan fertig: %d Titel in %.1f s", len(all_items), time.time() - t0)
            await asyncio.to_thread(thumbs.prune)
        except Exception as e:  # noqa: BLE001
            log.error("Scan fehlgeschlagen: %s", e, exc_info=not isinstance(e, PlexError))
            STATE.update(error=str(e) or e.__class__.__name__, progress="")
        finally:
            STATE["running"] = False


def _parent_of(it: dict, root: Path) -> Path | None:
    """Directory that holds the title folder of an item that already has assets (flat mode: the file's folder)."""
    for key in ["poster", *it["slots"]]:
        sl = it["slots"].get(key)
        if sl and sl.get("exists"):
            f = Path(sl["path"])
            parent = f.parent.parent if config.get()["assets"]["asset_folders"] else f.parent
            try:
                parent.relative_to(root)
            except ValueError:
                return None
            return parent
    return None


def preferred_base(item: dict) -> Path | None:
    """Where a NEW title folder belongs, so it lands next to the folders the user already has – e.g. in
    ``assets/4K-Serien`` instead of directly in ``assets``. Order: same Plex library, a folder named like the
    library, same Sonarr/Radarr instance, same type; otherwise None (= assets root)."""
    root = Path(item["assets_path"])
    others = [i for i in STATE["items"] if i["world"] == item["world"] and i["id"] != item["id"]]

    def most_common(items: list[dict]) -> Path | None:
        c = Counter(p for p in (_parent_of(i, root) for i in items) if p is not None)
        return c.most_common(1)[0][0] if c else None

    lib = item.get("library_title")
    if lib:
        hit = most_common([i for i in others if i.get("library_title") == lib])
        if hit:
            return hit
        try:  # an existing folder named like the library
            for d in root.iterdir():
                if d.is_dir() and d.name.casefold() == lib.casefold():
                    return d
        except OSError:
            pass
    arr_sources = {x for x in item.get("sources", []) if x not in ("Plex", "Eigener Ordner")}
    if arr_sources:
        hit = most_common([i for i in others if arr_sources & set(i.get("sources", []))])
        if hit:
            return hit
    return most_common([i for i in others if i["type"] == item["type"]])


def refresh_item(item_id: str) -> None:
    """Re-evaluate assets of one item after a change (no Plex call)."""
    cfg = config.get()
    item = next((i for i in STATE["items"] if i["id"] == item_id), None)
    if not item:
        return
    index = kometa.get_index(Path(item["assets_path"]), cfg["assets"]["asset_folders"], item.get("search_depth", 3))
    build_slots(item, index, cfg["assets"]["ignore_specials"])


def add_custom(entry: dict) -> dict:
    """Add a freely entered folder to the live state. Returns the item (existing one if the folder is known)."""
    cfg = config.get()
    world = next(w for w in cfg["worlds"] if w["id"] == entry["world"])
    for it in STATE["items"]:
        if it["world"] == world["id"] and it["type"] == entry["type"] and it["folder"].casefold() == entry["folder"].casefold():
            return it
    item = custom_item(entry)
    index = kometa.get_index(Path(world["assets_path"]), cfg["assets"]["asset_folders"], world.get("search_depth", 3))
    item.update(id=f"{world['id']}-c{entry['id']}", world=world["id"], assets_path=world["assets_path"],
                search_depth=world.get("search_depth", 3), updated=0)
    build_slots(item, index, cfg["assets"]["ignore_specials"])
    _prep(item)
    STATE["items"].append(item)
    STATE["items"].sort(key=lambda i: i["title"].casefold())
    return item


def remove_item(item_id: str) -> None:
    STATE["items"] = [i for i in STATE["items"] if i["id"] != item_id]


def summary() -> dict:
    worlds: dict = {}
    for w in config.get()["worlds"]:
        its = [i for i in STATE["items"] if i["world"] == w["id"]]
        worlds[w["id"]] = {
            "items": len(its), "slots": sum(len([s for s in i["slots"].values() if not s.get("extra")]) for i in its),
            "missing": sum(i["missing"] for i in its),
            "complete_items": sum(1 for i in its if not i["missing"]),
        }
    return {
        "worlds": worlds, "scanned_at": STATE["scanned_at"], "running": STATE["running"],
        "error": STATE["error"], "warnings": STATE["warnings"], "progress": STATE["progress"],
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
