"""Translations. German is the source language of all texts (code, UI); English lives in app/i18n/en.json (key = German text).

The browser sends its language in the header ``X-Lang`` (default and fallback: English). Messages that are produced while a request is
handled (errors shown in the UI) go through ``tr()``; everything else (log lines, notifications, background scan texts) is English.
"""
from __future__ import annotations

import contextvars
import json
import re
from pathlib import Path

EN: dict[str, str] = json.loads((Path(__file__).parent / "i18n" / "en.json").read_text("utf-8"))
_lang: contextvars.ContextVar[str] = contextvars.ContextVar("p5lang", default="en")


def set_lang(value: str | None) -> None:
    _lang.set("de" if (value or "").strip().lower().startswith("de") else "en")


def lang() -> str:
    return _lang.get()


def tr(key: str, *args) -> str:
    """Text for the language of the current request: ``tr("Text {0}", value)``."""
    text = EN.get(key, key) if _lang.get() == "en" else key
    return re.sub(r"\{(\d+)\}", lambda m: str(args[int(m.group(1))]) if int(m.group(1)) < len(args) else m.group(0), text) if args else text


def js() -> str:
    """The English table as a script (``window.P5_EN``) for the browser."""
    return "window.P5_EN = " + json.dumps(EN, ensure_ascii=False) + ";\n"
