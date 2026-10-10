from app.text import plural


def test_plural():
    assert plural(1, "Datei", "Dateien") == "1 Datei"
    assert plural(0, "Datei", "Dateien") == "0 Dateien"
    assert plural(5, "Ordner", "Ordner") == "5 Ordner"


def test_error_texts_have_no_keys():
    import httpx
    from app.errors import short
    req = httpx.Request("GET", "https://api.themoviedb.org/3/movie/1?api_key=SECRET123")
    err = httpx.HTTPStatusError("boom", request=req, response=httpx.Response(401, request=req))
    assert short(err) == "HTTP 401"
    assert "SECRET123" not in short(RuntimeError("GET https://x.test/a?X-Plex-Token=SECRET123 failed"))
