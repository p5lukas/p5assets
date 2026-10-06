"""Language catalogue for the preferred poster language order. "xx" = textless (no text on the poster)."""
from __future__ import annotations

# code, English name, native name, ISO-639-2 (TheTVDB uses 3-letter codes)
LANGUAGES: list[tuple[str, str, str, str]] = [
    ("xx", "Textless", "No Text", ""),
    ("de", "German", "Deutsch", "deu"), ("en", "English", "English", "eng"), ("fr", "French", "Français", "fra"),
    ("es", "Spanish", "Español", "spa"), ("it", "Italian", "Italiano", "ita"), ("nl", "Dutch", "Nederlands", "nld"),
    ("pt", "Portuguese", "Português", "por"), ("ru", "Russian", "Русский", "rus"), ("ja", "Japanese", "日本語", "jpn"),
    ("ko", "Korean", "한국어", "kor"), ("zh", "Chinese", "中文", "zho"), ("pl", "Polish", "Polski", "pol"),
    ("tr", "Turkish", "Türkçe", "tur"), ("sv", "Swedish", "Svenska", "swe"), ("da", "Danish", "Dansk", "dan"),
    ("no", "Norwegian", "Norsk", "nor"), ("fi", "Finnish", "Suomi", "fin"), ("cs", "Czech", "Čeština", "ces"),
    ("hu", "Hungarian", "Magyar", "hun"), ("el", "Greek", "Ελληνικά", "ell"), ("he", "Hebrew", "עברית", "heb"),
    ("ar", "Arabic", "العربية", "ara"), ("hi", "Hindi", "हिन्दी", "hin"), ("th", "Thai", "ไทย", "tha"),
    ("uk", "Ukrainian", "Українська", "ukr"), ("ro", "Romanian", "Română", "ron"), ("bg", "Bulgarian", "Български", "bul"),
    ("hr", "Croatian", "Hrvatski", "hrv"), ("id", "Indonesian", "Bahasa Indonesia", "ind"), ("vi", "Vietnamese", "Tiếng Việt", "vie"),
]
DEFAULT_ORDER = ["xx", "de", "en"]
_BY3 = {l[3]: l[0] for l in LANGUAGES if l[3]}
_ALT3 = {"ger": "de", "fre": "fr", "dut": "nl", "chi": "zh", "cze": "cs", "gre": "el", "rum": "ro", "per": "fa"}


def catalogue() -> list[dict]:
    return [{"code": c, "name": n, "native": nat} for c, n, nat, _ in LANGUAGES]


def norm_tmdb(code: str | None) -> str:
    return code if code else "xx"


def norm_fanart(code: str | None) -> str:
    return "xx" if code in (None, "", "00") else code


def norm_tvdb(code: str | None) -> str:
    if not code:
        return "xx"
    code = code.lower()
    return _BY3.get(code) or _ALT3.get(code) or code
