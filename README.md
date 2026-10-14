# Bulk Character Export

A minimal SillyTavern extension that lets you select any number of characters and download
them all at once as a single `.zip` containing the PNG card, the JSON, or both.

## Install

1. In SillyTavern, open the **Extensions** panel (puzzle-piece icon) → **Install extension**.
2. Paste this repo's URL: `https://github.com/smolsn3k/st-bulk-character-export`
3. Confirm the install, then refresh the page if it doesn't reload automatically.
4. Still in the Extensions panel, make sure "Bulk Character Export" is enabled.

## Use

1. Open the **Extensions** panel (puzzle-piece icon).
2. Find the "Bulk Character Export" drawer and click **Open Bulk Export**.
3. Check the characters you want (or use "Select all"), pick PNG / JSON / Both, click **Export**.
4. Your browser downloads one `character_cards_export_<timestamp>.zip` with all the selected files.

If you've imported or created a character since you opened the popup and don't see it in the
list, click **Refresh list** — it re-fetches the character list straight from the server instead
of relying on whatever was cached when the popup opened.

## How it works

- It reads the character list from `SillyTavern.getContext().characters` when the popup opens.
- The **Refresh list** button instead calls `POST /api/characters/all` directly, bypassing the
  client-side cache, and re-renders the checkbox list in place (selections are reset on refresh).
- For each selected character it calls the built-in `POST /api/characters/export` endpoint
  (the same one the "Export character" button in the UI uses) once per requested format
  (`png` and/or `json`), using `avatar_url: character.avatar`.
- All resulting files are bundled client-side into one zip with JSZip (loaded from a CDN at
  runtime, nothing to install) and downloaded as one file, so your browser only ever pops a
  single download instead of one per character.

## Notes / troubleshooting

- This only exports characters that exist in your current SillyTavern user profile — it can't
  reach characters belonging to other users on a multi-user setup.
- If exports (or the refresh) fail for everyone, open the browser dev tools Network tab while
  doing the same action manually from the normal UI and compare the request body/headers
  against what this extension sends — SillyTavern's internal API has changed shape before across
  major versions, and this extension mirrors the current (as of writing) shapes:
  `/api/characters/export` → `{ format, avatar_url }`, `/api/characters/all` → `{}`.
- Large libraries (100+ characters) will take a little while since each character needs its own
  network round trip before zipping; a progress message shows in the loading overlay.
- If the character count shown in the popup (or after **Refresh list**) is lower than what your
  character panel's pagination shows, that's not something this extension can fix — it only
  displays whatever `/api/characters/all` returns. A mismatch usually means either (a) the
  sidebar count includes group chats, which aren't individual characters and aren't returned by
  that endpoint, or (b) some character files failed to parse server-side (check the SillyTavern
  server console/log for warnings) and were silently excluded from the API response. You can
  confirm the server's real count independent of this extension by running the following in your
  browser console while on the SillyTavern page, then comparing it to your file count on disk:
  ```js
  fetch('/api/characters/all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(r => r.json()).then(data => console.log('Server returned:', data.length));
  ```
