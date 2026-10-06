"""Online poster sources: TMDb, TheTVDB (v4) and fanart.tv."""
from __future__ import annotations

import asyncio
import time

import httpx

from . import languages as langs

TIMEOUT = httpx.Timeout(20.0, connect=8.0)
TMDB_IMG = "https://image.tmdb.org/t/p/"
ALLOWED_HOSTS = ("image.tmdb.org", "artworks.thetvdb.com", "assets.fanart.tv", "thetvdb.com", "www.thetvdb.com")

_tvdb_token: dict = {"key": None, "token": None, "ts": 0.0}


def ids_from_guids(guids: list[dict]) -> dict:
    out: dict = {}
    for g in guids or []:
        gid = g.get("id", "")
        if "://" in gid:
            scheme, value = gid.split("://", 1)
            out[scheme] = value
    return out


# ------------------------------------------------------------------ TMDb ---

def _tmdb_auth(key: str) -> tuple[dict, dict]:
    if key.startswith("eyJ"):
        return {"Authorization": f"Bearer {key}"}, {}
    return {}, {"api_key": key}


async def tmdb_get(key: str, path: str, **params) -> dict:
    headers, auth = _tmdb_auth(key)
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.get(f"https://api.themoviedb.org/3{path}", params={**auth, **params}, headers=headers)
        r.raise_for_status()
        return r.json()


async def tmdb_test(key: str) -> bool:
    await tmdb_get(key, "/configuration")
    return True


async def tmdb_find_id(key: str, ids: dict, kind: str, title: str, year: int | None) -> str | None:
    if ids.get("tmdb"):
        return ids["tmdb"]
    for source, ext in (("imdb", "imdb_id"), ("tvdb", "tvdb_id")):
        if ids.get(source):
            data = await tmdb_get(key, f"/find/{ids[source]}", external_source=ext)
            res = data.get("movie_results" if kind == "movie" else "tv_results") or []
            if res:
                return str(res[0]["id"])
    params = {"query": title}
    if year:
        params["year" if kind == "movie" else "first_air_date_year"] = year
    data = await tmdb_get(key, f"/search/{'movie' if kind == 'movie' else 'tv'}", **params)
    res = data.get("results") or []
    return str(res[0]["id"]) if res else None


async def tmdb_posters(key: str, wanted: list[str], kind: str, tmdb_id: str, season: int | None) -> list[dict]:
    # TMDb only returns the requested languages: the preferred ones, English and textless ("null")
    codes = ["null" if c == "xx" else c for c in dict.fromkeys([*wanted, "en", "xx"])]
    if kind == "movie":
        path = f"/movie/{tmdb_id}/images"
    elif season is None:
        path = f"/tv/{tmdb_id}/images"
    else:
        path = f"/tv/{tmdb_id}/season/{season}/images"
    data = await tmdb_get(key, path, include_image_language=",".join(codes))
    out = []
    for p in data.get("posters", []):
        out.append({
            "source": "TMDb",
            "url": f"{TMDB_IMG}original{p['file_path']}",
            "preview": f"{TMDB_IMG}w342{p['file_path']}",
            "lang": langs.norm_tmdb(p.get("iso_639_1")),
            "width": p.get("width"), "height": p.get("height"),
            "score": p.get("vote_average") or 0,
        })
    return out


# ------------------------------------------------------------- fanart.tv ---

async def fanart_posters(key: str, kind: str, ids: dict, tmdb_id: str | None, season: int | None) -> list[dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        if kind == "movie":
            mid = tmdb_id or ids.get("imdb")
            if not mid:
                return []
            r = await c.get(f"https://webservice.fanart.tv/v3/movies/{mid}", params={"api_key": key})
            field = "movieposter"
        else:
            if not ids.get("tvdb"):
                return []
            r = await c.get(f"https://webservice.fanart.tv/v3/tv/{ids['tvdb']}", params={"api_key": key})
            field = "tvposter" if season is None else "seasonposter"
        if r.status_code == 404:
            return []
        r.raise_for_status()
        data = r.json()
    out = []
    for p in data.get(field, []) or []:
        if season is not None and str(p.get("season")) not in (str(season),):
            continue
        url = p.get("url", "")
        out.append({
            "source": "fanart.tv", "url": url,
            "preview": url.replace("/fanart/", "/preview/"),
            "lang": langs.norm_fanart(p.get("lang")),
            "score": int(p.get("likes") or 0) * 0.5,
        })
    return out


async def fanart_test(key: str) -> bool:
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.get("https://webservice.fanart.tv/v3/movies/603", params={"api_key": key})
        if r.status_code in (401, 403):
            raise ValueError("Ungültiger fanart.tv API Key")
        r.raise_for_status()
    return True


# --------------------------------------------------------------- TheTVDB ---

async def _tvdb_login(key: str, pin: str = "") -> str:
    if _tvdb_token["key"] == key and _tvdb_token["token"] and time.time() - _tvdb_token["ts"] < 20 * 86400:
        return _tvdb_token["token"]
    body = {"apikey": key}
    if pin:
        body["pin"] = pin
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.post("https://api4.thetvdb.com/v4/login", json=body)
        if r.status_code == 401:
            raise ValueError("Ungültiger TVDB API Key / PIN")
        r.raise_for_status()
        token = r.json()["data"]["token"]
    _tvdb_token.update(key=key, token=token, ts=time.time())
    return token


async def tvdb_test(key: str, pin: str = "") -> bool:
    _tvdb_token["token"] = None
    await _tvdb_login(key, pin)
    return True


async def tvdb_posters(key: str, pin: str, kind: str, ids: dict, season: int | None) -> list[dict]:
    token = await _tvdb_login(key, pin)
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=headers) as c:
        arts: list[dict] = []
        if kind == "movie":
            mid = ids.get("tvdb")
            if not mid:
                return []
            r = await c.get(f"https://api4.thetvdb.com/v4/movies/{mid}/extended")
            if r.status_code == 404:
                return []
            r.raise_for_status()
            arts = [a for a in r.json()["data"].get("artworks") or [] if a.get("type") == 14]
        elif ids.get("tvdb"):
            sid = ids["tvdb"]
            if season is None:
                r = await c.get(f"https://api4.thetvdb.com/v4/series/{sid}/artworks", params={"type": 2})
                if r.status_code == 404:
                    return []
                r.raise_for_status()
                arts = r.json()["data"].get("artworks") or []
            else:
                r = await c.get(f"https://api4.thetvdb.com/v4/series/{sid}/extended", params={"short": "true"})
                if r.status_code == 404:
                    return []
                r.raise_for_status()
                seasons = [s for s in r.json()["data"].get("seasons") or []
                           if s.get("number") == season and (s.get("type") or {}).get("type") == "official"]
                if not seasons:
                    return []
                r = await c.get(f"https://api4.thetvdb.com/v4/seasons/{seasons[0]['id']}/extended")
                r.raise_for_status()
                arts = [a for a in r.json()["data"].get("artwork") or [] if a.get("type") == 7]
    out = []
    for a in arts:
        img = a.get("image") or ""
        if not img:
            continue
        if img.startswith("/"):
            img = "https://artworks.thetvdb.com" + img
        thumb = a.get("thumbnail") or img
        if thumb.startswith("/"):
            thumb = "https://artworks.thetvdb.com" + thumb
        out.append({"source": "TVDB", "url": img, "preview": thumb, "lang": langs.norm_tvdb(a.get("language")),
                    "score": (a.get("score") or 0) / 100000})
    return out


# ------------------------------------------------------------ aggregate ---

async def search(apis: dict, kind: str, ids: dict, title: str, year: int | None, season: int | None,
                 order: list[str] | None = None) -> dict:
    """Search all configured providers. `order` = preferred language order of the world ("xx" = textless).
    Returns the images (sorted by language rank, then score) and per-provider status for the UI tabs."""
    order = order or langs.DEFAULT_ORDER
    tmdb_id = ids.get("tmdb")
    status: dict[str, dict] = {n: {"name": n, "state": "nokey", "count": 0, "error": None} for n in ("TMDb", "TVDB", "fanart.tv")}
    tasks: dict[str, object] = {}
    if apis.get("tmdb"):
        try:
            tmdb_id = await tmdb_find_id(apis["tmdb"], ids, kind, title, year)
        except Exception as e:  # noqa: BLE001
            status["TMDb"].update(state="error", error=str(e) or e.__class__.__name__)
        if tmdb_id:
            tasks["TMDb"] = tmdb_posters(apis["tmdb"], order, kind, tmdb_id, season)
        elif status["TMDb"]["state"] == "nokey":
            status["TMDb"].update(state="ok")
    if apis.get("fanart"):
        tasks["fanart.tv"] = fanart_posters(apis["fanart"], kind, ids, tmdb_id, season)
    if apis.get("tvdb"):
        tasks["TVDB"] = tvdb_posters(apis["tvdb"], apis.get("tvdb_pin", ""), kind, ids, season)
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    images: list[dict] = []
    for name, res in zip(tasks, results):
        if isinstance(res, Exception):
            status[name].update(state="error", error=str(res) or res.__class__.__name__)
        else:
            status[name].update(state="ok", count=len(res))
            images.extend(res)
    rank = {c: i for i, c in enumerate(order)}
    images.sort(key=lambda x: (rank.get(x["lang"], len(order)), -x.get("score", 0)))
    catalogue = {l["code"]: l for l in langs.catalogue()}
    return {"images": images, "providers": list(status.values()),
            "languages": [{**catalogue.get(c, {"code": c, "name": c, "native": ""}), "rank": i} for i, c in enumerate(order)],
            "errors": {n: s["error"] for n, s in status.items() if s["error"]}}
