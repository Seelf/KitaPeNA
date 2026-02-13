
import { state } from './state.js';
import { updateStats } from './ui.js';
import { savePetriNetDb, loadPetriNetFromDb, importPetriBatch } from './storage.js';

// DOM Elements
let viewDatabaseExplorer, dbGrid, dbSearchInput, dbSortSelect, btnRefreshDb;
let importNetInput;
let dbStats;
let dbDetailHeader, dbDetailContent, dbDetailEmpty;
let dbDetailName, dbDetailMeta, dbDetailProps;
let btnDbOpen, btnDbDelete;
let btnDownloadPnh, btnDownloadPnml, btnDownloadJson;

let currentNets = []; // Local cache of fetched nets
let selectedNet = null; // Currently selected Net object

export function initDatabaseExplorer() {
    viewDatabaseExplorer = document.getElementById('viewDatabaseExplorer');
    dbGrid = document.getElementById('dbGrid'); // This is now the sidebar list container
    dbSearchInput = document.getElementById('dbSearchInput');
    dbSortSelect = document.getElementById('dbSortSelect');
    btnRefreshDb = document.getElementById('btnRefreshDb');
    importNetInput = document.getElementById('importNetInput');
    dbStats = document.getElementById('dbStats');

    // Detail Panel Elements
    dbDetailHeader = document.getElementById('dbDetailHeader');
    dbDetailContent = document.getElementById('dbDetailContent');
    dbDetailEmpty = document.getElementById('dbDetailEmpty');
    dbDetailName = document.getElementById('dbDetailName');
    dbDetailMeta = document.getElementById('dbDetailMeta');
    dbDetailProps = document.getElementById('dbDetailProps');

    // Detail Actions
    btnDbOpen = document.getElementById('btnDbOpen');
    btnDbDelete = document.getElementById('btnDbDelete');
    btnDownloadPnh = document.getElementById('btnDownloadPnh');
    btnDownloadPnml = document.getElementById('btnDownloadPnml');
    btnDownloadJson = document.getElementById('btnDownloadJson');

    if (!viewDatabaseExplorer) return;

    // Event Listeners
    if (btnRefreshDb) btnRefreshDb.addEventListener('click', fetchNets);

    if (dbSearchInput) {
        dbSearchInput.addEventListener('input', () => renderList());
    }

    if (dbSortSelect) {
        dbSortSelect.addEventListener('change', () => renderList());
    }

    if (importNetInput) {
        importNetInput.addEventListener('change', handleImport);
    }

    // Action Buttons (Bound to selectedNet)
    if (btnDbOpen) btnDbOpen.addEventListener('click', () => handleAction('open'));
    if (btnDbDelete) btnDbDelete.addEventListener('click', () => handleAction('delete'));
    if (btnDownloadPnh) btnDownloadPnh.addEventListener('click', () => handleAction('download-pnh'));
    if (btnDownloadPnml) btnDownloadPnml.addEventListener('click', () => handleAction('download-pnml'));
    if (btnDownloadJson) btnDownloadJson.addEventListener('click', () => handleAction('download-json'));
}

export function openDatabaseExplorer() {
    if (!viewDatabaseExplorer) return;
    viewDatabaseExplorer.style.display = 'flex';
    fetchNets();
}

export function closeExplorer() {
    if (!viewDatabaseExplorer) return;
    viewDatabaseExplorer.style.display = 'none';

    // Switch back to editor if needed, usually managed by main.js tabs logic
    const tabEditor = document.getElementById('tabEditor');
    if (tabEditor) tabEditor.click();
}

async function fetchNets() {
    if (dbGrid) dbGrid.innerHTML = '<div class="empty-state">Loading...</div>';
    if (dbStats) dbStats.textContent = 'Fetching data...';

    try {
        const response = await fetch('/api/petri/saved');
        if (!response.ok) throw new Error('Failed to fetch nets');

        const data = await response.json();
        currentNets = data.nets || []; // Expecting { nets: [...] }

        renderList();

        // If a net was selected try to re-select it by ID, else clear selection
        if (selectedNet) {
            const stillExists = currentNets.find(n => n.id === selectedNet.id);
            if (stillExists) selectNet(stillExists);
            else clearSelection();
        } else {
            // Maybe select first one? Or clear.
            clearSelection();
        }
    } catch (err) {
        console.error("Error fetching nets:", err);
        if (dbGrid) dbGrid.innerHTML = `<div class="empty-state error">Error: ${err.message}</div>`;
    }
}

function renderList() {
    if (!dbGrid) return;
    dbGrid.innerHTML = '';

    // Filter
    const query = dbSearchInput ? dbSearchInput.value.toLowerCase() : '';
    let filtered = currentNets.filter(net => net.name.toLowerCase().includes(query));

    // Sort
    const sortMode = dbSortSelect ? dbSortSelect.value : 'date_desc';
    filtered.sort((a, b) => {
        const dateA = a.created_at || 0;
        const dateB = b.created_at || 0;
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();

        switch (sortMode) {
            case 'date_asc': return dateA - dateB;
            case 'date_desc': return dateB - dateA; // Default
            case 'name_asc': return nameA.localeCompare(nameB);
            case 'name_desc': return nameB.localeCompare(nameA);
            default: return dateB - dateA;
        }
    });

    // Update Stats
    if (dbStats) {
        dbStats.textContent = `${filtered.length} nets`;
    }

    if (filtered.length === 0) {
        dbGrid.innerHTML = '<div class="empty-state">No matching nets.</div>';
        return;
    }

    // Render List Items
    filtered.forEach(net => {
        const item = createlistitem(net);
        dbGrid.appendChild(item);
    });
}

function createlistitem(net) {
    const div = document.createElement('div');
    div.className = 'db-list-item';
    if (selectedNet && selectedNet.id === net.id) {
        div.classList.add('selected');
    }

    // Check if ID is string or number
    const displayId = String(net.id).substring(0, 6);
    const dateObj = net.created_at ? new Date(net.created_at * 1000) : null;
    const dateStr = dateObj ? dateObj.toLocaleDateString() : 'Unknown';

    div.innerHTML = `
        <div class="db-item-title" title="${net.name}">${net.name}</div>
        <div class="db-item-meta">
            <span>#${displayId}</span>
            <span>${dateStr}</span>
        </div>
    `;

    div.addEventListener('click', () => selectNet(net));

    return div;
}

async function selectNet(net) {
    selectedNet = net;
    renderList(); // Re-render to update 'selected' class highlight

    // Show Details UI
    dbDetailEmpty.style.display = 'none';
    dbDetailHeader.style.display = 'block';
    dbDetailContent.style.display = 'block';

    // Populate Header
    dbDetailName.textContent = net.name;
    const dateStr = net.created_at ? new Date(net.created_at * 1000).toLocaleString() : 'Unknown';
    dbDetailMeta.textContent = `ID: ${net.id} | Created: ${dateStr}`;

    // Populate Properties (Requires full load first?)
    // Usually fetching /saved returns light metadata. We need to check if content is there.
    let fullNetData = net;
    if (!net.content && !net.places) {
        try {
            // We reuse the existing load function from storage.js which fetches by ID
            const loaded = await loadPetriNetFromDb(net.id);
            if (loaded) {
                fullNetData = loaded;
                // Update local cache too so subsequent clicks are fast
                const idx = currentNets.findIndex(n => n.id === net.id);
                if (idx !== -1) currentNets[idx] = fullNetData;
            }
        } catch (e) {
            console.error("Failed to load details", e);
            dbDetailProps.innerHTML = '<div style="color:red">Error loading details.</div>';
            return;
        }
    }
    selectedNet = fullNetData; // Update reference to full data

    // Extract stats
    const content = fullNetData.content || fullNetData;
    const numPlaces = (content.places || []).length;
    const numTrans = (content.transitions || []).length;
    const numArcs = (content.arcs || []).length;

    // Render Props Grid
    dbDetailProps.innerHTML = `
        <div class="prop-item">
            <div class="prop-label">Places</div>
            <div class="prop-value">${numPlaces}</div>
        </div>
        <div class="prop-item">
            <div class="prop-label">Transitions</div>
            <div class="prop-value">${numTrans}</div>
        </div>
        <div class="prop-item">
            <div class="prop-label">Arcs</div>
            <div class="prop-value">${numArcs}</div>
        </div>
        <div class="prop-item">
            <div class="prop-label">Marking Sum</div>
            <div class="prop-value">${countTokens(content.places)}</div>
        </div>
    `;
}

function countTokens(places) {
    if (!places) return 0;
    return places.reduce((sum, p) => sum + (p.tokens || 0), 0);
}

function clearSelection() {
    selectedNet = null;
    renderList();
    dbDetailEmpty.style.display = 'flex';
    dbDetailHeader.style.display = 'none';
    dbDetailContent.style.display = 'none';
}

async function handleAction(action) {
    if (!selectedNet) return;

    const net = selectedNet; // Already fully loaded in selectNet
    const content = net.content || net;

    switch (action) {
        case 'open':
            loadNetToEditor(net);
            break;
        case 'download-pnh':
            downloadFile(net.name + '.pnh', convertToPnh(content));
            break;
        case 'download-pnml':
            downloadFile(net.name + '.pnml', convertToPnml(content, net.name));
            break;
        case 'download-json':
            downloadFile(net.name + '.json', JSON.stringify(content, null, 2));
            break;
        case 'delete':
            if (confirm(`Are you sure you want to delete "${net.name}"?`)) {
                await deleteNet(net.id);
            }
            break;
    }
}

function loadNetToEditor(netData) {
    // We can dispatch an event or directly manipulate the tabs/context
    // Using CustomEvent as before
    const event = new CustomEvent('requestLoadNet', {
        detail: {
            id: netData.id,
            name: netData.name,
            content: netData.content || netData
        }
    });
    // But we need to listen for this in main or handle it here?
    // Actually main.js handles tab switching. We need to tell main.js to load this net.
    // Let's reuse `loadPetriNetFromDb` logic? No, main.js has logic for "tab open".

    // Dispatch event that main.js can listen to, OR just call the import directly.
    // Wait, main.js doesn't listen to 'requestLoadNet'.

    // Better way: Close explorer, switch to editor, then trigger load.
    // Since we are in a module, we can't easily call main.js functions unless exported.
    // But we can trigger a click on a hidden button or similar hack, OR use window global.

    // Let's use localStorage + reload? No.
    // How about window.loadNetToEditor global?

    // Or, we can modify main.js to listen for a custom event.
    // I will add a listener in main.js quickly in next step if needed. 
    // BUT wait, in existing main.js (read previously), I saw no custom event listener.
    // Let's dispatch event and I'll add the listener to main.js in a follow-up if needed.

    // However, `main.js` has `loadPetriNetFromDb` imported.
    // We can try to emulate the "Open" behavior.

    // Re-reading main.js: it has logic inside `tabDb` click handler to load nets.
    // We can expose a function on window.

    if (window.openPetriNetInEditor) {
        window.openPetriNetInEditor(netData);
    } else {
        // Fallback: Dispatch event
        document.dispatchEvent(new CustomEvent('open-petri-net', { detail: netData }));
    }

    closeExplorer();
}


async function deleteNet(id) {
    try {
        const response = await fetch(`/api/petri/saved/${id}`, { method: 'DELETE' });
        if (response.ok) {
            currentNets = currentNets.filter(n => n.id !== id);
            clearSelection();
            renderList(); // Will also show update stats
        } else {
            alert("Failed to delete net.");
        }
    } catch (e) {
        console.error("Delete failed", e);
        alert("Delete failed: " + e.message);
    }
}

async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const content = event.target.result;
        const name = file.name.split('.')[0];

        try {
            let netContent;
            if (file.name.endsWith('.json')) {
                netContent = JSON.parse(content);
            } else if (file.name.endsWith('.pnh')) {
                netContent = parsePnh(content);
            } else {
                alert("Only .json and .pnh files are currently supported for browser import.");
                return;
            }

            if (netContent) {
                await savePetriNetDb(name, netContent);
                fetchNets();
                alert(`Import successful: ${name}`);
            }
        } catch (err) {
            console.error("Import error:", err);
            alert("Error importing file: " + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
}

function parsePnh(content) {
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
    if (lines.length < 3) throw new Error("Invalid PNH format");

    const numPlaces = parseInt(lines[0].trim());
    const numRows = parseInt(lines[1].trim());
    const numTransitions = numRows - 1;

    const places = [];
    for (let i = 0; i < numPlaces; i++) places.push({ id: i, label: `p${i}`, tokens: 0 });

    const transitions = [];
    for (let i = 0; i < numTransitions; i++) transitions.push({ id: i, label: `t${i}` });

    const arcs = [];

    // Parse Metadata
    lines.forEach(l => {
        if (l.trim().startsWith(';Places=')) {
            const names = l.trim().substring(8).split(';');
            names.forEach((n, i) => { if (places[i]) places[i].label = n; });
        } else if (l.trim().startsWith(';Transitions=')) {
            const names = l.trim().substring(13).split(';');
            names.forEach((n, i) => { if (transitions[i]) transitions[i].label = n; });
        }
    });

    // Parse Matrix
    for (let t = 0; t < numTransitions; t++) {
        const line = lines[2 + t].trim();
        let vals = [];
        if (line.includes(' ')) {
            vals = line.split(/\s+/).map(v => v === 'x' ? -1 : parseInt(v));
        } else {
            vals = line.split('').map(c => c === 'x' ? -1 : parseInt(c));
        }

        vals.forEach((val, pIdx) => {
            if (val === -1) arcs.push({ source: places[pIdx].id, target: transitions[t].id, weight: 1 });
            else if (val === 1) arcs.push({ source: transitions[t].id, target: places[pIdx].id, weight: 1 });
        });
    }

    // Marking
    const markingLine = lines[2 + numTransitions].trim();
    let tokens = [];
    if (markingLine.includes(' ')) {
        tokens = markingLine.split(/\s+/).map(Number);
    } else {
        tokens = markingLine.split('').map(Number);
    }
    tokens.forEach((t, i) => { if (places[i]) places[i].tokens = t; });

    return { places, transitions, arcs };
}

// --- CONVERTERS ---

function convertToPnh(json) {
    const places = json.places || [];
    const transitions = json.transitions || [];
    const arcs = json.arcs || []; // [{source, target, weight}, ...]

    // 1. Map IDs to indices (dense format requires 0..N-1)
    // We assume IDs are somewhat arbitrary, so we re-index them for the matrix.
    const pMap = new Map();
    places.forEach((p, i) => pMap.set(p.id, i));

    const tMap = new Map();
    transitions.forEach((t, i) => tMap.set(t.id, i));

    const numP = places.length;
    const numT = transitions.length;

    let lines = [];
    // Header
    lines.push(`${numP}`);
    lines.push(`${numT}`);

    // Matrix: numT rows, numP columns
    for (let t = 0; t < numT; t++) {
        let row = [];
        const tId = transitions[t].id;

        for (let p = 0; p < numP; p++) {
            const pId = places[p].id;

            // Check arc P->T (input)
            const arcIn = arcs.find(a => a.source === pId && a.target === tId);
            // Check arc T->P (output)
            const arcOut = arcs.find(a => a.source === tId && a.target === pId);

            let val = 0;
            if (arcIn) {
                // -1 is 'x'
                val -= (arcIn.weight || 1);
            }
            if (arcOut) {
                val += (arcOut.weight || 1);
            }

            // Representation
            if (val === 0) row.push('0');
            else if (val > 0) row.push(String(val));
            else row.push('x'); // strict format
        }
        lines.push(row.join(' '));
    }

    // Marking (Dense row of digits)
    let marking = [];
    for (let p = 0; p < numP; p++) {
        marking.push(places[p].tokens || 0);
    }
    lines.push(marking.join(' '));

    // Metadata (Names)
    const pNames = places.map(p => p.label || p.name || `p${p.id}`).join(';');
    lines.push(`;Places=${pNames}`);

    const tNames = transitions.map(t => t.label || t.name || `t${t.id}`).join(';');
    lines.push(`;Transitions=${tNames}`);

    return lines.join("\n");
}

function convertToPnml(json, netName) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<pnml>\n';
    xml += `  <net id="${netName}" type="http://www.pnml.org/version-2009/grammar/ptnet">\n`;

    // Places
    const places = json.places || [];
    places.forEach(p => {
        xml += `    <place id="p${p.id}">\n`;
        xml += `      <name><text>${p.label || p.name || `p${p.id}`}</text></name>\n`;
        xml += `      <initialMarking><text>${p.tokens || 0}</text></initialMarking>\n`;
        if (p.x !== undefined && p.y !== undefined) {
            xml += `      <graphics><position x="${p.x}" y="${p.y}"/></graphics>\n`;
        }
        xml += `    </place>\n`;
    });

    // Transitions
    const transitions = json.transitions || [];
    transitions.forEach(t => {
        xml += `    <transition id="t${t.id}">\n`;
        xml += `      <name><text>${t.label || t.name || `t${t.id}`}</text></name>\n`;
        if (t.x !== undefined && t.y !== undefined) {
            xml += `      <graphics><position x="${t.x}" y="${t.y}"/></graphics>\n`;
        }
        xml += `    </transition>\n`;
    });

    // Arcs
    const arcs = json.arcs || [];
    let arcIdCounter = 0;
    arcs.forEach(a => {
        const isSourcePlace = places.some(p => p.id === a.source);
        const sourceId = isSourcePlace ? `p${a.source}` : `t${a.source}`;
        const targetId = isSourcePlace ? `t${a.target}` : `p${a.target}`;

        xml += `    <arc id="a${arcIdCounter++}" source="${sourceId}" target="${targetId}">\n`;
        xml += `      <inscription><text>${a.weight || 1}</text></inscription>\n`;
        xml += `    </arc>\n`;
    });

    xml += '  </net>\n';
    xml += '</pnml>';
    return xml;
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
