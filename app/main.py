"""p5assets – FastAPI application."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import tempfile
import time
import zipfile
from collections import Counter
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

import httpx
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    Response,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.gzip import GZipMiddleware

from . import arr as arrmod
from . import (
    auth,
    builder_store,
    changes,
    collection_assets,
    config,
    history,
    i18n,
    kometa,
    logs,
    notify,
    providers,
    scanner,
    styles,
    thumbs,
    trash,
    uploads,
    version,
    watch,
)
from . import languages as langmod
from . import plex as plexmod
from .errors import short
from .i18n import tr
from .plex import Plex, PlexError
from .text import plural

STATIC = Path(__file__).parent / "static"
log = logs.get("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logs.setup()
    config.load()
    auth.startup()
    v = version.info()
    log.info("p5assets %s started (branch %s, commit %s)", v["version"], v["branch"] or "-", v["commit_short"] or "-")
    await asyncio.to_thread(thumbs.cleanup_old)
    task = asyncio.create_task(scanner.loop())
    watch_task = asyncio.create_task(_watch_loop())
    yield
    task.cancel()
    watch_task.cancel()


app = FastAPI(title="p5assets", lifespan=lifespan)


class _SelectiveGZip:
    """Compresses scripts, styles and the big JSON lists (a library of thousands of titles is some hundred KB of text); pictures and ZIPs are left alone."""
    PREFIXES = ("/static/", "/i18n.js", "/api/items", "/api/collection", "/api/state", "/api/status", "/api/logs/read", "/api/changes", "/api/trash", "/api/news", "/manifest.webmanifest")
    TEXT = (".js", ".css", ".html", ".svg", ".webmanifest", ".json")

    def __init__(self, inner):
        self.inner = inner
        self.gzip = GZipMiddleware(inner, minimum_size=700, compresslevel=5)

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "") if scope["type"] == "http" else ""
        text = path in ("/",) or (path.startswith(self.PREFIXES) and (not path.startswith("/static/") or path.endswith(self.TEXT)) and not path.startswith(("/api/changes/", "/api/trash/")) )
        await (self.gzip if text else self.inner)(scope, receive, send)


app.add_middleware(_SelectiveGZip)
app.include_router(auth.router)


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    denied = auth.gate(request)
    return denied if denied is not None else await call_next(request)


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",                       # nobody may embed p5assets in a frame (clickjacking)
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
                               "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    if request.url.path.startswith("/api/auth/"):
        response.headers["Cache-Control"] = "no-store"
    elif request.url.path.startswith("/static/") and response.status_code == 200:
        # the page asks for ?v=<hash of the files> (see index): such an address never changes its content, so the browser keeps it; fonts and icons rarely change
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable" if "v" in request.query_params else "public, max-age=86400"
    if auth._secure(request):
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    return response


@app.middleware("http")
async def language(request: Request, call_next):
    """Outermost middleware: the browser's language (header X-Lang) applies to all messages of this request, also the login gate's."""
    i18n.set_lang(request.headers.get("x-lang"))
    return await call_next(request)


@app.get("/i18n.js")
async def i18n_js(request: Request):
    """English texts for the browser (German is the source language of the UI). Checked with an ETag, so an unchanged file costs a few bytes."""
    body = i18n.js()
    etag = '"' + hashlib.md5(body.encode("utf-8"), usedforsecurity=False).hexdigest()[:16] + '"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "no-cache"})
    return Response(body, media_type="text/javascript", headers={"Cache-Control": "no-cache", "ETag": etag})


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
    log.warning("Invalid request: %s", exc)
    return JSONResponse({"detail": str(exc)}, status_code=400)


# ------------------------------------------------------------ helpers ---

def _item(item_id: str) -> dict:
    it = next((i for i in scanner.STATE["items"] if i["id"] == item_id), None)
    if not it:
        raise HTTPException(404, tr("Titel nicht gefunden – bitte neu scannen"))
    return it


def _marks_for(item_id: str) -> list[dict]:
    return watch.for_item(item_id)


def _public_item(it: dict, full: bool = False) -> dict:
    out = {k: it[k] for k in ("id", "world", "type", "title", "year", "folder", "library_title", "missing",
                              "updated", "in_plex", "sources", "dupes")}
    out["mirror_folders"] = it.get("mirror_folders") or []
    out["watch"] = {m["slot"]: len(m["new"]) for m in _marks_for(it["id"])}      # tiles marked "Später suchen": slot -> how many new textless pictures
    out["collections"] = it.get("collections") or []
    out["coming_soon"] = bool(it.get("coming_soon"))
    out["missing_plex"] = it.get("missing_plex", 0)
    out["arr_folders"] = it.get("arr_folders") or []
    out["monitored"] = it.get("monitored")      # None = no Sonarr/Radarr information
    out["has_files"] = it.get("has_files")
    out["available"] = it.get("available")
    out["slots"] = {k: {kk: vv for kk, vv in v.items() if kk != "path"} for k, v in it["slots"].items()}
    out["season_count"] = len(it["seasons"])
    out["tmdb_id"] = (it.get("ids") or {}).get("tmdb")
    out["poster_count"] = 1 + len(it["seasons"])      # series poster + every season (Specials included when there is a season 0)
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
            raise HTTPException(404, tr("Welt nicht gefunden"))
        return w
    return worlds[0]


def _plex() -> Plex:
    c = config.get()
    if not c["plex"]["url"] or not c["plex"]["token"]:
        raise HTTPException(400, tr("Plex nicht verbunden"))
    return Plex(c["plex"]["url"], c["plex"]["token"], c["client_id"])


def _slot_check(it: dict, slot: str) -> int | None:
    season = kometa.parse_slot_key(slot)
    if not kometa.slot_allowed(it["type"], set(it["slots"]), slot):
        raise HTTPException(404, tr("Slot existiert nicht für diesen Titel"))
    return season


async def _store(it: dict, slot: str, data: bytes, source: str = "upload") -> dict:
    undo: dict = {}
    path = (await asyncio.to_thread(uploads.write_assets, it, [slot], data, undo))[0]
    await asyncio.to_thread(scanner.refresh_item, it["id"])
    await asyncio.to_thread(thumbs.get, Path(path))                 # the preview image is ready when the browser asks for it
    await asyncio.to_thread(watch.unmark, it["id"], slot)           # a poster was chosen: "Später suchen" is done for this tile
    await asyncio.to_thread(changes.record, source=source, world=it["world"], item_id=it["id"], title=it["title"], slot=slot, type_=it["type"], gid=undo.get("gid"), path=path)
    log.info("Saved: %s / %s → %s%s", it["title"], slot, path,
             f" (+ mirror: {', '.join(it['mirror_folders'])})" if it.get("mirror_folders") else "")
    return {"ok": True, "path": str(path), "trash": undo.get("gid"), "item": _public_item(_item(it["id"]), True)}


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
            raise HTTPException(400, tr("Mindestens eine Welt wird benötigt"))
        for w in worlds:
            w["name"] = (w.get("name") or "").strip()
            w["assets_path"] = (w.get("assets_path") or "").strip()
    log.info("Settings changed: %s", ", ".join(sorted(patch)) or "-")
    return config.public(config.update(patch))


def _news() -> list[dict]:
    """Release notes (German source texts in news.json), translated for the language of the request."""
    try:
        entries = json.loads((Path(__file__).parent / "news.json").read_text("utf-8"))
    except (OSError, ValueError):
        return []
    for e in entries:
        e["title"], e["text"] = tr(e["title"]), tr(e["text"])
        if e.get("action"):
            e["action"] = {**e["action"], "label": tr(e["action"]["label"])}
    return entries


def _vkey(v: str) -> tuple:
    try:
        return tuple(int(x) for x in (v or "0").split("."))
    except ValueError:
        return (0,)


def _seen_version(cfg: dict) -> str:
    """Last version whose news the user has been shown. Installs from before this setting but with seen entries count as 0.4.0."""
    return cfg.get("news_version_seen") or ("0.4.0" if cfg.get("seen_news") else "")


@app.get("/api/news")
async def news():
    """``show``: news of a version the user has not been told about yet (one short notice per version);
    ``unseen``/``all``: the single entries (by ID) for the full list in the footer."""
    cfg = config.get()
    seen = set(cfg.get("seen_news") or [])
    entries = _news()
    current = version.BASE_VERSION
    newer = [e for e in entries if _vkey(e["version"]) > _vkey(_seen_version(cfg)) and _vkey(e["version"]) <= _vkey(current)]
    return {"version": current, "show": bool(newer) and bool(cfg.get("onboarded")), "count": len(newer), "highlights": [e["title"] for e in newer[:4]],
            "unseen": [e for e in entries if e["id"] not in seen],
            "all": [{**e, "seen": e["id"] in seen} for e in entries]}


class NewsSeen(BaseModel):
    ids: list[str] = []
    version: bool = False        # also remember that the notice for the current version was shown


@app.post("/api/news/seen")
async def news_seen(body: NewsSeen):
    known = {e["id"] for e in _news()}
    cfg = config.get()
    patch: dict = {"seen_news": list(dict.fromkeys(list(cfg.get("seen_news") or []) + [i for i in body.ids if i in known]))}
    if body.version:
        patch["news_version_seen"] = version.BASE_VERSION
    config.update(patch)
    return {"ok": True}


@app.post("/api/onboarding/finish")
async def finish_onboarding():
    config.update({"onboarded": True, "seen_news": [e["id"] for e in _news()], "news_version_seen": version.BASE_VERSION})   # a fresh install has nothing "new"
    log.info("Onboarding finished")
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
            raise PlexError(tr("Keine der Server-Adressen war erreichbar – bitte URL manuell eingeben"))
    if not url or not token:
        raise HTTPException(400, tr("URL und Token werden benötigt"))
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
    log.info("Plex connected: %s (%s), %d libraries", ident["name"], url, len(merged))
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
        raise HTTPException(400, tr("Kein API-Key angegeben"))
    try:
        if provider == "tmdb":
            await providers.tmdb_test(key)
        elif provider == "tvdb":
            await providers.tvdb_test(key, pin)
        elif provider == "fanart":
            await providers.fanart_test(key)
        else:
            raise HTTPException(404, tr("Unbekannter Anbieter"))
    except httpx.HTTPStatusError as e:
        log.warning("API test %s: invalid key (HTTP %s)", provider, e.response.status_code)
        raise HTTPException(400, tr("Ungültiger Key (HTTP {0})", e.response.status_code))
    except httpx.HTTPError as e:
        log.warning("API test %s: not reachable (%s)", provider, e)
        raise HTTPException(502, tr("Nicht erreichbar: {0}", short(e))) from None
    log.info("API test %s: OK", provider)
    return {"ok": True}


class ArrTest(BaseModel):
    id: str = ""
    kind: str
    url: str
    api_key: str = ""


@app.post("/api/arr/test")
async def arr_test(body: ArrTest):
    if body.kind not in ("sonarr", "radarr"):
        raise HTTPException(400, tr("Unbekannter Typ"))
    key = body.api_key
    if key == config.MASK:
        key = next((a["api_key"] for a in config.get()["arr"] if a.get("id") == body.id), "")
    if not body.url or not key:
        raise HTTPException(400, tr("URL und API-Key werden benötigt"))
    res = await arrmod.test(body.kind, body.url.strip(), key)
    log.info("%s-Test (%s): OK, Version %s", body.kind.capitalize(), body.url.strip(), res.get("version", "?"))
    return res


# ------------------------------------------------------ filesystem ---

@app.get("/api/fs")
async def browse(path: str = "/"):
    p = Path(path or "/")
    if not p.is_dir():
        raise HTTPException(404, tr("Ordner nicht gefunden"))
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


_STATS_CACHE: dict = {}


def _cached_stats(items: list[dict], *scope) -> dict:
    """The statistic block of a source selection is the same for every tab, letter and search: it is worked out once per change of the data (or after 3 s)."""
    all_items = scanner.STATE["items"]
    key = (*scope, id(all_items), len(all_items), scanner.STATE.get("rev", 0), tuple(h["id"] for h in _hidden_list()), watch.version())
    hit = _STATS_CACHE.get(key)
    if hit and time.monotonic() - hit[0] < 3:
        return hit[1]
    weak_w, weak_r = scope[-2], scope[-1]
    out = _scope_stats(items, weak_w, weak_r)
    if len(_STATS_CACHE) > 24:
        _STATS_CACHE.clear()
    _STATS_CACHE[key] = (time.monotonic(), out)
    return out


def _scope_stats(items: list[dict], weak_w: int = 0, weak_r: bool = False) -> dict:
    """Numbers for the statistic block and the tab counters of one source selection."""
    c = Counter()
    marked = {m["item_id"] for m in watch.marks().values()}
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
        c["plexmissing"] += 1 if i.get("missing_plex") else 0
    return {"items": c["items"], "slots": c["slots"], "missing": c["missing_slots"], "complete_items": c["complete"],
            "counts": {"all": c["items"], "missing": c["missing"],
                       "comingsoon": c["comingsoon"], "plexmissing": c["plexmissing"], "weak": c["weak"], "watch": sum(1 for i in items if i["id"] in marked),
                       "collections": sum(1 for g in collection_overview([i for i in items if i["type"] == "movie"], "", _hidden_collections()) if not g["hidden"])},
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
    stats = _cached_stats(res, wid, library, source, type, weak_w, weak_r)         # for the chosen source, independent of tab, letter and search
    if filter == "missing":
        res = [i for i in res if i["missing"]]
    elif filter == "plexmissing":     # already in Plex, but a poster/season is missing in the Kometa assets
        res = [i for i in res if i.get("missing_plex")]
    elif filter == "comingsoon":      # Coming-Soon placeholders already visible in Plex: the ones without a poster first
        res = [i for i in res if i.get("coming_soon")]
        if nopost:
            res = [i for i in res if not i["slots"].get("poster", {}).get("exists")]
        res.sort(key=lambda i: (bool(i["slots"].get("poster", {}).get("exists")), i["title"].casefold()))
    elif filter == "watch":           # marked "Später suchen"
        marked = {m["item_id"] for m in watch.marks().values()}
        res = [i for i in res if i["id"] in marked]
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


def _hidden_list() -> list[dict]:
    """Hidden collections as [{id, title, count}]; older versions stored plain IDs."""
    return [c if isinstance(c, dict) else {"id": str(c), "title": str(c), "count": 0} for c in config.get().get("hidden_collections") or []]


def _hidden_collections() -> frozenset:
    return frozenset(c["id"] for c in _hidden_list())


def collection_overview(items: list[dict], q: str = "", hidden: set | frozenset = frozenset()) -> list[dict]:
    """Plex collections of one world with the state of their members' posters (only collections with at least two films)."""
    groups: dict[str, dict] = {}
    for it in items:
        for c in it.get("collections") or []:
            g = groups.setdefault(c["id"], {"id": c["id"], "title": c["title"], "members": []})
            sl = it["slots"].get("poster", {})
            g["members"].append({"id": it["id"], "title": it["title"], "year": it["year"], "has_poster": bool(sl.get("exists")), "v": sl.get("ver") or sl.get("mtime") or 0})
    nq = kometa.normalize(q) if q else ""
    out = []
    for g in groups.values():
        if len(g["members"]) < 2 or (nq and nq not in kometa.normalize(g["title"])):
            continue
        g["members"].sort(key=lambda m: (m["year"] or 0, m["title"].casefold()))
        g["hidden"] = g["id"] in hidden
        g["total"] = len(g["members"])
        g["with_poster"] = sum(1 for m in g["members"] if m["has_poster"])
        out.append(g)
    out.sort(key=lambda g: (g["with_poster"] == g["total"], g["title"].casefold()))
    return out


@app.get("/api/collection")
async def collection_detail(id: str):
    """One Plex collection with its films (public items) for the detail view."""
    films = [i for i in scanner.STATE["items"] if any(c["id"] == id for c in i.get("collections") or [])]
    if not films:
        raise HTTPException(404, tr("Collection nicht gefunden – bitte neu scannen"))
    title = next(c["title"] for c in films[0]["collections"] if c["id"] == id)
    films.sort(key=lambda i: (i["year"] or 0, i["title"].casefold()))
    world = next((w for w in config.get()["worlds"] if w["id"] == films[0]["world"]), None)
    return {"id": id, "title": title, "hidden": id in _hidden_collections(), "builder_key": builder_store.collection_key(id),
            "poster": collection_assets.state(world, title) if world else None, "world": films[0]["world"],
            "members": [_public_item(i, True) for i in films]}


@app.get("/api/collections")
async def collections(world: str = "", q: str = ""):
    wid = _world(world)["id"]
    world = _world(world)
    groups = collection_overview([i for i in scanner.STATE["items"] if i["world"] == wid and i["type"] == "movie"], q, _hidden_collections())
    for g in groups:
        g["poster"] = collection_assets.state(world, g["title"])      # None = no collections folder for this world
    return {"collections": groups}


def _collection_films(cid: str) -> tuple[list[dict], dict, str]:
    films = [i for i in scanner.STATE["items"] if any(c["id"] == cid for c in i.get("collections") or [])]
    if not films:
        raise HTTPException(404, tr("Collection nicht gefunden – bitte neu scannen"))
    world = next((w for w in config.get()["worlds"] if w["id"] == films[0]["world"]), None)
    if not world:
        raise HTTPException(404, tr("Welt nicht gefunden"))
    return films, world, next(c["title"] for c in films[0]["collections"] if c["id"] == cid)


@app.get("/api/collections-dir")
async def collections_dir(world: str = ""):
    """Where the posters of the collections of a world go (None = no collections folder found)."""
    w = _world(world)
    root = await asyncio.to_thread(collection_assets.root_for, w)
    return {"path": str(root) if root else None, "set": bool((w.get("collections_dir") or "").strip())}


@app.get("/api/collection-poster")
async def collection_poster(id: str, download: bool = False, thumb: bool = False, v: str = ""):
    _, world, title = _collection_films(id)
    root = collection_assets.root_for(world)
    folder = collection_assets.folder_of(root, title) if root else None
    poster = collection_assets.poster_of(folder) if folder else None
    if not poster:
        raise HTTPException(404, tr("Datei nicht gefunden"))
    if download:                                      # the original file, named like the other downloads
        return FileResponse(poster, filename=f"{collection_assets.safe_name(title)} - Collection{poster.suffix.lower()}", headers={"Cache-Control": "no-store"})
    if thumb:                                         # the small cached preview for tiles, like for films
        out = await asyncio.to_thread(thumbs.get, poster)
        return FileResponse(out, media_type="image/jpeg" if out != poster else None, headers={"Cache-Control": "public, max-age=31536000, immutable"})
    return FileResponse(poster, headers={"Cache-Control": "no-cache"})


@app.post("/api/collection-poster")
async def collection_poster_upload(id: str, file: Annotated[UploadFile, File()], create: bool = False, source: str = "upload"):
    """Save the poster of a collection (the finished poster of the poster builder). The folder must exist unless create is set."""
    _, world, title = _collection_films(id)
    data = await file.read()
    undo: dict = {}
    try:
        path, reason = await asyncio.to_thread(collection_assets.write_poster, world, title, data, create, undo)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if path is None:
        return JSONResponse({"detail": tr("Der Ordner „{0}“ existiert noch nicht.", title), "needs_folder": title, "reason": reason}, status_code=409)
    log.info("Collection poster: %s → %s", title, path)
    await asyncio.to_thread(changes.record, source="builder" if source == "builder" else "upload", world=world["id"], item_id=None, title=title, slot="collection", type_="collection", gid=undo.get("gid"), path=path)
    return {"ok": True, "path": str(path), "trash": undo.get("gid"), "poster": collection_assets.state(world, title)}


@app.delete("/api/collection-poster")
async def collection_poster_delete(id: str):
    _, world, title = _collection_films(id)
    undo: dict = {}
    if not await asyncio.to_thread(collection_assets.delete_poster, world, title, undo):
        raise HTTPException(404, tr("Datei nicht gefunden"))
    log.info("Collection poster deleted: %s", title)
    await asyncio.to_thread(changes.record, source="delete", world=world["id"], item_id=None, title=title, slot="collection", type_="collection", gid=undo.get("gid"))
    return {"ok": True, "trash": undo.get("gid"), "poster": collection_assets.state(world, title)}


class CollectionUrlBody(BaseModel):
    id: str
    url: str
    create: bool = False


@app.post("/api/collection-poster/url")
async def collection_poster_from_url(body: CollectionUrlBody):
    """Take a picture from the online search (TMDb) as the poster of a collection."""
    _, world, title = _collection_films(body.id)
    data = await _download(body.url)
    undo: dict = {}
    try:
        path, reason = await asyncio.to_thread(collection_assets.write_poster, world, title, data, body.create, undo)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if path is None:
        return JSONResponse({"detail": tr("Der Ordner „{0}“ existiert noch nicht.", title), "needs_folder": title, "reason": reason}, status_code=409)
    await asyncio.to_thread(changes.record, source="online", world=world["id"], item_id=None, title=title, slot="collection", type_="collection", gid=undo.get("gid"), path=path)
    return {"ok": True, "path": str(path), "trash": undo.get("gid"), "poster": collection_assets.state(world, title)}


@app.get("/api/collection-search")
async def collection_search(id: str):
    """Posters of a collection from TMDb (through its films), for the collection poster in the builder."""
    films, world, _ = _collection_films(id)
    apis = config.get()["apis"]
    if not apis["tmdb"]:
        raise HTTPException(400, tr("Keine API-Keys hinterlegt (Einstellungen → Quellen)"))
    movies = [{"ids": f["ids"], "title": f["title"], "year": f["year"]} for f in films[:6]]
    return await providers.search_collection(apis, movies, world.get("languages"))


@app.get("/api/collection-tmdb-id")
async def collection_tmdb_id(id: str):
    """The TMDb number of a collection and of its first film (for links to MediUX); null when TMDb does not know it."""
    films, _, _ = _collection_films(id)
    movies = [{"ids": f["ids"], "title": f["title"], "year": f["year"]} for f in films[:6]]
    out = {"id": None, "film": None}
    try:
        out["id"] = await providers.tmdb_collection_id(config.get()["apis"], movies)
        key = config.get()["apis"]["tmdb"]
        if key and movies:
            tid = (films[0].get("ids") or {}).get("tmdb") or await providers.tmdb_find_id(key, movies[0]["ids"], "movie", movies[0]["title"], movies[0]["year"])
            out["film"] = str(tid) if tid else None
    except Exception as e:  # noqa: BLE001
        log.warning("TMDb number of a collection: %s", short(e))
    return out


@app.get("/api/collections/hidden")
async def collections_hidden():
    """The hidden collections with names and film counts; IDs saved by older versions get their name from the last scan (and keep it)."""
    names: dict[str, str] = {}
    counts: Counter = Counter()
    for i in scanner.STATE["items"]:
        for c in i.get("collections") or []:
            names[c["id"]] = c["title"]
            counts[c["id"]] += 1
    out = []
    changed = any(not isinstance(c, dict) for c in config.get().get("hidden_collections") or [])      # legacy plain IDs get converted
    for hc in _hidden_list():
        known = hc["id"] in names
        new = {**hc, "title": names[hc["id"]], "count": counts[hc["id"]]} if known else dict(hc)
        changed = changed or new != hc
        out.append({**new, "gone": bool(scanner.STATE["items"]) and not known})
    if changed:
        config.update({"hidden_collections": [{k: v for k, v in o.items() if k != "gone"} for o in out]})
    return {"hidden": out}


class CollectionHide(BaseModel):
    id: str
    hidden: bool = True
    title: str = ""
    count: int = 0


@app.post("/api/collections/hidden")
async def collection_hide(body: CollectionHide):
    """Hide a Plex collection (e.g. a huge one that is no film series) from the overview and the import check, or show it again."""
    cur = [c for c in _hidden_list() if c["id"] != body.id]
    if body.hidden:
        cur.append({"id": body.id, "title": body.title[:200] or body.id, "count": body.count})
    config.update({"hidden_collections": cur})
    return {"ok": True}


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
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-cache"})


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
        raise HTTPException(404, tr("Kein Bild vorhanden"))
    p = Path(path)
    log.info("Download: %s / %s", it["title"], slot)
    return FileResponse(p, filename=_download_name(it, slot, p), headers={"Cache-Control": "no-store"})


def _build_zip(entries: list[tuple[Path, str]]):
    tmp = tempfile.TemporaryFile()  # noqa: SIM115 – handed to the streaming response, which closes it
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
        raise HTTPException(404, tr("Keine Bilder zum Herunterladen"))
    tmp, size = await asyncio.to_thread(_build_zip, entries)
    log.info("Download ZIP: %s (%d images, %.1f MB)", it["title"], len(entries), size / 1048576)

    def chunks():
        try:
            while block := tmp.read(1 << 20):
                yield block
        finally:
            tmp.close()
    name = _safe_name(f"{it['title']} ({it['year']})" if it.get("year") else it["title"]) + ".zip"
    quoted = re.sub(r"[^A-Za-z0-9._ -]", "_", name)
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
async def upload_slot(item_id: str, slot: str, file: Annotated[UploadFile, File()], source: str = "upload"):
    it = _item(item_id)
    _slot_check(it, slot)
    data = await file.read()
    return await _store(it, slot, data, "builder" if source == "builder" else "upload")


class CopyBody(BaseModel):
    source: str


@app.post("/api/items/{item_id}/{slot}/copy")
async def copy_slot(item_id: str, slot: str, body: CopyBody):
    """Copy an existing Kometa asset of this title onto another slot (renamed Kometa-conform)."""
    it = _item(item_id)
    _slot_check(it, slot)
    if body.source == slot:
        raise HTTPException(400, tr("Quelle und Ziel sind identisch"))
    src = it["slots"].get(body.source, {}).get("path")
    if not src or not Path(src).is_file():
        raise HTTPException(404, tr("Das Quellbild wurde im Assets-Ordner nicht gefunden"))
    log.info("Copy: %s / %s → %s", it["title"], body.source, slot)
    return await _store(it, slot, Path(src).read_bytes(), "copy")


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
        raise HTTPException(404, tr("Das Quellbild wurde im Assets-Ordner nicht gefunden"))
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
        return {"ok": True, "written": [], "skipped": skipped, "item": _public_item(it, True)}
    data = Path(src).read_bytes()
    undo: dict = {}
    await asyncio.to_thread(uploads.write_assets, it, targets, data, undo)
    log.info("Apply to all: %s / %s → %d tiles (%d skipped)", it["title"], body.source, len(targets), len(skipped))
    await asyncio.to_thread(scanner.refresh_item, it["id"])
    for t in targets:
        await asyncio.to_thread(changes.record, source="all", world=it["world"], item_id=it["id"], title=it["title"], slot=t, type_=it["type"], gid=undo.get("gid"), path=(it["slots"].get(t) or {}).get("path"))
    return {"ok": True, "written": targets, "skipped": skipped, "trash": undo.get("gid"), "item": _public_item(_item(it["id"]), True)}


class UrlBody(BaseModel):
    url: str


def _plex_rk(it: dict, slot: str) -> str | None:
    season = kometa.parse_slot_key(slot)
    return it.get("rating_key") if season is None else next((s["rating_key"] for s in it["seasons"] if s["number"] == season), None)


def _plex_form(e: dict) -> str:
    k = e.get("key") or ""
    return "path" if k.startswith("/library/") else "url" if k.startswith(("http://", "https://")) else "reference" if "://" in k else "other"


async def _plex_list(rk: str | None, what: str) -> dict:
    """The pictures Plex holds for one entry, as {state, error, images: [{i, selected, source}]} (never silently empty: the state says why)."""
    out: dict = {"state": "ok", "error": None, "images": [], "total": 0}
    c = config.get()["plex"]
    if not c["url"] or not c["token"]:
        return {**out, "state": "nokey"}
    if not rk:
        return {**out, "state": "none", "error": tr("Plex kennt diesen Eintrag nicht")}
    p = _plex()
    try:
        photos = await p.photos(rk)
    except PlexError as e:
        log.warning("Plex pictures of %s (%s): %s", what, rk, e)
        return {**out, "state": "error", "error": str(e)}
    finally:
        await p.close()
    forms = Counter(_plex_form(e) for e in photos)
    log.info("Plex pictures of %s (%s): %d entries (%s)", what, rk, len(photos), ", ".join(f"{n} {k}" for k, n in forms.items()) or "none")
    out["total"] = len(photos)
    out["images"] = [{"i": n, "selected": bool(e.get("selected")), "provider": e.get("provider") or ""} for n, e in enumerate(photos)]
    return out


async def _plex_bytes(rk: str, i: int, preview: bool) -> bytes:
    p = _plex()
    try:
        photos = await p.photos(rk)
        if not 0 <= i < len(photos):
            raise HTTPException(404, tr("Datei nicht gefunden"))
        return await p.photo(photos[i], preview)
    except PlexError as e:
        raise HTTPException(502, str(e)) from e
    finally:
        await p.close()


@app.get("/api/items/{item_id}/plex-posters")
async def plex_posters(item_id: str, slot: str = "poster"):
    it = _item(item_id)
    _slot_check(it, slot)
    return await _plex_list(_plex_rk(it, slot), f"{it['title']} / {slot}")


@app.get("/api/items/{item_id}/plex-photo")
async def plex_photo(item_id: str, i: int, slot: str = "poster", preview: bool = False):
    it = _item(item_id)
    _slot_check(it, slot)
    rk = _plex_rk(it, slot)
    if not rk:
        raise HTTPException(404, tr("Plex kennt diesen Eintrag nicht"))
    return Response(await _plex_bytes(rk, i, preview), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


class PlexImport(BaseModel):
    i: int | None = None             # which of Plex's pictures; None = the one Plex shows right now


@app.post("/api/items/{item_id}/{slot}/plex-import")
async def plex_import(item_id: str, slot: str, body: PlexImport):
    """Take the poster of Plex as the Kometa asset of this tile (nothing is sent back to Plex)."""
    it = _item(item_id)
    _slot_check(it, slot)
    rk = _plex_rk(it, slot)
    if not rk:
        raise HTTPException(404, tr("Plex kennt diesen Eintrag nicht"))
    if body.i is None:
        season = kometa.parse_slot_key(slot)
        path = it.get("thumb") if season is None else next((s["thumb"] for s in it["seasons"] if s["number"] == season), "")
        if not path:
            raise HTTPException(404, tr("Plex hat für diese Kachel kein Poster"))
        p = _plex()
        try:
            data = await p.photo_at(path)
        except PlexError as e:
            raise HTTPException(502, str(e)) from e
        finally:
            await p.close()
    else:
        data = await _plex_bytes(rk, body.i, False)
    log.info("Plex poster taken: %s / %s", it["title"], slot)
    return await _store(it, slot, data, "plex")


@app.get("/api/collection-plex-posters")
async def collection_plex_posters(id: str):
    _, _, title = _collection_films(id)
    return await _plex_list(id.split(":", 1)[-1], f"collection {title}")


@app.get("/api/collection-plex-photo")
async def collection_plex_photo(id: str, i: int, preview: bool = False):
    _collection_films(id)
    return Response(await _plex_bytes(id.split(":", 1)[-1], i, preview), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


class CollectionPlexImport(BaseModel):
    id: str
    i: int
    create: bool = False


@app.post("/api/collection-poster/plex")
async def collection_poster_from_plex(body: CollectionPlexImport):
    _, world, title = _collection_films(body.id)
    data = await _plex_bytes(body.id.split(":", 1)[-1], body.i, False)
    undo: dict = {}
    try:
        path, reason = await asyncio.to_thread(collection_assets.write_poster, world, title, data, body.create, undo)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if path is None:
        return JSONResponse({"detail": tr("Der Ordner „{0}“ existiert noch nicht.", title), "needs_folder": title, "reason": reason}, status_code=409)
    await asyncio.to_thread(changes.record, source="plex", world=world["id"], item_id=None, title=title, slot="collection", type_="collection", gid=undo.get("gid"), path=path)
    return {"ok": True, "path": str(path), "trash": undo.get("gid"), "poster": collection_assets.state(world, title)}


async def _download(url: str) -> bytes:
    u = httpx.URL(url)
    if u.scheme != "https" or u.host not in providers.ALLOWED_HOSTS:
        raise HTTPException(400, tr("Download nur von TMDb, TVDB und fanart.tv erlaubt"))
    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as c:
        r = await c.get(url)
        r.raise_for_status()
        if len(r.content) > 40 * 1024 * 1024:
            raise HTTPException(400, tr("Bild zu groß"))
        return r.content


@app.post("/api/items/{item_id}/{slot}/url")
async def upload_from_url(item_id: str, slot: str, body: UrlBody):
    it = _item(item_id)
    _slot_check(it, slot)
    data = await _download(body.url)
    return await _store(it, slot, data, "online")


@app.get("/api/items/{item_id}/{slot}/search")
async def search_posters(item_id: str, slot: str):
    it = _item(item_id)
    season = _slot_check(it, slot)
    apis = config.get()["apis"]
    if not (apis["tmdb"] or apis["tvdb"] or apis["fanart"]):
        raise HTTPException(400, tr("Keine API-Keys hinterlegt (Einstellungen → Quellen)"))
    world = next((w for w in config.get()["worlds"] if w["id"] == it["world"]), None)
    res = await providers.search(apis, it["type"], it["ids"], it["title"], it["year"], season,
                                 (world or {}).get("languages"))
    log.info("Online search %s / %s: %d posters (%s)", it["title"], slot, len(res["images"]),
             ", ".join(f"{p['name']}: {p['count'] if p['state'] == 'ok' else p['state']}" for p in res["providers"]))
    for p in res["providers"]:
        if p["state"] == "error":
            log.warning("Online search %s (%s / %s): %s", p["name"], it["title"], slot, p["error"])
    return res


@app.get("/api/items/{item_id}/logos")
async def search_item_logos(item_id: str):
    """Clear logos (transparent PNGs) of a title for the poster builder: TMDb, fanart.tv and TheTVDB."""
    it = _item(item_id)
    apis = config.get()["apis"]
    if not (apis["tmdb"] or apis["tvdb"] or apis["fanart"]):
        raise HTTPException(400, tr("Keine API-Keys hinterlegt (Einstellungen → Quellen)"))
    world = next((w for w in config.get()["worlds"] if w["id"] == it["world"]), None)
    res = await providers.search_logos(apis, it["type"], it["ids"], it["title"], it["year"], (world or {}).get("languages"))
    log.info("Logo search %s: %d logos (%s)", it["title"], len(res["images"]),
             ", ".join(f"{p['name']}: {p['count'] if p['state'] == 'ok' else p['state']}" for p in res["providers"]))
    return res


@app.get("/api/items/{item_id}/backdrops")
async def search_item_backdrops(item_id: str):
    """Backdrops (landscape pictures) of a title as backgrounds for the poster builder: TMDb, fanart.tv and TheTVDB."""
    it = _item(item_id)
    apis = config.get()["apis"]
    if not (apis["tmdb"] or apis["tvdb"] or apis["fanart"]):
        raise HTTPException(400, tr("Keine API-Keys hinterlegt (Einstellungen → Quellen)"))
    world = next((w for w in config.get()["worlds"] if w["id"] == it["world"]), None)
    res = await providers.search_backdrops(apis, it["type"], it["ids"], it["title"], it["year"], (world or {}).get("languages"))
    for p in res["providers"]:
        if p["state"] == "error":
            log.warning("Backdrop search %s (%s): %s", p["name"], it["title"], p["error"])
    return res


@app.get("/api/items/{item_id}/sources/{kind}")
async def builder_source(item_id: str, kind: str, slot: str = "poster"):
    """Extra picture sources for the poster builder: backdrops, episode pictures, season pictures."""
    it = _item(item_id)
    season = _slot_check(it, slot)
    if kind not in providers.SOURCE_KINDS:
        raise HTTPException(404, tr("Unbekannte Quelle"))
    apis = config.get()["apis"]
    if not (apis["tmdb"] or apis["tvdb"] or apis["fanart"]):
        raise HTTPException(400, tr("Keine API-Keys hinterlegt (Einstellungen → Quellen)"))
    world = next((w for w in config.get()["worlds"] if w["id"] == it["world"]), None)
    res = await providers.search_source(kind, apis, it["type"], it["ids"], it["title"], it["year"], season,
                                        [s["number"] for s in it["seasons"]], (world or {}).get("languages"))
    for p in res["providers"]:
        if p["state"] == "error":
            log.warning("Source %s %s (%s / %s): %s", kind, p["name"], it["title"], slot, p["error"])
    return res


@app.get("/api/items/{item_id}/tmdb-id")
async def item_tmdb_id(item_id: str):
    """The TMDb number of a title (for links to sites that use it, like MediUX); looked up through the other IDs when it is not known yet."""
    it = _item(item_id)
    tid = (it.get("ids") or {}).get("tmdb")
    key = config.get()["apis"]["tmdb"]
    if not tid and key:
        try:
            tid = await providers.tmdb_find_id(key, it.get("ids") or {}, it["type"], it["title"], it["year"])
        except Exception as e:  # noqa: BLE001
            log.warning("TMDb number of %s: %s", it["title"], short(e))
    return {"id": str(tid) if tid else None}


def _builder_owner(item_id: str) -> None:
    """The poster builder keeps its look per title, and per Plex collection (key "col-…")."""
    if not builder_store.COLLECTION_KEY_RE.match(item_id):
        _item(item_id)


@app.get("/api/items/{item_id}/builder")
async def get_builder_project(item_id: str):
    """What the poster builder remembers about this title (None = nothing yet)."""
    _builder_owner(item_id)
    return {"project": await asyncio.to_thread(builder_store.load, item_id)}


@app.put("/api/items/{item_id}/builder")
async def put_builder_project(item_id: str, request: Request):
    _builder_owner(item_id)
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(400, tr("Ungültige Daten")) from None
    project = await asyncio.to_thread(builder_store.save, item_id, body)
    if project is None:
        raise HTTPException(400, tr("Ungültige Daten"))
    return {"project": project}


@app.delete("/api/items/{item_id}/builder")
async def delete_builder_project(item_id: str):
    _builder_owner(item_id)
    await asyncio.to_thread(builder_store.delete, item_id)
    return {"ok": True}


@app.post("/api/items/{item_id}/builder/file")
async def put_builder_file(item_id: str, file: Annotated[UploadFile, File()]):
    """Keep a picture from the user's computer (background or logo) for later visits of the builder."""
    _builder_owner(item_id)
    data = await file.read()
    name = await asyncio.to_thread(builder_store.put_file, item_id, data)
    if not name:
        raise HTTPException(400, tr("Kein gültiges Bild (PNG, JPG oder WebP bis 15 MB)"))
    return {"name": name, "url": builder_store.file_url(item_id, name)}


@app.get("/api/items/{item_id}/builder/file/{name}")
async def get_builder_file(item_id: str, name: str):
    _builder_owner(item_id)
    path = builder_store.file_path(item_id, name)
    if not path:
        raise HTTPException(404, tr("Datei nicht gefunden"))
    return FileResponse(path, headers={"Cache-Control": "private, max-age=31536000, immutable"})


@app.get("/api/styles")
async def get_styles():
    return styles.load()


class StyleBody(BaseModel):
    style: dict


@app.get("/api/styles/export")
async def export_styles(name: str = ""):
    """The presets as a file (one by name, or all) to keep or to share."""
    data = styles.load()["presets"]
    if name:
        if name not in data:
            raise HTTPException(404, tr("Vorlage nicht gefunden"))
        data = {name: data[name]}
    body = json.dumps({"format": "p5assets-presets", "version": 1, "presets": data}, ensure_ascii=False, indent=1)
    fname = f"p5assets-{_safe_name(name) if name else 'presets'}.json"
    return Response(body, media_type="application/json", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}", "Cache-Control": "no-store"})


@app.put("/api/styles/presets/{name}")
async def put_style_preset(name: str, body: StyleBody):
    if not await asyncio.to_thread(styles.save_preset, name, body.style):
        raise HTTPException(400, tr("Name ungültig oder zu viele Vorlagen"))
    return styles.load()


class DefaultBody(BaseModel):
    name: str | None = None


@app.put("/api/styles/default")
async def put_style_default(body: DefaultBody):
    if not await asyncio.to_thread(styles.set_default, body.name):
        raise HTTPException(404, tr("Vorlage nicht gefunden"))
    return styles.load()


@app.delete("/api/styles/presets/{name}")
async def delete_style_preset(name: str):
    await asyncio.to_thread(styles.delete_preset, name)
    return styles.load()


@app.get("/api/languages")
async def language_catalogue():
    return langmod.catalogue()


@app.get("/api/proxy")
async def proxy_preview(url: str):
    """Preview thumbnails of whitelisted hosts (avoids mixed-content/CORS/hotlink issues)."""
    data = await _download(url)
    kind = "image/png" if data.startswith(b"\x89PNG") else "image/webp" if data[8:12] == b"WEBP" else "image/gif" if data[:3] == b"GIF" else "image/jpeg"
    return Response(data, media_type=kind, headers={"Cache-Control": "public, max-age=86400"})


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
            log.info("Deleted (mirror): %s / %s (%s)", it["title"], slot, extra)
        trash.stash(gid, Path(path), move=True, label=slot)      # moved to the trash: can be undone for 30 days
        log.info("Deleted: %s / %s (%s)", it["title"], slot, path)
        await asyncio.to_thread(changes.record, source="delete", world=it["world"], item_id=it["id"], title=it["title"], slot=slot, type_=it["type"], gid=gid)
    await asyncio.to_thread(scanner.refresh_item, item_id)
    return {"ok": True, "trash": gid, "item": _public_item(_item(item_id), True)}


# ------------------------------------------------- trash / orphans / history ---

@app.get("/api/trash")
async def trash_list():
    return {"keep_days": trash.KEEP_DAYS, "groups": await asyncio.to_thread(trash.listing)}


@app.get("/api/changes")
async def changes_list(world: str = "", q: str = "", source: str = "", limit: int = 60, offset: int = 0):
    return await asyncio.to_thread(changes.listing, world, q, source, min(max(limit, 1), 200), max(offset, 0))


@app.get("/api/changes/{eid}/picture")
async def changes_picture(eid: str):
    p = changes.picture(eid)
    if not p:
        raise HTTPException(404)
    return FileResponse(p, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"})


@app.post("/api/trash/{gid}/restore")
async def trash_restore(gid: str):
    try:
        meta = await asyncio.to_thread(trash.restore, gid)
    except FileNotFoundError:
        raise HTTPException(404, tr("Eintrag nicht mehr vorhanden"))
    kometa.drop_indexes()
    item = next((i for i in scanner.STATE["items"] if i["id"] == meta.get("item_id")), None)
    if item:
        await asyncio.to_thread(scanner.refresh_item, item["id"])
        slot = meta.get("slot") or "poster"
        await asyncio.to_thread(changes.record, source="restore", world=item["world"], item_id=item["id"], title=item["title"], slot=slot, type_=item["type"], path=(item["slots"].get(slot) or {}).get("path"))
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
        raise HTTPException(404, tr("Eintrag nicht mehr vorhanden"))
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
        return w, [], tr("Der letzte Scan ist fehlgeschlagen oder fehlt – bitte zuerst erfolgreich scannen, sonst würden Titel fälschlich als verwaist gelten.")
    if failed:   # an unreachable Sonarr/Radarr would make all its titles look like orphans
        return w, [], tr("{0} war beim letzten Scan nicht erreichbar – die Liste wäre unvollständig. Bitte erneut scannen.", ", ".join(failed))
    index = kometa.get_index(root, True, w.get("search_depth", 3))
    col_root = collection_assets.root_for(w)          # the folders of the collections are never orphans
    known: set[str] = set()
    for it in scanner.STATE["items"]:
        if it["world"] == w["id"]:
            known.update(x.casefold() for x in [it["folder"], *(it.get("arr_folders") or []), *(it.get("mirror_folders") or [])] if x)
    out = []
    for key, d in index.dirs.items():
        if key in known or (col_root and (d == col_root or col_root in d.parents)):
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
    gid = trash.begin("orphan", world=w["id"], title=plural(len(body.paths), "orphaned folder", "orphaned folders"), slot="")
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
        raise HTTPException(400, tr("Unbekannter Kanal"))
    if body.channel not in notify.channels():
        raise HTTPException(400, tr("Kanal ist nicht aktiviert oder unvollständig eingerichtet"))
    title, text = notify.compose([{"title": "Beispiel-Film", "year": 2026, "world": "HD", "coming_soon": True},
                                  {"title": "Beispiel-Serie", "year": 2025, "world": "HD", "coming_soon": False}], False,
                                 (config.get()["notify"].get("base_url") or "").strip())
    res = await notify.send_all("Test message from p5assets", f"This is what a notification looks like:\n\n{title}\n{text}", [body.channel])
    if res[body.channel]:
        raise HTTPException(502, res[body.channel])
    return {"ok": True}


@app.get("/api/history")
async def coverage_history(world: str = "", days: int = 90):
    return {"points": history.get(_world(world)["id"], days)}


# ----------------------------------------------------------- import ---

def _collection_for(entry: dict, cols: list[dict]) -> dict | None:
    """The Plex collection a file is the poster of: named like the collection (or "<collection> Collection"), or "poster" inside a folder of that name."""
    path = Path(entry["name"])
    stem = path.parent.name if path.stem.casefold() in ("poster", "folder", "cover") and path.parent.name else path.stem
    n = kometa.normalize(re.sub(r"[_.]+", " ", stem))
    for g in cols:
        gn = kometa.normalize(g["title"])
        if gn and n in (gn, gn + "collection"):
            return g
    return None


def _suggest(entry: dict, fixed: dict | None, pool: list[dict], index: dict | None = None, cols: list[dict] | None = None) -> dict:
    out = dict(entry)
    out["item_id"] = None
    out["slot"] = None
    if entry["kind"] == "ignore":
        return out
    g = _collection_for(entry, cols or []) if entry["kind"] == "poster" and not fixed else None
    if g:                                              # the poster of a whole Plex collection
        out["collection_id"], out["collection_title"], out["slot"], out["collection"] = g["id"], g["title"], "collection", True
        return out
    if kometa.is_collection_name(entry["name"]):          # a poster for a whole collection: the user decides where it belongs
        out["collection"] = True
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
    drop_col = str(form.get("collection_id") or "")      # files dropped on a collection tile: its films are the titles to match
    col_films = _collection_films(drop_col)[0] if drop_col else None
    world = fixed["world"] if fixed else col_films[0]["world"] if col_films else _world(form.get("world") or None)["id"]
    pool = col_films if col_films else [i for i in scanner.STATE["items"] if i["world"] == world]
    cols = [g for g in collection_overview([i for i in scanner.STATE["items"] if i["world"] == world and i["type"] == "movie"], "", _hidden_collections()) if not g["hidden"]]
    if drop_col:
        cols = [g for g in cols if g["id"] == drop_col]
    wcfg = next((w for w in config.get()["worlds"] if w["id"] == world), None)
    sid = uploads.new_session()
    entries, errors = [], []
    for f in form.getlist("files"):
        name = getattr(f, "filename", "") or ""
        try:
            entries += uploads.stage_file(sid, name, await f.read())
        except ValueError as e:
            errors.append(str(e))
    match_index = kometa.index_items(pool) if not fixed else None
    suggestions = [_suggest(e, fixed, pool, match_index, cols) for e in entries]
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
    used_cols = {e["collection_id"] for e in suggestions if e.get("collection_id")}
    colinfo = {g["id"]: {"id": g["id"], "title": g["title"], "total": g["total"], "poster": collection_assets.state(wcfg, g["title"]) if wcfg else None} for g in cols if g["id"] in used_cols}
    return {"session": sid, "entries": suggestions, "errors": errors, "world": world, "targets": targets, "collections": colinfo}


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
                keys += [kometa.slot_key(n) for n in range(kometa.MAX_SEASON + 1)]
                keys += [k for k in i["slots"] if k not in keys]
            out.append({"id": i["id"], "title": i["title"], "year": i["year"], "type": i["type"],
                        "slots": [{"slot": k, "label": kometa.slot_label(kometa.parse_slot_key(k))} for k in keys]})
            if len(out) >= limit:
                break
    if nq:                                              # the collections of the world: a poster can be the poster of a collection
        world = _world(world)
        movies = [i for i in scanner.STATE["items"] if i["world"] == wid and i["type"] == "movie"]
        for g in collection_overview(movies, "", _hidden_collections()):
            if not g["hidden"] and nq in kometa.normalize(g["title"]):
                out.append({"id": "col:" + g["id"], "collection": True, "collection_id": g["id"], "title": g["title"], "year": None, "type": "collection", "total": g["total"],
                            "poster": collection_assets.state(world, g["title"]), "slots": [{"slot": "collection", "label": tr("Collection-Poster")}]})
    return out


class Assignment(BaseModel):
    file: str
    item_id: str | None = None
    slot: str = "poster"
    collection_id: str | None = None         # the poster of a Plex collection (instead of a film / series tile)
    create_folder: bool = False


class ApplyBody(BaseModel):
    assignments: list[Assignment]


@app.post("/api/import/{sid}/apply")
async def import_apply(sid: str, body: ApplyBody):
    done, failed = [], []
    for a in body.assignments:
        try:
            if a.collection_id:
                _, world, title = _collection_films(a.collection_id)
                path, _reason = await asyncio.to_thread(collection_assets.write_poster, world, title, uploads.staged_bytes(sid, a.file), a.create_folder, {})
                if path is None:
                    raise ValueError(tr("Der Ordner „{0}“ existiert noch nicht.", title))
                done.append({"item": title, "slot": "collection"})
                continue
            it = _item(a.item_id)
            _slot_check(it, a.slot)
            data = uploads.staged_bytes(sid, a.file)
            await _store(it, a.slot, data, "import")
            done.append({"item": it["title"], "slot": a.slot})
        except (ValueError, HTTPException, FileNotFoundError) as e:
            failed.append({"file": a.file, "error": getattr(e, "detail", None) or str(e)})
    uploads.drop_session(sid)
    log.info("Import: %d files applied, %d failed", len(done), len(failed))
    for f in failed:
        log.warning("Import failed: %s", f["error"])
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
        raise HTTPException(400, tr("Ungültige Logdatei")) from None


@app.get("/api/logs/download")
async def log_download(file: str = logs.LOG_NAME):
    try:
        p = logs.path_of(file)
    except ValueError:
        raise HTTPException(400, tr("Ungültige Logdatei")) from None
    if not p.is_file():
        raise HTTPException(404, tr("Logdatei nicht gefunden"))
    return FileResponse(p, media_type="text/plain", filename=file)


@app.delete("/api/logs")
async def log_clear(file: str = logs.LOG_NAME):
    try:
        logs.clear(file)
    except ValueError:
        raise HTTPException(400, tr("Ungültige Logdatei")) from None
    log.info("Log file cleared: %s", file)
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
    for name in ("style.css", "planets.js", "app.js", "builder.js"):
        html = html.replace(f"/static/{name}", f"/static/{name}?v={v}")
    # versioned icon addresses: browsers keep favicons very long, so a new version number makes them load the new icon
    ver = version.BASE_VERSION
    for name in ("favicon-32.png", "favicon-48.png", "apple-touch-icon.png"):
        html = html.replace(f"/static/{name}", f"/static/{name}?v={ver}")
    html = html.replace('href="/favicon.ico"', f'href="/favicon.ico?v={ver}"').replace('href="/manifest.webmanifest"', f'href="/manifest.webmanifest?v={ver}"')
    return HTMLResponse(html, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.get("/manifest.webmanifest")
async def manifest():
    """Makes p5assets installable as an app on the home screen (iPhone/iPad: Share > Add to Home Screen)."""
    return JSONResponse({
        "name": "p5assets", "short_name": "p5assets", "description": "Find and replace missing posters for Plex and Kometa",
        "start_url": "/", "scope": "/", "display": "standalone", "orientation": "any", "lang": "de",
        "background_color": "#02100a", "theme_color": "#02100a",
        "icons": [{"src": f"/static/icon-192.png?v={version.BASE_VERSION}", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                  {"src": f"/static/icon-512.png?v={version.BASE_VERSION}", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                  {"src": f"/static/icon-512.png?v={version.BASE_VERSION}", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
    }, media_type="application/manifest+json", headers={"Cache-Control": "no-cache"})


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(STATIC / "favicon.ico", media_type="image/x-icon", headers={"Cache-Control": "no-cache"})


class _RevalidatingStatic(StaticFiles):
    def file_response(self, *a, **kw):
        r = super().file_response(*a, **kw)
        r.headers["Cache-Control"] = "no-cache"      # always ask (ETag) – cheap, and new versions arrive immediately
        return r


app.mount("/static", _RevalidatingStatic(directory=STATIC), name="static")


# ------------------------------------------------------- Später suchen ---

class WatchBody(BaseModel):
    on: bool = True


async def _watch_look(it: dict, slot: str) -> list[dict] | None:
    """One online search for a tile: the textless pictures it finds (None = the search failed)."""
    try:
        res = await search_posters(it["id"], slot)
    except HTTPException:
        return None
    return watch.textless(res["images"])


@app.post("/api/items/{item_id}/{slot}/watch")
async def watch_set(item_id: str, slot: str, body: WatchBody):
    """Mark a tile "Später suchen" (what is online now counts as known) or take the mark away."""
    it = _item(item_id)
    _slot_check(it, slot)
    if not body.on:
        await asyncio.to_thread(watch.unmark, item_id, slot)
    else:
        found = await _watch_look(it, slot)
        if not await asyncio.to_thread(watch.mark, item_id, slot, [f["url"] for f in (found or [])]):
            raise HTTPException(400, tr("Zu viele Markierungen – bitte erst einige aufheben"))
        log.info("Marked 'search later': %s / %s (%d textless known)", it["title"], slot, len(found or []))
    return {"ok": True, "item": _public_item(_item(item_id), True)}


@app.post("/api/items/{item_id}/{slot}/watch/seen")
async def watch_seen(item_id: str, slot: str):
    _item(item_id)
    await asyncio.to_thread(watch.dismiss, item_id, slot)
    return {"ok": True, "item": _public_item(_item(item_id), True)}


@app.post("/api/watch/check")
async def watch_check_now():
    """Look at every marked tile now (also done once a day by itself)."""
    return await _watch_run(force=True)


async def _watch_run(force: bool = False) -> dict:
    todo = list(watch.marks().values()) if force else watch.due()
    news = []
    for m in todo[:40]:
        it = next((i for i in scanner.STATE["items"] if i["id"] == m["item_id"]), None)
        if not it:
            continue
        found = await _watch_look(it, m["slot"])
        if found is None:
            continue
        fresh = await asyncio.to_thread(watch.record_check, m["item_id"], m["slot"], found)
        if fresh:
            news.append({"title": it["title"], "slot": m["slot"], "count": len(fresh)})
    if news:
        log.info("Search later: new textless pictures for %s", ", ".join(f"{n['title']} ({n['slot']})" for n in news))
        if notify.channels(config.get()):
            lines = [f"{n['title']} – {n['slot']}: {n['count']}" for n in news]
            await notify.send_all("p5assets: " + tr("Neue Textless-Poster gefunden"), "\n".join(lines))
    return {"checked": len(todo[:40]), "news": news}


async def _watch_loop() -> None:
    await asyncio.sleep(120)
    while True:
        try:
            apis = config.get()["apis"]
            if config.get()["onboarded"] and (apis["tmdb"] or apis["tvdb"] or apis["fanart"]):
                await _watch_run()
        except Exception as e:  # noqa: BLE001
            log.warning("Search later: %s", short(e))
        await asyncio.sleep(3600)
