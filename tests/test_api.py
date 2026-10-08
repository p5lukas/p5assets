import pytest
from fastapi.testclient import TestClient

from app import config, main, scanner


def _item(i, title, **kw):
    base = {"id": f"w:{i}", "world": "hd", "title": title, "year": 2020, "type": "movie", "folder": f"{title} (2020)",
            "library_title": "Filme", "sources": ["Plex"], "letter": title[0].upper(), "_nt": title.lower(), "_fl": title.lower(),
            "updated": 0, "custom": False, "dupes": [], "seasons": [], "ids": {}, "missing": False, "missing_plex": False, "in_plex": True, "coming_soon": False, "slots": {"poster": {"exists": True}}}
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
