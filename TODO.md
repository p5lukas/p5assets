# p5assets – Ideen & Verbesserungen

Alle bisher gesammelten Punkte sind in Version 2 umgesetzt. Neue Beobachtungen bitte unten eintragen.

## Uploads
- [x] Beliebige zusätzliche Staffelposter hochladen können, auch für Staffeln, die Plex noch nicht kennt (z. B. Season05, bevor sie bei Plex landet). Benennung weiterhin automatisch Kometa-konform (`Season05.jpg` im richtigen Medienordner)
- [x] Sonarr/Radarr anbinden (URL + API-Key im Onboarding, optional, mehrere Instanzen möglich): Titel und Staffeln inkl. noch nicht erschienener/nicht in Plex vorhandener liefern; Ordnername (letzte Pfadkomponente) aus Sonarr/Radarr ableiten und mit Plex per TVDB-/TMDB-ID zusammenführen. Titel nur in Sonarr/Radarr als „noch nicht in Plex“ kennzeichnen, Poster-Upload dafür erlauben
- [x] Mehrere Sonarr- und Radarr-Instanzen (z. B. HD und 4K), jeweils mit eigenem Namen, URL und API-Key
- [x] „Welten“ (z. B. HD und 4K): getrennte Bereiche mit eigener Titelliste und eigenem Dashboard. Ordnernamen sind in HD und 4K gleich, deshalb darf nichts vermischt werden. Zuordnung im Onboarding und in den Einstellungen: Der Nutzer weist Plex-Bibliotheken, Sonarr- und Radarr-Instanzen selbst einer Welt zu (beliebig viele Welten, nicht nur zwei)
- [x] Welten-Umschalter in der Kopfleiste mit kurzer Matrix-Animation beim Wechsel (z. B. HD → 4K), jede Welt mit eigener Akzentfarbe/Beschriftung, damit klar ist, wo man gerade ist
- [x] Geklärt: HD und 4K haben komplett getrennte Assets-Ordner. Der Assets-Pfad wird pro Welt gesetzt (ersetzt den Punkt „Mehrere Assets-Ordner“)
- [x] Unraid-Template: mehrere Assets-Pfade vorsehen (z. B. `/assets` für HD, `/assets-4k` für 4K) und in der README erklären, dass jeder Ordner beim Anlegen des Containers gemountet sein muss. Ordner-Browser im Onboarding zeigt die gemounteten Pfade
- [x] Freie Ordnereingabe: Poster für Titel ablegen, die weder in Plex noch in Sonarr/Radarr stehen (Ordnername von Hand, z. B. `Titel (Jahr)`)
- [x] Detailansicht einer Serie: leere Kacheln für Poster, Season00 bis Season50, auch für Staffeln, die es (noch) nicht gibt. Fehlende Extra-Kacheln zählen nicht als „fehlt“. Vorschlag: bekannte Staffeln zuerst, die übrigen eingeklappt unter „Weitere Staffeln“, damit die Ansicht übersichtlich bleibt. Backend muss dafür Staffel-Slots 0–50 erlauben

## Onboarding / Eingabe
- [ ] Weltzuordnung verständlicher als eigener Onboarding-Schritt „Zuordnung“ (zwischen „Welten“ und „Poster-Quellen“): Quellen-Bubbles „Plex“, „Sonarr“ und „Radarr“ enthalten ihre Bibliotheken bzw. Instanzen als kleine Chips. Darunter stehen große Welt-Bubbles (in der jeweiligen Weltfarbe). Der Nutzer zieht die Chips per Drag & Drop aus den Quellen-Bubbles in die gewünschte Welt-Bubble; ein Chip kann auch wieder zurückgezogen werden. Nicht zugeordnete Chips landen standardmäßig in der ersten Welt. Statt der Bücher-Symbole 📚 klare Beschriftung/Symbole pro Quelle (Plex, Sonarr, Radarr). Zusätzlich Klick-Alternative für Touch-Geräte (Chip antippen, dann Welt antippen). Der bisherige Zuordnungsblock im Schritt „Welten“ entfällt
- [ ] Navigation in den Einstellungen deutlicher: Statt der schmalen Striche oben eine beschriftete Schrittleiste (z. B. „Plex · Bibliotheken · Sonarr/Radarr · Welten · Quellen“) im Matrix-/Terminal-Stil, mit Namen, aktivem Schritt hervorgehoben und Hover-Hinweis. Im Einstellungsmodus frei anklickbar, im ersten Onboarding nur bereits erreichte Schritte
- [ ] Plex-Adresse in drei Felder aufteilen: Protokoll als Dropdown (http/https), IP-Adresse oder Hostname als Textfeld (manuell, ohne Vorgabe), Port als eigenes Feld mit Beispiel 32400 (Platzhalter). Daraus wird intern die URL zusammengesetzt. Gleiches Muster eventuell auch für Sonarr/Radarr (Standardports 8989/7878)

## Detailansicht
- [ ] Bildquelle sauber trennen: Angezeigt und zum Kopieren genutzt werden immer die im Kometa-Assets-Ordner gefundenen Bilder (ohne Overlays). Plex-Bilder (mit Overlays wie Auflösungs-Badges) nur als Backup-Vorschau, wenn für den Slot kein Kometa-Asset existiert. Solche Plex-Vorschauen deutlich kennzeichnen („Plex-Vorschau, mit Overlay“) und nicht als Quelle für das Kopieren per Drag & Drop zulassen
- [ ] Vorhandene Bilder innerhalb der Serienansicht auf andere Kacheln ziehen: z. B. das Poster von Staffel 1 auf die leere Kachel Staffel 2 ziehen. Das Bild wird kopiert und Kometa-konform umbenannt (`Season02.jpg`), das Original bleibt erhalten. Auch für die Kachel „Serienposter“ und die „Weiteren Staffeln“ nutzbar. Ist die Zielkachel schon belegt, vorher nachfragen, ob sie überschrieben werden soll

## Design
- [ ] Einstellungs-Zahnrad in der Kopfleiste ist zu klein geraten: Symbol größer darstellen (Button auf gleiche Höhe wie die anderen Buttons, Symbol ca. 20 px)
- [ ] Welten-Farben komplett umfärben statt nur die Akzentfarbe zu tauschen: Alles, was in einer Welt grün ist (Hintergrund-Tönung, Rahmen, Texte, Glow, Matrix-Regen), nimmt die Farbe der jeweiligen Welt an, damit nicht Blau auf Grün gemischt ist. Umsetzung über eine gemeinsame Farbton-Variable, aus der die ganze Palette abgeleitet wird. Die Farbe wählt der Nutzer pro Welt per Dropdown im Onboarding (Schritt „Welten“) und in den Einstellungen, z. B. Grün, Blau, Rot, Gelb/Orange, Violett, Pink. Standard für Welt 1 ist Grün, für weitere Welten automatisch eine andere Farbe; Welt 1 muss nicht zwingend grün bleiben
- [x] Futuristischeres Design im Matrix-Stil: Terminal-/Coding-Look mit grünen Akzenten auf dunklem Hintergrund, passende Monospace-Schrift. Kein Regeneffekt im Hintergrund
- [x] „Digital Rain“-Effekt nur beim Ersetzen eines Posters: im Poster-Rahmen läuft der Matrix-Regen, und das neue Poster erscheint daraus

## Onboarding / Einstellungen
- [x] Mehrere Assets-Ordner unterstützen (pro Bibliothek oder mehrere `asset_directory`-Pfade wie bei Kometa)

- [x] „Automatischer Scan“ gehört nicht zu den Poster-Quellen: eigener Platz (z. B. Schritt „Plex/Bibliotheken“ oder allgemeine Einstellungen) mit kurzer Erklärung, was er macht

## Unraid / Deployment
- [x] README: Template-Installation per `wget` statt „Template Repositories“ beschreiben (Option je nach Unraid-Version nicht auffindbar)
- [x] README: Hinweis auf GHCR-Paket „public“ und abweichenden Host-Port (z. B. 8484)
- [x] Template: Hinweis ergänzen, dass nur der Host-Port geändert werden darf

## Weitere Beobachtungen
- [x] Standard-Host-Port 8484 (Template, Compose, README)
(hier sammeln wir, was dir beim Onboarding auffällt)
