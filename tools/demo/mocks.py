"""Mock Plex + Sonarr/Radarr (one FastAPI app) serving the fictional demo library."""
from __future__ import annotations

import io

from fastapi import APIRouter, FastAPI, Header, HTTPException
from fastapi.responses import Response

import data
from posters import make_poster

app = FastAPI()
ART = data.by_id()
_cache: dict[str, bytes] = {}


def jpeg(img) -> bytes:
    b = io.BytesIO()
    img.save(b, "JPEG", quality=82)
    return b.getvalue()


# ------------------------------------------------------------------ Plex ---
def plex_items(lib: str) -> list[dict]:
    title, kind, world = data.LIBS[lib]
    rows = {"1": data.MOVIES_HD, "2": data.SHOWS_HD, "3": data.MOVIES_4K, "4": data.SHOWS_4K}[lib]
    root = "/media/" + title
    out = []
    for row in rows:
        if kind == "movie":
            t, y, i, h, s, _ = row
            f = data.folder(t, y)
            out.append({"ratingKey": str(i * 10 + int(lib)), "title": t, "year": y, "thumb": f"/t/{i}/{world}", "Guid": [{"id": f"tmdb://{i}"}],
                        "Media": [{"Part": [{"file": f"{root}/{f}/{f}.mkv"}]}]})
        else:
            t, y, i, n, h, s, _ = row
            f = data.folder(t, y)
            out.append({"ratingKey": str(i * 10 + int(lib)), "title": t, "year": y, "thumb": f"/t/{i}/{world}", "Guid": [{"id": f"tvdb://{i}"}],
                        "Location": [{"path": f"{root}/{f}"}]})
    if lib == "3":  # UMTK placeholder
        t, y, i, h, s = data.COMING_SOON
        f = data.folder(t, y, " {edition-Coming Soon}")
        out.append({"ratingKey": str(i * 10 + 3), "title": t, "year": y, "thumb": f"/t/{i}/4K", "Guid": [{"id": f"tmdb://{i}"}],
                    "Media": [{"Part": [{"file": f"{root}/{f}/{f}.mkv"}]}]})
    return out


@app.get("/")
def identity():
    return {"MediaContainer": {"friendlyName": "Demo Plex", "version": "1.41", "machineIdentifier": "demo"}}


@app.get("/library/sections")
def sections():
    return {"MediaContainer": {"Directory": [{"key": k, "title": v[0], "type": v[1], "Location": [{"path": "/media/" + v[0]}]} for k, v in data.LIBS.items()]}}


@app.get("/library/sections/{key}/all")
def section_all(key: str, type: int = 0):
    if type == 3:
        out = []
        rows = data.SHOWS_HD if key == "2" else data.SHOWS_4K
        world = data.LIBS[key][2]
        for t, y, i, n, h, s, _ in rows:
            for k in range(0, n + 1):
                out.append({"ratingKey": str(i * 1000 + k * 10 + int(key)), "index": k, "parentRatingKey": str(i * 10 + int(key)),
                            "title": "Specials" if k == 0 else f"Staffel {k}", "thumb": f"/t/{i}/{world}"})
        return {"MediaContainer": {"Metadata": out}}
    return {"MediaContainer": {"Metadata": plex_items(key)}}


@app.get("/photo/:/transcode")
def transcode(url: str = ""):
    return thumb(*url.rstrip("/").split("/")[-2:])


@app.get("/t/{tid}/{world}")
def thumb(tid: str, world: str):
    """The Plex poster carries a simulated Kometa overlay (badge) – exactly why p5assets only uses it as a preview."""
    key = f"{tid}-{world}"
    if key not in _cache:
        t, y, h, s = ART[tid]
        _cache[key] = jpeg(make_poster(t, y, h, s, seed=int(tid), badge="4K · HDR10" if world == "4K" else "1080p · Dolby"))
    return Response(_cache[key], media_type="image/jpeg")


# ----------------------------------------------------------- Sonarr/Radarr ---
def chk(k):
    if k != "demo":
        raise HTTPException(401)


def make_router(kind: str, world: str) -> APIRouter:
    r = APIRouter(prefix=f"/{kind}-{world.lower()}")

    @r.get("/api/v3/system/status")
    def status(x_api_key: str = Header(None)):
        chk(x_api_key)
        return {"appName": kind.capitalize(), "version": "4.0.9" if kind == "sonarr" else "5.14"}

    if kind == "sonarr":
        @r.get("/api/v3/series")
        def series(x_api_key: str = Header(None)):
            chk(x_api_key)
            rows = data.SHOWS_HD if world == "HD" else data.SHOWS_4K
            return [{"title": t, "year": y, "path": f"/tv/{data.folder(t, y)}", "tvdbId": i, "monitored": True, "status": "continuing",
                     "statistics": {"episodeFileCount": 10}, "seasons": [{"seasonNumber": k} for k in range(0, n + 1)]} for t, y, i, n, *_ in rows]
    else:
        @r.get("/api/v3/movie")
        def movies(x_api_key: str = Header(None)):
            chk(x_api_key)
            rows = data.MOVIES_HD if world == "HD" else data.MOVIES_4K
            out = [{"title": t, "year": y, "path": f"/movies/{data.folder(t, y)}", "tmdbId": i, "monitored": True, "hasFile": True, "isAvailable": True}
                   for t, y, i, *_ in rows]
            if world == "4K":
                t, y, i, *_ = data.COMING_SOON
                out.append({"title": t, "year": y, "path": f"/movies/{data.folder(t, y)}", "tmdbId": i, "monitored": True, "hasFile": False, "isAvailable": False})
            for t, y, i, mon, has, avail in (data.RADARR_ONLY_HD if world == "HD" else data.RADARR_ONLY_4K):
                out.append({"title": t, "year": y, "path": f"/movies/{data.folder(t, y)}", "tmdbId": i, "monitored": mon, "hasFile": has, "isAvailable": avail})
            return out
    return r


for _w in ("HD", "4K"):
    for _k in ("sonarr", "radarr"):
        app.include_router(make_router(_k, _w))
