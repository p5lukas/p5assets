"""Small helpers for German texts."""


def plural(n: int, one: str, many: str) -> str:
    """``plural(1, "Ordner", "Ordner")`` -> "1 Ordner", ``plural(2, "Datei", "Dateien")`` -> "2 Dateien"."""
    return f"{n} {one if n == 1 else many}"
