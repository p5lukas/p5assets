"""Saved looks ("styles") of the poster builder: the last used one and named presets, kept in /config/styles.json."""
from __future__ import annotations

import json
import os
import re
import threading

from . import config

FONTS = ("montserrat", "raleway", "oswald", "bebas-neue", "anton", "cinzel", "playfair-display", "lato")
NUMBERS = {"titleScale": (0.3, 2.0), "titleY": (0.05, 0.95), "seasonScale": (0.3, 3.0), "gap": (0.0, 0.12), "tracking": (0.0, 0.5)}
MAX_PRESETS = 50
_lock = threading.Lock()


def _file():
    return config.CONFIG_DIR / "styles.json"


def sanitize(style: object) -> dict:
    """Only known keys with values in range; anything else is dropped."""
    if not isinstance(style, dict):
        return {}
    out: dict = {}
    if style.get("font") in FONTS:
        out["font"] = style["font"]
    if isinstance(style.get("upper"), bool):
        out["upper"] = style["upper"]
    if style.get("mode") in ("logo", "text"):
        out["mode"] = style["mode"]
    for key, (lo, hi) in NUMBERS.items():
        v = style.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[key] = round(min(hi, max(lo, float(v))), 4)
    color = style.get("color")
    if "color" in style and (color is None or isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color)):
        out["color"] = color.lower() if color else None
    return out


def clean_name(name: str) -> str:
    return re.sub(r"[\x00-\x1f]", "", name or "").strip()[:60]


def load() -> dict:
    try:
        data = json.loads(_file().read_text("utf-8"))
    except (OSError, ValueError):
        data = {}
    presets = data.get("presets") if isinstance(data.get("presets"), dict) else {}
    return {"presets": {clean_name(k): sanitize(v) for k, v in presets.items() if clean_name(k)}, "last": sanitize(data.get("last")) or None}


def _save(data: dict) -> None:
    f = _file()
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    os.replace(tmp, f)


def set_last(style: dict) -> None:
    with _lock:
        data = load()
        data["last"] = sanitize(style) or None
        _save(data)


def save_preset(name: str, style: dict) -> bool:
    name = clean_name(name)
    with _lock:
        data = load()
        if not name or (name not in data["presets"] and len(data["presets"]) >= MAX_PRESETS):
            return False
        data["presets"][name] = sanitize(style)
        _save(data)
    return True


def delete_preset(name: str) -> None:
    with _lock:
        data = load()
        data["presets"].pop(clean_name(name), None)
        _save(data)
