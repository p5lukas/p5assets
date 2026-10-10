"""Error texts that are safe to show in the UI and to log: no query strings (API keys, Plex tokens) from request URLs."""
from __future__ import annotations

import re

import httpx

_URL_QUERY = re.compile(r"(https?://[^\s'\"<>?]+)\?[^\s'\"<>]*")


def short(e: BaseException) -> str:
    """Short, key-free description of an exception (``HTTP 401``, ``All connection attempts failed`` …)."""
    if isinstance(e, httpx.HTTPStatusError):
        return f"HTTP {e.response.status_code}"
    return _URL_QUERY.sub(r"\1", str(e)) or e.__class__.__name__
