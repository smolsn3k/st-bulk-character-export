import { getRequestHeaders } from '../../../../script.js';

const MODULE_NAME = 'bulk_character_export';
const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

function safeFileName(name) {
    const cleaned = (name || 'character').replace(/[\\/:*?"<>|]/g, '_').trim();
    return cleaned.length ? cleaned : 'character';
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

function buildPanelHtml(characters) {
    const rows = characters.map((c, index) => `
        <label class="checkbox_label bce-row" for="bce_char_${index}">
            <input type="checkbox" id="bce_char_${index}" class="bce-char-checkbox" data-index="${index}" checked />
            <span>${c.name}</span>
        </label>
    `).join('');

    return `
        <div class="bulk-character-export">
            <h3>Bulk Character Export</h3>
            <div class="bce-controls flex-container">
                <label class="checkbox_label">
                    <input type="checkbox" id="bce_select_all" checked />
                    <span>Select all (${characters.length} characters)</span>
                </label>
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
    const { characters, Popup, POPUP_TYPE, POPUP_RESULT } = SillyTavern.getContext();

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

    // Wire up "select all" once the popup content is in the DOM.
    setTimeout(() => {
        const root = popup.dlg;
        if (!root) return;
        const selectAll = root.querySelector('#bce_select_all');
        const checkboxes = root.querySelectorAll('.bce-char-checkbox');
        selectAll?.addEventListener('change', () => {
            checkboxes.forEach((cb) => { cb.checked = selectAll.checked; });
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
