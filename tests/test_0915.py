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
