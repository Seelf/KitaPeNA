/**
 * explorer_import.js — File import and drag-and-drop handling.
 */

import {
    viewDatabaseExplorer, importNetInput, importFolderInput, dbStats, savePetriNetDb,
    dbViewSelect, importFormatSelect, PETRI_EXTENSIONS, GRAPH_EXTENSIONS, getCsrfToken
} from './explorer_shared.js';
import { parsePnh, parsePnml } from './explorer_converters.js';
import { loadDatabaseItems } from './explorer_init.js';

export async function handleImport(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    e.target.value = '';
}

export async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (viewDatabaseExplorer) viewDatabaseExplorer.classList.remove('drag-active');

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    let allFiles = [];
    if (dbStats) dbStats.textContent = "Scanning directory tree...";

    async function traverseFileTree(item, path = '') {
        if (item.isFile) {
            return new Promise((resolve) => {
                item.file(file => {
                    allFiles.push(file);
                    resolve();
                });
            });
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            const entries = await new Promise((resolve) => {
                dirReader.readEntries(resolve);
            });
            for (let i = 0; i < entries.length; i++) {
                await traverseFileTree(entries[i], path + item.name + "/");
            }
        }
    }

    for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
            await traverseFileTree(item);
        }
    }

    if (allFiles.length > 0) {
        await processFiles(allFiles);
    } else {
        if (dbStats) dbStats.textContent = "";
    }
}

async function processFiles(files) {
    let successCount = 0;
    let failCount = 0;

    if (importNetInput) importNetInput.disabled = true;
    if (importFolderInput) importFolderInput.disabled = true;

    if (dbStats) dbStats.textContent = `Importing ${files.length} file(s)...`;

    const isPetri = dbViewSelect && dbViewSelect.value === 'petri';
    const selectedFormat = (importFormatSelect && importFormatSelect.value !== 'all') ? importFormatSelect.value : null;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

        // Skip if it doesn't match the explicitly selected format
        if (selectedFormat) {
            if (selectedFormat === '.pnml' && !['.pnml', '.xml'].includes(ext)) continue;
            if (selectedFormat !== '.pnml' && ext !== selectedFormat) continue;
        } else {
            // General filtering by mode
            const allowed = isPetri ? PETRI_EXTENSIONS : GRAPH_EXTENSIONS;
            if (!allowed.includes(ext)) {
                console.log(`Skipping file with unallowed extension: ${file.name}`);
                continue;
            }
        }

        try {
            if (isPetri) {
                const content = await file.text();
                const name = file.name.split('.')[0];
                let netContent;

                if (ext === '.json') {
                    netContent = JSON.parse(content);
                } else if (ext === '.pnh') {
                    netContent = parsePnh(content);
                } else if (ext === '.pnml' || ext === '.xml') {
                    netContent = parsePnml(content);
                }

                if (netContent) {
                    await savePetriNetDb(name, netContent);
                    successCount++;
                } else {
                    failCount++;
                }
            } else {
                // Graph format import
                const result = await processGraphFile(file);
                if (result) successCount++;
                else failCount++;
            }
        } catch (err) {
            console.error(`Error importing file ${file.name}:`, err);
            failCount++;
        }
    }

    if (importNetInput) importNetInput.disabled = false;
    if (importFolderInput) importFolderInput.disabled = false;

    const menu = document.getElementById('importDropdownMenu');
    if (menu) menu.style.display = 'none';

    loadDatabaseItems(true);

    if (files.length === 1 && failCount === 0 && successCount > 0) {
        alert(`Import successful: ${files[0].name.split('.')[0]}`);
    } else if (files.length > 0) {
        alert(`Bulk Import Complete:\nSuccessfully stored: ${successCount}\nFailed/Ignored: ${failCount}`);
    }
}

async function processGraphFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/graphs/import', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrfToken() },
        body: formData
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to parse graph file');
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const saveRes = await fetch('/api/graphs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({
            name: data.name || file.name.split('.')[0],
            nodes: JSON.stringify(data.nodes),
            edges: JSON.stringify(data.edges),
            is_directed: data.is_directed
        })
    });

    if (!saveRes.ok) throw new Error('Failed to save parsed graph to database');
    return true;
}
