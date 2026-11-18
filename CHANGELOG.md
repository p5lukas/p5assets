# Changelog

## 0.9.13 – 2026-11-18

**Changed**
- Poster builder: the default “Title height” is 85 % instead of 82 % (logo or title sits a little lower; the season line moves with it). Saved looks keep their value

## 0.9.12 – 2026-11-18

**New**
- Collections tab: sorted by name, filter “Missing” (collection poster missing and/or film posters missing, each with a count) and the A–Z bar above and below like in “All” (from 12 collections on)
- Builder: “Compare” has a switch Built / Current / Both (current above built; space or arrow keys flip through), also for the collection poster; the button is also there for a single poster (movies)

**Fixed**
- Pictures that changed could still show the old one: the version in picture addresses is now exact (nanoseconds instead of seconds), so two saves within one second no longer share a cached picture; after the collection builder the view waits until the server shows the new versions before it redraws (matrix rain included)

**Changed**
- Collection posters in tiles load the small cached preview (like film posters) with lazy loading and a fade-in; preview and download still use the original

## 0.9.11 – 2026-11-17

**New**
- Collection poster: ThePosterDB and MediUX tabs in the online search, like for films (search term = name of the collection, section “Collections” or “Movies”, link to the collection and to its first film on MediUX, drop zone that stores the picture as the collection poster; in the builder it becomes the background)
- Matrix rain on the collection poster after upload, drop, online choice and saving from the builder (Collections tab and collection view)
- “Build” in the menu of every series and season tile and in every preview; “Build collection” in the menu of a film inside a collection view
- Collection poster: full preview with details (folder, file, size, date, resolution), “Download” in the menu and the preview

**Changed**
- One order of actions everywhere (Replace/Upload, Preview, Search online, Build, Download, Apply to all, Delete), also in the preview; “Build it myself” is now simply “Build”

## 0.9.10 – 2026-11-17

**New**
- Collection poster search: “Search in” (like in the builder) searches the collection's own posters and the posters of its films, so textless posters of single films can be used for the collection too; the same in the builder when choosing the background of the collection poster

**Changed**
- The collection poster tile (collection view and Collections tab) now has the usual hover menu on the poster (Upload / Replace, Preview, Search online, Build, Delete; on touch devices a tap shows it) instead of buttons below the poster

## 0.9.9 – 2026-11-17

**Fixed**
- Collection poster: names with characters a folder cannot have (e.g. “:” or “/”) no longer fail with “cannot be used as a folder name”; those characters are left out of the folder name (as Kometa does) and an existing folder is also found when only spaces or punctuation differ

## 0.9.8 – 2026-11-17

**New**
- Collections tab: each collection shows its own poster in front (a dashed card when it is missing), four of its films fanned out behind. “Upload” sets the collection poster, and a picture dropped right onto the tile does too (several files or a ZIP go through the import review)
- Collection view: the poster of the collection is the first tile (replace by click or drop, search online at TMDb, build, delete with undo)
- Import: files can be assigned to a collection (“Collection poster” group in the review); typing a collection name in the title field suggests collections; file names like “Vaiana Collection” are recognised automatically. A missing collection folder is only created after you confirm

## 0.9.7 – 2026-11-17

**New**
- Collection poster: the collection builder starts with a tile for the poster of the collection itself (its name as the title, the same look as the films; background from TMDb's collection posters or your own file). It is saved as `<collections folder>/<name of the collection>/poster.jpg` (the folder is named exactly like the collection in Plex, as Kometa creates it; a missing folder is only created after you confirm) and replaced posters go to the trash. Nothing is uploaded to Plex
- Collections folder per world (Settings → Worlds): found by itself when the assets folder has a folder “Collections”, or given by hand. The tab and the collection view show “Collection poster ✓ / missing”
- The folders of the collections are never offered as orphaned folders
- Poster builder: logo or title can be switched off (“Off” next to “Logo” and “Text”), and the season text has a “Show season text” box; both for all posters or one by one, saved with the look

## 0.9.6 – 2026-11-17

**New**
- Tab “Collections” on the main page: every Plex collection (movie series with at least two films, hidden ones excluded) as a fan of overlapping posters, missing posters as dashed cards, with its name and state; the search filters by name; a click opens the collection, “Build” its builder
- Collection builder: all films of a collection in one look, in the same layout as the series builder. Every film has its own background, logo (found per film, otherwise the title as text) and title text; size, height, fade, filter, logo colour and the rest are one look for all posters. Each poster is saved as the poster of its film; the look of the collection is remembered
- Entries: “Build” in the collection view, “Build” on the collection box in a movie's preview, and in the movie builder a note “Part of the collection …” with “Build collection” (that film preselected)

**Changed**
- The collection box in the movie preview has its own “Build” button

## 0.9.5 – 2026-11-16

**New**
- MediUX tab next to ThePosterDB (in the online search, in the builder search, and a “MediUX” button in the series view): a button opens the title's MediUX page by its TMDb number (movies `/movies/<id>`, series `/shows/<id>`), then drop the downloaded poster or set like with ThePosterDB. The TMDb number is looked up when it is not known yet
- Poster builder: “Trim edges” cuts the same share (0–15 %) off every side of the background, e.g. to remove a frame; it is a look setting for all posters (the “Settings for all posters” box now sits above “Crop”)
- Poster builder: every slider has a number field to type a value and − / + buttons for steps of 1 % (hold to repeat, Shift + arrow keys for 10)

**Changed**
- The poster builder always starts with the default settings; the last used look is no longer carried over to other titles (a series with a saved look still continues with it, presets stay)

## 0.9.4 – 2026-11-16

**Changed**
- README (English and German): the poster builder section now lists all features briefly, with a second screenshot of the background search

**Fixed**
- Poster builder: the “Free area” choices appeared only after another setting was changed when zooming out with the slider; they now show up at once

## 0.9.3 – 2026-11-16

**New**
- Online search: a “Build it myself” button on top opens the poster builder for that title (movies: the builder window; series: the build mode with the searched poster preselected), and the empty result offers it too (“Nothing suitable? Build it myself”)
- Poster builder: tiles without a background show their actions (“Search online”, “Choose file”) permanently, so newcomers see what to do without hovering; with a background the hover menu stays as it was

## 0.9.2 – 2026-11-16

**New**
- Poster builder: colourise the logo (“Logo colour”: Original or Colourise with suggestions, eyedropper and a free colour), handy for white logos; for all posters or for one, saved with the look

**Changed**
- The automatic colour of the season line is taken from the colours of the whole poster (its palette), with lightness adjusted so that it can be read on the strip behind the line, fade included. The suggestions are now three colours from the poster plus white and near-black. A dark fade no longer turns the line white
- Removed the background sources “Cast”, “Figures” and “Plex” again; “Backdrops”, “Episode pictures” and “Season pictures” stay

## 0.9.1 – 2026-11-15

**New**
- Poster builder, more sources for backgrounds (the “Source” row in the search): Episode pictures (TMDb stills, per season), Season pictures (fanart.tv season thumbs, TheTVDB season backgrounds and banners), Cast (portrait photos from TMDb), Figures (cut-out characters and clear art from fanart.tv, with transparency) and Plex (alternative posters and backgrounds your Plex server holds)
- Zoom out: the zoom goes down to 30 %, “Fit” shows the whole picture; the free area can be filled automatically from the picture's edge (default), black, white, a colour (suggestions from the picture, eyedropper, free colour) or a blurred copy of the picture. Cut-out figures get a dark colour behind them
- Colour filter over the background (off, black and white, one-colour tone, duotone with suggestions), strength adjustable; it is a look setting like the fade: for all posters or only for one

**Fixed**
- Backdrops did not show up when the search was opened from a season (a crash while labelling the pictures); a hint now says that backdrops belong to the whole series, not to a season

## 0.9.0 – 2026-11-15

**New**
- Poster builder: the look of a series is remembered. Saving also keeps the settings, colours, texts, logo and the chosen backgrounds (pictures from your computer are copied to `/config/builder`); the next visit continues where you stopped, so you can e.g. swap only the logo on all posters, or build one new season in the same look. “Delete look” in the builder removes it; titles that are gone for good are cleaned up after 30 days
- Backdrops as backgrounds: a “Backdrops” source in the builder search (TMDb, fanart.tv, TheTVDB), with “Crop” sliders for zoom and position, per poster
- “Compare”: all posters of the series side by side; a click opens the large view
- The large view can switch between the draft and the existing poster
- “Reset all” puts the look back to the defaults (backgrounds and logo stay)
- The automatic colour of the season line is taken from the picture around the line (light on dark, dark on light), not from the whole poster

**Fixed**
- TMDb answering 404 for a season or title it has no pictures for (Specials, announced seasons) is “nothing found” and no longer a warning; real errors now name the title and the poster in the log

## 0.8.8 – 2026-11-14

**New**
- Poster builder: the logo can be moved all the way from the top to the bottom edge (“Title height” 0–100 %); the clamp that kept the whole picture inside the poster is gone
- Transparent margins of a logo are trimmed automatically, so size and height refer to the visible logo (“Trim the transparent margin”, on by default, can be switched off per logo)
- ThePosterDB tab in the builder search: search link and drop zone; the dropped picture becomes the background of the selected poster

## 0.8.7 – 2026-11-14

**Changed**
- Poster builder, series: from 760 px width the posters stand in a fixed column on the left (top to bottom) that stays in view and scrolls for itself, the settings are on the right, so every change is visible at once; the selected poster scrolls into view. On phones the strip stays at the top
- Season text: size and letter spacing are always visible (no “Fine tuning” fold)

## 0.8.6 – 2026-11-14

**New**
- Poster builder: the season line can be placed freely over the whole poster (“Line position: Free” with a “Text height” slider), e.g. the title at the top and the season line at the bottom. “Below the title” (default) keeps the old behaviour with “Distance to the title”. The same on all posters; presets include it

## 0.8.5 – 2026-11-14

**Changed**
- Poster builder, logo search: the groups follow your preferred language order, logos without a language come last (the “textless first” rule only applies to poster searches); the logo chosen by default is the first one in a preferred language
- Eyedropper: the colour is taken when you release (tap, click, or drag with a finger or the mouse), at the spot where you let go; releasing outside the poster takes nothing

## 0.8.4 – 2026-11-14

**New**
- Poster builder: optional fade from the bottom edge (off / dark / light) with strength and height, for busy pictures. Like the logo it applies to all posters by default (“Settings for all posters” now sits above Title and Fade) and can be set differently for a single poster; presets include it
- Eyedropper for the season colour: opens the poster large (without logo and text) so the colour is taken from the picture, not from the rest of the screen; the browser's own colour picker stays for free colours

## 0.8.3 – 2026-11-14

**Changed**
- Poster builder, online search: textless posters always come first, whatever the language preferences say
- Poster builder, online search: “Search in” chips (series poster, every season, All) search several posters at once; by default the poster itself plus the series poster, the rest loads when selected; with several chips each result shows where it comes from

## 0.8.2 – 2026-11-14

**Changed**
- Poster builder, series: the background is chosen directly on the poster tile (search online, choose file, preview, use for all); the tiles no longer have checkboxes, every poster with a background is saved; “Copy background from …” is gone, dragging a poster onto another one remains
- Title: “Settings for all posters” (on by default). Switched off, the selected poster can have its own logo or text, size and height (marked “custom” on its tile)
- Season text is one compact block: text, colour suggestions taken from the picture (plus Auto and a free colour); size, spacing and letter spacing moved into “Fine tuning”
- Series tiles show the number of posters (series poster plus every season, Specials included) instead of the number of seasons

**New**
- “Add Specials” in the builder for series without a season 0

**Fixed**
- Specials were missing in the builder when “Specials (Season00) not monitored” is on

## 0.8.1 – 2026-11-14

**Changed**
- Poster builder: size, height, spacing and font are the same on every poster; only the background and the colour of the season line belong to a poster. The “all posters / only this one” switch is gone
- The logo (or title text) now sits at exactly the same height on every poster, with or without a season line; the season line hangs below it. Default height raised a little
- Sliders: always the same length, with a permanent “Default” button; no snapping, tick mark or vibration
- Matrix frame only around the poster being edited; no more “+ Background” on the tiles
- Backgrounds like in the series overview: search or choose a file for the selected poster, “Use for all posters”, drag a poster onto another one, or “Copy background from …” (also for touch screens)
- Logo search looks like the poster search: sources as tabs, logos grouped by language
- “Find textless automatically” removed

**New**
- Upload your own clear logo (PNG or WebP with transparency, file picker or drag & drop)
- View every poster large, in the resolution that will be saved, and flip through the series with arrows (magnifier on the tile or double click); also for movies
- The language list of a logo search is returned by the API (`languages`)

**Fixed**
- The letter effect left scrambled text behind (names of titles behind a window) and could overwrite text the page changed meanwhile
- Build tiles could grow step by step on iOS (WebKit)

## 0.8.0 – 2026-11-13

**New**
- Poster builder: build a poster when none fits. Textless background (online search, “find textless automatically”, file choose or drag & drop), clear logo from TMDb, fanart.tv and TheTVDB or the title as text, vertical position and size adjustable, output 1000×1500 JPG saved through the normal upload path (Kometa naming, trash/undo)
- Movies: “Build” in the poster's hover menu
- Series: build button in the detail view next to “Upload set”; build mode previews every poster, the one being edited has an animated Matrix frame, settings apply to all posters or only the selected one
- Season line under the title (“Season One” … “Specials”) in a colour matched to the background, changeable
- The season line uses a light, widely spaced sans (Source Sans 3) like the ThePosterDB sets
- Eight bundled open-licence fonts, looks saved as named presets (`/config/styles.json`)

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
