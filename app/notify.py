"""Notifications after a scan (Discord, Telegram, ntfy).

Only three things are reported, nothing else:
  1. titles without a poster that are Coming-Soon placeholders in Plex,
  2. new entries in "In Plex, Poster fehlt" (summarised with 1 in ONE message),
  3. errors of a scan (once per error state, not at every repeated scan).
"New" means: not in the previous scan. The very first scan only records the starting point (no flood of messages)."""
from __future__ import annotations

import json
import os

import httpx

from . import config, logs

log = logs.get("notify")
STATE_FILE = config.CONFIG_DIR / "notify_state.json"
TELEGRAM_API = os.environ.get("P5_TELEGRAM_API", "https://api.telegram.org").rstrip("/")   # overridable for tests
MAX_LISTED = 10


def _read() -> dict:
    try:
        return json.loads(STATE_FILE.read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def _write(state: dict) -> None:
    try:
        config.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(state), "utf-8")
        tmp.replace(STATE_FILE)
    except OSError as e:
        log.warning("Benachrichtigungs-Zustand nicht speicherbar: %s", e)


def channels(cfg: dict | None = None) -> list[str]:
    """Enabled channels that have everything they need."""
    n = (cfg or config.get()).get("notify", {})
    out = []
    if n.get("discord", {}).get("enabled") and n["discord"].get("webhook"):
        out.append("discord")
    if n.get("telegram", {}).get("enabled") and n["telegram"].get("token") and n["telegram"].get("chat_id"):
        out.append("telegram")
    if n.get("ntfy", {}).get("enabled") and n["ntfy"].get("url") and n["ntfy"].get("topic"):
        out.append("ntfy")
    return out


async def _send(channel: str, title: str, text: str, n: dict) -> str | None:
    """Returns None on success, otherwise a short error text (never containing the URL or a token)."""
    link = (n.get("base_url") or "").strip()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=6.0)) as c:
            if channel == "discord":
                r = await c.post(n["discord"]["webhook"], json={"username": "p5assets", "content": f"**{title}**\n{text}"[:1900]})
            elif channel == "telegram":
                t = n["telegram"]
                r = await c.post(f"{TELEGRAM_API}/bot{t['token']}/sendMessage",
                                 json={"chat_id": t["chat_id"], "text": f"{title}\n{text}"[:4000], "disable_web_page_preview": True})
            else:
                t = n["ntfy"]
                body = {"topic": t["topic"], "title": title, "message": text[:3500], "tags": ["frame_with_picture"]}
                if link:
                    body["click"] = link
                r = await c.post(t["url"].rstrip("/") + "/", json=body, headers={"Authorization": f"Bearer {t['token']}"} if t.get("token") else {})
        if r.status_code >= 400:
            return f"HTTP {r.status_code}" + (" – Zugangsdaten oder Adresse prüfen" if r.status_code in (401, 403, 404) else "")
        return None
    except httpx.HTTPError as e:
        return type(e).__name__ + " – nicht erreichbar"
    except Exception as e:  # noqa: BLE001
        return type(e).__name__


async def send_all(title: str, text: str, only: list[str] | None = None) -> dict[str, str | None]:
    cfg = config.get()
    res: dict[str, str | None] = {}
    for ch in (only or channels(cfg)):
        res[ch] = await _send(ch, title, text, cfg["notify"])
        if res[ch]:
            log.warning("Benachrichtigung (%s) fehlgeschlagen: %s", ch, res[ch])
    return res


def compose(new: list[dict], multi_world: bool, link: str) -> tuple[str, str]:
    """(title, text) for the new titles without poster; ``new`` = [{title, year, world, coming_soon}]."""
    n, soon = len(new), sum(1 for x in new if x["coming_soon"])
    head = f"{n} neue{'r' if n == 1 else ''} Titel ohne Poster" + (f", {soon} davon Coming Soon" if soon else "")
    ordered = sorted(new, key=lambda x: (not x["coming_soon"], x["title"].casefold()))   # Coming Soon first
    lines = [f"• {'[' + x['world'] + '] ' if multi_world else ''}{x['title']}{' (' + str(x['year']) + ')' if x['year'] else ''}"
             f"{' – Coming Soon' if x['coming_soon'] else ''}" for x in ordered[:MAX_LISTED]]
    if n > MAX_LISTED:
        lines.append(f"… und {n - MAX_LISTED} weitere")
    if link:
        lines.append(link)
    return "p5assets: " + head, "\n".join(lines)


async def after_scan(items: list[dict], worlds: list[dict], failed: dict[str, list[str]], error: str | None) -> None:
    """Called at the end of every scan. Never raises."""
    try:
        cfg = config.get()
        state = _read()
        first = "missing" not in state
        names = {w["id"]: w["name"] for w in worlds}
        cur: dict[str, dict] = {}
        if not error:
            for it in items:
                if it.get("missing_plex"):
                    cur[it["id"]] = {"title": it["title"], "year": it.get("year"), "world": names.get(it["world"], ""),
                                     "coming_soon": bool(it.get("coming_soon")) and not it["slots"].get("poster", {}).get("exists")}
        # --- 1 + 3: new titles without poster (Coming Soon marked), one message
        if not error:
            prev = set(state.get("missing", []))
            new = [v for k, v in cur.items() if k not in prev]
            state["missing"] = list(cur)
            if new and not first and channels(cfg):
                title, text = compose(new, len(worlds) > 1, (cfg["notify"].get("base_url") or "").strip())
                res = await send_all(title, text)
                log.info("Benachrichtigung: %s (%s)", title, ", ".join(f"{k}: {'ok' if v is None else v}" for k, v in res.items()))
        # --- 2: errors, once per error state
        names_failed = [n for lst in failed.values() for n in lst]
        sig = error or (", ".join(sorted(set(names_failed))) + " nicht erreichbar" if names_failed else "")
        if sig and sig != state.get("error_sig") and channels(cfg):
            res = await send_all("p5assets: Fehler beim Scan", sig)
            log.info("Benachrichtigung: Scan-Fehler (%s)", ", ".join(f"{k}: {'ok' if v is None else v}" for k, v in res.items()))
        state["error_sig"] = sig
        _write(state)
    except Exception as e:  # noqa: BLE001 – a notification problem must never break a scan
        log.warning("Benachrichtigung konnte nicht verarbeitet werden: %s", type(e).__name__)
