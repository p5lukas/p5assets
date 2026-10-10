# Änderungen

## 0.4.0 (in Vorbereitung, Branch `dev`)

**Neu**
- Benachrichtigungen per Discord, Telegram oder ntfy (neue Titel ohne Poster, Coming Soon, Scan-Fehler)
- „Neu in diesem Update“-Fenster mit Einrichten-Aktionen (später über „Neuigkeiten“ in der Fußzeile)
- Papierkorb mit Rückgängig (30 Tage, höchstens 2 GB) und Aufräumen verwaister Ordner, jeweils mit Suche
- Reiter „Schwache Poster“ (zu klein oder nicht 2:3, Schwellwerte frei wählbar)
- Abdeckungsverlauf im Statistik-Block
- Zehn Welten mit eigenem Planeten, Wechsel als Wurmloch-Reise
- Reiter „In Plex, Poster fehlt“ und „Coming Soon“; Quellenauswahl; A–Z-Leiste
- Set-Kontrolle beim Import: Gruppen je Serie, Prüfung gegen die Staffeln aus Plex/Sonarr, Warnung bei doppelt belegten Kacheln
- Herunterladen (Original, ZIP am Desktop); auf iPhone/iPad öffnet sich das Original in p5assets
- Installierbar als App auf iPhone/iPad (Runterziehen zum Aktualisieren, „Neu laden“)
- Upload-Gruppe „Bilder hochladen:“ (Datei/ZIP, Ordner), Suche neben den Reitern mit Ein-Klick-Leeren
- Optionale Anmeldung (Benutzername/Passwort, scrypt-Hash, 30 Tage angemeldet bleiben, Sperre nach Fehlversuchen) mit Zurücksetzen per Befehl, Umgebungsvariable oder Datei
- Lizenz: GPL-3.0

**Geändert**
- Marken vereinfacht: kein Häkchen-Kästchen mehr, eine Marke „Noch nicht in Plex“, richtige Einzahl/Mehrzahl
- „Titel anlegen“ (eigene Ordner) entfernt; vorhandene Einträge erscheinen ggf. unter „Verwaiste Ordner“
- Vorschau-Fenster mit einer Kopfzeile und einem Schließen-Kreuz

**Behoben / verbessert**
- Fehlermeldungen enthalten keine API-Keys oder Tokens mehr (auch nicht aus Request-URLs)
- Titelabgleich beim Import ca. 17-mal schneller (180 Dateien gegen 6450 Titel: 29 s → 1,7 s)
- Sicherheits-Header (Content-Security-Policy, kein Einbetten in fremde Seiten, nosniff, kein Referrer)
- Ungültige Logdateinamen ergeben 400 statt 500; ZIP-Einträge mit echter Größenbegrenzung
- Leere Liste nach fehlgeschlagenem Scan erklärt jetzt den Fehler und bietet „Erneut scannen“
- Statische Dateien werden mit Versionsparameter ausgeliefert (die Home-Bildschirm-App lädt sofort die neue Version)
- 40+ automatische Tests (Namensregeln, Zuordnung, Papierkorb, Upload/ZIP, Sicherheit) laufen vor jedem Image-Bau

**Für die Veröffentlichung**
1. `BASE_VERSION` in `app/version.py` auf `0.4.0` setzen
2. `dev` nach `main` bringen (README, LICENSE und Social-Preview liegen bisher nur auf `dev`)
3. Auf GitHub ein Release `v0.4.0` mit diesen Notizen anlegen (löst den Image-Bau mit dem Tag aus)
4. Social-Preview-Bild `docs/images/social-preview-2026-10.png` in den Repo-Einstellungen hochladen
