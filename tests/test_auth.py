import pytest
from fastapi.testclient import TestClient

from app import auth, main

H = {"X-Requested-With": "p5assets"}


@pytest.fixture(autouse=True)
def clean_auth(monkeypatch):
    auth._remove_all()
    auth._fails.clear()
    monkeypatch.setattr(auth, "FREE_TRIES", 5)
    yield
    auth._remove_all()
    auth._fails.clear()


@pytest.fixture()
def client():
    with TestClient(main.app) as c:
        yield c


def _setup(c, user="lukas", pw="geheim-123"):
    r = c.post("/api/auth/setup", json={"username": user, "password": pw}, headers=H)
    assert r.status_code == 200, r.text
    return r


def test_password_hash_roundtrip():
    h = auth.hash_password("correct horse")
    assert "correct horse" not in h and h.startswith("scrypt$")
    assert auth.verify_password("correct horse", h)
    assert not auth.verify_password("wrong", h)
    assert not auth.verify_password("anything", None)       # unknown user: checked against a dummy, never true


def test_login_is_off_by_default(client):
    assert client.get("/api/auth/state").json()["enabled"] is False
    assert client.get("/api/state").status_code == 200


def test_setup_protects_the_api_and_login_works(client):
    _setup(client)
    anon = TestClient(main.app)
    assert anon.get("/api/state").status_code == 401
    assert anon.get("/api/state").json()["auth"] is True
    assert anon.get("/api/health").json() == {"ok": True}
    assert anon.get("/api/auth/state").json() == {"enabled": True, "authenticated": False, "user": None, "fun": True}
    assert anon.get("/").status_code == 200 and anon.get("/static/app.js").status_code == 200       # the page itself loads (shows the login)
    assert client.get("/api/state").status_code == 200       # the browser that set it up is logged in
    bad = anon.post("/api/auth/login", json={"username": "lukas", "password": "falsch"}, headers=H)
    assert bad.status_code == 401 and bad.json()["detail"] == "Benutzername oder Passwort falsch"
    ok = anon.post("/api/auth/login", json={"username": "LUKAS", "password": "geheim-123"}, headers=H)
    assert ok.status_code == 200
    assert "httponly" in ok.headers["set-cookie"].lower() and "samesite=lax" in ok.headers["set-cookie"].lower()
    assert anon.get("/api/state").status_code == 200


def test_writes_need_the_csrf_header_when_login_is_on(client):
    _setup(client)
    assert client.post("/api/scan").status_code == 403
    assert client.post("/api/scan", headers=H).status_code == 200


def test_logout_ends_the_session(client):
    _setup(client)
    assert client.post("/api/auth/logout", headers=H).status_code == 200
    assert client.get("/api/state").status_code == 401


def test_weak_passwords_and_double_setup_are_refused(client):
    assert client.post("/api/auth/setup", json={"username": "a", "password": "kurz"}, headers=H).status_code == 400
    assert client.post("/api/auth/setup", json={"username": " ", "password": "langgenug1"}, headers=H).status_code == 400
    _setup(client)
    assert client.post("/api/auth/setup", json={"username": "b", "password": "langgenug1"}, headers=H).status_code == 409


def test_wrong_attempts_are_slowed_down(client, monkeypatch):
    _setup(client)
    monkeypatch.setattr(auth.asyncio, "sleep", lambda *_: _noop())
    anon = TestClient(main.app)
    codes = [anon.post("/api/auth/login", json={"username": "lukas", "password": f"x{i}"}, headers=H).status_code for i in range(7)]
    assert codes[:5] == [401] * 5 and codes[5] == 429
    assert anon.post("/api/auth/login", json={"username": "lukas", "password": "geheim-123"}, headers=H).status_code == 429   # even the right one waits


async def _noop():
    return None


def test_change_password_needs_the_current_one_and_logs_other_devices_out(client):
    _setup(client)
    other = TestClient(main.app)
    other.post("/api/auth/login", json={"username": "lukas", "password": "geheim-123"}, headers=H)
    assert other.get("/api/state").status_code == 200
    assert client.post("/api/auth/change", json={"current_password": "nope", "new_password": "neues-pass-1"}, headers=H).status_code == 403
    assert client.post("/api/auth/change", json={"current_password": "geheim-123", "new_password": "neues-pass-1"}, headers=H).status_code == 200
    assert client.get("/api/state").status_code == 200       # this device stays logged in
    assert other.get("/api/state").status_code == 401        # the other one has to log in again
    assert TestClient(main.app).post("/api/auth/login", json={"username": "lukas", "password": "neues-pass-1"}, headers=H).status_code == 200


def test_fun_switch_needs_no_password(client):
    _setup(client)
    assert client.post("/api/auth/change", json={"fun": False}, headers=H).status_code == 200
    assert TestClient(main.app).get("/api/auth/state").json()["fun"] is False


def test_disable_needs_the_password(client):
    _setup(client)
    assert client.post("/api/auth/disable", json={"password": "falsch"}, headers=H).status_code == 403
    assert client.post("/api/auth/disable", json={"password": "geheim-123"}, headers=H).status_code == 200
    assert TestClient(main.app).get("/api/state").status_code == 200       # login is off again


def test_deleting_the_file_switches_the_login_off(client):
    _setup(client)
    assert TestClient(main.app).get("/api/state").status_code == 401
    auth._file().unlink()
    assert TestClient(main.app).get("/api/state").status_code == 200


def test_reset_by_environment_variable(client, monkeypatch):
    _setup(client)
    monkeypatch.setenv("P5_AUTH_RESET", "1")
    auth.startup()
    assert not auth.enabled()
    assert not auth._sessions_file().exists()


def test_auth_file_is_private_and_holds_no_clear_password(client):
    _setup(client, pw="supersecret-pw")
    raw = auth._file().read_text()
    assert "supersecret-pw" not in raw and "scrypt$" in raw
    assert oct(auth._file().stat().st_mode & 0o777) == "0o600"
    assert "supersecret-pw" not in auth._sessions_file().read_text()


def test_password_never_reaches_the_log(client):
    _setup(client, pw="log-me-not-123")
    TestClient(main.app).post("/api/auth/login", json={"username": "lukas", "password": "log-me-not-124"}, headers=H)
    from app import logs
    text = "".join(p.read_text(errors="ignore") for p in logs.LOG_DIR.glob("*.log*"))
    assert "log-me-not" not in text and "Anmeldung fehlgeschlagen" in text
