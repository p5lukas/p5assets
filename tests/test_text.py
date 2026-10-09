from app.text import plural


def test_plural():
    assert plural(1, "Datei", "Dateien") == "1 Datei"
    assert plural(0, "Datei", "Dateien") == "0 Dateien"
    assert plural(5, "Ordner", "Ordner") == "5 Ordner"
