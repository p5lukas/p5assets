"""0.10.1: release dates from Radarr / Sonarr, hiding titles that are not released yet, "released now" notification."""
from fastapi.testclient import TestClient

from app import arr, config, main, notify, scanner


def test_radarr_release_follows_minimum_availability():
    m = {"inCinemas": "2016-03-10T00:00:00Z", "digitalRelease": "2017-10-15T00:00:00Z", "physicalRelease": "2016-05-27T00:00:00Z"}
    assert arr.movie_release({**m, "minimumAvailability": "inCinemas"}) == {"cinema": "2016-03-10", "digital": "2017-10-15", "disc": "2016-05-27", "from": "2016-03-10"}
    assert arr.movie_release({**m, "minimumAvailability": "released"})["from"] == "2016-05-27"        # the earlier of digital and disc
    assert arr.movie_release({**m, "minimumAvailability": "announced"})["from"] is None               # available at once
    assert arr.movie_release({"minimumAvailability": "released"}) == {"cinema": None, "digital": None, "disc": None, "from": None}
    assert arr.movie_release({"inCinemas": "garbage", "minimumAvailability": "inCinemas"})["cinema"] is None


def test_sonarr_release_per_season_only_for_seasons_without_files():
    s = {"firstAired": "2027-09-03T00:00:00Z", "seasons": [
        {"seasonNumber": 1, "statistics": {"previousAiring": "2020-01-01T00:00:00Z", "episodeFileCount": 8}},
        {"seasonNumber": 2, "statistics": {"nextAiring": "2027-09-03T00:00:00Z", "episodeFileCount": 0}}, {"seasonNumber": 3}]}
    assert arr.show_release(s) == {"from": "2027-09-03", "seasons": {2: "2027-09-03"}}


def _item(i, title, available, in_plex=False, missing=1, release=None):
    return {"id": f"w-{i}", "world": "w", "title": title, "year": 2027, "type": "movie", "folder": title, "library_title": "", "sources": ["Radarr"], "letter": title[0],
            "_nt": title.lower(), "_fl": title.lower(), "updated": 0, "dupes": [], "seasons": [], "ids": {}, "missing": missing, "missing_plex": 0, "in_plex": in_plex,
            "coming_soon": False, "collections": [], "available": available, "release": release, "slots": {"poster": {"exists": missing == 0}}}


def test_missing_list_hides_unreleased_and_sorts_by_date(monkeypatch):
    items = [_item(1, "Later", False, release={"from": "2027-12-01"}), _item(2, "Sooner", False, release={"from": "2027-03-14"}), _item(3, "Out", True), _item(4, "NoDate", False)]
    monkeypatch.setitem(scanner.STATE, "items", items)
    monkeypatch.setattr(main, "_world", lambda w=None: {"id": "w"})
    monkeypatch.setattr(main, "_hidden_list", list)
    monkeypatch.setattr(main, "_hidden_collections", lambda: frozenset())
    main._STATS_CACHE.clear()
    c = TestClient(main.app)
    shown = c.get("/api/items", params={"world": "w", "filter": "missing", "hide_unreleased": "true"}).json()
    assert [i["title"] for i in shown["items"]] == ["Out"] and shown["stats"]["counts"]["unreleased_missing"] == 3
    allm = c.get("/api/items", params={"world": "w", "filter": "missing", "sort": "release"}).json()
    assert [i["title"] for i in allm["items"]][:2] == ["Sooner", "Later"]                        # dated ones first, nearest date first
    assert allm["items"][0]["unreleased"] is True and allm["items"][0]["release"]["from"] == "2027-03-14"


def test_released_now_is_reported_once_and_only_without_poster():
    prev = {"w-1": 1, "w-2": 1, "w-3": 1, "w-9": 1}
    items = [_item(1, "Now Out", True), _item(2, "Still Waiting", False), _item(3, "Out With Poster", True, missing=0), _item(4, "Other", True)]
    got = notify.released_since(prev, items, {"w": "HD"})
    assert [g["title"] for g in got] == ["Now Out"]                                              # w-9 is gone, w-2 not out, w-3 has a poster
    title, text = notify.compose_released(got, False, "http://x")
    assert title == "p5assets: 1 title released, no poster yet" and "Now Out (2027)" in text and "http://x" in text
    assert config.DEFAULTS["notify"]["on_release"] is True


def test_dates_texts_exist_in_english():
    """The short texts of the date display are skipped by the general translation test (too short), so they are checked here."""
    import json
    from pathlib import Path
    en = json.loads((Path(main.__file__).parent / "i18n" / "en.json").read_text("utf-8"))
    for key in ("ab {0}", "{0} ab {1}", "Staffel {0}", "Termin unbekannt", "Kino", "Digital", "Disc", "Ausstrahlung", "Erscheint"):
        assert en.get(key), key


def _soon(i, title, days, in_plex=False, poster=False, seasons=None, typ="movie"):
    import datetime
    d = (datetime.datetime.now().astimezone().date() + datetime.timedelta(days=days)).isoformat()
    it = _item(i, title, False, in_plex=in_plex, missing=0 if poster else 1, release={"from": d, "seasons": seasons or {}})
    it["type"] = typ
    return it, d


def test_upcoming_strip_lists_soon_and_just_released_titles_without_poster(monkeypatch):
    import datetime
    a, _ = _soon(1, "Soon", 10)
    b, _ = _soon(2, "Far", 200)
    c, _ = _soon(3, "Just Out", -5)
    d, _ = _soon(4, "Long Ago", -90)
    e, _ = _soon(5, "Has Poster", 5, poster=True)
    day = (datetime.datetime.now().astimezone().date() + datetime.timedelta(days=20)).isoformat()
    show, _ = _soon(6, "Show In Plex", 400, in_plex=True, typ="show", seasons={2: day})
    show["slots"]["season-2"] = {"exists": False}
    monkeypatch.setitem(scanner.STATE, "items", [a, b, c, d, e, show])
    monkeypatch.setattr(main, "_world", lambda w=None: {"id": "w"})
    r = TestClient(main.app).get("/api/upcoming", params={"world": "w"}).json()
    assert [(x["item"]["title"], x["slot"]) for x in r["entries"]] == [("Just Out", "poster"), ("Soon", "poster"), ("Show In Plex", "season-2")]
    assert r["entries"][0]["in_days"] == -5 and r["entries"][2]["in_days"] == 20
    assert TestClient(main.app).get("/api/upcoming", params={"world": "w", "days": 365}).json()["entries"][-1]["item"]["title"] == "Far"
