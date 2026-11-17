"""Online poster sources: TMDb, TheTVDB (v4) and fanart.tv."""
from __future__ import annotations

import asyncio
import time

import httpx

from . import languages as langs
from .errors import short
from .i18n import tr

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


async def _tmdb_images(key: str, path: str, **params) -> dict:
    """TMDb answers 404 for a season or title it has no pictures for (Specials, announced seasons …): that is "nothing found", not an error."""
    try:
        return await tmdb_get(key, path, **params)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return {}
        raise


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
    data = await _tmdb_images(key, path, include_image_language=",".join(codes))
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


async def tmdb_collection_posters(key: str, wanted: list[str], movie_id: str) -> list[dict]:
    """The posters TMDb holds for the collection a film belongs to (found through the film)."""
    codes = ["null" if c == "xx" else c for c in dict.fromkeys([*wanted, "en", "xx"])]
    info = await _tmdb_images(key, f"/movie/{movie_id}")
    cid = (info.get("belongs_to_collection") or {}).get("id")
    if not cid:
        return []
    data = await _tmdb_images(key, f"/collection/{cid}/images", include_image_language=",".join(codes))
    return [{"source": "TMDb", "url": f"{TMDB_IMG}original{p['file_path']}", "preview": f"{TMDB_IMG}w342{p['file_path']}",
             "lang": langs.norm_tmdb(p.get("iso_639_1")), "width": p.get("width"), "height": p.get("height"), "score": p.get("vote_average") or 0}
            for p in data.get("posters", []) if p.get("file_path")]


async def tmdb_collection_id(apis: dict, movies: list[dict]) -> str | None:
    """The TMDb number of the collection of a Plex collection (found through its films: the first one that has one)."""
    if not apis.get("tmdb"):
        return None
    for m in movies:
        tid = await tmdb_find_id(apis["tmdb"], m["ids"], "movie", m["title"], m["year"])
        if tid:
            cid = ((await _tmdb_images(apis["tmdb"], f"/movie/{tid}")).get("belongs_to_collection") or {}).get("id")
            if cid:
                return str(cid)
    return None


async def search_collection(apis: dict, movies: list[dict], order: list[str] | None = None) -> dict:
    """Posters of a Plex collection from TMDb (same shape as ``search``); movies = [{ids, title, year}] of its films, the first one TMDb knows is used."""
    order = order or langs.DEFAULT_ORDER
    status = {"TMDb": {"name": "TMDb", "state": "nokey", "count": 0, "error": None}}
    tasks: dict[str, object] = {}
    if apis.get("tmdb"):
        for m in movies:
            try:
                tid = await tmdb_find_id(apis["tmdb"], m["ids"], "movie", m["title"], m["year"])
            except Exception as e:  # noqa: BLE001
                status["TMDb"].update(state="error", error=short(e))
                break
            if tid:
                tasks["TMDb"] = tmdb_collection_posters(apis["tmdb"], order, tid)
                break
        else:
            status["TMDb"].update(state="ok")
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    images = _collect(status, tasks, results, order)
    catalogue = {l["code"]: l for l in langs.catalogue()}
    return {"images": images, "providers": list(status.values()),
            "languages": [{**catalogue.get(c, {"code": c, "name": c, "native": ""}), "rank": i} for i, c in enumerate(order)],
            "errors": {n: s["error"] for n, s in status.items() if s["error"]}}


async def tmdb_logos(key: str, wanted: list[str], kind: str, tmdb_id: str) -> list[dict]:
    codes = ["null" if c == "xx" else c for c in dict.fromkeys([*wanted, "en", "xx"])]
    data = await _tmdb_images(key, f"/{'movie' if kind == 'movie' else 'tv'}/{tmdb_id}/images", include_image_language=",".join(codes))
    return [{"source": "TMDb", "url": f"{TMDB_IMG}original{p['file_path']}", "preview": f"{TMDB_IMG}w300{p['file_path']}",
             "lang": langs.norm_tmdb(p.get("iso_639_1")), "width": p.get("width"), "height": p.get("height"),
             "score": p.get("vote_average") or 0} for p in data.get("logos", []) if p.get("file_path")]


async def tmdb_backdrops(key: str, wanted: list[str], kind: str, tmdb_id: str) -> list[dict]:
    """Landscape pictures (backdrops) of a title, for the poster builder."""
    codes = ["null" if c == "xx" else c for c in dict.fromkeys([*wanted, "en", "xx"])]
    data = await _tmdb_images(key, f"/{'movie' if kind == 'movie' else 'tv'}/{tmdb_id}/images", include_image_language=",".join(codes))
    return [{"source": "TMDb", "url": f"{TMDB_IMG}original{p['file_path']}", "preview": f"{TMDB_IMG}w780{p['file_path']}",
             "lang": langs.norm_tmdb(p.get("iso_639_1")), "width": p.get("width"), "height": p.get("height"),
             "score": p.get("vote_average") or 0} for p in data.get("backdrops", []) if p.get("file_path")]


async def tmdb_stills(key: str, tmdb_id: str, seasons: list[int]) -> list[dict]:
    """Episode pictures (stills) of the given seasons, in episode order (the season details name one still per episode)."""
    sem = asyncio.Semaphore(5)

    async def one(n: int) -> list[dict]:
        async with sem:
            data = await _tmdb_images(key, f"/tv/{tmdb_id}/season/{n}")
        out = []
        for ep in data.get("episodes", []) or []:
            path = ep.get("still_path")
            if path:
                num = ep.get("episode_number") or 0
                out.append({"source": "TMDb", "url": f"{TMDB_IMG}original{path}", "preview": f"{TMDB_IMG}w300{path}", "lang": "xx",
                            "label": f"S{n:02d}E{num:02d} {ep.get('name') or ''}".strip(), "landscape": True, "score": -(n * 1000 + num)})
        return out

    res = await asyncio.gather(*(one(n) for n in seasons[:25]))
    return [i for part in res for i in part]


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


async def fanart_logos(key: str, kind: str, ids: dict, tmdb_id: str | None) -> list[dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        if kind == "movie":
            mid = tmdb_id or ids.get("imdb")
            if not mid:
                return []
            r = await c.get(f"https://webservice.fanart.tv/v3/movies/{mid}", params={"api_key": key})
            fields = ("hdmovielogo", "movielogo")
        else:
            if not ids.get("tvdb"):
                return []
            r = await c.get(f"https://webservice.fanart.tv/v3/tv/{ids['tvdb']}", params={"api_key": key})
            fields = ("hdtvlogo", "clearlogo")
        if r.status_code == 404:
            return []
        r.raise_for_status()
        data = r.json()
    out = []
    for field in fields:
        for p in data.get(field, []) or []:
            url = p.get("url", "")
            out.append({"source": "fanart.tv", "url": url, "preview": url.replace("/fanart/", "/preview/"),
                        "lang": langs.norm_fanart(p.get("lang")), "score": int(p.get("likes") or 0) * 0.5 + (1 if field.startswith("hd") else 0)})
    return out


async def fanart_backdrops(key: str, kind: str, ids: dict, tmdb_id: str | None) -> list[dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        if kind == "movie":
            mid = tmdb_id or ids.get("imdb")
            if not mid:
                return []
            r = await c.get(f"https://webservice.fanart.tv/v3/movies/{mid}", params={"api_key": key})
            field = "moviebackground"
        else:
            if not ids.get("tvdb"):
                return []
            r = await c.get(f"https://webservice.fanart.tv/v3/tv/{ids['tvdb']}", params={"api_key": key})
            field = "showbackground"
        if r.status_code == 404:
            return []
        r.raise_for_status()
        data = r.json()
    out = []
    for p in data.get(field, []) or []:
        url = p.get("url", "")
        if url:
            out.append({"source": "fanart.tv", "url": url, "preview": url.replace("/fanart/", "/preview/"),
                        "lang": langs.norm_fanart(p.get("lang")), "score": int(p.get("likes") or 0) * 0.5})
    return out


async def fanart_test(key: str) -> bool:
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.get("https://webservice.fanart.tv/v3/movies/603", params={"api_key": key})
        if r.status_code in (401, 403):
            raise ValueError(tr("Ungültiger fanart.tv-API-Key"))
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
            raise ValueError(tr("Ungültiger TVDB-API-Key oder PIN"))
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


async def tvdb_logos(key: str, pin: str, kind: str, ids: dict) -> list[dict]:
    """Clear logos from TheTVDB (artwork type 25 for movies, 23 for series)."""
    sid = ids.get("tvdb")
    if not sid:
        return []
    token = await _tvdb_login(key, pin)
    async with httpx.AsyncClient(timeout=TIMEOUT, headers={"Authorization": f"Bearer {token}"}) as c:
        if kind == "movie":
            r = await c.get(f"https://api4.thetvdb.com/v4/movies/{sid}/extended")
            if r.status_code == 404:
                return []
            r.raise_for_status()
            arts = [a for a in r.json()["data"].get("artworks") or [] if a.get("type") == 25]
        else:
            r = await c.get(f"https://api4.thetvdb.com/v4/series/{sid}/artworks", params={"type": 23})
            if r.status_code == 404:
                return []
            r.raise_for_status()
            arts = r.json()["data"].get("artworks") or []
    out = []
    for a in arts:
        img = a.get("image") or ""
        if not img:
            continue
        img = "https://artworks.thetvdb.com" + img if img.startswith("/") else img
        thumb = a.get("thumbnail") or img
        thumb = "https://artworks.thetvdb.com" + thumb if thumb.startswith("/") else thumb
        out.append({"source": "TVDB", "url": img, "preview": thumb, "lang": langs.norm_tvdb(a.get("language")),
                    "score": (a.get("score") or 0) / 100000})
    return out


async def tvdb_backdrops(key: str, pin: str, kind: str, ids: dict) -> list[dict]:
    """Backgrounds from TheTVDB (artwork type 15 for movies, 3 for series)."""
    sid = ids.get("tvdb")
    if not sid:
        return []
    token = await _tvdb_login(key, pin)
    async with httpx.AsyncClient(timeout=TIMEOUT, headers={"Authorization": f"Bearer {token}"}) as c:
        if kind == "movie":
            r = await c.get(f"https://api4.thetvdb.com/v4/movies/{sid}/extended")
            if r.status_code == 404:
                return []
            r.raise_for_status()
            arts = [a for a in r.json()["data"].get("artworks") or [] if a.get("type") == 15]
        else:
            r = await c.get(f"https://api4.thetvdb.com/v4/series/{sid}/artworks", params={"type": 3})
            if r.status_code == 404:
                return []
            r.raise_for_status()
            arts = r.json()["data"].get("artworks") or []
    out = []
    for a in arts:
        img = a.get("image") or ""
        if not img:
            continue
        img = "https://artworks.thetvdb.com" + img if img.startswith("/") else img
        thumb = a.get("thumbnail") or img
        thumb = "https://artworks.thetvdb.com" + thumb if thumb.startswith("/") else thumb
        out.append({"source": "TVDB", "url": img, "preview": thumb, "lang": langs.norm_tvdb(a.get("language")),
                    "width": a.get("width"), "height": a.get("height"), "score": (a.get("score") or 0) / 100000})
    return out


async def fanart_seasonart(key: str, kind: str, ids: dict, season: int | None) -> list[dict]:
    """The landscape thumbs fanart.tv files under a season (series only)."""
    if kind == "movie" or not ids.get("tvdb"):
        return []
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.get(f"https://webservice.fanart.tv/v3/tv/{ids['tvdb']}", params={"api_key": key})
        if r.status_code == 404:
            return []
        r.raise_for_status()
        data = r.json()
    out = []
    for p in data.get("seasonthumb", []) or []:
        url, n = p.get("url", ""), p.get("season")
        if not url or (season is not None and str(n) != str(season)):
            continue
        out.append({"source": "fanart.tv", "url": url, "preview": url.replace("/fanart/", "/preview/"), "lang": langs.norm_fanart(p.get("lang")),
                    "label": f"S{int(n):02d}" if str(n).isdigit() else "", "landscape": True, "score": int(p.get("likes") or 0) * 0.5})
    return out


async def tvdb_seasonart(key: str, pin: str, ids: dict, seasons: list[int]) -> list[dict]:
    """Backgrounds and banners that TheTVDB files under a season (artwork types 8 and 6)."""
    sid = ids.get("tvdb")
    if not sid:
        return []
    token = await _tvdb_login(key, pin)
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=TIMEOUT, headers={"Authorization": f"Bearer {token}"}) as c:
        r = await c.get(f"https://api4.thetvdb.com/v4/series/{sid}/extended")
        if r.status_code == 404:
            return []
        r.raise_for_status()
        by_number = {s.get("number"): s.get("id") for s in r.json()["data"].get("seasons") or [] if (s.get("type") or {}).get("type") in (None, "official")}
        sem = asyncio.Semaphore(4)

        async def one(n: int) -> list[dict]:
            season_id = by_number.get(n)
            if not season_id:
                return []
            async with sem:
                rr = await c.get(f"https://api4.thetvdb.com/v4/seasons/{season_id}/extended")
            if rr.status_code == 404:
                return []
            rr.raise_for_status()
            res = []
            for a in rr.json()["data"].get("artwork") or []:
                if a.get("type") not in (6, 8) or not a.get("image"):
                    continue
                img = a["image"]
                img = "https://artworks.thetvdb.com" + img if img.startswith("/") else img
                thumb = a.get("thumbnail") or img
                thumb = "https://artworks.thetvdb.com" + thumb if thumb.startswith("/") else thumb
                res.append({"source": "TVDB", "url": img, "preview": thumb, "lang": langs.norm_tvdb(a.get("language")),
                            "label": f"S{n:02d}" if n else "Specials", "landscape": True, "width": a.get("width"), "height": a.get("height"),
                            "score": (a.get("score") or 0) / 100000})
            return res

        for part in await asyncio.gather(*(one(n) for n in seasons[:25])):
            out.extend(part)
    return out


# ------------------------------------------------------------ aggregate ---

def _collect(status: dict, tasks: dict, results: list, order: list[str]) -> list[dict]:
    """Merge the results of the providers (and their status for the UI), sorted by language rank, then score."""
    images: list[dict] = []
    for name, res in zip(tasks, results):
        if isinstance(res, Exception):
            status[name].update(state="error", error=short(res))
        else:
            status[name].update(state="ok", count=len(res))
            images.extend(res)
    rank = {c: i for i, c in enumerate(order)}
    images.sort(key=lambda x: (rank.get(x["lang"], len(order)), -x.get("score", 0)))
    return images


async def _search_extra(apis: dict, kind: str, ids: dict, title: str, year: int | None, order: list[str] | None, tmdb_fn, fanart_fn, tvdb_fn) -> dict:
    """Shared by the logo and the backdrop search: TMDb, fanart.tv and TheTVDB (same shape as ``search``)."""
    order = order or langs.DEFAULT_ORDER
    tmdb_id = ids.get("tmdb")
    status: dict[str, dict] = {n: {"name": n, "state": "nokey", "count": 0, "error": None} for n in ("TMDb", "TVDB", "fanart.tv")}
    tasks: dict[str, object] = {}
    if apis.get("tmdb"):
        try:
            tmdb_id = await tmdb_find_id(apis["tmdb"], ids, kind, title, year)
        except Exception as e:  # noqa: BLE001
            status["TMDb"].update(state="error", error=short(e))
        if tmdb_id:
            tasks["TMDb"] = tmdb_fn(apis["tmdb"], order, kind, tmdb_id)
        elif status["TMDb"]["state"] == "nokey":
            status["TMDb"].update(state="ok")
    if apis.get("fanart"):
        tasks["fanart.tv"] = fanart_fn(apis["fanart"], kind, ids, tmdb_id)
    if apis.get("tvdb"):
        tasks["TVDB"] = tvdb_fn(apis["tvdb"], apis.get("tvdb_pin", ""), kind, ids)
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    images = _collect(status, tasks, results, order)
    catalogue = {l["code"]: l for l in langs.catalogue()}
    return {"images": images, "providers": list(status.values()),
            "languages": [{**catalogue.get(c, {"code": c, "name": c, "native": ""}), "rank": i} for i, c in enumerate(order)],
            "errors": {n: s["error"] for n, s in status.items() if s["error"]}}


async def search_logos(apis: dict, kind: str, ids: dict, title: str, year: int | None, order: list[str] | None = None) -> dict:
    """Clear logos of a title from TMDb, fanart.tv and TheTVDB (same shape as ``search``)."""
    return await _search_extra(apis, kind, ids, title, year, order,
                               lambda *a: tmdb_logos(*a), lambda *a: fanart_logos(*a), lambda *a: tvdb_logos(*a))


async def search_backdrops(apis: dict, kind: str, ids: dict, title: str, year: int | None, order: list[str] | None = None) -> dict:
    """Backdrops (landscape pictures) of a title for the poster builder."""
    return await _search_extra(apis, kind, ids, title, year, order,
                               lambda *a: tmdb_backdrops(*a), lambda *a: fanart_backdrops(*a), lambda *a: tvdb_backdrops(*a))


SOURCE_KINDS = ("backdrop", "stills", "seasonart")


async def search_source(kind: str, apis: dict, item_type: str, ids: dict, title: str, year: int | None,
                        season: int | None, season_numbers: list[int], order: list[str] | None = None) -> dict:
    """The extra picture sources of the poster builder: backdrops, episode pictures (stills), season pictures.
    Same shape as ``search`` (images, providers, languages); ``flat`` = no language groups (the pictures carry a label instead)."""
    if kind == "backdrop":
        return await search_backdrops(apis, item_type, ids, title, year, order)
    order = order or langs.DEFAULT_ORDER
    wanted = [season] if season is not None else sorted(set(season_numbers))
    status: dict[str, dict] = {}
    tasks: dict[str, object] = {}
    if kind == "stills":
        status["TMDb"] = {"name": "TMDb", "state": "nokey", "count": 0, "error": None}
        if apis.get("tmdb"):
            tmdb_id = ids.get("tmdb")
            try:
                tmdb_id = await tmdb_find_id(apis["tmdb"], ids, item_type, title, year)
            except Exception as e:  # noqa: BLE001
                status["TMDb"].update(state="error", error=short(e))
            if tmdb_id:
                tasks["TMDb"] = tmdb_stills(apis["tmdb"], tmdb_id, wanted)
            elif status["TMDb"]["state"] == "nokey":
                status["TMDb"].update(state="ok")
    else:                                                          # "seasonart"
        status["fanart.tv"] = {"name": "fanart.tv", "state": "nokey", "count": 0, "error": None}
        status["TVDB"] = {"name": "TVDB", "state": "nokey", "count": 0, "error": None}
        if apis.get("fanart"):
            tasks["fanart.tv"] = fanart_seasonart(apis["fanart"], item_type, ids, season)
        if apis.get("tvdb"):
            tasks["TVDB"] = tvdb_seasonart(apis["tvdb"], apis.get("tvdb_pin", ""), ids, wanted)
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    images = _collect(status, tasks, results, order)
    images.sort(key=lambda i: -i.get("score", 0))
    catalogue = {l["code"]: l for l in langs.catalogue()}
    return {"images": images, "providers": list(status.values()), "flat": kind == "stills",
            "languages": [{**catalogue.get(c, {"code": c, "name": c, "native": ""}), "rank": i} for i, c in enumerate(order)],
            "errors": {n: s["error"] for n, s in status.items() if s["error"]}}


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
            status["TMDb"].update(state="error", error=short(e))
        if tmdb_id:
            tasks["TMDb"] = tmdb_posters(apis["tmdb"], order, kind, tmdb_id, season)
        elif status["TMDb"]["state"] == "nokey":
            status["TMDb"].update(state="ok")
    if apis.get("fanart"):
        tasks["fanart.tv"] = fanart_posters(apis["fanart"], kind, ids, tmdb_id, season)
    if apis.get("tvdb"):
        tasks["TVDB"] = tvdb_posters(apis["tvdb"], apis.get("tvdb_pin", ""), kind, ids, season)
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    images = _collect(status, tasks, results, order)
    catalogue = {l["code"]: l for l in langs.catalogue()}
    return {"images": images, "providers": list(status.values()),
            "languages": [{**catalogue.get(c, {"code": c, "name": c, "native": ""}), "rank": i} for i, c in enumerate(order)],
            "errors": {n: s["error"] for n, s in status.items() if s["error"]}}
