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
    assert _titles(client, filter="missing")[0] == ["Beta", "Gamma", "Delta"]
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
    monkeypatch.setattr(version, "BASE_VERSION", "0.4.6")
    config.update({"seen_news": [e["id"] for e in r["all"]], "news_version_seen": "0.4.5"})
    import json
    from pathlib import Path
    entries = json.loads((Path(main.__file__).parent / "news.json").read_text("utf-8"))
    assert client.get("/api/news").json()["count"] == sum(1 for e in entries if e["version"] == "0.4.6")


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
    assert c.get("/api/items", params={"world": "hd"}).json()["items"][0]["collections"] == col


def test_collection_hide(monkeypatch):
    from app import config
    config.update({"hidden_collections": []})
    col = [{"id": "1:900", "title": "Trilogie"}, {"id": "1:999", "title": "Riesen"}]
    items = [_item(i, f"Film {i}", collections=col) for i in range(3)]
    monkeypatch.setitem(scanner.STATE, "items", items)
    monkeypatch.setattr(main, "_world", lambda w=None: {"id": "hd", "name": "HD", "assets_path": "/nonexistent"})
    c = TestClient(main.app)
    assert c.post("/api/collections/hidden", json={"id": "1:999"}).status_code == 200
    got = {g["id"]: g["hidden"] for g in c.get("/api/collections", params={"world": "hd"}).json()["collections"]}
    assert got == {"1:900": False, "1:999": True}
    c.post("/api/collections/hidden", json={"id": "1:999", "hidden": False})
    assert not any(g["hidden"] for g in c.get("/api/collections", params={"world": "hd"}).json()["collections"])


def test_collection_detail_and_hidden_names(monkeypatch):
    from app import config
    config.update({"hidden_collections": ["1:777"]})              # plain IDs of older versions still work
    col = [{"id": "1:900", "title": "Trilogie"}]
    items = [_item(2, "Teil 2", year=2008, collections=col), _item(1, "Teil 1", year=2005, collections=col), _item(3, "Ohne")]
    monkeypatch.setitem(scanner.STATE, "items", items)
    monkeypatch.setattr(main, "_world", lambda w=None: {"id": "hd", "name": "HD", "assets_path": "/nonexistent"})
    c = TestClient(main.app)
    d = c.get("/api/collection", params={"id": "1:900"}).json()
    assert d["title"] == "Trilogie" and [m["title"] for m in d["members"]] == ["Teil 1", "Teil 2"] and d["hidden"] is False
    assert c.get("/api/collection", params={"id": "nope"}).status_code == 404
    c.post("/api/collections/hidden", json={"id": "1:900", "title": "Trilogie", "count": 2})
    hidden = config.get()["hidden_collections"]
    assert {"id": "1:900", "title": "Trilogie", "count": 2} in hidden and any(h["id"] == "1:777" for h in hidden if isinstance(h, dict))
    assert c.get("/api/collection", params={"id": "1:900"}).json()["hidden"] is True
    config.update({"hidden_collections": []})


def test_hidden_collections_get_names_from_the_scan(monkeypatch):
    from app import config
    config.update({"hidden_collections": ["1:900", "1:404"]})        # old format: IDs only
    col = [{"id": "1:900", "title": "Trilogie"}]
    monkeypatch.setitem(scanner.STATE, "items", [_item(1, "Teil 1", collections=col), _item(2, "Teil 2", collections=col)])
    c = TestClient(main.app)
    got = {h["id"]: h for h in c.get("/api/collections/hidden").json()["hidden"]}
    assert got["1:900"]["title"] == "Trilogie" and got["1:900"]["count"] == 2 and not got["1:900"]["gone"]
    assert got["1:404"]["gone"] is True
    assert all(isinstance(h, dict) for h in config.get()["hidden_collections"])            # converted and kept
    assert next(h for h in config.get()["hidden_collections"] if h["id"] == "1:900")["title"] == "Trilogie"
    config.update({"hidden_collections": []})


def test_language_header_switches_error_texts():
    with TestClient(main.app) as c:
        assert c.get("/api/items/nope", headers={"X-Lang": "de"}).json()["detail"] == "Titel nicht gefunden – bitte neu scannen"
        assert c.get("/api/items/nope", headers={"X-Lang": "en"}).json()["detail"] == "Title not found – please rescan"
        assert c.get("/api/items/nope").json()["detail"] == "Title not found – please rescan"          # English is the default
        js = c.get("/i18n.js")
        assert js.status_code == 200 and js.text.startswith("window.P5_EN = ") and "Title not found" in js.text


def test_every_translated_text_has_an_english_version():
    """All tr("…") keys of the backend and all T("…")/TP/pl texts of the UI exist in en.json (German text → English text)."""
    import ast
    import json
    import re
    from pathlib import Path

    app_dir = Path(main.__file__).parent
    en = json.loads((app_dir / "i18n" / "en.json").read_text("utf-8"))
    missing = []
    for f in app_dir.glob("*.py"):
        for node in ast.walk(ast.parse(f.read_text("utf-8"))):
            is_tr = isinstance(node, ast.Call) and getattr(node.func, "id", "") == "tr" and node.args and isinstance(node.args[0], ast.Constant)
            if is_tr and node.args[0].value not in en:
                missing.append(f"{f.name}: {node.args[0].value}")
    js = (app_dir / "static" / "app.js").read_text("utf-8")
    for m in re.finditer(r'\b(?:T|TP)\(\s*(?:[^,"()]+,\s*)?"((?:[^"\\]|\\.)*)"', js):
        key = json.loads('"' + m.group(1) + '"')
        if key not in en and re.search(r"[A-Za-zÄÖÜäöüß]{3}", key) and not re.fullmatch(r"[a-z:_/*,. -]+", key):
            missing.append("app.js: " + key)
    assert not missing, "\n".join(sorted(set(missing))[:20])
