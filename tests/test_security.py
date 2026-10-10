"""Hostile input: path traversal and friends must be refused (and never reach the file system)."""
import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture()
def client():
    return TestClient(main.app)


@pytest.mark.parametrize("name", ["../config.json", "..%2Fconfig.json", "/etc/passwd", "a/b.log", "x" * 300])
def test_log_files_cannot_escape(client, name):
    for path in ("/api/logs/read", "/api/logs/download"):
        assert client.get(path, params={"file": name}).status_code in (400, 404, 422)
    assert client.delete("/api/logs", params={"file": name}).status_code in (400, 404, 422)


@pytest.mark.parametrize("gid", ["..", "../x", "a/b", "a b", "%2e%2e"])
def test_trash_ids_cannot_escape(client, gid):
    assert client.post(f"/api/trash/{gid}/restore").status_code in (400, 404, 405)
    assert client.delete(f"/api/trash/{gid}").status_code in (400, 404, 405)
    assert client.get(f"/api/trash/{gid}/file/0").status_code in (400, 404)


def test_unknown_items_are_404_not_500(client):
    for url in ("/api/items/..%2F..%2Fetc", "/api/asset/nope/poster", "/api/thumb/nope/poster", "/api/download/nope/poster"):
        assert client.get(url).status_code == 404


def test_import_session_ids_are_checked(client):
    assert client.get("/api/import/..%2F../abc").status_code in (400, 404)
    assert client.delete("/api/import/..%2F..").status_code in (400, 404, 405)


def test_proxy_only_allows_known_https_hosts(client):
    for url in ("http://image.tmdb.org/t/p/w342/x.jpg", "https://evil.example/x.jpg", "file:///etc/passwd", "https://127.0.0.1/x"):
        assert client.get("/api/proxy", params={"url": url}).status_code == 400
    assert client.post("/api/items/nope/poster/url", json={"url": "https://evil.example/x.jpg"}).status_code in (400, 404)


def test_secrets_are_not_returned(client):
    from app import config
    cfg = config.get()
    cfg["plex"]["token"] = "PLEXSECRET"
    cfg["apis"]["tmdb"] = "TMDBSECRET"
    cfg["notify"]["telegram"]["token"] = "TGSECRET"
    pub = str(config.public(cfg))
    for secret in ("PLEXSECRET", "TMDBSECRET", "TGSECRET"):
        assert secret not in pub


def test_security_headers_are_set(client):
    r = client.get("/")
    assert r.headers["x-frame-options"] == "DENY" and r.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"] and "script-src 'self'" in r.headers["content-security-policy"]
    assert client.get("/api/health").headers["x-frame-options"] == "DENY"
