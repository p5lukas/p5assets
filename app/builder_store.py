"""The poster builder's memory per title ("look of the series"): settings, colours, texts and the chosen backgrounds / logo, so that a later visit continues
where the last one ended (e.g. swap only the logo on all posters, or build one new season in the same look).

Layout: ``<config>/builder/<item id>/project.json`` plus ``files/<hash>.<ext>`` for pictures that came from the user's computer (online ones are kept as links)."""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import time
from pathlib import Path

from PIL import Image

from . import config, styles

MAX_FILE = 15 * 1024 * 1024
MAX_JSON = 96 * 1024
STALE_DAYS = 30
FILE_RE = re.compile(r"^[0-9a-f]{16}\.(png|jpg|webp)$")
SLOT_RE = re.compile(r"^(poster|season-\d{1,3})$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
OVERRIDES = ("titleScale", "titleY", "mode", "trim", "blend", "blendAmount", "blendHeight")


def _root() -> Path:
    return config.CONFIG_DIR / "builder"


def _dir(item_id: str) -> Path:
    if not ID_RE.match(item_id):
        raise ValueError("bad item id")
    return _root() / item_id


def file_url(item_id: str, name: str) -> str:
    return f"/api/items/{item_id}/builder/file/{name}"


def _ref(v: object, item_id: str) -> dict | None:
    """A picture reference {url, preview, name, source}: a web address or one of this title's stored files."""
    if not isinstance(v, dict):
        return None
    ok = re.compile(rf"^(https?://\S{{1,990}}|/api/items/{re.escape(item_id)}/builder/file/[0-9a-f]{{16}}\.(png|jpg|webp))$")
    url = v.get("url")
    if not isinstance(url, str) or not ok.match(url):
        return None
    preview = v.get("preview") if isinstance(v.get("preview"), str) and ok.match(v.get("preview")) else url
    out = {"url": url, "preview": preview}
    for k in ("name", "source"):
        if isinstance(v.get(k), str):
            out[k] = re.sub(r"[\x00-\x1f]", "", v[k])[:120]
    return out


def _num(v: object, lo: float, hi: float, default: float) -> float:
    return round(min(hi, max(lo, float(v))), 4) if isinstance(v, (int, float)) and not isinstance(v, bool) else default


def sanitize(item_id: str, p: object) -> dict | None:
    if not isinstance(p, dict):
        return None
    out: dict = {"v": 1, "look": styles.sanitize(p.get("look")), "allTitle": p.get("allTitle") is not False,
                 "titleText": re.sub(r"[\x00-\x1f]", "", str(p.get("titleText") or ""))[:120], "logo": _ref(p.get("logo"), item_id), "posters": {}}
    posters = p.get("posters") if isinstance(p.get("posters"), dict) else {}
    for key, v in list(posters.items())[:120]:
        if not SLOT_RE.match(str(key)) or not isinstance(v, dict):
            continue
        fit = v.get("fit") if isinstance(v.get("fit"), dict) else {}
        ov_in = v.get("ov") if isinstance(v.get("ov"), dict) else {}
        ov = styles.sanitize({k: ov_in[k] for k in OVERRIDES if k in ov_in})
        if _ref(ov_in.get("logo"), item_id):
            ov["logo"] = _ref(ov_in.get("logo"), item_id)
        color = v.get("color")
        out["posters"][key] = {
            "bg": _ref(v.get("bg"), item_id), "line": re.sub(r"[\x00-\x1f]", "", str(v.get("line") or ""))[:40],
            "color": color.lower() if isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color) else None,
            "fit": {"zoom": _num(fit.get("zoom"), 1, 4, 1), "x": _num(fit.get("x"), 0, 1, 0.5), "y": _num(fit.get("y"), 0, 1, 0.5)}, "ov": ov}
    return out


def load(item_id: str) -> dict | None:
    path = _dir(item_id) / "project.json"
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return None


def _used_files(project: dict) -> set[str]:
    refs = [project.get("logo")] + [x for v in project["posters"].values() for x in (v.get("bg"), v["ov"].get("logo"))]
    return {r["url"].rsplit("/", 1)[-1] for r in refs if r and "/builder/file/" in r["url"]}


def save(item_id: str, raw: object) -> dict | None:
    project = sanitize(item_id, raw)
    if project is None:
        return None
    data = json.dumps(project, ensure_ascii=False)
    if len(data.encode()) > MAX_JSON:
        return None
    d = _dir(item_id)
    (d / "files").mkdir(parents=True, exist_ok=True)
    tmp = d / "project.tmp"
    tmp.write_text(data, "utf-8")
    os.replace(tmp, d / "project.json")
    used = _used_files(project)
    for f in (d / "files").iterdir():                  # pictures nobody refers to any more
        if f.name not in used:
            f.unlink(missing_ok=True)
    return project


def put_file(item_id: str, data: bytes) -> str | None:
    """Store a picture from the user's computer (checked to be a real PNG / JPEG / WebP). Returns its file name."""
    if not data or len(data) > MAX_FILE:
        return None
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = (im.format or "").upper()
            im.verify()
    except Exception:  # noqa: BLE001
        return None
    ext = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}.get(fmt)
    if not ext:
        return None
    name = f"{hashlib.sha1(data, usedforsecurity=False).hexdigest()[:16]}.{ext}"
    d = _dir(item_id) / "files"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_bytes(data)
    return name


def file_path(item_id: str, name: str) -> Path | None:
    if not FILE_RE.match(name):
        return None
    p = _dir(item_id) / "files" / name
    return p if p.is_file() else None


def delete(item_id: str) -> None:
    shutil.rmtree(_dir(item_id), ignore_errors=True)


def prune(valid_ids: set[str]) -> int:
    """Remove the memory of titles that are gone for good (not seen in a scan and untouched for 30 days)."""
    n, now = 0, time.time()
    if not _root().is_dir() or not valid_ids:
        return 0
    for d in _root().iterdir():
        try:
            if d.is_dir() and d.name not in valid_ids and now - d.stat().st_mtime > STALE_DAYS * 86400:
                shutil.rmtree(d, ignore_errors=True)
                n += 1
        except OSError:
            continue
    return n
