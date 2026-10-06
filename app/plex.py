"""Minimal async Plex client (JSON API) plus plex.tv PIN login."""
from __future__ import annotations

import asyncio

import httpx

PRODUCT = "p5assets"
VERSION = "1.0.0"


def plex_headers(client_id: str, token: str | None = None) -> dict:
    h = {
        "Accept": "application/json",
        "X-Plex-Product": PRODUCT,
        "X-Plex-Version": VERSION,
        "X-Plex-Client-Identifier": client_id,
        "X-Plex-Platform": "Web",
        "X-Plex-Device-Name": "p5assets",
    }
    if token:
        h["X-Plex-Token"] = token
    return h


class PlexError(Exception):
    pass


class Plex:
    def __init__(self, url: str, token: str, client_id: str):
        self.url = url.rstrip("/")
        self.token = token
        self.client = httpx.AsyncClient(
            base_url=self.url,
            headers=plex_headers(client_id, token),
            timeout=httpx.Timeout(30.0, connect=8.0),
            verify=False,  # many local servers use plex.direct / self signed certs
        )

    async def close(self) -> None:
        await self.client.aclose()

    async def _get(self, path: str, **params) -> dict:
        try:
            r = await self.client.get(path, params=params)
        except httpx.HTTPError as e:
            raise PlexError(f"Plex nicht erreichbar: {e}") from e
        if r.status_code == 401:
            raise PlexError("Plex-Token ungültig (401)")
        if r.status_code >= 400:
            raise PlexError(f"Plex antwortete mit HTTP {r.status_code}")
        return r.json().get("MediaContainer", {})

    async def identity(self) -> dict:
        mc = await self._get("/")
        return {"name": mc.get("friendlyName", "Plex"), "version": mc.get("version", ""),
                "machine_id": mc.get("machineIdentifier", "")}

    async def libraries(self) -> list[dict]:
        mc = await self._get("/library/sections")
        out = []
        for d in mc.get("Directory", []):
            if d.get("type") in ("movie", "show"):
                out.append({"key": str(d["key"]), "title": d.get("title", ""), "type": d["type"],
                            "locations": [loc.get("path") for loc in d.get("Location", [])]})
        return out

    async def items(self, section: str) -> list[dict]:
        mc = await self._get(f"/library/sections/{section}/all", includeGuids=1)
        return mc.get("Metadata", [])

    async def seasons(self, section: str) -> list[dict]:
        mc = await self._get(f"/library/sections/{section}/all", type=3)
        return mc.get("Metadata", [])

    async def metadata(self, rating_key: str) -> dict:
        mc = await self._get(f"/library/metadata/{rating_key}")
        md = mc.get("Metadata", [])
        return md[0] if md else {}

    async def show_locations(self, rating_keys: list[str], concurrency: int = 8) -> dict[str, list[str]]:
        sem = asyncio.Semaphore(concurrency)
        out: dict[str, list[str]] = {}

        async def one(rk: str):
            async with sem:
                try:
                    md = await self.metadata(rk)
                    out[rk] = [loc.get("path") for loc in md.get("Location", []) if loc.get("path")]
                except PlexError:
                    out[rk] = []

        await asyncio.gather(*(one(rk) for rk in rating_keys))
        return out

    async def image(self, path: str, width: int = 300, height: int = 450) -> bytes:
        try:
            r = await self.client.get("/photo/:/transcode",
                                      params={"url": path, "width": width, "height": height, "minSize": 1, "upscale": 1})
            if r.status_code >= 400:
                r = await self.client.get(path)
        except httpx.HTTPError as e:
            raise PlexError(str(e)) from e
        if r.status_code >= 400:
            raise PlexError(f"HTTP {r.status_code}")
        return r.content

    async def upload_poster(self, rating_key: str, data: bytes) -> None:
        r = await self.client.post(f"/library/metadata/{rating_key}/posters", content=data)
        if r.status_code >= 400:
            raise PlexError(f"Upload zu Plex fehlgeschlagen (HTTP {r.status_code})")


# ------------------------------------------------------------ plex.tv ---

async def create_pin(client_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post("https://plex.tv/api/v2/pins", params={"strong": "true"}, headers=plex_headers(client_id))
        r.raise_for_status()
        pin = r.json()
    auth_url = (
        "https://app.plex.tv/auth#?"
        f"clientID={client_id}&code={pin['code']}"
        f"&context%5Bdevice%5D%5Bproduct%5D={PRODUCT}"
    )
    return {"id": pin["id"], "code": pin["code"], "auth_url": auth_url}


async def check_pin(client_id: str, pin_id: int) -> str | None:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"https://plex.tv/api/v2/pins/{pin_id}", headers=plex_headers(client_id))
        r.raise_for_status()
        return r.json().get("authToken") or None


async def servers(client_id: str, token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get("https://plex.tv/api/v2/resources",
                        params={"includeHttps": 1, "includeRelay": 0},
                        headers=plex_headers(client_id, token))
        r.raise_for_status()
        out = []
        for res in r.json():
            if "server" not in (res.get("provides") or ""):
                continue
            conns = sorted(res.get("connections", []),
                           key=lambda c: (not c.get("local"), c.get("relay", False), c.get("protocol") != "http"))
            out.append({
                "name": res.get("name"),
                "token": res.get("accessToken") or token,
                "owned": res.get("owned", False),
                "connections": [{"uri": cn.get("uri"), "local": cn.get("local", False),
                                 "address": cn.get("address"), "port": cn.get("port")} for cn in conns],
            })
        return out


async def test_connection(url: str, token: str, client_id: str) -> dict:
    p = Plex(url, token, client_id)
    try:
        return await p.identity()
    finally:
        await p.close()


async def first_reachable(connections: list[dict], token: str, client_id: str) -> str | None:
    async def probe(uri: str):
        p = Plex(uri, token, client_id)
        p.client.timeout = httpx.Timeout(5.0)
        try:
            await p.identity()
            return uri
        except Exception:
            return None
        finally:
            await p.close()

    results = await asyncio.gather(*(probe(c["uri"]) for c in connections))
    for r in results:
        if r:
            return r
    return None
