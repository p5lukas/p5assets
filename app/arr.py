"""Sonarr / Radarr client: lists series / movies including the media folder name."""
from __future__ import annotations

import httpx

from . import kometa
from .errors import short
from .i18n import tr


class ArrError(Exception):
    pass


def _client(url: str, api_key: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=url.rstrip("/"), headers={"X-Api-Key": api_key, "Accept": "application/json"},
        timeout=httpx.Timeout(40.0, connect=8.0), verify=False, follow_redirects=True,
    )


async def _get(c: httpx.AsyncClient, path: str):
    try:
        r = await c.get(path)
    except httpx.HTTPError as e:
        raise ArrError(tr("nicht erreichbar: {0}", short(e))) from e
    if r.status_code == 401:
        raise ArrError(tr("API-Key ungültig (401)"))
    if r.status_code >= 400:
        raise ArrError(f"HTTP {r.status_code}")
    try:
        return r.json()
    except ValueError as e:
        raise ArrError(tr("Antwort ist kein JSON – stimmt die URL (inkl. URL-Base)?")) from e


async def test(kind: str, url: str, api_key: str) -> dict:
    if "://" not in url:
        url = "http://" + url
    async with _client(url, api_key) as c:
        data = await _get(c, "/api/v3/system/status")
    app = data.get("appName") or kind.capitalize()
    if kind == "sonarr" and "sonarr" not in app.lower():
        raise ArrError(tr("Das ist {0}, nicht Sonarr", app))
    if kind == "radarr" and "radarr" not in app.lower():
        raise ArrError(tr("Das ist {0}, nicht Radarr", app))
    return {"app": app, "version": data.get("version", "")}


def _folder(entry: dict) -> str:
    for key in ("path", "folderName"):
        if entry.get(key):
            return kometa.media_folder_name(entry[key], False)
    return ""


def _day(v) -> str | None:
    """'2027-03-14T00:00:00Z' -> '2027-03-14' (None when there is no date)."""
    return str(v)[:10] if v and len(str(v)) >= 10 and str(v)[4] == "-" else None


def movie_release(m: dict) -> dict:
    """The dates Radarr knows and the one from which Radarr counts the film as available (its "Minimum Availability"); None = available at once."""
    cinema, digital, disc = _day(m.get("inCinemas")), _day(m.get("digitalRelease")), _day(m.get("physicalRelease"))
    home = min([d for d in (digital, disc) if d], default=None)
    mode = str(m.get("minimumAvailability") or "released")
    start = None if mode in ("announced", "tba") else (cinema or home) if mode == "inCinemas" else home
    return {"cinema": cinema, "digital": digital, "disc": disc, "from": start}


def show_release(s: dict) -> dict:
    """Sonarr: when the series (and each season) is aired from."""
    seasons = {}
    for x in s.get("seasons", []):
        st = x.get("statistics") or {}
        d = _day(st.get("nextAiring")) or _day(st.get("previousAiring"))
        if "seasonNumber" in x and d and not int(st.get("episodeFileCount") or 0):
            seasons[int(x["seasonNumber"])] = d
    return {"from": _day(s.get("firstAired")) or _day(s.get("nextAiring")), "seasons": seasons}


async def fetch(inst: dict) -> list[dict]:
    """Normalised entries: {type, title, year, folder, ids, seasons[int], source, monitored, has_files, available}."""
    url = inst["url"] if "://" in inst["url"] else "http://" + inst["url"]
    out: list[dict] = []
    async with _client(url, inst["api_key"]) as c:
        if inst["kind"] == "sonarr":
            for s in await _get(c, "/api/v3/series"):
                out.append({
                    "type": "show", "title": s.get("title", ""), "year": s.get("year"), "folder": _folder(s),
                    "ids": {k: str(v) for k, v in (("tvdb", s.get("tvdbId")), ("tmdb", s.get("tmdbId")),
                                                   ("imdb", s.get("imdbId"))) if v},
                    "seasons": sorted({int(x["seasonNumber"]) for x in s.get("seasons", []) if "seasonNumber" in x}),
                    "source": inst["name"],
                    "monitored": bool(s.get("monitored", True)),
                    "has_files": int((s.get("statistics") or {}).get("episodeFileCount") or 0) > 0,
                    "available": s.get("status") != "upcoming",
                    "release": show_release(s),
                })
        else:
            for m in await _get(c, "/api/v3/movie"):
                out.append({
                    "type": "movie", "title": m.get("title", ""), "year": m.get("year"), "folder": _folder(m),
                    "ids": {k: str(v) for k, v in (("tmdb", m.get("tmdbId")), ("imdb", m.get("imdbId"))) if v},
                    "seasons": [], "source": inst["name"],
                    "monitored": bool(m.get("monitored", True)),
                    "has_files": bool(m.get("hasFile")),
                    "available": bool(m.get("isAvailable", True)),
                    "release": movie_release(m),
                })
    return out
