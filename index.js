import { getRequestHeaders } from '../../../../script.js';

const MODULE_NAME = 'bulk_character_export';
const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

function safeFileName(name) {
    const cleaned = (name || 'character').replace(/[\\/:*?"<>|]/g, '_').trim();
    return cleaned.length ? cleaned : 'character';
}

async function fetchCharactersFromServer() {
    // Bypasses the client-side cached `context.characters` array and asks the
    // server directly, so newly imported/created characters show up without
    // a full page reload.
    const response = await fetch('/api/characters/all', {
        method: 'POST',
        headers: {
            ...getRequestHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching character list`);
    }

    return response.json();
}

async function exportCharacterBlob(avatarUrl, format) {
    const response = await fetch('/api/characters/export', {
        method: 'POST',
        headers: {
            ...getRequestHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            format,
            avatar_url: avatarUrl,
        }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} exporting ${avatarUrl} (${format})`);
    }

    return response.blob();
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function rowHtml(character, index) {
    return `
        <label class="checkbox_label bce-row" for="bce_char_${index}">
            <input type="checkbox" id="bce_char_${index}" class="bce-char-checkbox" data-index="${index}" checked />
            <span>${character.name}</span>
        </label>
    `;
}

function buildPanelHtml(characters) {
    const rows = characters.map((c, index) => rowHtml(c, index)).join('');

    return `
        <div class="bulk-character-export">
            <h3>Bulk Character Export</h3>
            <div class="bce-controls flex-container">
                <label class="checkbox_label">
                    <input type="checkbox" id="bce_select_all" checked />
                    <span id="bce_select_all_label">Select all (${characters.length} characters)</span>
                </label>
                <input id="bce_refresh" class="menu_button" type="button" value="Refresh list" title="Re-fetch the character list from the server" />
            </div>
            <div class="bce-format flex-container">
                <label class="radio_label">
                    <input type="radio" name="bce_format" value="png" checked />
                    <span>PNG card</span>
                </label>
                <label class="radio_label">
                    <input type="radio" name="bce_format" value="json" />
                    <span>JSON only</span>
                </label>
                <label class="radio_label">
                    <input type="radio" name="bce_format" value="both" />
                    <span>Both PNG + JSON</span>
                </label>
            </div>
            <div class="bce-list">
                ${rows}
            </div>
        </div>
    `;
}

async function runExport(selectedCharacters, format) {
    const { loader } = SillyTavern.getContext();
    const handle = loader.show({ message: `Exporting 0 / ${selectedCharacters.length}...` });

    try {
        const { default: JSZip } = await import(/* webpackIgnore: true */ JSZIP_URL);
        const zip = new JSZip();

        let done = 0;
        let failures = 0;

        for (const character of selectedCharacters) {
            const baseName = safeFileName(character.name);
            const formatsToFetch = format === 'both' ? ['png', 'json'] : [format];

            for (const fmt of formatsToFetch) {
                try {
                    const blob = await exportCharacterBlob(character.avatar, fmt);
                    zip.file(`${baseName}.${fmt}`, blob);
                } catch (error) {
                    failures++;
                    console.error(`[${MODULE_NAME}] Failed to export ${character.name} as ${fmt}`, error);
                }
            }

            done++;
            handle.update?.({ message: `Exporting ${done} / ${selectedCharacters.length}...` });
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, `character_cards_export_${Date.now()}.zip`);

        if (failures > 0) {
            toastr.warning(`Done, but ${failures} file(s) failed to export. Check the console for details.`);
        } else {
            toastr.success(`Exported ${selectedCharacters.length} character(s) to a zip file.`);
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Bulk export failed`, error);
        toastr.error('Bulk export failed. See browser console for details.');
    } finally {
        await handle.hide();
    }
}

async function openExportPanel() {
    const { Popup, POPUP_TYPE, POPUP_RESULT } = SillyTavern.getContext();

    // Mutable reference: the "Refresh list" button inside the popup reassigns
    // this, and the closures below (wireList/renderList/the final OK-click
    // read) all read through this same variable.
    let characters = SillyTavern.getContext().characters;

    if (!characters || characters.length === 0) {
        toastr.warning('No characters found.');
        return;
    }

    const html = buildPanelHtml(characters);

    const popup = new Popup(html, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        okButton: 'Export',
        cancelButton: 'Cancel',
        allowVerticalScrolling: true,
    });

    function wireSelectAll(root) {
        const selectAll = root.querySelector('#bce_select_all');
        const checkboxes = root.querySelectorAll('.bce-char-checkbox');
        selectAll.checked = true;
        selectAll?.addEventListener('change', () => {
            checkboxes.forEach((cb) => { cb.checked = selectAll.checked; });
        });
    }

    function renderList(root, chars) {
        const listEl = root.querySelector('.bce-list');
        const labelEl = root.querySelector('#bce_select_all_label');
        if (listEl) {
            listEl.innerHTML = chars.map((c, index) => rowHtml(c, index)).join('');
        }
        if (labelEl) {
            labelEl.textContent = `Select all (${chars.length} characters)`;
        }
        wireSelectAll(root);
    }

    setTimeout(() => {
        const root = popup.dlg;
        if (!root) return;

        wireSelectAll(root);

        const refreshBtn = root.querySelector('#bce_refresh');
        refreshBtn?.addEventListener('click', async () => {
            const originalText = refreshBtn.value;
            refreshBtn.disabled = true;
            refreshBtn.value = 'Refreshing...';
            try {
                characters = await fetchCharactersFromServer();
                renderList(root, characters);
                toastr.success(`Found ${characters.length} character(s).`);
            } catch (error) {
                console.error(`[${MODULE_NAME}] Failed to refresh character list`, error);
                toastr.error('Failed to refresh the character list. See console for details.');
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.value = originalText;
            }
        });
    }, 0);

    const result = await popup.show();

    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        return;
    }

    const root = popup.dlg ?? document;
    const checkboxes = Array.from(root.querySelectorAll('.bce-char-checkbox'));
    const selectedIndexes = checkboxes.filter((cb) => cb.checked).map((cb) => Number(cb.dataset.index));
    const formatInput = root.querySelector('input[name="bce_format"]:checked');
    const format = formatInput ? formatInput.value : 'png';

    if (selectedIndexes.length === 0) {
        toastr.warning('No characters selected.');
        return;
    }

    await runExport(selectedIndexes.map((i) => characters[i]), format);
}

function addSettingsUI() {
    const html = `
        <div class="bulk-character-export-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Bulk Character Export</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="flex-container">
                        <input id="bce_open_panel" class="menu_button" type="button" value="Open Bulk Export" />
                    </div>
                </div>
            </div>
        </div>
    `;
    $('#extensions_settings2').append(html);
    $('#bce_open_panel').on('click', openExportPanel);
}

jQuery(() => {
    addSettingsUI();
});
