"""p5assets – FastAPI application."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import tempfile
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from collections import Counter

from pydantic import BaseModel

from .text import plural
from .errors import short
from . import arr as arrmod, auth, config, history, kometa, languages as langmod, logs, notify, thumbs, trash, version, plex as plexmod, providers, scanner, uploads
from .plex import Plex, PlexError

STATIC = Path(__file__).parent / "static"
log = logs.get("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logs.setup()
    config.load()
    auth.startup()
    v = version.info()
    log.info("p5assets %s gestartet (Branch %s, Commit %s)", v["version"], v["branch"] or "-", v["commit_short"] or "-")
    await asyncio.to_thread(thumbs.cleanup_old)
    task = asyncio.create_task(scanner.loop())
    yield
    task.cancel()


app = FastAPI(title="p5assets", lifespan=lifespan)
app.include_router(auth.router)


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    denied = auth.gate(request)
    return denied if denied is not None else await call_next(request)


@app.get("/api/health")
async def health():
    """For the Docker health check: answers without a login and without any data."""
    return {"ok": True}



@app.exception_handler(PlexError)
async def plex_error(_: Request, exc: PlexError):
    log.warning("Plex: %s", exc)
    return JSONResponse({"detail": str(exc)}, status_code=502)


@app.exception_handler(arrmod.ArrError)
async def arr_error(_: Request, exc: arrmod.ArrError):
    log.warning("Sonarr/Radarr: %s", exc)
    return JSONResponse({"detail": str(exc)}, status_code=502)


@app.exception_handler(ValueError)
async def value_error(_: Request, exc: ValueError):
    log.warning("Ungültige Anfrage: %s", exc)
    return JSONResponse({"detail": str(exc)}, status_code=400)


# ------------------------------------------------------------ helpers ---

def _item(item_id: str) -> dict:
    it = next((i for i in scanner.STATE["items"] if i["id"] == item_id), None)
    if not it:
        raise HTTPException(404, "Titel nicht gefunden – bitte neu scannen")
    return it


def _public_item(it: dict, full: bool = False) -> dict:
    out = {k: it[k] for k in ("id", "world", "type", "title", "year", "folder", "library_title", "missing",
                              "updated", "in_plex", "sources", "dupes")}
    out["mirror_folders"] = it.get("mirror_folders") or []
    out["coming_soon"] = bool(it.get("coming_soon"))
    out["missing_plex"] = it.get("missing_plex", 0)
    out["arr_folders"] = it.get("arr_folders") or []
    out["monitored"] = it.get("monitored")      # None = no Sonarr/Radarr information
    out["has_files"] = it.get("has_files")
    out["available"] = it.get("available")
    out["slots"] = {k: {kk: vv for kk, vv in v.items() if kk != "path"} for k, v in it["slots"].items()}
    out["season_count"] = len(it["seasons"])
    if full:
        out["seasons"] = [{"number": s["number"], "title": s["title"], "slot": kometa.slot_key(s["number"]),
                           "label": kometa.slot_label(s["number"])} for s in it["seasons"]]
        out["ids"] = it["ids"]
        out["max_season"] = kometa.MAX_SEASON
    return out


def _world(world_id: str | None) -> dict:
    worlds = config.get()["worlds"]
    if world_id:
        w = next((w for w in worlds if w["id"] == world_id), None)
        if not w:
            raise HTTPException(404, "Welt nicht gefunden")
        return w
    return worlds[0]


def _plex() -> Plex:
    c = config.get()
    if not c["plex"]["url"] or not c["plex"]["token"]:
        raise HTTPException(400, "Plex nicht verbunden")
    return Plex(c["plex"]["url"], c["plex"]["token"], c["client_id"])


def _slot_check(it: dict, slot: str) -> int | None:
    season = kometa.parse_slot_key(slot)
    if not kometa.slot_allowed(it["type"], set(it["slots"]), slot):
        raise HTTPException(404, "Slot existiert nicht für diesen Titel")
    return season


async def _plex_push(it: dict, slots: list[str], data: bytes) -> str | None:
    """Optionally also set the poster(s) in Plex. Returns a warning text on problems."""
    if not config.get()["plex"].get("upload_to_plex"):
        return None
    targets = []
    for slot in slots:
        season = kometa.parse_slot_key(slot)
        rk = it.get("rating_key") if season is None else next(
            (s["rating_key"] for s in it["seasons"] if s["number"] == season), None)
        if rk:
            targets.append(rk)
    if not targets:
        return None
    p = _plex()
    try:
        body, _ = await asyncio.to_thread(uploads.normalize_image, data, True)
        for rk in targets:
            await p.upload_poster(rk, body)
    except PlexError as e:
        return str(e)
    finally:
        await p.close()
    return None


async def _store(it: dict, slot: str, data: bytes) -> dict:
    undo: dict = {}
    path = (await asyncio.to_thread(uploads.write_assets, it, [slot], data, undo))[0]
    await asyncio.to_thread(scanner.refresh_item, it["id"])
    warn = await _plex_push(it, [slot], data)
    log.info("Gespeichert: %s / %s → %s%s", it["title"], slot, path,
             f" (+ Spiegel: {', '.join(it['mirror_folders'])})" if it.get("mirror_folders") else "")
    if warn:
        log.warning("Plex-Upload für %s / %s: %s", it["title"], slot, warn)
    return {"ok": True, "path": str(path), "warning": warn, "trash": undo.get("gid"), "item": _public_item(_item(it["id"]), True)}


# --------------------------------------------------------------- state ---

@app.get("/api/state")
async def state():
    cfg = config.get()
    return {"onboarded": cfg["onboarded"], "config": config.public(cfg), "summary": scanner.summary()}


class ConfigPatch(BaseModel):
    patch: dict


@app.post("/api/config")
async def set_config(body: ConfigPatch):
    patch = config.strip_masked(body.patch)
    for forbidden in ("client_id", "onboarded"):
        patch.pop(forbidden, None)
    if "worlds" in patch:
        worlds = patch["worlds"]
        if not isinstance(worlds, list) or not worlds:
            raise HTTPException(400, "Mindestens eine Welt wird benötigt")
        for w in worlds:
            w["name"] = (w.get("name") or "").strip()
            w["assets_path"] = (w.get("assets_path") or "").strip()
    log.info("Einstellungen geändert: %s", ", ".join(sorted(patch)) or "-")
    return config.public(config.update(patch))


def _news() -> list[dict]:
    try:
        return json.loads((Path(__file__).parent / "news.json").read_text("utf-8"))
    except (OSError, ValueError):
        return []


@app.get("/api/news")
async def news():
    """What is new since the user last looked: entries whose ID is not in ``seen_news`` (the first onboarding marks all as seen)."""
    seen = set(config.get().get("seen_news") or [])
    entries = _news()
    return {"unseen": [e for e in entries if e["id"] not in seen], "all": [{**e, "seen": e["id"] in seen} for e in entries]}


class NewsSeen(BaseModel):
    ids: list[str]


@app.post("/api/news/seen")
async def news_seen(body: NewsSeen):
    known = {e["id"] for e in _news()}
    cur = list(config.get().get("seen_news") or [])
    config.update({"seen_news": list(dict.fromkeys(cur + [i for i in body.ids if i in known]))})
    return {"ok": True}


@app.post("/api/onboarding/finish")
async def finish_onboarding():
    config.update({"onboarded": True, "seen_news": [e["id"] for e in _news()]})   # a fresh install has nothing "new"
    log.info("Onboarding abgeschlossen")
    asyncio.create_task(scanner.scan())
    return {"ok": True}


# ---------------------------------------------------------------- plex ---

@app.post("/api/plex/pin")
async def plex_pin():
    return await plexmod.create_pin(config.get()["client_id"])


@app.get("/api/plex/pin/{pin_id}")
async def plex_pin_check(pin_id: int):
    cid = config.get()["client_id"]
    token = await plexmod.check_pin(cid, pin_id)
    if not token:
        return {"ready": False}
    srv = await plexmod.servers(cid, token)
    return {"ready": True, "token": token, "servers": srv}


class Connect(BaseModel):
    url: str = ""
    token: str = ""
    connections: list[dict] | None = None


@app.post("/api/plex/connect")
async def plex_connect(body: Connect):
    cfg = config.get()
    token = body.token if body.token and body.token != "********" else cfg["plex"]["token"]
    url = body.url.strip()
    if not url and body.connections:
        url = await plexmod.first_reachable(body.connections, token, cfg["client_id"]) or ""
        if not url:
            raise PlexError("Keine der Server-Adressen war erreichbar – bitte URL manuell eingeben")
    if not url or not token:
        raise HTTPException(400, "URL und Token werden benötigt")
    if "://" not in url:
        url = "http://" + url
    ident = await plexmod.test_connection(url, token, cfg["client_id"])
    p = Plex(url, token, cfg["client_id"])
    try:
        libs = await p.libraries()
    finally:
        await p.close()
    existing = {l["key"]: l for l in cfg["libraries"]}
    merged = [{"key": l["key"], "title": l["title"], "type": l["type"],
               "enabled": existing.get(l["key"], {}).get("enabled", True),
               "world": existing.get(l["key"], {}).get("world", cfg["worlds"][0]["id"]),
               "world_set": existing.get(l["key"], {}).get("world_set", False)} for l in libs]
    config.update({"plex": {"url": url, "token": token, "server_name": ident["name"]}})
    cur = config.get()
    cur["libraries"] = merged
    config.save(cur)
    log.info("Plex verbunden: %s (%s), %d Bibliotheken", ident["name"], url, len(merged))
    return {"server": ident, "url": url, "libraries": merged}


@app.get("/api/plex/libraries")
async def plex_libraries():
    cfg = config.get()
    return cfg["libraries"]


# ------------------------------------------------------------- apis ---

class ApiTest(BaseModel):
    key: str = ""
    pin: str = ""


@app.post("/api/test/{provider}")
async def test_provider(provider: str, body: ApiTest):
    apis = config.get()["apis"]
    key = body.key if body.key and body.key != "********" else apis.get(provider, "")
    pin = body.pin if body.pin and body.pin != "********" else apis.get("tvdb_pin", "")
    if not key:
        raise HTTPException(400, "Kein API Key angegeben")
    try:
        if provider == "tmdb":
            await providers.tmdb_test(key)
        elif provider == "tvdb":
            await providers.tvdb_test(key, pin)
        elif provider == "fanart":
            await providers.fanart_test(key)
        else:
            raise HTTPException(404, "Unbekannter Anbieter")
    except httpx.HTTPStatusError as e:
        log.warning("API-Test %s: ungültiger Key (HTTP %s)", provider, e.response.status_code)
        raise HTTPException(400, f"Ungültiger Key (HTTP {e.response.status_code})")
    except httpx.HTTPError as e:
        log.warning("API-Test %s: nicht erreichbar (%s)", provider, e)
        raise HTTPException(502, f"Nicht erreichbar: {short(e)}") from None
    log.info("API-Test %s: OK", provider)
    return {"ok": True}


class ArrTest(BaseModel):
    id: str = ""
    kind: str
    url: str
    api_key: str = ""


@app.post("/api/arr/test")
async def arr_test(body: ArrTest):
    if body.kind not in ("sonarr", "radarr"):
        raise HTTPException(400, "Unbekannter Typ")
    key = body.api_key
    if key == config.MASK:
        key = next((a["api_key"] for a in config.get()["arr"] if a.get("id") == body.id), "")
    if not body.url or not key:
        raise HTTPException(400, "URL und API-Key werden benötigt")
    res = await arrmod.test(body.kind, body.url.strip(), key)
    log.info("%s-Test (%s): OK, Version %s", body.kind.capitalize(), body.url.strip(), res.get("version", "?"))
    return res


# ------------------------------------------------------ filesystem ---

@app.get("/api/fs")
async def browse(path: str = "/"):
    p = Path(path or "/")
    if not p.is_dir():
        raise HTTPException(404, "Ordner nicht gefunden")
    dirs = []
    try:
        for e in sorted(p.iterdir(), key=lambda x: x.name.casefold()):
            if e.is_dir() and not e.name.startswith("."):
                dirs.append(e.name)
    except OSError as e:
        raise HTTPException(403, str(e))
    return {"path": str(p.resolve()), "parent": str(p.resolve().parent), "dirs": dirs}


class PathCheck(BaseModel):
    path: str
    asset_folders: bool = True


@app.post("/api/path/check")
async def path_check(body: PathCheck):
    p = Path(body.path)
    if not p.is_dir():
        return {"exists": False, "writable": False, "entries": 0}
    entries = sum(1 for e in p.iterdir() if not e.name.startswith("."))
    return {"exists": True, "writable": os.access(p, os.W_OK), "entries": entries}


# ------------------------------------------------------------ items ---

@app.post("/api/scan")
async def start_scan():
    if not scanner.STATE["running"]:
        asyncio.create_task(scanner.scan())
        await asyncio.sleep(0.05)  # let the scan start so the answer already says "running"
    return scanner.summary()


@app.get("/api/status")
async def status():
    return scanner.summary()


def _is_weak(it: dict, min_w: int, ratio: bool) -> bool:
    """Quality check: an existing asset is too narrow and/or not 2:3 (user's choice). Unknown sizes never count."""
    for sl in it["slots"].values():
        if sl.get("extra") or not sl.get("exists") or not sl.get("w"):
            continue
        if min_w and sl["w"] < min_w:
            return True
        if ratio and abs(sl["w"] / sl["h"] - 2 / 3) > 0.04:
            return True
    return False


def _scope_stats(items: list[dict], weak_w: int = 0, weak_r: bool = False) -> dict:
    """Numbers for the statistic block and the tab counters of one source selection."""
    c = Counter()
    for i in items:
        for sl in i["slots"].values():
            if sl.get("exists") and not sl.get("extra"):
                c["dims_total"] += 1
                c["dims_known"] += 1 if sl.get("w") else 0
        if (weak_w or weak_r) and _is_weak(i, weak_w, weak_r):
            c["weak"] += 1
        c["items"] += 1
        c["slots"] += sum(1 for s in i["slots"].values() if not s.get("extra"))
        c["missing_slots"] += i["missing"]
        c["missing"] += 1 if i["missing"] else 0
        c["complete"] += 0 if i["missing"] else 1
        c["comingsoon"] += 1 if i.get("coming_soon") else 0
        c["notplex"] += 0 if i["in_plex"] else 1
        c["plexmissing"] += 1 if i.get("missing_plex") else 0
    return {"items": c["items"], "slots": c["slots"], "missing": c["missing_slots"], "complete_items": c["complete"],
            "counts": {"all": c["items"], "missing": c["missing"], "complete": c["complete"],
                       "comingsoon": c["comingsoon"], "notplex": c["notplex"], "plexmissing": c["plexmissing"], "weak": c["weak"]},
            "dims": {"known": c["dims_known"], "total": c["dims_total"]}}


@app.get("/api/items")
async def items(world: str = "", q: str = "", filter: str = "all", library: str = "", source: str = "",
                type: str = "", letter: str = "", nopost: bool = False, weak_w: int = 0, weak_r: bool = False,
                offset: int = 0, limit: int = Query(120, le=500)):
    wid = _world(world)["id"]   # once – config.get() deep-copies the whole configuration
    res = [i for i in scanner.STATE["items"] if i["world"] == wid]
    if library:
        res = [i for i in res if i["library_title"] == library]
    if source:  # Sonarr/Radarr instance name
        res = [i for i in res if source in i["sources"]]
    if type:
        res = [i for i in res if i["type"] == type]
    stats = _scope_stats(res, weak_w, weak_r)          # for the chosen source, independent of tab, letter and search
    if filter == "missing":
        res = [i for i in res if i["missing"]]
    elif filter == "complete":
        res = [i for i in res if not i["missing"]]
    elif filter == "notplex":
        res = [i for i in res if not i["in_plex"]]
    elif filter == "plexmissing":     # already in Plex, but a poster/season is missing in the Kometa assets
        res = [i for i in res if i.get("missing_plex")]
    elif filter == "comingsoon":      # Coming-Soon placeholders already visible in Plex: the ones without a poster first
        res = [i for i in res if i.get("coming_soon")]
        if nopost:
            res = [i for i in res if not i["slots"].get("poster", {}).get("exists")]
        res.sort(key=lambda i: (bool(i["slots"].get("poster", {}).get("exists")), i["title"].casefold()))
    elif filter == "weak":            # quality check: too small and/or not 2:3, thresholds chosen by the user
        res = [i for i in res if _is_weak(i, weak_w, weak_r)]
    if q:  # the search always looks at ALL titles of the world/filter, the A-Z letter does not apply
        nq, cq = kometa.normalize(q), q.casefold()
        res = [i for i in res if (nq and nq in i["_nt"]) or cq in i["_fl"]]
        letters: dict = {}
    else:
        letters = dict(Counter(i["letter"] for i in res))
        if letter:
            res = [i for i in res if i["letter"] == letter]
    return {"total": len(res), "letters": letters, "stats": stats,
            "items": [_public_item(i) for i in res[offset:offset + limit]]}


@app.get("/api/items/{item_id}")
async def item_detail(item_id: str):
    return _public_item(_item(item_id), True)


async def _plex_image(path: str) -> Response:
    if not path:
        raise HTTPException(404)
    p = _plex()
    try:
        data = await p.image(path)
    finally:
        await p.close()
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/asset/{item_id}/{slot}")
async def asset(item_id: str, slot: str, v: str = ""):
    it = _item(item_id)
    path = it["slots"].get(slot, {}).get("path")
    if not path or not Path(path).is_file():
        raise HTTPException(404)
    return FileResponse(path, headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/thumb/{item_id}/{slot}")
async def thumb(item_id: str, slot: str, v: str = ""):
    """Small preview of an asset for lists and tiles (the original stays untouched)."""
    it = _item(item_id)
    path = it["slots"].get(slot, {}).get("path")
    if not path or not Path(path).is_file():
        raise HTTPException(404)
    out = await asyncio.to_thread(thumbs.get, Path(path))
    return FileResponse(out, media_type="image/jpeg" if out != Path(path) else None,
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


def _safe_name(text: str) -> str:
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]+', " ", text).strip(" .") or "poster"


def _download_name(it: dict, slot: str, path: Path) -> str:
    base = f"{it['title']} ({it['year']})" if it.get("year") else it["title"]
    season = kometa.parse_slot_key(slot)
    part = "Poster" if season is None else ("Specials" if season == 0 else f"Season {season:02d}")
    return f"{_safe_name(base)} - {part}{path.suffix.lower()}"


@app.get("/api/download/{item_id}/{slot}")
async def download_asset(item_id: str, slot: str):
    """The asset exactly as it lies in the assets folder (original quality, no re-encoding)."""
    it = _item(item_id)
    path = it["slots"].get(slot, {}).get("path")
    if not path or not Path(path).is_file():
        raise HTTPException(404, "Kein Bild vorhanden")
    p = Path(path)
    log.info("Download: %s / %s", it["title"], slot)
    return FileResponse(p, filename=_download_name(it, slot, p), headers={"Cache-Control": "no-store"})


def _build_zip(entries: list[tuple[Path, str]]):
    tmp = tempfile.TemporaryFile()  # spills to disk, so a big series does not sit in RAM
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED, allowZip64=True) as zf:  # posters are compressed already
        for src, arc in entries:
            zf.write(src, arc)
    size = tmp.tell()
    tmp.seek(0)
    return tmp, size


@app.get("/api/download-zip/{item_id}")
async def download_zip(item_id: str, slots: str = ""):
    """Several assets of one title as a ZIP: ``<Kometa folder>/poster.jpg``, ``Season01.jpg`` … in original quality."""
    it = _item(item_id)
    wanted = [x for x in slots.split(",") if x] or list(it["slots"])
    folder = _safe_name(it["folder"] or it["title"])
    entries = []
    for key in wanted:
        sl = it["slots"].get(key)
        if sl and sl.get("exists") and Path(sl["path"]).is_file():
            p = Path(sl["path"])
            entries.append((p, f"{folder}/{kometa.slot_basename(kometa.parse_slot_key(key))}{p.suffix.lower()}"))
    if not entries:
        raise HTTPException(404, "Keine Bilder zum Herunterladen")
    tmp, size = await asyncio.to_thread(_build_zip, entries)
    log.info("Download ZIP: %s (%d Bilder, %.1f MB)", it["title"], len(entries), size / 1048576)

    def chunks():
        try:
            while block := tmp.read(1 << 20):
                yield block
        finally:
            tmp.close()
    name = _safe_name(f"{it['title']} ({it['year']})" if it.get("year") else it["title"]) + ".zip"
    quoted = re.sub(r"[^A-Za-z0-9._ -]", "_", name)
    from urllib.parse import quote
    return StreamingResponse(chunks(), media_type="application/zip", headers={
        "Content-Length": str(size), "Cache-Control": "no-store",
        "Content-Disposition": f"attachment; filename=\"{quoted}\"; filename*=UTF-8''{quote(name)}"})


@app.get("/api/season-thumb/{item_id}/{slot}")
async def season_thumb(item_id: str, slot: str):
    it = _item(item_id)
    season = kometa.parse_slot_key(slot)
    thumb_path = it["thumb"] if season is None else next(
        (s["thumb"] for s in it["seasons"] if s["number"] == season), "")
    return await _plex_image(thumb_path)


@app.post("/api/items/{item_id}/{slot}/upload")
async def upload_slot(item_id: str, slot: str, file: UploadFile = File(...)):
    it = _item(item_id)
    _slot_check(it, slot)
    data = await file.read()
    return await _store(it, slot, data)


class CopyBody(BaseModel):
    source: str


@app.post("/api/items/{item_id}/{slot}/copy")
async def copy_slot(item_id: str, slot: str, body: CopyBody):
    """Copy an existing Kometa asset of this title onto another slot (renamed Kometa-conform)."""
    it = _item(item_id)
    _slot_check(it, slot)
    if body.source == slot:
        raise HTTPException(400, "Quelle und Ziel sind identisch")
    src = it["slots"].get(body.source, {}).get("path")
    if not src or not Path(src).is_file():
        raise HTTPException(404, "Das Quellbild wurde im Assets-Ordner nicht gefunden")
    log.info("Kopieren: %s / %s → %s", it["title"], body.source, slot)
    return await _store(it, slot, Path(src).read_bytes())


class CopyAllBody(BaseModel):
    source: str
    targets: list[str]
    overwrite: bool = False


@app.post("/api/items/{item_id}/copy-all")
async def copy_all(item_id: str, body: CopyAllBody):
    """Use one existing asset of this title for many slots at once (e.g. poster.jpg -> Season00 … Season50)."""
    it = _item(item_id)
    src = it["slots"].get(body.source, {}).get("path")
    if not src or not Path(src).is_file():
        raise HTTPException(404, "Das Quellbild wurde im Assets-Ordner nicht gefunden")
    known = set(it["slots"])
    targets, skipped = [], []
    for t in dict.fromkeys(body.targets):
        if t == body.source:
            continue
        if not kometa.slot_allowed(it["type"], known, t):
            skipped.append(t)
            continue
        if it["slots"].get(t, {}).get("exists") and not body.overwrite:
            skipped.append(t)
            continue
        targets.append(t)
    if not targets:
        return {"ok": True, "written": [], "skipped": skipped, "warning": None, "item": _public_item(it, True)}
    data = Path(src).read_bytes()
    undo: dict = {}
    await asyncio.to_thread(uploads.write_assets, it, targets, data, undo)
    log.info("Auf alle: %s / %s → %d Kacheln (%d übersprungen)", it["title"], body.source, len(targets), len(skipped))
    await asyncio.to_thread(scanner.refresh_item, it["id"])
    warn = await _plex_push(it, targets, data)
    return {"ok": True, "written": targets, "skipped": skipped, "warning": warn, "trash": undo.get("gid"), "item": _public_item(_item(it["id"]), True)}


class UrlBody(BaseModel):
    url: str


async def _download(url: str) -> bytes:
    u = httpx.URL(url)
    if u.scheme != "https" or u.host not in providers.ALLOWED_HOSTS:
        raise HTTPException(400, "Download nur von TMDb, TVDB und fanart.tv erlaubt")
    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as c:
        r = await c.get(url)
        r.raise_for_status()
        if len(r.content) > 40 * 1024 * 1024:
            raise HTTPException(400, "Bild zu groß")
        return r.content


@app.post("/api/items/{item_id}/{slot}/url")
async def upload_from_url(item_id: str, slot: str, body: UrlBody):
    it = _item(item_id)
    _slot_check(it, slot)
    data = await _download(body.url)
    return await _store(it, slot, data)


@app.get("/api/items/{item_id}/{slot}/search")
async def search_posters(item_id: str, slot: str):
    it = _item(item_id)
    season = _slot_check(it, slot)
    apis = config.get()["apis"]
    if not (apis["tmdb"] or apis["tvdb"] or apis["fanart"]):
        raise HTTPException(400, "Keine API-Keys hinterlegt (Einstellungen → Quellen)")
    world = next((w for w in config.get()["worlds"] if w["id"] == it["world"]), None)
    res = await providers.search(apis, it["type"], it["ids"], it["title"], it["year"], season,
                                 (world or {}).get("languages"))
    log.info("Online-Suche %s / %s: %d Poster (%s)", it["title"], slot, len(res["images"]),
             ", ".join(f"{p['name']}: {p['count'] if p['state'] == 'ok' else p['state']}" for p in res["providers"]))
    for p in res["providers"]:
        if p["state"] == "error":
            log.warning("Online-Suche %s: %s", p["name"], p["error"])
    return res


@app.get("/api/languages")
async def language_catalogue():
    return langmod.catalogue()


@app.get("/api/proxy")
async def proxy_preview(url: str):
    """Preview thumbnails of whitelisted hosts (avoids mixed-content/CORS/hotlink issues)."""
    return Response(await _download(url), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.delete("/api/items/{item_id}/{slot}")
async def delete_slot(item_id: str, slot: str):
    it = _item(item_id)
    _slot_check(it, slot)
    path = it["slots"].get(slot, {}).get("path")
    gid = None
    if path and Path(path).is_file():
        gid = trash.begin("delete", item_id=it["id"], world=it["world"], title=it["title"], slot=slot, type=it["type"])
        for extra in uploads.mirror_files(it, slot):  # keep the Coming-Soon mirror folder in sync
            trash.stash(gid, extra, move=True, label=slot)
            log.info("Gelöscht (Spiegel): %s / %s (%s)", it["title"], slot, extra)
        trash.stash(gid, Path(path), move=True, label=slot)      # moved to the trash: can be undone for 30 days
        log.info("Gelöscht: %s / %s (%s)", it["title"], slot, path)
    await asyncio.to_thread(scanner.refresh_item, item_id)
    return {"ok": True, "trash": gid, "item": _public_item(_item(item_id), True)}


# ------------------------------------------------- trash / orphans / history ---

@app.get("/api/trash")
async def trash_list():
    return {"keep_days": trash.KEEP_DAYS, "groups": await asyncio.to_thread(trash.listing)}


@app.post("/api/trash/{gid}/restore")
async def trash_restore(gid: str):
    try:
        meta = await asyncio.to_thread(trash.restore, gid)
    except FileNotFoundError:
        raise HTTPException(404, "Eintrag nicht mehr vorhanden")
    kometa.drop_indexes()
    item = next((i for i in scanner.STATE["items"] if i["id"] == meta.get("item_id")), None)
    if item:
        await asyncio.to_thread(scanner.refresh_item, item["id"])
    return {"ok": True, "item": _public_item(item, True) if item else None, "title": meta.get("title")}


@app.get("/api/trash/{gid}/file/{n}")
async def trash_file(gid: str, n: int):
    """The stored old poster, for the thumbnail in the trash list."""
    try:
        meta = trash._load(gid)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404)
    f = next((x for x in meta["files"] if x["n"] == n and not x["dir"]), None)
    p = trash._root() / gid / "data" / str(n)
    if not f or not p.is_file() or Path(f["orig"]).suffix.lower() not in kometa.IMAGE_EXTS:
        raise HTTPException(404)
    out = await asyncio.to_thread(thumbs.get, p)
    return FileResponse(out, media_type="image/jpeg" if out != p else None, headers={"Cache-Control": "private, max-age=3600"})


@app.delete("/api/trash/{gid}")
async def trash_remove(gid: str):
    try:
        trash.remove(gid)
    except FileNotFoundError:
        raise HTTPException(404, "Eintrag nicht mehr vorhanden")
    return {"ok": True}


@app.delete("/api/trash")
async def trash_empty():
    return {"ok": True, "removed": await asyncio.to_thread(trash.empty)}


def _orphans(world_id: str) -> tuple[dict, list[dict], str]:
    """Folders in the assets folder that hold poster/season files but belong to no title (any more).

    Orphan = the folder belongs to nothing that exists any more: not in Plex, not listed in Sonarr/Radarr (monitored or not –
    announced titles that are not released yet stay protected) and not an own folder. Returns (world, folders, reason why not checked)."""
    w = _world(world_id)
    cfg = config.get()
    root = Path(w["assets_path"])
    if not cfg["assets"]["asset_folders"] or not root.is_dir():
        return w, [], ""
    failed = scanner.STATE.get("failed", {}).get(w["id"], [])
    if scanner.STATE.get("error") or not scanner.STATE.get("scanned_at"):
        return w, [], "Der letzte Scan ist fehlgeschlagen oder fehlt – bitte zuerst erfolgreich scannen, sonst würden Titel fälschlich als verwaist gelten."
    if failed:   # an unreachable Sonarr/Radarr would make all its titles look like orphans
        return w, [], f"{', '.join(failed)} war beim letzten Scan nicht erreichbar – die Liste wäre unvollständig. Bitte erneut scannen."
    index = kometa.get_index(root, True, w.get("search_depth", 3))
    known: set[str] = set()
    for it in scanner.STATE["items"]:
        if it["world"] == w["id"]:
            known.update(x.casefold() for x in [it["folder"], *(it.get("arr_folders") or []), *(it.get("mirror_folders") or [])] if x)
    out = []
    for key, d in index.dirs.items():
        if key in known:
            continue
        try:
            files = [e for e in d.iterdir() if e.is_file() and e.suffix.lower() in kometa.IMAGE_EXTS
                     and (e.stem.casefold() == "poster" or e.stem.casefold().startswith("season"))]
        except OSError:
            continue
        if files:   # a title folder (container folders like "Filme" hold only sub-folders)
            out.append({"name": d.name, "path": str(d.relative_to(root)), "files": len(files),
                        "size": sum(f.stat().st_size for f in files), "mtime": int(max(f.stat().st_mtime for f in files))})
    return w, sorted(out, key=lambda o: o["name"].casefold())[:1000], ""


@app.get("/api/orphans")
async def orphans(world: str = ""):
    w, out, blocked = await asyncio.to_thread(_orphans, world)
    return {"world": w["id"], "folders": bool(config.get()["assets"]["asset_folders"]), "orphans": out, "blocked": blocked}


class OrphanBody(BaseModel):
    world: str = ""
    paths: list[str]


@app.post("/api/orphans/trash")
async def orphans_trash(body: OrphanBody):
    w, found, blocked = await asyncio.to_thread(_orphans, body.world)
    if blocked:
        raise HTTPException(409, blocked)
    allowed = {o["path"]: o for o in found}
    root = Path(w["assets_path"])
    moved = 0
    gid = trash.begin("orphan", world=w["id"], title=plural(len(body.paths), "verwaister Ordner", "verwaiste Ordner"), slot="")
    for rel in body.paths:
        if rel in allowed and (root / rel).is_dir():     # only folders that are really orphans, nothing outside the assets folder
            trash.stash(gid, root / rel, move=True, label=allowed[rel]["name"])
            moved += 1
    trash.discard_if_empty(gid)
    kometa.drop_indexes()
    log.info("Verwaiste Ordner in den Papierkorb verschoben: %d", moved)
    return {"ok": True, "moved": moved, "trash": gid if moved else None}


class NotifyTest(BaseModel):
    channel: str


@app.post("/api/notify/test")
async def notify_test(body: NotifyTest):
    """Sends a test message through ONE channel with the saved settings."""
    if body.channel not in ("discord", "telegram", "ntfy"):
        raise HTTPException(400, "Unbekannter Kanal")
    if body.channel not in notify.channels():
        raise HTTPException(400, "Kanal ist nicht aktiviert oder unvollständig eingerichtet")
    title, text = notify.compose([{"title": "Beispiel-Film", "year": 2026, "world": "HD", "coming_soon": True},
                                  {"title": "Beispiel-Serie", "year": 2025, "world": "HD", "coming_soon": False}], False,
                                 (config.get()["notify"].get("base_url") or "").strip())
    res = await notify.send_all("Testnachricht von p5assets", f"So sieht eine Benachrichtigung aus:\n\n{title}\n{text}", [body.channel])
    if res[body.channel]:
        raise HTTPException(502, res[body.channel])
    return {"ok": True}


@app.get("/api/history")
async def coverage_history(world: str = "", days: int = 90):
    return {"points": history.get(_world(world)["id"], days)}


# ----------------------------------------------------------- import ---

def _suggest(entry: dict, fixed: dict | None, pool: list[dict], index: dict | None = None) -> dict:
    out = dict(entry)
    out["item_id"] = None
    out["slot"] = None
    if entry["kind"] == "ignore":
        return out
    item = fixed or kometa.match_item(entry["title"], entry["year"], pool, index)
    if item:
        slot = "poster" if entry["kind"] == "poster" else kometa.slot_key(entry["season"])
        if kometa.slot_allowed(item["type"], set(item["slots"]), slot):
            out["item_id"], out["slot"] = item["id"], slot
            out["item_title"] = item["title"]
            out["item_year"] = item["year"]
    return out


@app.post("/api/import")
async def import_files(request: Request):
    """Multipart upload of many files (names may contain relative paths) or zips."""
    form = await request.form(max_files=5000, max_fields=5000)
    fixed_id = form.get("item_id")
    fixed = _item(str(fixed_id)) if fixed_id else None
    world = fixed["world"] if fixed else _world(form.get("world") or None)["id"]
    pool = [i for i in scanner.STATE["items"] if i["world"] == world]
    sid = uploads.new_session()
    entries, errors = [], []
    for f in form.getlist("files"):
        name = getattr(f, "filename", "") or ""
        try:
            entries += uploads.stage_file(sid, name, await f.read())
        except ValueError as e:
            errors.append(str(e))
    match_index = kometa.index_items(pool) if not fixed else None
    suggestions = [_suggest(e, fixed, pool, match_index) for e in entries]
    if fixed:
        # files dropped on a title belong to that title, whatever they are called
        for s in suggestions:
            if s["kind"] == "ignore" or s["item_id"]:
                continue
            slot = "poster" if s["kind"] == "poster" else kometa.slot_key(s["season"])
            if kometa.slot_allowed(fixed["type"], set(fixed["slots"]), slot):
                s["item_id"], s["slot"], s["item_title"], s["item_year"] = fixed["id"], slot, fixed["title"], fixed["year"]
    by_id = {i["id"]: i for i in pool}
    if fixed:
        by_id[fixed["id"]] = fixed
    # what the review dialog needs to check a set for completeness: the known seasons (Plex/Sonarr) and which tiles already exist
    targets = {e["item_id"]: _public_item(by_id[e["item_id"]], True) for e in suggestions if e.get("item_id") in by_id}
    return {"session": sid, "entries": suggestions, "errors": errors, "world": world, "targets": targets}


@app.get("/api/import/{sid}/{fid}")
async def import_preview(sid: str, fid: str):
    try:
        data = uploads.staged_bytes(sid, fid)
    except FileNotFoundError:
        raise HTTPException(404)
    return Response(data, media_type="image/*", headers={"Cache-Control": "private, max-age=3600"})


@app.get("/api/slots")
async def slot_options(world: str = "", q: str = "", limit: int = 30):
    """Autocomplete for manual assignment in the import dialog."""
    wid = _world(world)["id"]
    nq = kometa.normalize(q)
    out = []
    for i in scanner.STATE["items"]:
        if i["world"] == wid and (not nq or nq in kometa.normalize(i["title"])):
            keys = ["poster"]
            if i["type"] == "show":
                keys += [kometa.slot_key(n) for n in range(0, kometa.MAX_SEASON + 1)]
                keys += [k for k in i["slots"] if k not in keys]
            out.append({"id": i["id"], "title": i["title"], "year": i["year"], "type": i["type"],
                        "slots": [{"slot": k, "label": kometa.slot_label(kometa.parse_slot_key(k))} for k in keys]})
            if len(out) >= limit:
                break
    return out


class Assignment(BaseModel):
    file: str
    item_id: str
    slot: str


class ApplyBody(BaseModel):
    assignments: list[Assignment]


@app.post("/api/import/{sid}/apply")
async def import_apply(sid: str, body: ApplyBody):
    done, failed = [], []
    for a in body.assignments:
        try:
            it = _item(a.item_id)
            _slot_check(it, a.slot)
            data = uploads.staged_bytes(sid, a.file)
            res = await _store(it, a.slot, data)
            done.append({"item": it["title"], "slot": a.slot, "warning": res["warning"]})
        except (ValueError, HTTPException, FileNotFoundError) as e:
            failed.append({"file": a.file, "error": getattr(e, "detail", None) or str(e)})
    uploads.drop_session(sid)
    log.info("Import: %d Dateien übernommen, %d fehlgeschlagen", len(done), len(failed))
    for f in failed:
        log.warning("Import fehlgeschlagen: %s", f["error"])
    return {"done": done, "failed": failed, "summary": scanner.summary()}


@app.delete("/api/import/{sid}")
async def import_cancel(sid: str):
    uploads.drop_session(sid)
    return {"ok": True}


# ---------------------------------------------------------- static ---

@app.get("/api/version")
async def version_info():
    return version.info()


@app.get("/api/logs")
async def log_files():
    return logs.files()


@app.get("/api/logs/alerts")
async def log_alerts(since: int = 0):
    return logs.alert_state(since)


@app.get("/api/logs/read")
async def log_read(file: str = logs.LOG_NAME, tail: int = Query(1000, ge=1, le=20000), offset: int | None = None):
    try:
        return logs.read(file, tail, offset)
    except ValueError:
        raise HTTPException(400, "Ungültige Logdatei") from None


@app.get("/api/logs/download")
async def log_download(file: str = logs.LOG_NAME):
    try:
        p = logs.path_of(file)
    except ValueError:
        raise HTTPException(400, "Ungültige Logdatei") from None
    if not p.is_file():
        raise HTTPException(404, "Logdatei nicht gefunden")
    return FileResponse(p, media_type="text/plain", filename=file)


@app.delete("/api/logs")
async def log_clear(file: str = logs.LOG_NAME):
    try:
        logs.clear(file)
    except ValueError:
        raise HTTPException(400, "Ungültige Logdatei") from None
    log.info("Logdatei geleert: %s", file)
    return {"ok": True}


def _asset_version() -> str:
    """Changes whenever a file in static/ changes: the scripts/styles get ?v=… so a home-screen app never keeps old ones."""
    h = hashlib.md5(usedforsecurity=False)
    for f in sorted(STATIC.glob("*")):
        if f.suffix in (".js", ".css", ".html"):
            st = f.stat()
            h.update(f"{f.name}{st.st_size}{int(st.st_mtime)}".encode())
    return h.hexdigest()[:10]


@app.get("/")
async def index():
    html = (STATIC / "index.html").read_text("utf-8")
    v = _asset_version()
    for name in ("style.css", "planets.js", "app.js"):
        html = html.replace(f"/static/{name}", f"/static/{name}?v={v}")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.get("/manifest.webmanifest")
async def manifest():
    """Makes p5assets installable as an app on the home screen (iPhone/iPad: Share > Add to Home Screen)."""
    return JSONResponse({
        "name": "p5assets", "short_name": "p5assets", "description": "Fehlende Poster für Plex und Kometa finden und ersetzen",
        "start_url": "/", "scope": "/", "display": "standalone", "orientation": "any", "lang": "de",
        "background_color": "#02100a", "theme_color": "#02100a",
        "icons": [{"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                  {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                  {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
    }, media_type="application/manifest+json", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(STATIC / "icon.png", media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


class _RevalidatingStatic(StaticFiles):
    def file_response(self, *a, **kw):
        r = super().file_response(*a, **kw)
        r.headers["Cache-Control"] = "no-cache"      # always ask (ETag) – cheap, and new versions arrive immediately
        return r


app.mount("/static", _RevalidatingStatic(directory=STATIC), name="static")
