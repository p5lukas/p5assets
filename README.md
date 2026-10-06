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
1. Template **und Icon** auf den Server bringen. Am einfachsten per Netzwerkfreigabe (funktioniert auch bei privatem Repo):
   `unraid/p5assets.xml` → `\\<Unraid-IP>\flash\config\plugins\dockerMan\templates-user\my-p5assets.xml`
   (Alternativ bei öffentlichem Repo per Terminal:
   `wget -O /boot/config/plugins/dockerMan/templates-user/my-p5assets.xml https://raw.githubusercontent.com/p5lukas/p5assets/main/unraid/p5assets.xml`)
2. *Docker → Add Container* → Template **p5assets** unter *User templates* wählen.
3. Pfade setzen: **Config** (z. B. `/mnt/user/appdata/p5assets`), **Assets 1** (dein Kometa-`asset_directory`),
   bei Bedarf **Assets 2** (z. B. 4K). Nicht benötigte Assets-Pfade leer lassen.
4. Ist Port 8080 belegt, ändere nur den **Host-Port** (z. B. 8484), nicht den Container-Port 8080.
5. WebUI öffnen und das Onboarding durchlaufen. Als Plex-URL trägst du `http://<Unraid-IP>:32400` ein.

### Image-Tags
| Tag | Quelle | Zweck |
|---|---|---|
| `:dev` | Branch `dev` | Neues testen |
| `:latest` | Branch `main` | stabil |
| `:1.2.3` | Git-Tag `v1.2.3` | feste Version |
| `:sha-…` | jeder Build | Fehlersuche |

Das Template nutzt `:latest`. Zum Testen im Container-Formular das Feld *Repository* auf
`ghcr.io/p5lukas/p5assets:dev` ändern.

### Privates GHCR-Paket in Unraid
Solange das Paket privat ist, braucht Unraid einen Login bei ghcr.io:
1. GitHub → *Settings → Developer settings → Personal access tokens → Tokens (classic)* → Token mit **nur** `read:packages`.
2. Im Unraid-Terminal: `docker login ghcr.io -u p5lukas` (Token als Passwort eingeben).
3. Damit der Login einen Neustart überlebt (Unraid leert `/root` beim Booten):
   ```bash
   mkdir -p /boot/config/p5assets && cp /root/.docker/config.json /boot/config/p5assets/docker-config.json
   echo 'mkdir -p /root/.docker && cp /boot/config/p5assets/docker-config.json /root/.docker/config.json' >> /boot/config/go
   ```
   (Der Token liegt dann im Klartext auf dem USB-Stick – deshalb nur Leserechte vergeben.)

Der Build läuft per GitHub Action (`.github/workflows/docker.yml`) bei Push auf `dev` bzw. `main`.
Dateien werden mit `PUID=99` / `PGID=100` (nobody/users) geschrieben.
Updates: Container in Unraid mit *Force Update* aktualisieren.

## Hinweis
Es gibt keine eigene Authentifizierung – betreibe p5assets nur im Heimnetz oder hinter einem Reverse Proxy mit Login.
Plex-Token und API-Keys liegen in `/config/config.json`.
