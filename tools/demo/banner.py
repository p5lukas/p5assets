"""Builds docs/images/social-preview.png (1280x640) from the demo screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

IMG = Path(__file__).resolve().parents[2] / "docs" / "images"
B = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
R = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
W, H = 1280, 640
bg = Image.new("RGB", (W, H), (3, 10, 5))
shot = Image.open(IMG / "dashboard.png").convert("RGB")
shot = shot.resize((int(shot.width * 0.62), int(shot.height * 0.62)))
glow = shot.copy().filter(ImageFilter.GaussianBlur(18))
bg.paste(glow, (W - shot.width + 120, 150))
bg.paste(shot, (W - shot.width + 120, 150))
over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(over)
for x in range(0, 760):
    d.line([(x, 0), (x, H)], fill=(3, 10, 5, int(255 * max(0, 1 - max(0, x - 380) / 380))))
bg = Image.alpha_composite(bg.convert("RGBA"), over).convert("RGB")
d = ImageDraw.Draw(bg)
g = (0, 255, 90)
d.text((70, 190), "p5assets", font=ImageFont.truetype(B, 92), fill=g)
d.text((74, 305), "Fehlende Poster & Staffelcover", font=ImageFont.truetype(R, 32), fill=(190, 255, 205))
d.text((74, 350), "für Plex, Sonarr, Radarr und Kometa", font=ImageFont.truetype(R, 32), fill=(190, 255, 205))
d.text((74, 440), "Docker · Unraid · Matrix-UI", font=ImageFont.truetype(R, 24), fill=(0, 190, 70))
bg.save(IMG / "social-preview.png")
