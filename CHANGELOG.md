# Änderungen

## 0.4.4 – 2026-10-12

**Neu**
- Poster-Vorschau zeigt die Plex-Collection(en) des Films; aufgeklappt stehen alle Poster der Collection nebeneinander (fehlende markiert, anklickbar)
- Einrichtung und Einstellungen mit Seitenleiste (Gruppen: Verbindungen, Welten, Weiteres); auf dem Handy eine scrollbare Zeile

**Geändert**
- Aufgeräumt: Reiter „Vollständig“ und „Collections“ entfernt (die Collection-Erkennung im Import und die Vorschau bleiben)
- „Bilder hochladen“ heißt jetzt „Poster hochladen“
- Ausgeblendete Collections lassen sich unter Einstellungen → Bibliotheken zurücksetzen

## 0.4.3 – 2026-10-11

**Neu**
- Collections lassen sich ausblenden (im Reiter „Collections“ und im Import); die Auswahl bleibt gespeichert, im Reiter sind ausgeblendete wieder einblendbar

**Geändert**
- Der Import zeigt alle passenden Plex-Collections eines Films (jeweils mit eigener Prüfung), nicht nur die erste; so kann eine große Sammel-Collection die passende kleine nicht mehr verdrängen

**Behoben**
- Code-Qualität: `ruff check` meldet keine Fehler mehr

## 0.4.2 – 2026-10-11

**Neu**
- Plex-Collections: neuer Reiter „Collections“ zeigt jede Collection (ab zwei Filmen) mit „x von y Postern“; Filme ohne Poster lassen sich direkt dort hochladen
- Beim Import werden Filme nach Plex-Collection gruppiert, die Prüfung nennt Filme der Collection, die danach noch kein Poster haben

## 0.4.1 – 2026-10-11

**Neu**
- Ein Klick auf das Logo bringt von überall zurück zur Startseite
- Tastaturkürzel: „/“ springt ins Suchfeld, Esc leert es, ←/→ blättern in der Poster-Vorschau (mit ‹ › Knöpfen)
- Import erkennt Collection-/Sammlungs-Poster am Dateinamen und ordnet sie nicht automatisch zu

**Geändert**
- „Neu in diesem Update“ ist jetzt ein kurzer Hinweis (einmal pro Version); alle Neuigkeiten, nach Version gruppiert, stehen unter „Neuigkeiten“ in der Fußzeile
- Bei doppelt belegten Kacheln bevorzugt der Import die Datei „Titel (Jahr)“ und wählt die andere ab

## 0.4.0 – 2026-10-10

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
