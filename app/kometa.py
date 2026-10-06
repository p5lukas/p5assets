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
        self._build()

    def _build(self) -> None:
        if not self.root.is_dir():
            return
        stack: list[tuple[Path, int]] = [(self.root, 0)]
        while stack:
            current, level = stack.pop()
            try:
                entries = list(current.iterdir())
            except OSError:
                continue
            for e in entries:
                name = e.name
                if name.startswith("."):
                    continue
                if e.is_dir():
                    if self.folders:
                        self.dirs.setdefault(name.casefold(), e)
                    if level < self.depth:
                        stack.append((e, level + 1))
                elif e.suffix.lower() in IMAGE_EXTS and not self.folders:
                    self.flat.setdefault(e.stem.casefold(), e)

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


def match_item(title: str, year: int | None, items: list[dict]) -> dict | None:
    """Best matching library item for a parsed title, or None."""
    key = normalize(title)
    if not key:
        return None
    best, best_score = None, 0.0
    for it in items:
        names = {normalize(it.get("title", "")), normalize(it.get("original_title", "")),
                 normalize(re.sub(r"\(.*?\)|\{.*?\}|\[.*?\]", "", it.get("folder", "")))}
        names.discard("")
        score = 0.0
        for n in names:
            if n == key:
                score = max(score, 1.0)
            else:
                score = max(score, difflib.SequenceMatcher(None, n, key).ratio())
        if year and it.get("year"):
            if int(it["year"]) == year:
                score += 0.15
            elif abs(int(it["year"]) - year) > 1:
                score -= 0.25
        if score > best_score:
            best, best_score = it, score
    return best if best_score >= 0.86 else None
