"""Persistent settings stored as JSON in the config directory."""
from __future__ import annotations

import copy
import json
import os
import threading
import uuid
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("P5_CONFIG_DIR", "/config"))
CONFIG_FILE = CONFIG_DIR / "config.json"
CACHE_DIR = CONFIG_DIR / "cache"
STAGING_DIR = CONFIG_DIR / "staging"

DEFAULTS: dict = {
    "onboarded": False,
    "client_id": "",
    "plex": {"url": "", "token": "", "server_name": "", "upload_to_plex": False},
    # [{key, title, type, enabled, world}]
    "libraries": [],
    # Welten (z. B. HD / 4K): eigener Assets-Ordner, Bibliotheken und Arr-Instanzen werden ihnen zugeordnet
    "worlds": [],
    # [{id, kind: sonarr|radarr, name, url, api_key, world}]
    "arr": [],
    # frei eingegebene Ordner: [{id, world, folder, title, type}]
    "custom": [],
    "assets": {
        "asset_folders": True,
        "convert_to_jpg": False,
        "ignore_specials": False,
        "search_depth": 3,
    },
    "apis": {"tmdb": "", "tvdb": "", "tvdb_pin": "", "fanart": "", "language": "de"},
    "scan_interval_minutes": 60,
}

_lock = threading.RLock()
_config: dict | None = None


def _merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load() -> dict:
    global _config
    with _lock:
        if _config is None:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            data = {}
            if CONFIG_FILE.exists():
                try:
                    data = json.loads(CONFIG_FILE.read_text("utf-8"))
                except (OSError, ValueError):
                    data = {}
            _config = _merge(DEFAULTS, data)
            changed = normalize(_config, legacy_path=(data.get("assets") or {}).get("path"))
            if not _config["client_id"]:
                _config["client_id"] = f"p5assets-{uuid.uuid4()}"
                changed = True
            if changed:
                save(_config)
        return _config


WORLD_COLORS = ["#00ff66", "#22d3ee", "#f472b6", "#fbbf24", "#a78bfa", "#fb7185"]


def normalize(cfg: dict, legacy_path: str | None = None) -> bool:
    """Make worlds/arr/libraries consistent. Returns True if something was changed."""
    changed = False
    if not cfg["worlds"]:
        cfg["worlds"] = [{"id": "w1", "name": "Standard",
                          "assets_path": legacy_path or os.environ.get("P5_ASSETS_DIR", "/assets")}]
        changed = True
    for i, w in enumerate(cfg["worlds"]):
        if not w.get("id"):
            w["id"] = uuid.uuid4().hex[:8]; changed = True
        if not w.get("name"):
            w["name"] = f"Welt {i + 1}"; changed = True
        if not w.get("color"):
            w["color"] = WORLD_COLORS[i % len(WORLD_COLORS)]; changed = True
        w.setdefault("assets_path", "")
    ids = {w["id"] for w in cfg["worlds"]}
    first = cfg["worlds"][0]["id"]
    for item in list(cfg["libraries"]) + list(cfg["arr"]) + list(cfg["custom"]):
        if item.get("world") not in ids:
            item["world"] = first; changed = True
    for a in cfg["arr"]:
        if not a.get("id"):
            a["id"] = uuid.uuid4().hex[:8]; changed = True
    for c in cfg["custom"]:
        if not c.get("id"):
            c["id"] = uuid.uuid4().hex[:8]; changed = True
    return changed


def get() -> dict:
    return copy.deepcopy(load())


def save(cfg: dict) -> None:
    global _config
    with _lock:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        tmp = CONFIG_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), "utf-8")
        tmp.replace(CONFIG_FILE)
        _config = copy.deepcopy(cfg)


def update(patch: dict) -> dict:
    with _lock:
        cfg = _merge(load(), patch)
        normalize(cfg)
        save(cfg)
        return get()


SECRET_PATHS = [("plex", "token"), ("apis", "tmdb"), ("apis", "tvdb"), ("apis", "tvdb_pin"), ("apis", "fanart")]
MASK = "********"


def public(cfg: dict | None = None) -> dict:
    """Config for the browser: secrets replaced by a mask."""
    cfg = copy.deepcopy(cfg or load())
    for section, key in SECRET_PATHS:
        val = cfg.get(section, {}).get(key, "")
        cfg[section][key] = MASK if val else ""
    for a in cfg.get("arr", []):
        a["api_key"] = MASK if a.get("api_key") else ""
    cfg.pop("client_id", None)
    return cfg


def strip_masked(patch: dict) -> dict:
    """Drop masked secrets from an incoming patch so they keep their value."""
    patch = copy.deepcopy(patch)
    for section, key in SECRET_PATHS:
        if patch.get(section, {}).get(key) == MASK:
            patch[section].pop(key)
    if isinstance(patch.get("arr"), list):
        current = {a["id"]: a for a in load().get("arr", []) if a.get("id")}
        for a in patch["arr"]:
            if a.get("api_key") == MASK:
                a["api_key"] = current.get(a.get("id"), {}).get("api_key", "")
    return patch
