"""Kometa asset naming rules and filename interpretation.

Kometa looks for assets either in folders (``asset_folders: true``)::

    <assets>/<Media Folder Name>/poster.jpg
    <assets>/<Media Folder Name>/Season01.jpg

or flat (``asset_folders: false``)::

    <assets>/<Media Folder Name>.jpg
    <assets>/<Media Folder Name>_Season01.jpg

The name has to match the folder the media lives in on disk.
"""
from __future__ import annotations

import difflib
import threading
from collections import deque
import re
import unicodedata
from pathlib import Path, PurePosixPath, PureWindowsPath

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")
MAX_SEASON = 50  # Staffel-Slots, die immer angeboten werden (auch ohne dass Plex sie kennt)
UPLOAD_EXTS = IMAGE_EXTS + (".gif", ".bmp", ".tif", ".tiff", ".avif")


# ---------------------------------------------------------------- slots ---

def slot_key(season: int | None) -> str:
    return "poster" if season is None else f"season-{season}"


def parse_slot_key(slot: str) -> int | None:
    if slot == "poster":
        return None
    m = re.fullmatch(r"season-(\d{1,4})", slot)
    if not m:
        raise ValueError(f"Unbekannter Slot: {slot}")
    return int(m.group(1))


def slot_allowed(item_type: str, known: set[str], slot: str) -> bool:
    """A slot is valid if the item knows it, or if it is a show and the season is within 0..MAX_SEASON."""
    if slot in known:
        return True
    try:
        season = parse_slot_key(slot)
    except ValueError:
        return False
    return item_type == "show" and season is not None and season <= MAX_SEASON


def slot_basename(season: int | None) -> str:
    """Kometa file stem for a slot inside an asset folder."""
    return "poster" if season is None else f"Season{season:02d}"


def slot_label(season: int | None) -> str:
    if season is None:
        return "Poster"
    return "Specials" if season == 0 else f"Staffel {season}"


# ------------------------------------------------------- folder naming ---

def media_folder_name(location: str, is_file: bool) -> str:
    """Name of the folder Kometa expects, derived from the media path in Plex."""
    if not location:
        return ""
    p = PureWindowsPath(location) if ("\\" in location and "/" not in location) else PurePosixPath(location)
    if is_file:
        p = p.parent
    return p.name


def asset_target(root: Path, folder_name: str, season: int | None, folders: bool, ext: str) -> Path:
    if folders:
        return root / folder_name / f"{slot_basename(season)}{ext}"
    suffix = "" if season is None else f"_{slot_basename(season)}"
    return root / f"{folder_name}{suffix}{ext}"


class AssetIndex:
    """Index of existing asset folders / flat files below the assets root."""

    def __init__(self, root: Path, folders: bool, depth: int = 3):
        self.root = root
        self.folders = folders
        self.depth = max(0, depth)
        self.dirs: dict[str, Path] = {}      # folder name (casefold) -> dir
        self.flat: dict[str, Path] = {}      # file stem (casefold) -> file
        self.dupes: dict[str, list[Path]] = {}  # same folder name found deeper
        self._build()

    def _build(self) -> None:
        """Breadth-first scan: the shallowest folder with a given name wins, further ones are kept as duplicates."""
        if not self.root.is_dir():
            return
        queue: deque[tuple[Path, int]] = deque([(self.root, 0)])
        while queue:
            current, level = queue.popleft()
            try:
                entries = sorted(current.iterdir(), key=lambda x: x.name.casefold())
            except OSError:
                continue
            for e in entries:
                name = e.name
                if name.startswith("."):
                    continue
                if e.is_dir():
                    if self.folders:
                        key = name.casefold()
                        if key in self.dirs:
                            self.dupes.setdefault(key, []).append(e)
                        else:
                            self.dirs[key] = e
                    if level < self.depth:
                        queue.append((e, level + 1))
                elif e.suffix.lower() in IMAGE_EXTS and not self.folders:
                    self.flat.setdefault(e.stem.casefold(), e)

    def knows(self, folder_name: str) -> bool:
        """True if the title already has a folder (folder mode) / files (flat mode) in the index."""
        if not folder_name:
            return False
        return folder_name.casefold() in self.dirs if self.folders else bool(self.slots(folder_name))

    def note_written(self, folder_name: str, target: Path) -> None:
        """Keep the cached index current after a file was written – no re-scan of the whole assets folder."""
        if self.folders:
            self.dirs.setdefault(folder_name.casefold(), target.parent)
        else:
            self.flat[target.stem.casefold()] = target

    def duplicates(self, folder_name: str) -> list[Path]:
        return self.dupes.get(folder_name.casefold(), [])

    def slots(self, folder_name: str) -> dict[str, Path]:
        """All existing assets of one title: {"poster": Path, "season-1": Path, ...}."""
        out: dict[str, Path] = {}
        if not folder_name:
            return out
        if self.folders:
            d = self.dirs.get(folder_name.casefold())
            if not d:
                return out
            try:
                files = [e for e in d.iterdir() if e.is_file() and e.suffix.lower() in IMAGE_EXTS]
            except OSError:
                return out
            for e in sorted(files, key=lambda x: x.name):
                stem = e.stem.casefold()
                m = re.fullmatch(r"season\s*(\d{1,4})", stem)
                if stem == "poster":
                    out.setdefault("poster", e)
                elif m:
                    out.setdefault(slot_key(int(m.group(1))), e)
            return out
        base = folder_name.casefold()
        if base in self.flat:
            out["poster"] = self.flat[base]
        for n in range(0, MAX_SEASON + 1):
            for name in (f"season{n:02d}", f"season{n}"):
                f = self.flat.get(f"{base}_{name}")
                if f:
                    out.setdefault(slot_key(n), f)
        return out

    def find(self, folder_name: str, season: int | None) -> Path | None:
        if not folder_name:
            return None
        if self.folders:
            d = self.dirs.get(folder_name.casefold())
            if not d:
                return None
            return find_image(d, slot_basename(season))
        stem = folder_name if season is None else f"{folder_name}_{slot_basename(season)}"
        return self.flat.get(stem.casefold())

    def base_dir(self, folder_name: str, default_root: Path) -> Path:
        """Where to write assets for this item (existing folder wins)."""
        if self.folders:
            d = self.dirs.get(folder_name.casefold())
            if d:
                return d.parent
        else:
            f = self.flat.get(folder_name.casefold())
            if f:
                return f.parent
        return default_root


_INDEX_CACHE: dict[tuple, AssetIndex] = {}
_INDEX_LOCK = threading.Lock()


def get_index(root: Path, folders: bool, depth: int = 3, fresh: bool = False) -> AssetIndex:
    """One shared AssetIndex per assets folder. Walking thousands of title folders takes seconds on a NAS, so it is
    done once per scan (``fresh=True``) and kept current incrementally (``note_written``) instead of on every change."""
    key = (str(root), bool(folders), int(depth))
    with _INDEX_LOCK:
        idx = _INDEX_CACHE.get(key)
        if idx is not None and not fresh:
            return idx
    idx = AssetIndex(root, folders, depth)
    with _INDEX_LOCK:
        _INDEX_CACHE[key] = idx
    return idx


def drop_indexes() -> None:
    """Forget the cached indexes (after folders were moved around): the next access reads the folders again."""
    with _INDEX_LOCK:
        _INDEX_CACHE.clear()


def find_image(directory: Path, stem: str) -> Path | None:
    try:
        for e in directory.iterdir():
            if e.is_file() and e.suffix.lower() in IMAGE_EXTS and e.stem.casefold() == stem.casefold():
                return e
    except OSError:
        pass
    return None


# ------------------------------------------------ filename interpretation ---

_SEASON_RE = re.compile(
    r"(?:^|[\s._\-\(\[,])(?:season|staffel|saison|temporada|stagione|seizoen|series|s)"
    r"\s*[-_.#]?\s*(\d{1,3})(?!\d)(?!\s*[-_.]?\s*e\d)",
    re.IGNORECASE,
)
_SPECIALS_RE = re.compile(r"(?:^|[\s._\-\(\[])(specials?|extras|besonderheiten)(?:$|[\s._\-\)\]])", re.IGNORECASE)
_EPISODE_RE = re.compile(r"s\d{1,3}\s*[-_.]?\s*e\d{1,4}", re.IGNORECASE)
_IGNORE_RE = re.compile(r"(background|backdrop|fanart|banner|logo|clearart|thumb|landscape|titlecard)", re.IGNORECASE)
_POSTER_WORDS = {"poster", "cover", "folder", "default", "show", "movie", "main"}
_YEAR_RE = re.compile(r"[\(\[]\s*((?:19|20)\d{2})\s*[\)\]]")


def guess_slot(filename: str) -> tuple[str, int | None]:
    """Return ("poster"|"season"|"ignore", season_number)."""
    stem = Path(filename).stem
    if _EPISODE_RE.search(stem) or _IGNORE_RE.search(stem):
        return "ignore", None
    m = _SEASON_RE.search(stem)
    if m:
        return "season", int(m.group(1))
    if _SPECIALS_RE.search(stem):
        return "season", 0
    return "poster", None


def _is_bare_slot_name(stem: str) -> bool:
    s = stem.strip().casefold()
    if s in _POSTER_WORDS:
        return True
    rest = _SEASON_RE.sub(" ", " " + s)
    rest = _SPECIALS_RE.sub(" ", rest)
    rest = re.sub(r"[\s._\-\(\)\[\]]+", "", rest)
    return rest == "" or rest in _POSTER_WORDS


def guess_title(rel_path: str) -> tuple[str, int | None]:
    """Extract (title, year) from a staged file path like
    ``Breaking Bad (2008) - Season 1.jpg`` or ``Breaking Bad (2008)/Season01.jpg``."""
    parts = [p for p in re.split(r"[\\/]", rel_path) if p]
    stem = Path(parts[-1]).stem if parts else ""
    source = stem
    if _is_bare_slot_name(stem) and len(parts) > 1:
        source = parts[-2]
    year = None
    m = _YEAR_RE.search(source)
    if m:
        year = int(m.group(1))
        title = source[: m.start()]
    else:
        title = _SEASON_RE.split(source)[0]
        title = _SPECIALS_RE.split(title)[0]
    title = re.sub(r"\{[^}]*\}|\[[^\]]*\]", " ", title)
    title = re.sub(r"[._]+", " ", title)
    title = re.sub(r"[\s\-–]+$", "", title.strip())
    return title.strip(), year


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = text.casefold().replace("&", " and ")
    text = re.sub(r"\b(the|a|an|der|die|das)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def letter_of(title: str) -> str:
    """Index letter for the A-Z bar: A-Z, or "#" for digits, symbols and everything else."""
    for ch in unicodedata.normalize("NFKD", (title or "").strip()):
        c = ch.encode("ascii", "ignore").decode().upper()
        if c.isalpha():
            return c
        if c.isdigit():
            return "#"
        if c and not c.isspace() and c not in "\"'`.,:;!?-_()[]{}":
            return "#"
    return "#"


def _match_names(it: dict) -> set[str]:
    names = {normalize(it.get("title", "")), normalize(it.get("original_title", "")),
             normalize(re.sub(r"\(.*?\)|\{.*?\}|\[.*?\]", "", it.get("folder", "")))}
    names.discard("")
    return names


def index_items(items: list[dict]) -> dict:
    """Lookup tables for match_item: normalized name -> items, plus first/last two letters -> (name, item).
    Without them every file would be compared with every title of the world (thousands of fuzzy comparisons per file)."""
    by_name: dict[str, list[dict]] = {}
    by_edge: dict[str, list[tuple[str, dict]]] = {}
    for it in items:
        for n in _match_names(it):
            by_name.setdefault(n, []).append(it)
            by_edge.setdefault("^" + n[:2], []).append((n, it))
            by_edge.setdefault("$" + n[-2:], []).append((n, it))
    return {"name": by_name, "edge": by_edge}


def match_item(title: str, year: int | None, items: list[dict], index: dict | None = None) -> dict | None:
    """Best matching library item for a parsed title, or None. ``index`` (see index_items) makes it fast for many files."""
    key = normalize(title)
    if not key:
        return None
    if index is None:
        candidates = [(it, _match_names(it)) for it in items]
    else:
        found: dict[int, tuple[dict, set[str]]] = {}
        for it in index["name"].get(key, []):
            found[id(it)] = (it, _match_names(it))
        for edge in ("^" + key[:2], "$" + key[-2:]):
            for _, it in index["edge"].get(edge, []):
                if id(it) not in found:
                    found[id(it)] = (it, _match_names(it))
        candidates = list(found.values())
    best, best_score = None, 0.0
    for it, names in candidates:
        score = 0.0
        for n in names:
            if n == key:
                score = max(score, 1.0)
            else:
                sm = difflib.SequenceMatcher(None, n, key)
                if sm.real_quick_ratio() >= 0.7 and sm.quick_ratio() >= 0.7:
                    score = max(score, sm.ratio())
        if year and it.get("year"):
            if int(it["year"]) == year:
                score += 0.15
            elif abs(int(it["year"]) - year) > 1:
                score -= 0.25
        if score > best_score:
            best, best_score = it, score
    return best if best_score >= 0.86 else None


# ------------------------------------------------------------ coming soon ---
# Placeholder titles in Plex carry the suffix "{edition-Coming Soon}" in their folder name. Posters for them are mirrored into the real Radarr/Sonarr folder so they survive the
# switch to the real file. Other editions ({edition-black&white} …) may have their own posters and are NOT mirrored.
_COMING_SOON = re.compile(r"\s*\{edition-coming soon\}", re.IGNORECASE)


def is_coming_soon(folder: str) -> bool:
    return bool(folder and _COMING_SOON.search(folder))


def coming_soon_mirrors(folder: str, arr_folders: list[str]) -> list[str]:
    """Folders that should receive a copy of the assets of a Coming-Soon placeholder folder."""
    if not is_coming_soon(folder):
        return []
    base = _COMING_SOON.sub("", folder).strip()
    real = [f for f in arr_folders if f and not is_coming_soon(f)]
    out: list[str] = []
    for cand in real or ([base] if base else []):
        if cand.casefold() != folder.casefold() and cand not in out:
            out.append(cand)
    return out
