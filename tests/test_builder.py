import asyncio

import pytest
from fastapi.testclient import TestClient

from app import main, providers, scanner, styles


def test_sanitize_keeps_only_known_values_in_range():
    out = styles.sanitize({"font": "oswald", "upper": True, "mode": "text", "titleScale": 99, "titleY": -3,
                           "color": "#ABCDEF", "evil": "x", "gap": True})
    assert out == {"font": "oswald", "upper": True, "mode": "text", "titleScale": 2.0, "titleY": 0.0, "color": "#abcdef"}
    assert styles.sanitize("nope") == {}
    assert styles.sanitize({"font": "comic-sans", "color": "red"}) == {}
    assert styles.sanitize({"color": None}) == {"color": None}


def test_sanitize_blend():
    assert styles.sanitize({"blend": "dark", "blendAmount": 5, "blendHeight": 0.01}) == {"blend": "dark", "blendAmount": 1.0, "blendHeight": 0.1}
    assert styles.sanitize({"blend": "red"}) == {}


def test_sanitize_season_position():
    assert styles.sanitize({"seasonPos": "free", "seasonY": 2}) == {"seasonPos": "free", "seasonY": 0.97}
    assert styles.sanitize({"seasonPos": "left"}) == {}


def test_sanitize_trim_and_title_height_range():
    assert styles.sanitize({"trim": False, "titleY": 1.5}) == {"trim": False, "titleY": 1.0}
    assert styles.sanitize({"trim": "yes"}) == {}


def test_sanitize_logo_colour():
    assert styles.sanitize({"logoColorMode": "color", "logoColor": "#FFAA00"}) == {"logoColorMode": "color", "logoColor": "#ffaa00"}
    assert styles.sanitize({"logoColorMode": "x", "logoColor": "red"}) == {}
    p = builder_store.sanitize("hd-abc", {"posters": {"poster": {"ov": {"logoColorMode": "color", "logoColor": "#000000"}}}})
    assert p["posters"]["poster"]["ov"] == {"logoColorMode": "color", "logoColor": "#000000"}


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


def test_poster_count_is_series_poster_plus_every_season():
    base = {"id": "w:9", "world": "hd", "type": "show", "title": "S", "year": 2020, "folder": "S", "library_title": "", "missing": 0,
            "updated": 0, "in_plex": True, "sources": [], "dupes": [], "slots": {}, "ids": {}}
    seasons = [{"number": n, "title": "", "rating_key": None, "thumb": ""} for n in (0, 1, 2)]
    assert main._public_item({**base, "seasons": seasons})["poster_count"] == 4
    assert main._public_item({**base, "seasons": []})["poster_count"] == 1


# ----------------------------------------------------------- builder memory ---
import io

from PIL import Image

from app import builder_store


def _png(color=(255, 0, 0, 255), size=(20, 10)) -> bytes:
    b = io.BytesIO()
    Image.new("RGBA", size, color).save(b, "PNG")
    return b.getvalue()


@pytest.fixture()
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(builder_store.config, "CONFIG_DIR", tmp_path)
    return tmp_path


def test_project_is_sanitized_and_roundtrips(store):
    name = builder_store.put_file("hd-abc", _png())
    assert name and name.endswith(".png")
    url = builder_store.file_url("hd-abc", name)
    raw = {"look": {"font": "oswald", "evil": 1}, "allTitle": False, "titleText": "T" * 500,
           "logo": {"url": url, "preview": url, "source": "x"},
           "posters": {"poster": {"bg": {"url": "https://image.tmdb.org/t/p/original/a.jpg", "name": "n"}, "line": "Season One", "color": "#ABCDEF",
                                  "fit": {"zoom": 9, "x": -1, "fill": "blur", "color": "zzz"}, "ov": {"titleY": 5, "logo": {"url": "javascript:alert(1)"}, "bad": 1}},
                       "../evil": {"bg": None}, "season-2": "nope"}}
    p = builder_store.save("hd-abc", raw)
    assert p["look"] == {"font": "oswald"} and p["allTitle"] is False and len(p["titleText"]) == 120
    assert list(p["posters"]) == ["poster"]
    poster = p["posters"]["poster"]
    assert poster["color"] == "#abcdef" and poster["fit"] == {"zoom": 4.0, "x": 0.0, "y": 0.5, "fill": "blur", "color": "#12161c"}
    assert poster["ov"] == {"titleY": 1.0} and poster["bg"]["url"].startswith("https://")
    assert builder_store.load("hd-abc") == p
    assert builder_store.file_path("hd-abc", name) is not None


def test_unused_files_are_removed_and_urls_of_other_titles_rejected(store):
    keep = builder_store.put_file("hd-abc", _png())
    drop = builder_store.put_file("hd-abc", _png((0, 255, 0, 255)))
    other = builder_store.file_url("hd-zzz", keep)
    p = builder_store.save("hd-abc", {"logo": {"url": builder_store.file_url("hd-abc", keep)}, "posters": {"poster": {"bg": {"url": other}}}})
    assert p["posters"]["poster"]["bg"] is None
    assert builder_store.file_path("hd-abc", keep) and not builder_store.file_path("hd-abc", drop)


def test_put_file_rejects_non_images_and_bad_names(store):
    assert builder_store.put_file("hd-abc", b"not an image") is None
    assert builder_store.file_path("hd-abc", "../../config.json") is None
    with pytest.raises(ValueError):
        builder_store.load("../x")


def test_prune_keeps_recent_and_present_titles(store):
    for i in ("hd-old", "hd-new", "hd-here"):
        builder_store.save(i, {"posters": {}})
    import os
    import time
    old = time.time() - 40 * 86400
    for i in ("hd-old", "hd-here"):
        os.utime(store / "builder" / i, (old, old))
    assert builder_store.prune({"hd-here"}) == 1
    assert builder_store.load("hd-old") is None and builder_store.load("hd-new") and builder_store.load("hd-here")


def test_builder_endpoints(store, monkeypatch):
    monkeypatch.setitem(scanner.STATE, "items", [{"id": "hd-abc", "world": "hd", "title": "A", "year": 2020, "type": "show", "ids": {}}])
    c = TestClient(main.app)
    assert c.get("/api/items/hd-abc/builder").json() == {"project": None}
    up = c.post("/api/items/hd-abc/builder/file", files={"file": ("l.png", _png(), "image/png")})
    assert up.status_code == 200
    assert c.post("/api/items/hd-abc/builder/file", files={"file": ("l.png", b"nope", "image/png")}).status_code == 400
    assert c.get(up.json()["url"]).status_code == 200
    assert c.put("/api/items/hd-abc/builder", json={"posters": {"season-1": {"line": "Season One"}}}).json()["project"]["posters"]["season-1"]["line"] == "Season One"
    assert c.get("/api/items/hd-abc/builder").json()["project"]["v"] == 1
    assert c.delete("/api/items/hd-abc/builder").json() == {"ok": True}
    assert c.get("/api/items/hd-abc/builder").json() == {"project": None}
    assert c.get("/api/items/nope/builder").status_code == 404


def test_tmdb_404_is_no_error(monkeypatch):
    import httpx

    async def fake_get(key, path, **params):
        raise httpx.HTTPStatusError("x", request=httpx.Request("GET", "https://x"), response=httpx.Response(404))

    monkeypatch.setattr(providers, "tmdb_get", fake_get)
    assert asyncio.run(providers.tmdb_posters("k", ["de"], "show", "1", 0)) == []
    assert asyncio.run(providers.tmdb_logos("k", ["de"], "show", "1")) == []

    async def boom(key, path, **params):
        raise httpx.HTTPStatusError("x", request=httpx.Request("GET", "https://x"), response=httpx.Response(401))

    monkeypatch.setattr(providers, "tmdb_get", boom)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(providers.tmdb_posters("k", ["de"], "show", "1", 0))


def test_sanitize_tint_and_wide_zoom():
    assert styles.sanitize({"tint": "duotone", "tintA": "#ABCDEF", "tintB": "nope", "tintAmount": 7}) == {"tint": "duotone", "tintA": "#abcdef", "tintAmount": 1.0}
    p = builder_store.sanitize("hd-abc", {"posters": {"poster": {"fit": {"zoom": 0.01}, "ov": {"tint": "mono", "tintAmount": 0.5}}}})
    assert p["posters"]["poster"]["fit"]["zoom"] == 0.3 and p["posters"]["poster"]["ov"] == {"tint": "mono", "tintAmount": 0.5}


def test_search_source_merges_and_marks_flat(monkeypatch):
    async def stills(key, tmdb_id, seasons):
        return [{"source": "TMDb", "url": "u1", "lang": "xx", "score": -1001}, {"source": "TMDb", "url": "u2", "lang": "xx", "score": -2001}]

    async def find(*a, **k):
        return "603"

    monkeypatch.setattr(providers, "tmdb_stills", stills)
    monkeypatch.setattr(providers, "tmdb_find_id", find)
    res = asyncio.run(providers.search_source("stills", {"tmdb": "k"}, "show", {}, "T", 2020, 1, [0, 1, 2]))
    assert res["flat"] is True and [i["url"] for i in res["images"]] == ["u1", "u2"]
    assert [p["name"] for p in res["providers"]] == ["TMDb"]
    res = asyncio.run(providers.search_source("seasonart", {"fanart": ""}, "show", {}, "T", 2020, None, []))
    assert res["images"] == [] and {p["name"] for p in res["providers"]} == {"fanart.tv", "TVDB"} and res["flat"] is False


def test_fanart_seasonart_filters_season(monkeypatch):
    class R:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"seasonthumb": [{"url": "https://assets.fanart.tv/fanart/a.jpg", "season": "1", "lang": "en", "likes": "2"},
                                    {"url": "https://assets.fanart.tv/fanart/b.jpg", "season": "2", "lang": "en", "likes": "1"}]}

    class C:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *a, **k):
            return R()

    monkeypatch.setattr(providers.httpx, "AsyncClient", C)
    thumbs = asyncio.run(providers.fanart_seasonart("k", "show", {"tvdb": "9"}, 2))
    assert [i["url"][-5:] for i in thumbs] == ["b.jpg"] and thumbs[0]["landscape"] and thumbs[0]["label"] == "S02"
    assert [i["label"] for i in asyncio.run(providers.fanart_seasonart("k", "show", {"tvdb": "9"}, None))] == ["S01", "S02"]
    assert asyncio.run(providers.fanart_seasonart("k", "movie", {"tvdb": "9"}, None)) == []


def test_sources_endpoint(store, monkeypatch):
    item = {"id": "hd-abc", "world": "hd", "title": "A", "year": 2020, "type": "show", "ids": {}, "rating_key": "10",
            "seasons": [{"number": 1, "rating_key": "11"}], "slots": {"poster": {}, "season-1": {}}}
    monkeypatch.setitem(scanner.STATE, "items", [item])
    monkeypatch.setattr(main.config, "get", lambda: {"apis": {"tmdb": "", "tvdb": "", "fanart": ""}, "worlds": []})
    c = TestClient(main.app)
    for gone in ("bogus", "plex", "cast", "figures"):
        assert c.get(f"/api/items/hd-abc/sources/{gone}").status_code == 404
    assert c.get("/api/items/hd-abc/sources/stills", params={"slot": "poster"}).status_code == 400      # no API keys
    assert c.get("/api/items/hd-abc/plex-photo", params={"path": "/library/metadata/1/art/1"}).status_code in (404, 405)
