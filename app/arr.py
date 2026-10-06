"""Sonarr / Radarr client: lists series / movies including the media folder name."""
from __future__ import annotations

import httpx

from . import kometa


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
        raise ArrError(f"nicht erreichbar: {e}") from e
    if r.status_code == 401:
        raise ArrError("API-Key ungültig (401)")
    if r.status_code >= 400:
        raise ArrError(f"HTTP {r.status_code}")
    try:
        return r.json()
    except ValueError as e:
        raise ArrError("Antwort ist kein JSON – stimmt die URL (inkl. URL-Base)?") from e


async def test(kind: str, url: str, api_key: str) -> dict:
    if "://" not in url:
        url = "http://" + url
    async with _client(url, api_key) as c:
        data = await _get(c, "/api/v3/system/status")
    app = data.get("appName") or kind.capitalize()
    if kind == "sonarr" and "sonarr" not in app.lower():
        raise ArrError(f"Das ist {app}, nicht Sonarr")
    if kind == "radarr" and "radarr" not in app.lower():
        raise ArrError(f"Das ist {app}, nicht Radarr")
    return {"app": app, "version": data.get("version", "")}


def _folder(entry: dict) -> str:
    for key in ("path", "folderName"):
        if entry.get(key):
            return kometa.media_folder_name(entry[key], False)
    return ""


async def fetch(inst: dict) -> list[dict]:
    """Normalised entries: {type, title, year, folder, ids, seasons[int], source}."""
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
                })
        else:
            for m in await _get(c, "/api/v3/movie"):
                out.append({
                    "type": "movie", "title": m.get("title", ""), "year": m.get("year"), "folder": _folder(m),
                    "ids": {k: str(v) for k, v in (("tmdb", m.get("tmdbId")), ("imdb", m.get("imdbId"))) if v},
                    "seasons": [], "source": inst["name"],
                })
    return out
