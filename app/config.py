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
    # [{key, title, type, enabled, asset_subdir}]
    "libraries": [],
    "assets": {
        "path": os.environ.get("P5_ASSETS_DIR", "/assets"),
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
            if not _config["client_id"]:
                _config["client_id"] = f"p5assets-{uuid.uuid4()}"
                save(_config)
        return _config


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
        save(cfg)
        return get()


SECRET_PATHS = [("plex", "token"), ("apis", "tmdb"), ("apis", "tvdb"), ("apis", "tvdb_pin"), ("apis", "fanart")]


def public(cfg: dict | None = None) -> dict:
    """Config for the browser: secrets replaced by a flag."""
    cfg = copy.deepcopy(cfg or load())
    for section, key in SECRET_PATHS:
        val = cfg.get(section, {}).get(key, "")
        cfg[section][key] = "********" if val else ""
    cfg.pop("client_id", None)
    return cfg


def strip_masked(patch: dict) -> dict:
    """Drop masked secrets from an incoming patch so they keep their value."""
    patch = copy.deepcopy(patch)
    for section, key in SECRET_PATHS:
        if patch.get(section, {}).get(key) == "********":
            patch[section].pop(key)
    return patch
