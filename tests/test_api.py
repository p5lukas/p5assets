import pytest
from fastapi.testclient import TestClient

from app import main, scanner


def _item(i, title, **kw):
    base = {"id": f"w:{i}", "world": "hd", "title": title, "year": 2020, "type": "movie", "folder": f"{title} (2020)",
            "library_title": "Filme", "sources": ["Plex"], "letter": title[0].upper(), "_nt": title.lower(), "_fl": title.lower(),
            "updated": 0, "dupes": [], "seasons": [], "ids": {}, "missing": False, "missing_plex": False, "in_plex": True, "coming_soon": False, "slots": {"poster": {"exists": True}}}
    base.update(kw)
    return base


@pytest.fixture()
def client(monkeypatch):
    items = [_item(1, "Alpha"),
             _item(2, "Beta", missing=True, missing_plex=True, slots={"poster": {"exists": False}}),
             _item(3, "Gamma", coming_soon=True, missing=True, slots={"poster": {"exists": False}}),
             _item(4, "Delta", in_plex=False, missing=True)]
    monkeypatch.setitem(scanner.STATE, "items", items)
    monkeypatch.setattr(main, "_world", lambda w=None: {"id": "hd", "name": "HD", "assets_path": "/nonexistent"})
    return TestClient(main.app)


def _titles(c, **params):
    r = c.get("/api/items", params={"world": "hd", **params})
    assert r.status_code == 200
    return [i["title"] for i in r.json()["items"]], r.json()


def test_filters_and_counters(client):
    assert _titles(client)[0] == ["Alpha", "Beta", "Gamma", "Delta"]
    assert _titles(client, filter="plexmissing")[0] == ["Beta"]
    assert _titles(client, filter="comingsoon")[0] == ["Gamma"]
    assert _titles(client, filter="notplex")[0] == ["Delta"]
    assert _titles(client, filter="complete")[0] == ["Alpha"]
    _, body = _titles(client)
    assert body["stats"]["counts"]["plexmissing"] == 1 and body["stats"]["counts"]["comingsoon"] == 1


def test_search_and_letter(client):
    assert _titles(client, q="gam")[0] == ["Gamma"]
    assert _titles(client, letter="B")[0] == ["Beta"]


def test_trash_rejects_bad_ids(client):
    assert client.post("/api/trash/..%2Fetc/restore").status_code in (404, 405)
    assert client.post("/api/trash/does-not-exist/restore").status_code == 404
    assert client.delete("/api/trash/nope").status_code == 404


def test_app_starts_and_serves_index():
    """The whole app starts (lifespan, background loops) and the page is served with versioned assets."""
    with TestClient(main.app) as c:
        r = c.get("/")
        assert r.status_code == 200 and "/static/app.js?v=" in r.text
        assert c.get("/api/version").status_code == 200


def test_import_returns_targets_for_the_set_check(client):
    import io
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (20, 30), "red").save(b, "PNG")
    r = client.post("/api/import", data={"world": "hd"}, files=[("files", ("Alpha (2020).png", b.getvalue(), "image/png"))])
    assert r.status_code == 200
    body = r.json()
    assert body["entries"][0]["item_id"] == "w:1"
    assert "w:1" in body["targets"] and "slots" in body["targets"]["w:1"]


def test_import_does_not_assign_collection_posters(client):
    import io
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (20, 30), "red").save(b, "PNG")
    files = [("files", ("Alpha (2020).png", b.getvalue(), "image/png")), ("files", ("Alpha Collection.png", b.getvalue(), "image/png"))]
    body = client.post("/api/import", data={"world": "hd"}, files=files).json()
    by = {e["name"]: e for e in body["entries"]}
    assert by["Alpha (2020).png"]["item_id"] == "w:1"
    assert by["Alpha Collection.png"]["item_id"] is None and by["Alpha Collection.png"]["collection"] is True


def test_news_summary_is_shown_once_per_version(client, monkeypatch):
    from app import config, version
    monkeypatch.setattr(version, "BASE_VERSION", "0.4.1")
    config.update({"onboarded": True, "seen_news": [], "news_version_seen": ""})
    r = client.get("/api/news").json()
    assert r["show"] and r["count"] >= 10 and len(r["highlights"]) == 4 and r["version"] == "0.4.1"
    client.post("/api/news/seen", json={"ids": [], "version": True})
    assert client.get("/api/news").json()["show"] is False
    monkeypatch.setattr(version, "BASE_VERSION", "0.4.2")
    config.update({"seen_news": [e["id"] for e in r["all"]], "news_version_seen": "0.4.1"})
    import json
    from pathlib import Path
    entries = json.loads((Path(main.__file__).parent / "news.json").read_text("utf-8"))
    assert client.get("/api/news").json()["count"] == sum(1 for e in entries if e["version"] == "0.4.2")


def test_collection_overview(monkeypatch):
    col = [{"id": "1:900", "title": "Trilogie"}]
    items = [_item(1, "Teil 1", year=2005, collections=col), _item(2, "Teil 2", year=2008, collections=col, slots={"poster": {"exists": False}}),
             _item(3, "Allein", collections=[{"id": "1:901", "title": "Allein"}]), _item(4, "Ohne")]
    monkeypatch.setitem(scanner.STATE, "items", items)
    monkeypatch.setattr(main, "_world", lambda w=None: {"id": "hd", "name": "HD", "assets_path": "/nonexistent"})
    c = TestClient(main.app)
    cols = c.get("/api/collections", params={"world": "hd"}).json()["collections"]
    assert [g["title"] for g in cols] == ["Trilogie"]          # a collection with a single film is not worth listing
    assert (cols[0]["total"], cols[0]["with_poster"]) == (2, 1)
    assert [m["title"] for m in cols[0]["members"]] == ["Teil 1", "Teil 2"]
    assert c.get("/api/collections", params={"world": "hd", "q": "zzz"}).json()["collections"] == []
    r = c.get("/api/items", params={"world": "hd"}).json()
    assert r["stats"]["counts"]["collections"] == 1
    assert r["items"][0]["collections"] == col
