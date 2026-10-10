"""Optional login with one user name and password.

* ``/config/auth.json`` holds the user name and the password HASH (scrypt, own salt per password) – never the password itself,
  and never in ``config.json``.
* A session is a random token in a cookie (HttpOnly, SameSite=Lax); the server only stores its SHA-256 and the expiry
  (``/config/sessions.json``), so a copy of that file cannot be used to log in.
* Wrong attempts are slowed down (per IP and per user name).
* Forgotten password (access to the server needed): ``python -m app.auth reset`` inside the container, the environment
  variable ``P5_AUTH_RESET=1`` at start, or simply delete ``/config/auth.json``.
"""
from __future__ import annotations

import asyncio
import base64
import getpass
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from . import config, logs

log = logs.get("auth")
COOKIE = "p5_session"
CSRF_HEADER = "x-requested-with"       # a custom header cannot be sent by another site without CORS permission
CSRF_VALUE = "p5assets"
PUBLIC = {"/api/auth/state", "/api/auth/login", "/api/health"}      # reachable without a login
MIN_PASSWORD = 8
REMEMBER_SECONDS = 30 * 86400
SESSION_SECONDS = 12 * 3600
MAX_SESSIONS = 50
WINDOW = 15 * 60
FREE_TRIES = 5

_lock = threading.Lock()
_cache: dict = {"mtime": None, "data": None}
_fails: dict[str, list[float]] = {}


# ------------------------------------------------------------------ files ---
def _file() -> Path:
    return config.CONFIG_DIR / "auth.json"


def _sessions_file() -> Path:
    return config.CONFIG_DIR / "sessions.json"


def _read() -> dict | None:
    """Current auth data (None = login off). Re-read when the file changes, so deleting it switches the login off at once."""
    p = _file()
    try:
        m = p.stat().st_mtime_ns
    except OSError:
        _cache.update(mtime=None, data=None)
        return None
    if _cache["mtime"] != m:
        try:
            data = json.loads(p.read_text("utf-8"))
            _cache.update(mtime=m, data=data if data.get("user") and data.get("hash") else None)
        except (OSError, ValueError):
            _cache.update(mtime=m, data=None)
    return _cache["data"]


def _write_private(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, p)


def _save(data: dict) -> None:
    _write_private(_file(), json.dumps(data, ensure_ascii=False))
    _cache.update(mtime=None, data=None)


def enabled() -> bool:
    return _read() is not None


# --------------------------------------------------------------- password ---
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    n, r, p = 2 ** 15, 8, 1
    dk = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, maxmem=96 * 1024 * 1024, dklen=32)
    return f"scrypt${n}${r}${p}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str | None) -> bool:
    """Constant-time check; with an unknown user a dummy hash is checked so the timing does not reveal whether the user exists."""
    try:
        _, n, r, p, salt, want = (stored or _DUMMY).split("$")
        dk = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), maxmem=96 * 1024 * 1024, dklen=32)
        return hmac.compare_digest(dk, base64.b64decode(want)) and stored is not None
    except (ValueError, TypeError):
        return False


_DUMMY = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="


def _check_user(user: str) -> str:
    user = (user or "").strip()
    if not 1 <= len(user) <= 64:
        raise HTTPException(400, "Der Benutzername muss 1 bis 64 Zeichen lang sein")
    return user


def _check_password(password: str) -> str:
    if len(password or "") < MIN_PASSWORD:
        raise HTTPException(400, f"Das Passwort braucht mindestens {MIN_PASSWORD} Zeichen")
    if len(password) > 200:
        raise HTTPException(400, "Das Passwort ist zu lang (höchstens 200 Zeichen)")
    return password


def _check_new(user: str, password: str) -> tuple[str, str]:
    return _check_user(user), _check_password(password)


# --------------------------------------------------------------- sessions ---
def _load_sessions() -> dict:
    try:
        d = json.loads(_sessions_file().read_text("utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _store_sessions(d: dict) -> None:
    now = time.time()
    d = {k: v for k, v in d.items() if v.get("exp", 0) > now}
    if len(d) > MAX_SESSIONS:
        d = dict(sorted(d.items(), key=lambda kv: kv[1]["exp"])[-MAX_SESSIONS:])
    _write_private(_sessions_file(), json.dumps(d))


def _tok(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(remember: bool) -> tuple[str, int]:
    token = secrets.token_urlsafe(32)
    life = REMEMBER_SECONDS if remember else SESSION_SECONDS
    with _lock:
        d = _load_sessions()
        d[_tok(token)] = {"exp": time.time() + life}
        _store_sessions(d)
    return token, life


def valid_session(token: str | None) -> bool:
    if not token:
        return False
    with _lock:
        s = _load_sessions().get(_tok(token))
    return bool(s and s.get("exp", 0) > time.time())


def end_session(token: str | None) -> None:
    if token:
        with _lock:
            d = _load_sessions()
            if d.pop(_tok(token), None):
                _store_sessions(d)


def end_all_sessions() -> None:
    with _lock:
        try:
            _sessions_file().unlink()
        except OSError:
            pass


# ---------------------------------------------------------------- limiter ---
def _blocked_for(keys: list[str]) -> int:
    """Seconds the caller still has to wait (0 = free). From the 6th failure on: 30 s, 60 s, 120 s … up to 15 minutes."""
    now, wait = time.time(), 0
    for k in keys:
        recent = [t for t in _fails.get(k, []) if now - t < WINDOW]
        _fails[k] = recent
        if len(recent) > FREE_TRIES - 1:
            until = recent[-1] + min(WINDOW, 30 * 2 ** (len(recent) - FREE_TRIES))
            wait = max(wait, int(until - now) + 1)
    return max(wait, 0)


def _failed(keys: list[str]) -> None:
    for k in keys:
        _fails.setdefault(k, []).append(time.time())


def _cleared(keys: list[str]) -> None:
    for k in keys:
        _fails.pop(k, None)


# -------------------------------------------------------------------- API ---
router = APIRouter(prefix="/api/auth")


def _secure(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").split(",")[0].strip() == "https"


def _set_cookie(request: Request, response: Response, token: str, life: int, remember: bool) -> None:
    response.set_cookie(COOKIE, token, max_age=life if remember else None, httponly=True, samesite="lax", secure=_secure(request), path="/")


def current_user(request: Request) -> str | None:
    d = _read()
    return d["user"] if d and valid_session(request.cookies.get(COOKIE)) else None


@router.get("/state")
async def state(request: Request):
    d = _read()
    user = current_user(request)
    return {"enabled": d is not None, "authenticated": user is not None, "user": user, "fun": bool(d and d.get("fun", True))}


class Login(BaseModel):
    username: str
    password: str
    remember: bool = False


@router.post("/login")
async def login(body: Login, request: Request, response: Response):
    d = _read()
    if not d:
        raise HTTPException(400, "Die Anmeldung ist nicht eingerichtet")
    ip = request.client.host if request.client else "?"
    keys = [f"ip:{ip}", f"user:{body.username.strip().lower()}"]
    wait = _blocked_for(keys)
    if wait:
        log.warning("Anmeldung gesperrt für %s (noch %d s)", ip, wait)
        raise HTTPException(429, f"Zu viele Fehlversuche. Bitte in {wait} Sekunden erneut versuchen.")
    same_user = hmac.compare_digest(body.username.strip().lower().encode(), str(d["user"]).lower().encode())
    ok = await asyncio.to_thread(verify_password, body.password, d["hash"] if same_user else None)
    if not ok:
        _failed(keys)
        log.warning("Anmeldung fehlgeschlagen (von %s)", ip)
        await asyncio.sleep(0.4)
        raise HTTPException(401, "Benutzername oder Passwort falsch")
    _cleared(keys)
    token, life = new_session(body.remember)
    _set_cookie(request, response, token, life, body.remember)
    log.info("Angemeldet: %s (von %s)", d["user"], ip)
    return {"ok": True, "user": d["user"]}


@router.post("/logout")
async def logout(request: Request, response: Response):
    end_session(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


class Setup(BaseModel):
    username: str
    password: str
    remember: bool = True


@router.post("/setup")
async def setup(body: Setup, request: Request, response: Response):
    """Switch the login on (only while it is off: with a login already set, changes go through /change)."""
    if enabled():
        raise HTTPException(409, "Die Anmeldung ist schon eingerichtet")
    user, password = _check_new(body.username, body.password)
    _save({"user": user, "hash": await asyncio.to_thread(hash_password, password), "fun": True, "created": int(time.time())})
    token, life = new_session(body.remember)
    _set_cookie(request, response, token, life, body.remember)
    log.info("Anmeldung eingerichtet (Benutzer %s)", user)
    return {"ok": True, "user": user}


class Change(BaseModel):
    current_password: str = ""
    username: str | None = None
    new_password: str | None = None
    fun: bool | None = None


@router.post("/change")
async def change(body: Change, request: Request, response: Response):
    """Change user name and/or password (needs the current password) or the fun switch (does not)."""
    d = _read()
    if not d or not current_user(request):
        raise HTTPException(401, "Anmeldung erforderlich")
    d = dict(d)
    new_hash = None
    if body.username is not None or body.new_password:
        if not await asyncio.to_thread(verify_password, body.current_password, d["hash"]):
            raise HTTPException(403, "Das aktuelle Passwort ist falsch")
        if body.username is not None:
            d["user"] = _check_user(body.username)
        if body.new_password:
            new_hash = await asyncio.to_thread(hash_password, _check_password(body.new_password))
            d["hash"] = new_hash
    if body.fun is not None:
        d["fun"] = body.fun
    _save(d)
    if new_hash:
        end_all_sessions()                  # other devices have to log in again
        token, life = new_session(True)
        _set_cookie(request, response, token, life, True)
        log.info("Passwort geändert")
    return {"ok": True, "user": d["user"]}


class Disable(BaseModel):
    password: str


@router.post("/disable")
async def disable(body: Disable, request: Request, response: Response):
    d = _read()
    if not d or not current_user(request):
        raise HTTPException(401, "Anmeldung erforderlich")
    if not await asyncio.to_thread(verify_password, body.password, d["hash"]):
        raise HTTPException(403, "Das Passwort ist falsch")
    _remove_all()
    response.delete_cookie(COOKIE, path="/")
    log.warning("Anmeldung ausgeschaltet")
    return {"ok": True}


# ------------------------------------------------------- gate / startup ---
def gate(request: Request) -> Response | None:
    """For the middleware: None = let the request through, else the answer (401/403)."""
    path = request.url.path
    if not path.startswith("/api/") or path in PUBLIC or not enabled():
        return None
    if not valid_session(request.cookies.get(COOKIE)):
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "Anmeldung erforderlich", "auth": True}, status_code=401)
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "Ungültige Anfrage (Herkunft)"}, status_code=403)
    return None


def _remove_all() -> None:
    for f in (_file(), _sessions_file()):
        try:
            f.unlink()
        except OSError:
            pass
    _cache.update(mtime=None, data=None)


def startup() -> None:
    """``P5_AUTH_RESET=1``: the login is switched off once at start (the variable can be removed afterwards)."""
    if os.environ.get("P5_AUTH_RESET", "").lower() in ("1", "true", "yes"):
        if _file().exists():
            _remove_all()
            log.warning("Anmeldung wurde zurückgesetzt (P5_AUTH_RESET). Bitte die Variable wieder entfernen und die Anmeldung neu einrichten.")
        else:
            log.info("P5_AUTH_RESET gesetzt, aber es gibt keine Anmeldung")


# -------------------------------------------------------------------- CLI ---
def _cli(argv: list[str]) -> int:
    cmd = argv[0] if argv else "help"
    if cmd == "status":
        d = _read()
        print(f"Anmeldung: {'an (Benutzer ' + d['user'] + ')' if d else 'aus'}")
        return 0
    if cmd == "reset":
        d = _read()
        print("Anmeldung zurücksetzen" + (f" (aktueller Benutzer: {d['user']})" if d else " (derzeit aus)"))
        print("  1) Neues Passwort setzen\n  2) Anmeldung ausschalten")
        choice = input("Auswahl [1/2]: ").strip()
        if choice == "2":
            _remove_all()
            print("Die Anmeldung ist ausgeschaltet.")
            return 0
        if choice != "1":
            print("Abgebrochen.")
            return 1
        user = input(f"Benutzername [{d['user'] if d else 'admin'}]: ").strip() or (d["user"] if d else "admin")
        pw, pw2 = getpass.getpass("Neues Passwort: "), getpass.getpass("Passwort wiederholen: ")
        if pw != pw2:
            print("Die Passwörter stimmen nicht überein.")
            return 1
        try:
            user, pw = _check_new(user, pw)
        except HTTPException as e:
            print(e.detail)
            return 1
        _save({"user": user, "hash": hash_password(pw), "fun": (d or {}).get("fun", True), "created": int(time.time())})
        end_all_sessions()
        print("Fertig. Das neue Passwort gilt sofort.")
        return 0
    print("Aufruf: python -m app.auth status | reset")
    return 0 if cmd == "help" else 2


if __name__ == "__main__":
    sys.exit(_cli(sys.argv[1:]))
