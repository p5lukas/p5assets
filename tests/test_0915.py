"""0.9.15: history of changes, "Später suchen", removal of the Plex upload, links dropped from web pages."""
import json

from fastapi.testclient import TestClient

from app import changes, config, main, trash, watch


def _png(tmp_path, name="a.jpg"):
    from PIL import Image
    p = tmp_path / name
    Image.new("RGB", (60, 90), (10, 120, 30)).save(p, "JPEG")
    return p


def test_history_records_lists_filters_and_prunes(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    pic = _png(tmp_path)
    changes.record(source="upload", world="w1", item_id="i1", title="Alpha", slot="poster", type_="movie", path=pic)
    changes.record(source="builder", world="w1", item_id="i2", title="Beta", slot="poster", type_="movie", gid=None, path=pic)
    changes.record(source="delete", world="w2", item_id="i3", title="Gamma", slot="poster", type_="movie")
    out = changes.listing(world="w1")
    assert [e["title"] for e in out["entries"]] == ["Beta", "Alpha"] and out["total"] == 2           # newest first, only this world
    assert all(e["pic"] and changes.picture(e["id"]) for e in out["entries"])
    assert [e["title"] for e in changes.listing(q="gam")["entries"]] == ["Gamma"]
    assert [e["title"] for e in changes.listing(source="builder")["entries"]] == ["Beta"]
    assert changes.picture("../../etc") is None
    monkeypatch.setattr(changes, "MAX_ENTRIES", 2)
    changes.prune()
    assert changes.listing()["total"] == 2 and len(list((tmp_path / "changes").glob("*.jpg"))) <= 2     # the oldest line and its picture go


def test_history_marks_what_can_be_restored(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    gid = trash.begin("replace", item_id="i1", world="w1", title="Alpha", slot="poster", type="movie")
    old = _png(tmp_path, "old.jpg")
    trash.stash(gid, old, move=False, label="poster")
    changes.record(source="upload", world="w1", item_id="i1", title="Alpha", slot="poster", type_="movie", gid=gid)
    e = changes.listing()["entries"][0]
    assert e["can_restore"] and e["before"] == 0
    trash.remove(gid)
    assert not changes.listing()["entries"][0]["can_restore"]                                       # the old version is gone from the trash


def test_history_endpoint_and_picture(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    changes.record(source="plex", world="w1", item_id="i1", title="Alpha", slot="poster", type_="movie", path=_png(tmp_path))
    c = TestClient(main.app)
    r = c.get("/api/changes", params={"world": "w1"}).json()
    assert r["total"] == 1 and r["entries"][0]["source"] == "plex"
    assert c.get(f"/api/changes/{r['entries'][0]['id']}/picture").status_code == 200
    assert c.get("/api/changes/nope/picture").status_code == 404


def test_watch_only_reports_new_textless_pictures(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    imgs = [{"url": "u1", "lang": "xx"}, {"url": "u2", "lang": "en"}, {"url": "u3", "lang": "xx", "preview": "p3", "source": "TMDb"}]
    known = watch.textless(imgs)
    assert [k["url"] for k in known] == ["u1", "u3"]                                                    # only textless pictures count
    assert watch.mark("i1", "poster", ["u1"])
    fresh = watch.record_check("i1", "poster", known)
    assert [f["url"] for f in fresh] == ["u3"] and watch.marks()["i1|poster"]["new"][0]["preview"] == "p3"
    assert watch.record_check("i1", "poster", known) == []                                             # seen once: not reported twice
    watch.dismiss("i1", "poster")
    assert watch.marks()["i1|poster"]["new"] == [] and "u3" in watch.marks()["i1|poster"]["seen"]
    watch.unmark("i1")
    assert watch.marks() == {}
    assert watch.due() == []


def test_watch_is_due_once_a_day(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    watch.mark("i1", "poster", [])
    assert watch.due() == [] and len(watch.due(now=__import__("time").time() + watch.CHECK_EVERY + 5)) == 1


def test_upload_to_plex_setting_is_dropped_quietly(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "CONFIG_FILE", tmp_path / "config.json")
    monkeypatch.setattr(config, "_config", None, raising=False)
    (tmp_path / "config.json").write_text(json.dumps({"plex": {"url": "http://x", "token": "t", "upload_to_plex": True}}), "utf-8")
    cfg = config.load()
    assert "upload_to_plex" not in cfg["plex"] and cfg["plex"]["url"] == "http://x"
    assert "upload_to_plex" not in json.loads((tmp_path / "config.json").read_text("utf-8"))["plex"]


def test_proxy_refuses_other_hosts():
    c = TestClient(main.app)
    assert c.get("/api/proxy", params={"url": "https://example.com/x.jpg"}).status_code == 400


def test_presets_export_roundtrip(tmp_path, monkeypatch):
    from app import styles
    monkeypatch.setattr(styles.config, "CONFIG_DIR", tmp_path)
    styles.save_preset("Dark", {"font": "anton", "titleY": 0.9})
    c = TestClient(main.app)
    r = c.get("/api/styles/export")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["format"] == "p5assets-presets" and data["presets"]["Dark"]["titleY"] == 0.9
    one = c.get("/api/styles/export", params={"name": "Dark"}).json()
    assert list(one["presets"]) == ["Dark"] and c.get("/api/styles/export", params={"name": "nope"}).status_code == 404


def test_gzip_only_for_text_and_lists_never_for_pictures():
    wants = main._SelectiveGZip.wants
    assert wants("/") and wants("/static/app.js") and wants("/api/items") and wants("/api/collections") and wants("/i18n.js")
    assert not wants("/static/icon-192.png") and not wants("/static/fonts/anton.woff2")
    assert not wants("/api/collection-poster") and not wants("/api/items/w1-abc/plex-photo") and not wants("/api/collection-plex-photo")
    assert not wants("/api/items/w1-abc/builder/file/bg.jpg") and not wants("/api/thumb/w1-abc/poster") and not wants("/api/download-zip/w1-abc")


def test_marks_are_handed_out_as_a_copy(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    watch.mark("i1", "poster", [])
    got = watch.marks()
    got.clear()
    assert "i1|poster" in watch.marks()


def test_search_later_needs_a_working_search(tmp_path, monkeypatch):
    """No baseline (the search failed) = no mark: otherwise every textless poster that is already online would count as new later."""
    from app import scanner
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    item = {"id": "hd-1", "world": "hd", "title": "Alpha", "year": 2001, "type": "movie", "folder": "Alpha (2001)", "library_title": "Filme", "sources": ["Plex"], "letter": "A",
            "_nt": "alpha", "_fl": "alpha", "updated": 0, "dupes": [], "seasons": [], "ids": {}, "missing": 0, "missing_plex": 0, "in_plex": True, "coming_soon": False,
            "collections": [], "slots": {"poster": {"exists": True, "mtime": 1}}}
    monkeypatch.setitem(scanner.STATE, "items", [item])

    async def failing(it, slot):
        return None
    monkeypatch.setattr(main, "_watch_look", failing)
    c = TestClient(main.app)
    r = c.post("/api/items/hd-1/poster/watch", json={"on": True})
    assert r.status_code == 400 and watch.marks() == {}

    async def working(it, slot):
        return [{"url": "u1", "preview": "p1", "source": "TMDb"}]
    monkeypatch.setattr(main, "_watch_look", working)
    r = c.post("/api/items/hd-1/poster/watch", json={"on": True})
    assert r.status_code == 200 and r.json()["item"]["watch"] == {"poster": 0} and watch.marks()["hd-1|poster"]["seen"] == ["u1"]


def test_statistics_cache_follows_changes_of_the_data(monkeypatch):
    from app import scanner
    items = [{"id": f"a{i}", "world": "w", "type": "movie", "slots": {"poster": {"exists": True}}, "missing": 0, "missing_plex": 0, "coming_soon": False} for i in range(3)]
    monkeypatch.setitem(scanner.STATE, "items", items)
    monkeypatch.setattr(main, "_hidden_list", list)
    monkeypatch.setattr(main, "_hidden_collections", lambda: frozenset())
    main._STATS_CACHE.clear()
    first = main._cached_stats(items, "w", "", "", "", 0, False)
    assert first["items"] == 3 and main._cached_stats(items, "w", "", "", "", 0, False) is first          # worked out once
    items[0]["missing"] = 1
    scanner.STATE["rev"] = scanner.STATE.get("rev", 0) + 1                                                 # what refresh_item / a scan do after a change
    assert main._cached_stats(items, "w", "", "", "", 0, False)["counts"]["missing"] == 1


def test_folder_with_look_alike_names_is_not_guessed(tmp_path):
    from app import collection_assets
    (tmp_path / "Fast Furious").mkdir()
    assert collection_assets.folder_of(tmp_path, "Fast & Furious") == tmp_path / "Fast Furious"            # one clear match
    (tmp_path / "Fast-Furious").mkdir()
    assert collection_assets.folder_of(tmp_path, "Fast & Furious") is None                                 # two look alike: no guess
