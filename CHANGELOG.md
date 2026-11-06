# Changelog

## 0.7.1 – 2026-11-06

**Changed**
- Switching the language no longer reloads the page: the visible letters scramble like a split-flap board or a Matrix decode and resolve into the new language within about a second; your place on the page, the open tab and the settings step stay as they are

## 0.7.0 – 2026-11-05

The first release with an English interface and English GitHub pages. It rolls up 0.6.0 to 0.6.2 (below).

**New**
- English and German interface with a terminal-style `$ EN/DE` switch; English is the default
- Instant feedback while a poster is saved: Matrix rain loops over the tile until the new image is in
- English README with a German twin (`README.de.md`), English changelog and Unraid template

**Changed**
- All texts proofread, no more emojis, README images recorded again with the English interface

## 0.6.2 – 2026-11-05

**Changed**
- Proofread all interface texts in English and German; wording, spelling and punctuation are more consistent and sound less machine-translated
- README (English and German), changelog, Unraid template and compose file reviewed and corrected, including the setup steps for additional assets folders

**Fixed**
- The notification setup step listed three triggers; there are two (new titles in “In Plex, poster missing” and scan errors)
- The upload progress text in the English interface mixed in German verbs
- World color names in the settings are now translated in tooltips too

## 0.6.1 – 2026-10-30

**Changed**
- Saving a poster gives instant feedback: as soon as you drop or choose an image, Matrix rain runs over the tile until the new poster is saved, then dissolves to reveal it (this also applies to copying a poster to another tile and to imports).
- New posters appear faster, because the preview image is generated while the optional Plex upload is still running.

## 0.6.0 – 2026-10-29

**New**
- The interface is available in English and German, with English as the default; the `$ EN/DE` switch in the header, on the login page and in the setup changes the language, and the browser remembers your choice.
- All texts, error messages and release notes are translated, while notifications, log lines and background scan messages are always in English.
- The README, changelog, Unraid template and release texts on GitHub are now in English; the German README is kept as `README.de.md`.

**Changed**
- Colorful emojis are replaced by terminal-style marks (`[ OK ]`, `[ !! ]`, `$ ready_`, numbered steps) and line icons.
- All README screenshots and animations are re-recorded with the English interface and made-up demo titles.

## 0.5.0 – 2026-10-22

Summary release of the 0.4.1 to 0.4.10 series (details below).

**New**
- **Plex collections:** The poster preview shows a movie's collection, and one click opens a detail view with all of the collection's posters (replace, upload, upload a set, hide).
- The import groups movies by Plex collection and lists the movies that will still have no poster; collection posters (“… Collection”) are never assigned to a movie automatically.
- The new start view “In Plex, poster missing” replaces the tabs “Complete”, “Collections” and “Not in Plex yet”, and “Missing” is renamed to “All missing”.
- Settings and onboarding have a sidebar on desktop and a grouped list with “Step x of y” on iPhone/iPad.
- Keyboard shortcuts (`/`, `Esc`, `←`/`→`), a clickable logo that leads to the start view, and a shorter update notice with the full list grouped by version under “What's new”.
- A new app icon (orange flame comet) in all sizes.

**Changed**
- The search always covers all titles in the world, and “Upload images” is renamed to “Upload posters”.
- Closing the detail view no longer makes the grid flicker, because unchanged tiles are reused.
- All README screenshots and animations are redone with made-up demo titles.

## 0.4.10 – 2026-10-18

**Fixed**
- The search on the start page covers all titles in the world again, even when another tab such as “In Plex, poster missing” is open; while searching, “All” is highlighted, and clicking a tab ends the search.

## 0.4.9 – 2026-10-16

**Fixed**
- The browser tab still showed the old icon; icon URLs now include the version number (`?v=…`) so browsers load the new icon immediately.
- `/favicon.ico` now serves a real `.ico` file (16/32/48 px), with dedicated 32 and 48 px tab icons and a legible badge.
- The web app manifest and icons are no longer cached for a long time.

## 0.4.8 – 2026-10-15

**Changed**
- The final app icon has an **orange flame comet** badge at the bottom right (a nod to Kometa) instead of the green fireball, matching the design of the p5converter icon (which has a silver audio CD and a blue Blu-ray).
- All icon sizes are regenerated: favicon `icon.png`, `icon-192.png`, `icon-512.png`, the Apple touch icon (iPhone/iPad web app) and `unraid/icon.png` (also shown in the README).
- The icon script `tools/icons/make_icons.py` (shared with p5converter) and the SVG sources of both icons are in `tools/icons/`.

## 0.4.7 – 2026-10-15

**Changed**
- The app icon has a badge with a small fireball (a comet, like the Kometa logo) at the bottom right and a slightly smaller “p5”, matching the design of the p5converter icon (which has two arrows).
- All icon sizes are regenerated: favicon `icon.png`, `icon-192.png`, `icon-512.png`, the Apple touch icon (iPhone/iPad web app) and `unraid/icon.png`.
- The SVG source and the generator script `make_icons.py` (shared with p5converter) are in `tools/icons/`.

## 0.4.6 – 2026-10-12

**New**
- The start view “In Plex, poster missing” is the first tab; when nothing is missing, it shows “All complete!” with a “Show all” button.
- On mobile, the settings are a grouped list where a tap opens a page (“‹ Settings” goes back), and onboarding shows “Step x of y” with a progress bar.

**Changed**
- The “Missing” tab is renamed to “All missing”, and the “Not in Plex yet” tab is removed; titles that only Sonarr/Radarr know stay under “All” and “All missing” with the “Not in Plex yet” badge.
- Hidden collections are listed by name in the settings (older entries get their name from the last scan), and collections that no longer exist can be removed.

**Fixed**
- On mobile, posters in the collection detail view no longer fill almost the whole screen; they are shown in several columns, as for series.

## 0.4.5 – 2026-10-12

**New**
- Collection detail view: in the preview, the movie's collection opens a view with all of the collection's posters, with the same tiles as for a series (replace, upload, delete, preview, upload a set, “Hide”).
- Hidden collections are listed in the settings in an expandable list with their names and can be shown again one by one or all at once.

**Changed**
- The expandable poster bar in the preview is replaced by an entry that opens the detail view.

**Fixed**
- Closing the detail view no longer makes the whole grid flicker (all posters briefly black), because unchanged tiles are reused instead of rebuilt.

## 0.4.4 – 2026-10-12

**New**
- The poster preview shows the movie's Plex collections, and expanding it shows all posters of a collection side by side (missing ones marked and clickable).
- Setup and settings have a sidebar with the groups Connections, Worlds and More, shown as a scrollable row on mobile.

**Changed**
- The “Complete” and “Collections” tabs are removed; collection detection in the import and the preview stays.
- “Upload images” is renamed to “Upload posters”.
- Hidden collections can be reset under “Settings → Libraries”.

## 0.4.3 – 2026-10-11

**New**
- Collections can be hidden in the “Collections” tab and in the import; the choice is saved, and hidden collections can be shown again in the tab.

**Changed**
- The import shows all matching Plex collections of a movie, each with its own check, so a large catch-all collection can no longer hide the small one that actually matches.

**Fixed**
- `ruff check` no longer reports any errors.

## 0.4.2 – 2026-10-11

**New**
- A new “Collections” tab shows each Plex collection with at least two movies as “x of y posters”, and missing posters can be uploaded right there.
- The import groups movies by Plex collection and lists the movies in the collection that will still have no poster.

## 0.4.1 – 2026-10-11

**New**
- Clicking the logo returns to the start page from anywhere.
- Keyboard shortcuts: `/` jumps to the search field, `Esc` clears it, and `←`/`→` page through the poster preview (also with ‹ › buttons).
- The import recognizes collection posters by their file name and does not assign them automatically.

**Changed**
- “New in this update” is now a short notice shown once per version, and all news, grouped by version, is under “What's new” in the footer.
- When two files claim the same tile, the import prefers the file named “Title (Year)” and deselects the other.

## 0.4.0 – 2026-10-10

**New**
- Notifications via Discord, Telegram or ntfy for new titles without a poster, Coming Soon titles and scan errors.
- A “New in this update” window with setup actions, available later under “What's new” in the footer.
- A trash with undo (30 days, 2 GB max.) and a cleanup for orphaned folders, both with search.
- A “Weak posters” tab for images that are too small or not 2:3, with adjustable thresholds.
- A coverage history in the statistics block.
- Ten worlds, each with its own planet, and a wormhole animation when switching.
- The tabs “In Plex, poster missing” and “Coming Soon”, a source filter and an A–Z bar.
- A set check in the import that groups files by series, compares them with the seasons in Plex/Sonarr and warns when two files claim the same tile.
- Downloads in original quality (as a ZIP on desktop); on iPhone/iPad the original opens in p5assets.
- p5assets can be installed as an app on iPhone/iPad, with pull-to-refresh and a “Reload” button.
- An “Upload posters:” group in the header (file/ZIP, folder) and a search next to the tabs with a one-click clear button.
- Optional login with username and password (scrypt hash, stay signed in for 30 days, lockout after failed attempts), which can be reset with a command, an environment variable or by deleting a file.
- The project is licensed under the GPL-3.0.

**Changed**
- Badges are simpler: no more checkbox, a single “Not in Plex yet” badge and correct singular/plural forms.
- “Create title” (custom folders) is removed; existing entries may show up under “Orphaned folders”.
- The preview window has a single header row and one close button.
- Title matching during import is about 17 times faster (180 files against 6450 titles: 29 s → 1.7 s).
- Security headers are added (Content-Security-Policy, no embedding in other sites, nosniff, no referrer).
- Static files are served with a version parameter, so the home screen app loads a new version immediately.
- More than 40 automated tests (naming rules, matching, trash, upload/ZIP, security) run before every image build.

**Fixed**
- Error messages no longer contain API keys or tokens, not even from request URLs.
- Invalid log file names return 400 instead of 500, and ZIP entries have a real size limit.
- An empty list after a failed scan now explains the error and offers “Scan again”.
