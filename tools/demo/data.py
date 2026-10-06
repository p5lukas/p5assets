"""Fictional demo library used for the README screenshots and GIFs."""
from __future__ import annotations

from pathlib import Path

from posters import make_poster

# --- titles -----------------------------------------------------------------------------------------------
# Movie: (title, year, tmdb, hue, style, has_poster)   Show: (title, year, tvdb, seasons, hue, style, slots_with_assets)
MOVIES_HD = [
    ("Neon Horizon", 2024, 1001, 150, "horizon", True), ("The Last Signal", 2023, 1002, 200, "signal", True),
    ("Glass Harbor", 2022, 1003, 190, "harbor", True), ("Echo Valley", 2025, 1004, 28, "valley", True),
    ("Paper Moons", 2021, 1005, 275, "moon", False), ("Orbit Seven", 2026, 1006, 330, "orbit", True),
    ("Zero Hour", 2019, 1007, 350, "city", False), ("Silent Meridian", 2020, 1008, 120, "grid", True),
]
SHOWS_HD = [
    ("Static Dreams", 2021, 2001, 4, 205, "signal", {"poster", 1, 2, 3, 4}),
    ("Midnight Relay", 2022, 2002, 3, 265, "city", {"poster", 1}),
    ("Cobalt Station", 2020, 2003, 5, 215, "orbit", {"poster", 1, 2, 3}),
    ("The Archivists", 2023, 2004, 2, 35, "valley", set()),
]
MOVIES_4K = [
    ("Neon Horizon", 2024, 1001, 150, "horizon", True), ("Glass Harbor", 2022, 1003, 190, "harbor", False),
    ("Orbit Seven", 2026, 1006, 330, "orbit", True),
]
SHOWS_4K = [
    ("Static Dreams", 2021, 2001, 4, 205, "signal", {"poster", 1}),
    ("Cobalt Station", 2020, 2003, 5, 215, "orbit", set()),
]
# UMTK placeholder in Plex + the real Radarr folder
COMING_SOON = ("Dawn Protocol", 2026, 1009, 300, "moon")
RADARR_ONLY_HD = [  # (title, year, tmdb, monitored, has_file, available)
    ("Iron Lantern", 2027, 1010, True, False, False), ("Deep Field", 2026, 1011, True, False, True),
    ("Old Frequency", 2012, 1012, False, False, True),
]
RADARR_ONLY_4K = [("Deep Field", 2026, 1011, True, False, True)]

LIBS = {  # plex key -> (title, type, world)
    "1": ("Filme", "movie", "HD"), "2": ("Serien", "show", "HD"),
    "3": ("4K-Filme", "movie", "4K"), "4": ("4K-Serien", "show", "4K"),
}


def folder(title: str, year: int, tag: str = "") -> str:
    return f"{title} ({year}){tag}"


def by_id() -> dict[str, tuple]:
    out: dict[str, tuple] = {}
    for t, y, i, h, s, *_ in MOVIES_HD + MOVIES_4K:
        out[str(i)] = (t, y, h, s)
    for t, y, i, n, h, s, *_ in SHOWS_HD + SHOWS_4K:
        out[str(i)] = (t, y, h, s)
    t, y, i, h, s = COMING_SOON
    out[str(i)] = (t, y, h, s)
    for t, y, i, *_ in RADARR_ONLY_HD + RADARR_ONLY_4K:
        out[str(i)] = (t, y, 40 + (i % 9) * 30, "grid")
    return out


def build_assets(root: Path) -> None:
    """Kometa-style asset folders (assets/<Library>/<Title (Year)>/poster.jpg, Season01.jpg …)."""
    def put(world_dir: str, lib: str, rows, shows: bool):
        for row in rows:
            if shows:
                t, y, i, n, h, s, slots = row
                for slot in slots:
                    d = root / world_dir / lib / folder(t, y)
                    d.mkdir(parents=True, exist_ok=True)
                    if slot == "poster":
                        make_poster(t, y, h, s, seed=i).save(d / "poster.jpg", quality=88)
                    else:
                        make_poster(t, y, h + 14 * slot, s, seed=i + slot, season=slot).save(d / f"Season{slot:02d}.jpg", quality=88)
            else:
                t, y, i, h, s, ok = row
                if ok:
                    d = root / world_dir / lib / folder(t, y)
                    d.mkdir(parents=True, exist_ok=True)
                    make_poster(t, y, h, s, seed=i).save(d / "poster.jpg", quality=88)
    put("assets-hd", "Filme", MOVIES_HD, False)
    put("assets-hd", "Serien", SHOWS_HD, True)
    put("assets-4k", "4K-Filme", MOVIES_4K, False)
    put("assets-4k", "4K-Serien", SHOWS_4K, True)
