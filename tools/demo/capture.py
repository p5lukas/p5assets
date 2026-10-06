"""Creates the README screenshots and GIFs from a fictional demo library.

    python tools/demo/capture.py            # needs: pip install -r requirements.txt playwright, ffmpeg

Everything is fake: posters are generated (posters.py), Plex/Sonarr/Radarr are mocks (mocks.py), the online
providers are patched (demo_app.py). Output goes to docs/images/.
"""
from __future__ import annotations

import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "docs" / "images"
sys.path.insert(0, str(HERE))

import data  # noqa: E402
from posters import make_poster  # noqa: E402

PY = sys.executable
APP_PORT, MOCK_PORT = 8099, 32499
BASE = f"http://127.0.0.1:{APP_PORT}"
W, H = 1440, 900


def api(path, body=None, method=None):
    req = urllib.request.Request(BASE + "/api" + path, json.dumps(body).encode() if body is not None else None,
                                 {"content-type": "application/json"}, method=method)
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def wait_http(url, tries=60):
    for _ in range(tries):
        try:
            urllib.request.urlopen(url)
            return
        except Exception:  # noqa: BLE001
            time.sleep(0.5)
    raise RuntimeError("server did not start: " + url)


LINKS = [Path("/assets"), Path("/assets-4k")]  # symlinks so that the UI shows realistic container paths


def setup(work: Path):
    data.build_assets(work)
    for link, target in zip(LINKS, ("assets-hd", "assets-4k")):
        if link.is_symlink() or link.exists():
            raise RuntimeError(f"{link} already exists – refusing to touch it")
        link.symlink_to(work / target)
    cfg = work / "cfg"
    cfg.mkdir()
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    env = {**os.environ, "P5_CONFIG_DIR": str(cfg), "P5_ASSETS_DIR": "/assets", "DEMO_PORT": str(APP_PORT),
           "P5_BRANCH": "dev", "P5_COMMIT": commit}
    procs = [
        subprocess.Popen([PY, "-m", "uvicorn", "mocks:app", "--port", str(MOCK_PORT), "--log-level", "warning"], cwd=HERE),
        subprocess.Popen([PY, str(HERE / "demo_app.py")], env=env),
    ]
    wait_http(f"http://127.0.0.1:{MOCK_PORT}/")
    wait_http(BASE + "/api/status")
    api("/plex/connect", {"url": f"http://localhost:{MOCK_PORT}", "token": "demo-token-8f3a"})
    libs = api("/state")["config"]["libraries"]
    for l in libs:
        l["world"] = "hd" if data.LIBS[l["key"]][2] == "HD" else "uhd"
        l["world_set"] = True
    arr = []
    for kind in ("sonarr", "radarr"):
        for w, wid in (("HD", "hd"), ("4K", "uhd")):
            arr.append({"id": f"{kind}-{wid}", "kind": kind, "name": f"{kind.capitalize()} {w}", "url": f"localhost:{MOCK_PORT}/{kind}-{w.lower()}",
                        "api_key": "demo", "world": wid, "world_set": True})
    api("/config", {"patch": {
        "worlds": [{"id": "hd", "name": "HD", "assets_path": "/assets", "hue": 140, "languages": ["xx", "de", "en"]},
                   {"id": "uhd", "name": "4K", "assets_path": "/assets-4k", "hue": 270, "languages": ["xx", "de", "en"]}],
        "libraries": libs, "arr": arr, "apis": {"tmdb": "demo", "tvdb": "demo", "fanart": "demo"}, "scan_interval_minutes": 0}})
    api("/onboarding/finish", {})
    for _ in range(60):
        s = api("/status")
        if s["scanned_at"] and not s["running"]:
            break
        time.sleep(0.5)
    return procs


def poster_file(path: Path, title, year, hue, style, seed, season=None):
    make_poster(title, year, hue, style, seed=seed, season=season).save(path, quality=88)
    return path


# --------------------------------------------------------------- helpers ---
def gif(video: Path, dest: Path, start: float, dur: float, crop: str | None = None, width: int = 760, fps: int = 12):
    vf = f"fps={fps}," + (f"crop={crop}," if crop else "") + f"scale={width}:-1:flags=lanczos"
    vf += ",split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(video), "-vf", vf, "-loop", "0", str(dest)], check=True)
    print(f"  {dest.name}: {dest.stat().st_size / 1024:.0f} KB")


def main():
    from playwright.sync_api import sync_playwright
    OUT.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="p5demo_"))
    procs = setup(work)
    chrome = next(iter(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")), None)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()

            def page(w=W, h=H, video=False):
                ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1,
                                    **({"record_video_dir": str(work / "video"), "record_video_size": {"width": w, "height": h}} if video else {}))
                pg = ctx.new_page()
                pg.on("dialog", lambda d: d.accept())
                return ctx, pg

            def shot(pg, name, clip=None):
                pg.wait_for_timeout(700)
                pg.screenshot(path=str(OUT / f"{name}.png"), clip=clip)
                print("  ", name)

            def to_world(pg, name):
                pg.click(f".worlds button:has-text('{name}')")
                pg.wait_for_timeout(2200)

            def open_item(pg, title):
                pg.click(f".card:has-text('{title}')")
                pg.wait_for_timeout(900)

            def tile(pg, label):
                return pg.locator(f".slot:has(.lab:text-is('{label}')) .poster")

            # ---------------------------------------------------------------- screenshots ---
            ctx, pg = page()
            pg.goto(BASE); pg.wait_for_timeout(2500)
            shot(pg, "dashboard")
            # detail with the hover overlay on an existing poster
            open_item(pg, "Midnight Relay")
            tile(pg, "Serienposter").hover()
            shot(pg, "detail")
            # online search from an empty tile
            tile(pg, "Staffel 2").hover()
            pg.locator(".slot:has(.lab:text-is('Staffel 2')) .ov-btn:text-is('Online')").click()
            pg.wait_for_selector(".tab"); pg.wait_for_timeout(1800)
            shot(pg, "online-search")
            pg.keyboard.press("Escape"); pg.locator(".modalwrap .btn.ghost.sm").first.click(); pg.wait_for_timeout(300)
            pg.click(".drawer header button:has-text('✕')")
            # 4K world
            to_world(pg, "4K")
            shot(pg, "dashboard-4k")
            # coming-soon placeholder: write a poster (mirrored into the real Radarr folder), then open the preview
            items = api("/items?world=uhd&filter=all&q=dawn")["items"]
            did = items[0]["id"]
            tmp = poster_file(work / "dawn.jpg", "Dawn Protocol", 2026, 300, "moon", 77)
            subprocess.run(["curl", "-s", "-F", f"file=@{tmp}", f"{BASE}/api/items/{did}/poster/upload", "-o", os.devnull], check=True)
            pg.reload(); pg.wait_for_timeout(1800)
            open_item(pg, "Dawn Protocol")
            tile(pg, "Poster").hover(); pg.locator(".slot:has(.lab:text-is('Poster')) .ov-btn:text-is('Vorschau')").click()
            shot(pg, "preview")
            pg.keyboard.press("Escape"); pg.click(".drawer header button:has-text('✕')")
            # apply to all
            open_item(pg, "Static Dreams")
            tile(pg, "Serienposter").hover(); pg.locator(".slot:has(.lab:text-is('Serienposter')) .ov-btn:text-is('Auf alle …')").click()
            pg.wait_for_selector(".numfld"); pg.locator(".numfld").fill("6"); pg.locator(".modal input[type=radio]").nth(1).check()
            shot(pg, "apply-all")
            pg.locator(".modal button:text-is('Abbrechen')").click(); pg.click(".drawer header button:has-text('✕')")
            ctx.close()

            # ---------------------------------------------------------------- GIF: world switch ---
            ctx, pg = page(video=True)
            t0 = time.monotonic()
            pg.goto(BASE); pg.wait_for_timeout(2300)
            start = time.monotonic() - t0
            pg.mouse.move(640, 300); pg.wait_for_timeout(700)
            pg.click(".worlds button:has-text('4K')"); pg.wait_for_timeout(2300)
            pg.click(".worlds button:has-text('HD')"); pg.wait_for_timeout(2300)
            vid = pg.video.path(); ctx.close()
            gif(Path(vid), OUT / "world-switch.gif", start, 7.2, width=760)

            # ---------------------------------------------------------------- GIF: matrix rain on replace ---
            ctx, pg = page(video=True)
            t0 = time.monotonic()
            pg.goto(BASE); pg.wait_for_timeout(2000)
            open_item(pg, "Midnight Relay")
            start = time.monotonic() - t0
            new = poster_file(work / "s2.jpg", "Midnight Relay", 2022, 275, "moon", 31, season=2)
            t = tile(pg, "Staffel 2"); t.hover(); pg.wait_for_timeout(900)
            with pg.expect_file_chooser() as fc:
                t.click(position={"x": 20, "y": 20})
            fc.value.set_files(str(new))
            pg.wait_for_timeout(3200)
            vid = pg.video.path(); ctx.close()
            gif(Path(vid), OUT / "matrix-replace.gif", start, 6.0, crop="940:380:500:190", width=760)

            # ---------------------------------------------------------------- GIF: ZIP import ---
            zp = work / "posters.zip"
            with zipfile.ZipFile(zp, "w") as z:
                def add(name, *args, **kw):
                    f = work / "z.jpg"; poster_file(f, *args, **kw); z.write(f, name)
                add("Midnight Relay (2022) - Season 2.jpg", "Midnight Relay", 2022, 275, "moon", 41, season=2)
                add("Midnight Relay (2022) - Season 3.jpg", "Midnight Relay", 2022, 300, "orbit", 42, season=3)
                add("The Archivists (2023)/poster.jpg", "The Archivists", 2023, 35, "valley", 43)
                add("The Archivists (2023)/Season01.jpg", "The Archivists", 2023, 55, "city", 44, season=1)
                add("Paper Moons (2021).jpg", "Paper Moons", 2021, 275, "moon", 45)
                add("Zero Hour (2019).jpg", "Zero Hour", 2019, 350, "city", 46)
                add("Cobalt Station (2020) - Season 4.jpg", "Cobalt Station", 2020, 215, "orbit", 47, season=4)
                add("Cobalt Station (2020) - Backdrop.jpg", "Cobalt Station", 2020, 215, "grid", 48)
            ctx, pg = page(video=True)
            t0 = time.monotonic()
            pg.goto(BASE); pg.wait_for_timeout(2200)
            start = time.monotonic() - t0
            pg.click("button[title^='Bilder, Ordner']"); pg.wait_for_timeout(900)
            with pg.expect_file_chooser() as fc:
                pg.click(".modal button:has-text('Bilder / ZIP')")
            fc.value.set_files(str(zp)); pg.wait_for_selector(".imp"); pg.wait_for_timeout(2600)
            pg.screenshot(path=str(OUT / "import-review.png")); print("   import-review")
            pg.click(".modal footer .btn.primary"); pg.wait_for_timeout(3600)
            vid = pg.video.path(); ctx.close()
            gif(Path(vid), OUT / "import-zip.gif", start, 10.5, width=760)

            # ---------------------------------------------------------------- settings + logs ---
            ctx, pg = page()
            pg.goto(BASE); pg.wait_for_timeout(1800)
            pg.click(".btn.tb.icon[title='Einstellungen']"); pg.wait_for_timeout(500)
            pg.click(".stepnav button:has-text('Welten')"); shot(pg, "onboarding-worlds")
            pg.click(".stepnav button:has-text('Zuordnung')"); shot(pg, "onboarding-assign")
            pg.click("button:has-text('Schließen')"); pg.wait_for_timeout(2500)
            pg.click(".btn.tb.icon[title='Logs']"); pg.wait_for_timeout(1500); shot(pg, "logs")
            ctx.close()
            b.close()
    finally:
        for pr in procs:
            pr.terminate()
        for link in LINKS:
            if link.is_symlink():
                link.unlink()  # only the symlinks, never the targets
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
