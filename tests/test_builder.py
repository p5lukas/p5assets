import asyncio

import pytest
from fastapi.testclient import TestClient

from app import main, providers, scanner, styles


def test_sanitize_keeps_only_known_values_in_range():
    out = styles.sanitize({"font": "oswald", "upper": True, "mode": "text", "titleScale": 99, "titleY": -3,
                           "color": "#ABCDEF", "evil": "x", "gap": True})
    assert out == {"font": "oswald", "upper": True, "mode": "text", "titleScale": 2.0, "titleY": 0.05, "color": "#abcdef"}
    assert styles.sanitize("nope") == {}
    assert styles.sanitize({"font": "comic-sans", "color": "red"}) == {}
    assert styles.sanitize({"color": None}) == {"color": None}


def test_presets_roundtrip_and_limits(tmp_path, monkeypatch):
    monkeypatch.setattr(styles.config, "CONFIG_DIR", tmp_path)
    assert styles.load() == {"presets": {}, "last": None}
    assert styles.save_preset("  Dark  ", {"font": "anton"})
    assert styles.load()["presets"] == {"Dark": {"font": "anton"}}
    assert not styles.save_preset("   ", {})
    styles.set_last({"mode": "logo"})
    assert styles.load()["last"] == {"mode": "logo"}
    styles.delete_preset("Dark")
    assert styles.load()["presets"] == {}
    for i in range(styles.MAX_PRESETS):
        assert styles.save_preset(f"p{i}", {})
    assert not styles.save_preset("one too many", {})
    assert styles.save_preset("p0", {"font": "lato"})  # overwriting an existing one is fine


def test_collect_sorts_by_language_then_score_and_reports_errors():
    status = {"A": {"state": "nokey", "count": 0, "error": None}, "B": {"state": "nokey", "count": 0, "error": None}}
    res = providers._collect(status, {"A": 1, "B": 2},
                             [[{"lang": "en", "score": 1}, {"lang": "de", "score": 1}, {"lang": "de", "score": 5}], RuntimeError("boom")],
                             ["de", "en"])
    assert [(i["lang"], i["score"]) for i in res] == [("de", 5), ("de", 1), ("en", 1)]
    assert status["A"]["state"] == "ok" and status["A"]["count"] == 3
    assert status["B"]["state"] == "error" and "boom" in status["B"]["error"]


def test_search_logos_merges_providers(monkeypatch):
    async def tm(*a, **k):
        return [{"url": "t", "lang": "en", "score": 1}]

    async def fa(*a, **k):
        return [{"url": "f", "lang": "de", "score": 1}]

    async def tv(*a, **k):
        raise RuntimeError("tvdb down")

    async def find(*a, **k):
        return "603"

    monkeypatch.setattr(providers, "tmdb_logos", tm)
    monkeypatch.setattr(providers, "fanart_logos", fa)
    monkeypatch.setattr(providers, "tvdb_logos", tv)
    monkeypatch.setattr(providers, "tmdb_find_id", find)
    res = asyncio.run(providers.search_logos({"tmdb": "k", "fanart": "k", "tvdb": "k"}, "movie", {}, "X", 2000, ["de", "en"]))
    assert [i["url"] for i in res["images"]] == ["f", "t"]
    assert "TVDB" in res["errors"]
    assert [l["code"] for l in res["languages"]] == ["de", "en"]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(styles.config, "CONFIG_DIR", tmp_path)
    monkeypatch.setitem(scanner.STATE, "items", [{"id": "w:1", "world": "hd", "title": "Alpha", "year": 2020, "type": "movie", "ids": {}}])
    return TestClient(main.app)


def test_style_endpoints(client):
    assert client.get("/api/styles").json() == {"presets": {}, "last": None}
    r = client.put("/api/styles/presets/Mine", json={"style": {"font": "cinzel", "titleY": 0.4, "x": 1}})
    assert r.status_code == 200 and r.json()["presets"] == {"Mine": {"font": "cinzel", "titleY": 0.4}}
    assert client.put("/api/styles/presets/%20", json={"style": {}}).status_code in (400, 404)
    assert client.put("/api/styles/last", json={"style": {"mode": "text"}}).json() == {"ok": True}
    assert client.get("/api/styles").json()["last"] == {"mode": "text"}
    assert client.delete("/api/styles/presets/Mine").json()["presets"] == {}


def test_logos_endpoint_needs_keys_and_returns_result(client, monkeypatch):
    monkeypatch.setattr(main.config, "get", lambda: {"apis": {"tmdb": "", "tvdb": "", "fanart": ""}, "worlds": []})
    assert client.get("/api/items/w:1/logos").status_code == 400

    async def fake(apis, kind, ids, title, year, order=None):
        return {"images": [{"url": "u", "lang": "en"}], "providers": [{"name": "TMDb", "state": "ok", "count": 1}], "errors": {}}

    monkeypatch.setattr(main.config, "get", lambda: {"apis": {"tmdb": "k", "tvdb": "", "fanart": ""}, "worlds": []})
    monkeypatch.setattr(main.providers, "search_logos", fake)
    assert client.get("/api/items/w:1/logos").json()["images"][0]["url"] == "u"
