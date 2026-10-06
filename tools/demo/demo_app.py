"""Starts p5assets with fake online providers (TMDb / TVDB / fanart.tv) that serve fictional posters.
Only used to produce the README screenshots – see tools/demo/README.md."""
from __future__ import annotations

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))
sys.path.insert(0, str(HERE))

import uvicorn  # noqa: E402

import data  # noqa: E402
from app import main, providers  # noqa: E402
from posters import make_poster  # noqa: E402

ART = data.by_id()

# (index, language) variants offered per title
VARIANTS = [("xx", 1), ("xx", 2), ("de", 3), ("de", 4), ("de", 5), ("en", 6), ("en", 7), ("fr", 8)]


def _season(path: str) -> str:
    parts = path.strip("/").split("/")
    return parts[parts.index("season") + 1] if "season" in parts else "p"


def _poster_rows(tid: str, season: str, source: str, wanted: list[tuple[str, int]]):
    rows = []
    for lang, idx in wanted:
        rows.append({"id": tid, "season": season, "lang": lang, "idx": idx, "source": source})
    return rows


async def fake_tmdb_get(key, path, **params):
    tid = path.strip("/").split("/")[1]
    season = _season(path)
    posters = []
    for lang, idx in VARIANTS[:7]:
        posters.append({"file_path": f"/demo/{tid}/{season}/t{idx}-{lang}.jpg", "iso_639_1": None if lang == "xx" else lang,
                        "vote_average": 9 - idx * 0.7, "width": 2000, "height": 3000})
    return {"posters": posters}


async def fake_find(key, ids, kind, title, year):
    return str(ids.get("tmdb") or ids.get("tvdb"))


async def fake_fanart(key, kind, ids, tmdb_id, season):
    tid = str(tmdb_id or ids.get("tvdb") or ids.get("tmdb"))
    s = "p" if season is None else str(season)
    return [{"source": "fanart.tv", "url": f"https://assets.fanart.tv/demo/{tid}/{s}/f{idx}-{lang}.jpg",
             "preview": f"https://assets.fanart.tv/demo/{tid}/{s}/f{idx}-{lang}.jpg", "lang": lang, "score": 12 - idx}
            for lang, idx in ((VARIANTS[0]), (VARIANTS[3]), (VARIANTS[5]))]


async def fake_tvdb(key, pin, kind, ids, season):
    tid = str(ids.get("tvdb") or ids.get("tmdb"))
    s = "p" if season is None else str(season)
    return [{"source": "TVDB", "url": f"https://artworks.thetvdb.com/demo/{tid}/{s}/v{idx}-{lang}.jpg",
             "preview": f"https://artworks.thetvdb.com/demo/{tid}/{s}/v{idx}-{lang}.jpg", "lang": lang, "score": 0.5}
            for lang, idx in ((VARIANTS[1]), (VARIANTS[4]))]


async def fake_download(url: str) -> bytes:
    import io
    parts = url.split("/demo/")[1].split("/")
    tid, season, tag = parts[0], parts[1], parts[2].rsplit(".", 1)[0]
    idx_lang = tag[1:]
    idx, lang = idx_lang.split("-")
    t, y, h, s = ART[tid]
    styles = ["horizon", "signal", "harbor", "valley", "moon", "orbit", "city", "grid"]
    img = make_poster(t, y, h + (int(idx) - 1) * 23, styles[(int(idx) + styles.index(s)) % len(styles)] if int(idx) > 1 else s,
                      seed=int(idx) * 7 + int(tid), season=None if season == "p" else int(season), textless=(lang == "xx"))
    b = io.BytesIO()
    img.save(b, "JPEG", quality=85)
    return b.getvalue()


providers.tmdb_get = fake_tmdb_get
providers.tmdb_find_id = fake_find
providers.fanart_posters = fake_fanart
providers.tvdb_posters = fake_tvdb
main._download = fake_download

if __name__ == "__main__":
    uvicorn.run(main.app, host="127.0.0.1", port=int(os.environ.get("DEMO_PORT", "8099")), log_level="warning")
