# Changelog

## 0.6.0 – 2026-10-29

**New**
- **English and German interface:** English is the default; a terminal-style switch `$ EN/DE` in the header (also on the login page and in the setup) changes the language, the choice is remembered in the browser. All texts, error messages and release notes are translated; notifications, log lines and scan messages from the background are always English
- **GitHub in English:** README, changelog, Unraid template and release texts are English; the German README is kept as `README.de.md`

**Changed**
- No more colorful emojis: terminal-style marks (`[ OK ]`, `[ !! ]`, `$ ready_`, numbered steps) and line icons instead
- All README images and animations recorded again with the English interface (made-up demo titles)

## 0.5.0 – 2026-10-22

Roll-up release of the 0.4.1 – 0.4.10 series (details below).

**New**
- **Plex collections:** a movie's poster preview names its collection; one click opens the collection detail view with all posters (replace, upload, set upload, hide). The import groups movies by Plex collection and checks which movies are still without a poster afterwards; collection posters (“… Collection”) are not automatically assigned to a movie
- **Home view “In Plex, poster missing”**, tabs tidied up (“All missing”; “Complete”, “Collections” and “Not in Plex yet” removed)
- **Settings and onboarding** with a sidebar (desktop) or as a list with groups and “Step x of y” (iPhone/iPad)
- Keyboard shortcuts (`/`, `Esc`, `←`/`→`), logo leads to the home page, shorter update notice with a list grouped by version under “What's new”
- New app icon (orange flame comet) in all sizes

**Changed**
- Search always covers all titles in the world; “Upload images” is now called “Upload posters”
- No more flicker when closing the detail view (unchanged tiles are reused)
- All README images and animations redone (fictional demo titles)

## 0.4.10 – 2026-10-18

**Fixed**
- Search on the home page covers all titles in the world again, even when another tab (e.g. the new home view “In Plex, poster missing”) is open; during a search “All” is highlighted, and clicking a tab ends the search

## 0.4.9 – 2026-10-16

**Fixed**
- **Browser tab icon** still showed the old image: icon URLs now carry the version number (`?v=…`) so browsers load the new icon immediately; `/favicon.ico` serves a real `.ico` (16/32/48 px), plus dedicated 32 and 48 px tab icons with a legible badge; web app manifest and icons are no longer cached for long

## 0.4.8 – 2026-10-15

**Changed**
- **App icon** final: the badge at the bottom right is an **orange flame comet** (own drawing, a nod to Kometa) instead of the green fireball; same design as the p5converter icon (which has a silver audio CD + blue Blu-ray). All sizes redone: favicon `icon.png`, `icon-192.png`, `icon-512.png`, Apple touch icon (iPhone/iPad web app) and `unraid/icon.png` (also shown in the README)
- Icon script `tools/icons/make_icons.py` (shared with p5converter) and the SVG sources of both icons are in `tools/icons/`

## 0.4.7 – 2026-10-15

**Changed**
- **App icon** with badge: small fireball (comet, like the Kometa logo) at the bottom right, the “p5” slightly smaller; same design as the p5converter icon (which has two arrows). All sizes redone: favicon `icon.png`, `icon-192.png`, `icon-512.png`, Apple touch icon (iPhone/iPad web app) and `unraid/icon.png`
- SVG source and generator script for the icons in `tools/icons/` (`make_icons.py`, shared with p5converter)

## 0.4.6 – 2026-10-12

**New**
- Home view “In Plex, poster missing” (first in the tab bar); if nothing is open, it shows “All complete!” with a “Show all” button
- Settings on mobile as a list with groups, a tap opens the page (“‹ Settings” leads back); onboarding shows “Step x of y” with a progress bar

**Changed**
- Tab “Missing” is now called “All missing”; the tab “Not in Plex yet” is removed (titles known only to Sonarr/Radarr remain under “All” and “All missing” with the “Not in Plex yet” label)
- Hidden collections show their name in the settings (also filled in for older entries from the last scan); ones that no longer exist can be removed

**Fixed**
- Collection detail view: posters almost filled the screen on mobile, now several columns as with series

## 0.4.5 – 2026-10-12

**New**
- Collection detail view: in the preview, the movie's collection leads to a view with all posters of the collection (tiles as for a series: replace, upload, delete, preview; set upload and “Hide”)
- Hidden collections are listed in the settings as an expandable list with names and can be shown again individually (or all at once)

**Changed**
- The expandable poster bar in the preview is replaced by an entry that opens the detail view

**Fixed**
- When closing the detail view, the whole grid flickered (all posters briefly black): unchanged tiles are now reused instead of rebuilt

## 0.4.4 – 2026-10-12

**New**
- Poster preview shows the movie's Plex collection(s); expanded, all posters of the collection appear side by side (missing ones marked, clickable)
- Setup and settings with a sidebar (groups: Connections, Worlds, More); a scrollable row on mobile

**Changed**
- Tidied up: tabs “Complete” and “Collections” removed (collection detection in the import and the preview remain)
- “Upload images” is now called “Upload posters”
- Hidden collections can be reset under Settings → Libraries

## 0.4.3 – 2026-10-11

**New**
- Collections can be hidden (in the “Collections” tab and in the import); the choice is saved, and hidden ones can be shown again in the tab

**Changed**
- The import shows all matching Plex collections of a movie (each with its own check), not just the first; a large catch-all collection can no longer crowd out the matching small one

**Fixed**
- Code quality: `ruff check` reports no errors anymore

## 0.4.2 – 2026-10-11

**New**
- Plex collections: new “Collections” tab shows each collection (from two movies) with “x of y posters”; movies without a poster can be uploaded right there
- The import groups movies by Plex collection; the check lists movies of the collection that still have no poster afterwards

## 0.4.1 – 2026-10-11

**New**
- A click on the logo returns to the home page from anywhere
- Keyboard shortcuts: “/” jumps to the search field, Esc clears it, ←/→ page through the poster preview (with ‹ › buttons)
- The import recognizes collection posters by file name and does not assign them automatically

**Changed**
- “New in this update” is now a short notice (once per version); all news, grouped by version, is under “What's new” in the footer
- For tiles claimed twice, the import prefers the file “Title (Year)” and deselects the other

## 0.4.0 – 2026-10-10

**New**
- Notifications via Discord, Telegram or ntfy (new titles without a poster, Coming Soon, scan errors)
- “New in this update” window with setup actions (later via “What's new” in the footer)
- Trash with undo (30 days, at most 2 GB) and cleanup of orphaned folders, each with search
- “Weak posters” tab (too small or not 2:3, thresholds freely selectable)
- Coverage history in the statistics block
- Ten worlds, each with its own planet, switching as a wormhole trip
- “In Plex, poster missing” and “Coming Soon” tabs; source selection; A–Z bar
- Set check in the import: groups per series, check against the seasons from Plex/Sonarr, warning for tiles claimed twice
- Download (original, ZIP on desktop); on iPhone/iPad the original opens in p5assets
- Installable as an app on iPhone/iPad (pull down to refresh, “Reload”)
- “Upload posters:” group (file/ZIP, folder), search next to the tabs with one-click clear
- Optional login (username/password, scrypt hash, stay signed in for 30 days, lockout after failed attempts) with reset via command, environment variable or file
- License: GPL-3.0

**Changed**
- Badges simplified: no checkbox anymore, a single “Not in Plex yet” badge, correct singular/plural
- “Create title” (custom folders) removed; existing entries may appear under “Orphaned folders”
- Preview window with a single header row and one close button

**Fixed / improved**
- Error messages no longer contain API keys or tokens (not even from request URLs)
- Title matching during import about 17 times faster (180 files against 6450 titles: 29 s → 1.7 s)
- Security headers (Content-Security-Policy, no embedding in other sites, nosniff, no referrer)
- Invalid log file names return 400 instead of 500; ZIP entries with a real size limit
- An empty list after a failed scan now explains the error and offers “Scan again”
- Static files are served with a version parameter (the home screen app loads the new version immediately)
- 40+ automated tests (naming rules, matching, trash, upload/ZIP, security) run before every image build
