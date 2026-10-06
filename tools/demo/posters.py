"""Fictional poster artwork for the README screenshots (no real covers are used)."""
from __future__ import annotations

import colorsys
import random
import textwrap

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def hsl(h: float, s: float, l: float, a: int = 255) -> tuple[int, int, int, int]:
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, l, s)
    return int(r * 255), int(g * 255), int(b * 255), a


def _gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGBA", size)
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(4))
        for x in range(w):
            px[x, y] = c
    return img


def _scene(style: str, hue: float, size, rnd: random.Random) -> Image.Image:
    w, h = size
    bg = _gradient(size, hsl(hue, 0.7, 0.10), hsl(hue + 30, 0.75, 0.34))
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    light = hsl(hue + 12, 0.9, 0.62)
    glow = hsl(hue + 20, 1.0, 0.75)
    if style == "horizon":
        cx, cy, r = w // 2, int(h * 0.42), int(w * 0.30)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=glow)
        for i in range(9):  # sun slices
            y = cy + int(r * 0.1) + i * 14
            d.rectangle((0, y, w, y + 3 + i), fill=hsl(hue, 0.7, 0.12 + i * 0.012))
        for i in range(-8, 9):  # floor grid
            d.line((w // 2 + i * 12, int(h * 0.52), w // 2 + i * 120, h), fill=light, width=2)
        for i in range(7):
            y = int(h * 0.52) + int((i / 7) ** 2 * h * 0.35)
            d.line((0, y, w, y), fill=light, width=2)
    elif style == "signal":
        cx, cy = int(w * 0.5), int(h * 0.62)
        for i in range(1, 9):
            r = i * 52
            d.arc((cx - r, cy - r, cx + r, cy + r), 200, 340, fill=glow if i % 2 else light, width=5)
        d.polygon([(cx - 14, cy), (cx + 14, cy), (cx + 4, int(h * 0.30)), (cx - 4, int(h * 0.30))], fill=hsl(hue, 0.4, 0.06))
        d.ellipse((cx - 10, int(h * 0.30) - 10, cx + 10, int(h * 0.30) + 10), fill=glow)
    elif style == "harbor":
        for i in range(24):
            y = int(h * 0.55) + i * 11
            d.line((0, y, w, y), fill=hsl(hue, 0.6, 0.20 + i * 0.008, 200), width=2)
        for (x, s) in ((0.30, 1.0), (0.62, 0.75)):
            bx = int(w * x)
            d.line((bx, int(h * 0.55), bx, int(h * (0.55 - 0.32 * s))), fill=hsl(hue, 0.3, 0.9), width=4)
            d.polygon([(bx + 4, int(h * (0.55 - 0.32 * s))), (bx + 4, int(h * 0.53)), (bx + int(110 * s), int(h * 0.53))], fill=glow)
            d.polygon([(bx - 4, int(h * (0.55 - 0.26 * s))), (bx - 4, int(h * 0.53)), (bx - int(80 * s), int(h * 0.53))], fill=light)
    elif style == "valley":
        d.ellipse((int(w * 0.62), int(h * 0.12), int(w * 0.62) + 120, int(h * 0.12) + 120), fill=glow)
        for k, (base, amp) in enumerate(((0.62, 150), (0.70, 120), (0.80, 90))):
            pts = [(0, h)]
            for x in range(0, w + 40, 40):
                pts.append((x, int(h * base) - int(amp * rnd.random())))
            pts.append((w, h))
            d.polygon(pts, fill=hsl(hue + k * 6, 0.65, 0.30 - k * 0.08))
    elif style == "moon":
        cx, cy, r = int(w * 0.5), int(h * 0.38), int(w * 0.34)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=hsl(hue, 0.5, 0.88))
        d.ellipse((cx - r + 36, cy - r - 8, cx + r + 36, cy + r - 8), fill=hsl(hue, 0.7, 0.14))
        for _ in range(60):
            x, y, s = rnd.randrange(w), rnd.randrange(int(h * 0.65)), rnd.choice((1, 2, 3))
            d.ellipse((x, y, x + s, y + s), fill=(255, 255, 255, 230))
    elif style == "orbit":
        cx, cy = w // 2, int(h * 0.40)
        for i, (rx, ry) in enumerate(((250, 70), (200, 56), (150, 42))):
            d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=light if i % 2 else glow, width=4)
        d.ellipse((cx - 62, cy - 62, cx + 62, cy + 62), fill=glow)
        d.ellipse((cx + 150, cy - 18, cx + 180, cy + 12), fill=(255, 255, 255, 255))
    elif style == "city":
        x = 0
        while x < w:
            bw, bh = rnd.randrange(40, 90), rnd.randrange(160, 420)
            d.rectangle((x, int(h * 0.68) - bh, x + bw, int(h * 0.68)), fill=hsl(hue, 0.5, 0.07 + rnd.random() * 0.05))
            for wy in range(int(h * 0.68) - bh + 12, int(h * 0.68) - 10, 22):
                for wx in range(x + 8, x + bw - 8, 16):
                    if rnd.random() < 0.45:
                        d.rectangle((wx, wy, wx + 7, wy + 10), fill=hsl(hue + 25, 1.0, 0.7))
            x += bw + 4
        d.rectangle((0, int(h * 0.68), w, h), fill=hsl(hue, 0.5, 0.05))
    else:  # "grid"
        vx, vy = w // 2, int(h * 0.38)
        for i in range(-12, 13):
            d.line((vx, vy, vx + i * 90, h), fill=light, width=2)
        for i in range(1, 14):
            y = vy + int((i / 13) ** 2.2 * (h - vy))
            d.line((0, y, w, y), fill=light, width=2)
        d.ellipse((vx - 70, vy - 70, vx + 70, vy + 70), fill=glow)
    layer = layer.filter(ImageFilter.GaussianBlur(0.6))
    return Image.alpha_composite(bg, layer)


def make_poster(title: str, year: int | None, hue: float, style: str, size=(600, 900), seed: int = 1,
                season: int | None = None, badge: str | None = None, textless: bool = False) -> Image.Image:
    rnd = random.Random(seed)
    w, h = size
    img = _scene(style, hue, size, rnd)
    # darken the lower third for the title
    shade = Image.new("RGBA", size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for y in range(int(h * 0.55), h):
        sd.line((0, y, w, y), fill=(0, 0, 0, int(215 * max(0.0, (y - h * 0.55) / (h * 0.45)) ** 1.3)))
    img = Image.alpha_composite(img, shade)
    d = ImageDraw.Draw(img)
    if textless:
        d.rectangle((24, 24, w - 24, h - 24), outline=(255, 255, 255, 40), width=2)
        return img.convert("RGB")
    big = ImageFont.truetype(BOLD, 62)
    small = ImageFont.truetype(REG, 26)
    lines = textwrap.wrap(title.upper(), 13) if len(title) > 13 else [title.upper()]
    y = h - 70 - len(lines) * 72
    for line in lines[:3]:
        tw = d.textlength(line, font=big)
        d.text(((w - tw) / 2 + 3, y + 3), line, font=big, fill=(0, 0, 0, 160))
        d.text(((w - tw) / 2, y), line, font=big, fill=(255, 255, 255, 255))
        y += 72
    sub = f"STAFFEL {season}" if season is not None else (str(year) if year else "")
    if sub:
        sw = d.textlength(sub, font=small)
        d.text(((w - sw) / 2, h - 52), sub, font=small, fill=hsl(hue + 12, 0.9, 0.78))
    d.rectangle((24, 24, w - 24, h - 24), outline=(255, 255, 255, 40), width=2)
    if badge:  # simulated Kometa overlay, only used on the "Plex preview" variant
        f = ImageFont.truetype(BOLD, 30)
        d.rectangle((0, 0, w, 56), fill=(0, 0, 0, 200))
        d.text((18, 10), badge, font=f, fill=(255, 255, 255, 255))
    return img.convert("RGB")


if __name__ == "__main__":
    make_poster("Neon Horizon", 2024, 150, "horizon").save("/tmp/poster_test.jpg", quality=90)
