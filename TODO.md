# p5assets – Ideen & Verbesserungen für die nächste Version

## Uploads
- [ ] Beliebige zusätzliche Staffelposter hochladen können, auch für Staffeln, die Plex noch nicht kennt (z. B. Season05, bevor sie bei Plex landet). Benennung weiterhin automatisch Kometa-konform (`Season05.jpg` im richtigen Medienordner)
- [ ] Sonarr/Radarr anbinden (URL + API-Key im Onboarding, optional, mehrere Instanzen möglich): Titel und Staffeln inkl. noch nicht erschienener/nicht in Plex vorhandener liefern; Ordnername (letzte Pfadkomponente) aus Sonarr/Radarr ableiten und mit Plex per TVDB-/TMDB-ID zusammenführen. Titel nur in Sonarr/Radarr als „noch nicht in Plex“ kennzeichnen, Poster-Upload dafür erlauben
- [ ] Mehrere Sonarr- und Radarr-Instanzen (z. B. HD und 4K), jeweils mit eigenem Namen, URL und API-Key
- [ ] „Welten“ (z. B. HD und 4K): getrennte Bereiche mit eigener Titelliste und eigenem Dashboard. Ordnernamen sind in HD und 4K gleich, deshalb darf nichts vermischt werden. Zuordnung im Onboarding und in den Einstellungen: Der Nutzer weist Plex-Bibliotheken, Sonarr- und Radarr-Instanzen selbst einer Welt zu (beliebig viele Welten, nicht nur zwei)
- [ ] Welten-Umschalter in der Kopfleiste mit kurzer Matrix-Animation beim Wechsel (z. B. HD → 4K), jede Welt mit eigener Akzentfarbe/Beschriftung, damit klar ist, wo man gerade ist
- [x] Geklärt: HD und 4K haben komplett getrennte Assets-Ordner. Der Assets-Pfad wird pro Welt gesetzt (ersetzt den Punkt „Mehrere Assets-Ordner“)
- [ ] Unraid-Template: mehrere Assets-Pfade vorsehen (z. B. `/assets` für HD, `/assets-4k` für 4K) und in der README erklären, dass jeder Ordner beim Anlegen des Containers gemountet sein muss. Ordner-Browser im Onboarding zeigt die gemounteten Pfade
- [ ] Freie Ordnereingabe: Poster für Titel ablegen, die weder in Plex noch in Sonarr/Radarr stehen (Ordnername von Hand, z. B. `Titel (Jahr)`)
- [ ] Detailansicht einer Serie: leere Kacheln für Poster, Season00 bis Season50, auch für Staffeln, die es (noch) nicht gibt. Fehlende Extra-Kacheln zählen nicht als „fehlt“. Vorschlag: bekannte Staffeln zuerst, die übrigen eingeklappt unter „Weitere Staffeln“, damit die Ansicht übersichtlich bleibt. Backend muss dafür Staffel-Slots 0–50 erlauben

## Design
- [ ] Futuristischeres Design im Matrix-Stil: Terminal-/Coding-Look mit grünen Akzenten auf dunklem Hintergrund, passende Monospace-Schrift. Kein Regeneffekt im Hintergrund
- [ ] „Digital Rain“-Effekt nur beim Ersetzen eines Posters: im Poster-Rahmen läuft der Matrix-Regen, und das neue Poster erscheint daraus

## Onboarding / Einstellungen
- [ ] Mehrere Assets-Ordner unterstützen (pro Bibliothek oder mehrere `asset_directory`-Pfade wie bei Kometa)

- [ ] „Automatischer Scan“ gehört nicht zu den Poster-Quellen: eigener Platz (z. B. Schritt „Plex/Bibliotheken“ oder allgemeine Einstellungen) mit kurzer Erklärung, was er macht

## Unraid / Deployment
- [ ] README: Template-Installation per `wget` statt „Template Repositories“ beschreiben (Option je nach Unraid-Version nicht auffindbar)
- [ ] README: Hinweis auf GHCR-Paket „public“ und abweichenden Host-Port (z. B. 8484)
- [ ] Template: Hinweis ergänzen, dass nur der Host-Port geändert werden darf

## Weitere Beobachtungen
(hier sammeln wir, was dir beim Onboarding auffällt)
