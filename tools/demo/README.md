# Demo-Daten & Screenshots

Erzeugt die Bilder in `docs/images` mit erfundenen Titeln (keine echten Cover, keine echten Server).

- `posters.py` / `data.py` – generierte Poster, Demo-Bibliotheken, Assets-Ordner
- `mocks.py` – Mock von Plex, Sonarr und Radarr (Port 32499)
- `demo_app.py` – p5assets mit gepatchten Online-Anbietern (Port 8099)
- `capture.py` – startet alles, konfiguriert per API und nimmt Screenshots/GIFs mit Playwright + ffmpeg auf
- `banner.py` – Social-Preview (1280×640)

```bash
pip install -r requirements.txt playwright && python tools/demo/capture.py
python tools/demo/banner.py
```
`capture.py` legt kurz Symlinks `/assets` und `/assets-4k` an (bricht ab, wenn sie existieren).
