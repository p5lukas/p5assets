# p5assets

Schlanke Weboberfläche, die deine **Plex-Bibliotheken** mit dem **Kometa-Assets-Ordner** vergleicht und fehlende
**Poster** und **Staffelcover** (Season00, Season01 …) findet. Hintergründe werden bewusst ignoriert.

## Features
- Onboarding: Plex-Login (PIN) oder URL + Token, Bibliotheken, Assets-Ordner, TMDb/TVDB/fanart.tv
- Dashboard mit Abdeckung in %, Filter „Fehlende“, Suche, automatischer Scan
- Ersetzen per Drag & Drop: einzelnes Bild auf ein Poster, **mehrere Bilder, ganze Ordner oder ZIPs** irgendwo ins Fenster
- Automatische Zuordnung über Datei-/Ordnernamen (`Show (2020) - Season 2.jpg`, `Show/S01.png`, `poster.jpg` …)
- Kometa-konforme Benennung: `<Medienordner>/poster.jpg`, `Season00.jpg`, `Season01.jpg` … (oder flach mit `asset_folders: false`)
- Online-Suche nach Postern (TMDb, TVDB, fanart.tv) und Übernahme per Klick

## Start
```bash
docker compose up -d --build
```
Dann http://localhost:8080 öffnen. Der Assets-Ordner muss derselbe sein, den Kometa als `asset_directory` nutzt
und **beschreibbar** gemountet sein. Die Ordnernamen werden aus dem Medienpfad in Plex abgeleitet
(so sucht Kometa die Assets).

## Unraid
1. Template-Datei `unraid/p5assets.xml` nach `/boot/config/plugins/dockerMan/templates-user/` auf den Stick kopieren
   (oder in den Docker-Einstellungen unter *Template-Repositories* `https://github.com/p5lukas/p5assets` eintragen).
2. *Docker → Container hinzufügen* → Template **p5assets** wählen.
3. Pfad **Kometa Assets** auf deinen Kometa-`asset_directory` setzen (Lese-/Schreibzugriff), **Config** z. B. `/mnt/user/appdata/p5assets`.
4. WebUI öffnen (Standard-Port 8080) und das Onboarding durchlaufen. In Plex trägst du als URL die Unraid-IP mit Port 32400 ein.

Das Image `ghcr.io/p5lukas/p5assets` wird per GitHub Action (`.github/workflows/docker.yml`) bei Push auf `main`
gebaut; das GHCR-Paket muss einmalig auf *public* gestellt werden. Dateien werden mit `PUID=99` / `PGID=100` (nobody/users) geschrieben.

## Hinweis
Es gibt keine eigene Authentifizierung – betreibe p5assets nur im Heimnetz oder hinter einem Reverse Proxy mit Login.
Plex-Token und API-Keys liegen in `/config/config.json`.
