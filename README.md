# p5assets

Schlanke Weboberfläche im Matrix-Look, die deine **Plex-Bibliotheken** (optional auch **Sonarr/Radarr**) mit dem
**Kometa-Assets-Ordner** vergleicht und fehlende **Poster** und **Staffelcover** (Season00, Season01 …) findet.
Hintergründe werden bewusst ignoriert.

## Features
- Onboarding: Plex-Login (PIN) oder URL + Token, Bibliotheken, Sonarr/Radarr, Welten mit Assets-Ordnern, TMDb/TVDB/fanart.tv
- **Welten** (z. B. HD und 4K): getrennte Bereiche mit eigenem Assets-Ordner, eigener Titelliste und eigenem Dashboard.
  Bibliotheken und Sonarr-/Radarr-Instanzen ordnest du selbst einer Welt zu. Umschalten per Matrix-Animation.
- **Sonarr & Radarr** (beliebig viele Instanzen): auch Titel und Staffeln, die noch nicht in Plex sind – Poster lassen sich schon im Voraus ablegen
- **Eigene Ordner**: Poster für Titel ablegen, die weder in Plex noch in Sonarr/Radarr stehen
- Detailansicht mit Kacheln für Poster und **Season00 – Season50**, auch für Staffeln, die es noch nicht gibt
- Ersetzen per Drag & Drop: einzelnes Bild auf eine Kachel, **mehrere Bilder, ganze Ordner oder ZIPs** irgendwo ins Fenster
- Automatische Zuordnung über Datei-/Ordnernamen (`Show (2020) - Season 2.jpg`, `Show/S01.png`, `poster.jpg` …)
- Kometa-konforme Benennung: `<Medienordner>/poster.jpg`, `Season00.jpg`, `Season01.jpg` … (oder flach mit `asset_folders: false`)
- Online-Suche nach Postern (TMDb, TVDB, fanart.tv) und Übernahme per Klick
- Dashboard mit Abdeckung in %, Filter „Fehlende“, Suche, automatischer Hintergrund-Scan

## Start (Docker Compose)
```bash
docker compose up -d --build
```
Dann http://localhost:8080 öffnen. Die Assets-Ordner müssen dieselben sein, die Kometa als `asset_directory` nutzt,
und **beschreibbar** gemountet werden. Jeder Ordner muss beim Anlegen des Containers eingebunden sein:
`/assets` für die erste Welt, `/assets-4k` für eine zweite usw. Im Onboarding wählst du den Pfad pro Welt aus.
Die Ordnernamen werden aus dem Medienpfad in Plex bzw. Sonarr/Radarr abgeleitet (so sucht Kometa die Assets).

## Unraid
1. Template per Terminal (oben rechts `>_`) auf den Server holen (Repo muss public sein):
   ```bash
   wget -O /boot/config/plugins/dockerMan/templates-user/my-p5assets.xml https://raw.githubusercontent.com/p5lukas/p5assets/main/unraid/p5assets.xml
   ```
   (Alternativ die Datei `unraid/p5assets.xml` per Netzwerkfreigabe nach `\\<Unraid-IP>\flash\config\plugins\dockerMan\templates-user\` kopieren und in `my-p5assets.xml` umbenennen.)
2. *Docker → Add Container* → Template **p5assets** unter *User templates* wählen.
3. Pfade setzen: **Config** (z. B. `/mnt/user/appdata/p5assets`), **Assets 1** (dein Kometa-`asset_directory`),
   bei Bedarf **Assets 2** (z. B. 4K). Nicht benötigte Assets-Pfade leer lassen.
4. Ist Port 8080 belegt, ändere nur den **Host-Port** (z. B. 8484), nicht den Container-Port 8080.
5. WebUI öffnen und das Onboarding durchlaufen. Als Plex-URL trägst du `http://<Unraid-IP>:32400` ein.

Das Image `ghcr.io/p5lukas/p5assets` wird per GitHub Action (`.github/workflows/docker.yml`) bei Push auf `main`
gebaut; das GHCR-Paket muss einmalig auf *public* gestellt werden. Dateien werden mit `PUID=99` / `PGID=100` (nobody/users) geschrieben.
Updates: Container in Unraid mit *Force Update* aktualisieren.

## Hinweis
Es gibt keine eigene Authentifizierung – betreibe p5assets nur im Heimnetz oder hinter einem Reverse Proxy mit Login.
Plex-Token und API-Keys liegen in `/config/config.json`.
