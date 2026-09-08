# Bulk Character Export

A minimal SillyTavern extension that lets you select any number of characters and download
them all at once as a single `.zip` containing the PNG card, the JSON, or both.

## Install

1. Copy this `bulk-character-export` folder into your SillyTavern install at:
   `data/<your-user-handle>/extensions/bulk-character-export`
   (or, for a shared/all-users install: `public/scripts/extensions/third-party/bulk-character-export`)
2. Restart SillyTavern (or just refresh the page).
3. Open the **Extensions** panel → **Manage extensions**, and make sure "Bulk Character Export" is enabled.

Alternatively, push this folder to a git repo and use **Extensions → Install extension** with the repo URL.

## Use

1. Open the **Extensions** panel (puzzle-piece icon).
2. Find the "Bulk Character Export" drawer and click **Open Bulk Export**.
3. Check the characters you want (or use "Select all"), pick PNG / JSON / Both, click **Export**.
4. Your browser downloads one `character_cards_export_<timestamp>.zip` with all the selected files.

## How it works

- It reads the character list from `SillyTavern.getContext().characters`.
- For each selected character it calls the built-in `POST /api/characters/export` endpoint
  (the same one the "Export character" button in the UI uses) once per requested format
  (`png` and/or `json`), using `avatar_url: character.avatar`.
- All resulting files are bundled client-side into one zip with JSZip (loaded from a CDN at
  runtime, nothing to install) and downloaded as one file, so your browser only ever pops a
  single download instead of one per character.

## Notes / troubleshooting

- This only exports characters that exist in your current SillyTavern user profile — it can't
  reach characters belonging to other users on a multi-user setup.
- If exports fail for everyone, open the browser dev tools Network tab while exporting one
  character manually from the UI and compare the request body/headers against what
  `/api/characters/export` expects on your installed version — SillyTavern's internal API has
  changed shape before across major versions, and this extension mirrors the current (as of
  writing) `{ format, avatar_url }` POST body.
- Large libraries (100+ characters) will take a little while since each character needs its own
  network round trip before zipping; a progress message shows in the loading overlay.

  Built for [SillyTavern](https://github.com/SillyTavern/SillyTavern).

