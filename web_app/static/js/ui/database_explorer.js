
import { state } from '../core/state.js';

function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
}
import { updateStats, showCustomModal } from './ui.js';
import { savePetriNetDb, loadPetriNetFromDb } from '../core/storage.js';

// DOM Elements
let viewDatabaseExplorer, dbGrid, dbSearchInput, dbSortSelect, btnRefreshDb, dbViewSelect;
let dbMinP, dbMinT, dbMinA, dbMinK;
let importNetInput;
let dbStats;

// Pagination state
let currentPage = 1;
const itemsPerPage = 20;
let isLoading = false;
let hasMore = true;
let currentNets = [];
let observer = null;
let sentinel = null;

export function initDatabaseExplorer() {
    viewDatabaseExplorer = document.getElementById('viewDatabaseExplorer');
    dbGrid = document.getElementById('dbGrid');
    dbSearchInput = document.getElementById('dbSearchInput');
    dbSortSelect = document.getElementById('dbSortSelect');
    btnRefreshDb = document.getElementById('btnRefreshDb');
    importNetInput = document.getElementById('importNetInput');
    dbStats = document.getElementById('dbStats');

    dbMinP = document.getElementById('dbMinP');
    dbMinT = document.getElementById('dbMinT');
    dbMinA = document.getElementById('dbMinA');
    dbMinK = document.getElementById('dbMinK');

    if (!viewDatabaseExplorer || !dbGrid) return;

    // Create sentinel element for infinite scroll trigger
    sentinel = document.createElement('div');
    sentinel.className = 'db-sentinel';
    sentinel.innerHTML = '<span style="color:#888; font-size:12px;">Loading more...</span>';
    sentinel.style.cssText = 'text-align:center; padding:20px; width:100%; grid-column:1/-1;';

    // Event Listeners
    if (btnRefreshDb) btnRefreshDb.addEventListener('click', () => loadDatabaseItems(true));

    if (dbSearchInput) {
        let debounceTimer;
        dbSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => loadDatabaseItems(true), 400);
        });
    }

    if (dbSortSelect) {
        dbSortSelect.addEventListener('change', () => loadDatabaseItems(true));
    }

    dbViewSelect = document.getElementById('dbViewSelect');
    if (dbViewSelect) {
        dbViewSelect.addEventListener('change', () => loadDatabaseItems(true));
    }

    [dbMinP, dbMinT, dbMinA, dbMinK].forEach(el => {
        if (el) el.addEventListener('change', () => loadDatabaseItems(true));
    });

    if (importNetInput) {
        importNetInput.addEventListener('change', handleImport);
    }

    // Use dbGrid itself as scroll root
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoading && hasMore) {
                loadDatabaseItems(false);
            }
        });
    }, {
        root: dbGrid,
        rootMargin: '200px',
        threshold: 0
    });
}

export function openDatabaseExplorer() {
    if (!viewDatabaseExplorer) return;
    viewDatabaseExplorer.style.display = 'flex';
    loadDatabaseItems(true);
}

export function closeExplorer() {
    if (!viewDatabaseExplorer) return;
    viewDatabaseExplorer.style.display = 'none';
    const tabEditor = document.getElementById('tabEditor');
    if (tabEditor) tabEditor.click();
}

async function loadDatabaseItems(reset = false) {
    if (reset) {
        currentPage = 1;
        currentNets = [];
        hasMore = true;
        // Detach sentinel and observer
        if (observer && sentinel) observer.unobserve(sentinel);
        if (sentinel && sentinel.parentNode) sentinel.remove();
        if (dbGrid) dbGrid.innerHTML = '';
        if (dbStats) dbStats.textContent = 'Loading...';
    }

    if (isLoading || !hasMore) return;
    isLoading = true;

    const query = dbSearchInput ? dbSearchInput.value : '';
    const sort = dbSortSelect ? dbSortSelect.value : 'date_desc';
    const viewMode = dbViewSelect ? dbViewSelect.value : 'petri';

    try {
        let newNets = [];
        let total = 0;

        if (viewMode === 'petri') {
            const params = new URLSearchParams({
                page: currentPage,
                per_page: itemsPerPage,
                q: query,
                sort: sort
            });

            if (dbMinP && dbMinP.value) params.append('min_p', dbMinP.value);
            if (dbMinT && dbMinT.value) params.append('min_t', dbMinT.value);
            if (dbMinA && dbMinA.value) params.append('min_a', dbMinA.value);
            if (dbMinK && dbMinK.value) params.append('min_k', dbMinK.value);

            const response = await fetch(`/api/petri/saved?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch nets');

            const data = await response.json();
            newNets = data.nets || [];
            total = data.total || 0;

            // Re-enable petri filters
            document.querySelectorAll('.filter-unit').forEach(el => el.style.opacity = '1');
            document.querySelectorAll('.class-input-group').forEach(el => el.style.display = 'flex');
        } else {
            // Graphs view
            // Disable petri filters visually
            document.querySelectorAll('.filter-unit').forEach(el => el.style.opacity = '0.3');
            document.querySelectorAll('.class-input-group').forEach(el => el.style.display = 'none');

            const response = await fetch('/api/graphs');
            if (!response.ok) throw new Error('Failed to fetch graphs');

            const data = await response.json();
            // Basic client-side search/sort for graphs since API handles all at once currently
            let filtered = data;
            if (query) {
                filtered = filtered.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));
            }
            if (sort === 'date_desc') filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            else if (sort === 'date_asc') filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            else if (sort === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));

            total = filtered.length;

            // Manual pagination for graphs
            const startIndex = (currentPage - 1) * itemsPerPage;
            newNets = filtered.slice(startIndex, startIndex + itemsPerPage);
        }

        if (reset && dbGrid) dbGrid.innerHTML = '';

        if (sentinel && sentinel.parentNode) sentinel.remove();
        if (observer && sentinel) observer.unobserve(sentinel);

        currentNets = reset ? newNets : [...currentNets, ...newNets];
        renderNewItems(newNets, viewMode);

        if (dbStats) {
            dbStats.textContent = `${currentNets.length} / ${total} nets`;
        }

        if (currentNets.length >= total || newNets.length < itemsPerPage) {
            hasMore = false;
        } else {
            currentPage++;
            if (dbGrid && sentinel && observer) {
                dbGrid.appendChild(sentinel);
                observer.observe(sentinel);
            }
        }

        if (currentNets.length === 0 && dbGrid) {
            dbGrid.innerHTML = '<div class="empty-state">No matching nets found.</div>';
        }

    } catch (err) {
        console.error("[DB] Error fetching nets:", err);
        if (reset && dbGrid) {
            dbGrid.innerHTML = `<div class="empty-state error">Error: ${err.message}</div>`;
        }
    } finally {
        isLoading = false;
    }
}

function renderNewItems(nets, viewMode) {
    if (!dbGrid) return;

    nets.forEach(net => {
        const card = viewMode === 'petri' ? createNetCard(net) : createGraphCard(net);
        dbGrid.appendChild(card);
    });
}

function createNetCard(net) {
    const card = document.createElement('div');
    card.className = 'net-card';

    const stats = net.stats || { places: 0, transitions: 0, arcs: 0, class: '' };
    const dateStr = net.created_at ? new Date(net.created_at).toLocaleDateString() : 'Unknown';

    card.innerHTML = `
        <div class="net-card-header">
            <div class="net-info-group">
                <div class="net-title" title="${net.name}">${net.name}</div>
                <div class="net-id-badge">#${net.id} • ${dateStr}</div>
            </div>
        </div>

        <div class="net-stats-row">
            <div class="stat-badge" title="Places">
                <span class="stat-label">Places:</span> <span>${stats.places}</span>
            </div>
            <div class="stat-badge" title="Transitions">
                <span class="stat-label">Transitions:</span> <span>${stats.transitions}</span>
            </div>
            <div class="stat-badge" title="Arcs">
                <span class="stat-label">Arcs:</span> <span>${stats.arcs}</span>
            </div>
            <div class="stat-badge" title="Tokens">
                <span class="stat-label">Tokens:</span> <span>${stats.tokens || 0}</span>
            </div>
        </div>

        <div class="class-input-group">
            <div class="class-label">Class:</div>
            <input type="text" class="class-input" value="${stats.class || ''}" placeholder="e.g. MG, SM..." data-id="${net.id}">
        </div>

        <div class="card-actions">
            <button class="action-btn-small primary btn-open">Open</button>
            <button class="action-btn-small icon-only btn-download-pnh" title="Download PNH">PNH</button>
            <button class="action-btn-small icon-only btn-download-pnml" title="Download PNML">PNML</button>
            <button class="action-btn-small icon-only btn-download-json" title="Download JSON">JSON</button>
            <button class="action-btn-small icon-only btn-download-gspn" title="Download GSPN">GSPN</button>
            <button class="action-btn-small icon-only danger btn-delete" title="Delete">🗑</button>
        </div>
    `;

    // Bind Events
    const btnOpen = card.querySelector('.btn-open');
    btnOpen.addEventListener('click', () => loadNetToEditor(net));

    const btnDelete = card.querySelector('.btn-delete');
    btnDelete.addEventListener('click', () => handleAction(net, 'delete'));

    const btnPnh = card.querySelector('.btn-download-pnh');
    btnPnh.addEventListener('click', () => handleAction(net, 'download-pnh'));

    const btnPnml = card.querySelector('.btn-download-pnml');
    btnPnml.addEventListener('click', () => handleAction(net, 'download-pnml'));

    const btnJson = card.querySelector('.btn-download-json');
    btnJson.addEventListener('click', () => handleAction(net, 'download-json'));

    const btnGspn = card.querySelector('.btn-download-gspn');
    btnGspn.addEventListener('click', () => handleAction(net, 'download-gspn'));

    const inputClass = card.querySelector('.class-input');
    inputClass.addEventListener('change', (e) => updateNetClass(net, e.target.value));

    return card;
}

async function updateNetClass(netMetadata, newClass) {
    try {
        const res = await fetch(`/api/petri/saved/${netMetadata.id}`);
        if (!res.ok) throw new Error("Failed to fetch net details");
        const fullNet = await res.json();

        let contentObj;
        if (typeof fullNet.content_json === 'string') {
            contentObj = JSON.parse(fullNet.content_json);
        } else if (fullNet.content) {
            contentObj = fullNet.content;
        } else {
            contentObj = {};
        }

        contentObj.model_class = newClass;

        const updateRes = await fetch(`/api/petri/saved/${netMetadata.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify({
                name: fullNet.name,
                content: contentObj
            })
        });

        if (updateRes.ok) {
            if (!netMetadata.stats) netMetadata.stats = {};
            netMetadata.stats.class = newClass;
        } else {
            alert("Failed to update class.");
        }
    } catch (e) {
        console.error("Update failed", e);
        alert("Update failed: " + e.message);
    }
}

function createGraphCard(graph) {
    const card = document.createElement('div');
    card.className = 'net-card';

    const dateStr = graph.created_at ? new Date(graph.created_at).toLocaleDateString() : 'Unknown';
    const dirStr = graph.is_directed ? 'Directed' : 'Undirected';

    // Parse nodes/edges to display counts if available
    let vCount = '?';
    let eCount = '?';
    try {
        const nodes = typeof graph.nodes === 'string' ? JSON.parse(graph.nodes) : graph.nodes;
        const edges = typeof graph.edges === 'string' ? JSON.parse(graph.edges) : graph.edges;
        vCount = nodes ? nodes.length : 0;
        eCount = edges ? edges.length : 0;
    } catch (e) { }

    card.innerHTML = `
        <div class="net-card-header">
            <div class="net-info-group">
                <div class="net-title" title="${graph.name}">${graph.name}</div>
                <div class="net-id-badge">#${graph.id} • ${dateStr} • ${dirStr}</div>
            </div>
        </div>
        
        <div class="net-stats-row">
            <div class="stat-badge" title="Vertices">
                <span class="stat-label">Vertices:</span> <span>${vCount}</span>
            </div>
            <div class="stat-badge" title="Edges">
                <span class="stat-label">Edges:</span> <span>${eCount}</span>
            </div>
        </div>

        <div class="card-actions" style="margin-top: 20px;">
            <button class="action-btn-small primary btn-open">Open in Editor</button>
            <button class="action-btn-small icon-only btn-download-gml" title="Download GML">GML</button>
            <button class="action-btn-small icon-only btn-download-graphml" title="Download GraphML">GraphML</button>
            <button class="action-btn-small icon-only btn-download-json" title="Download JSON">JSON</button>
            <button class="action-btn-small icon-only danger btn-delete" title="Delete">🗑</button>
        </div>
    `;

    const btnOpen = card.querySelector('.btn-open');
    btnOpen.addEventListener('click', () => loadGraphToEditor(graph));

    const btnDelete = card.querySelector('.btn-delete');
    btnDelete.addEventListener('click', () => handleGraphAction(graph, 'delete'));

    // Export actions
    card.querySelector('.btn-download-gml').addEventListener('click', () => handleGraphAction(graph, 'download-gml'));
    card.querySelector('.btn-download-graphml').addEventListener('click', () => handleGraphAction(graph, 'download-graphml'));
    card.querySelector('.btn-download-json').addEventListener('click', () => handleGraphAction(graph, 'download-json'));

    return card;
}

async function handleGraphAction(graph, action) {
    if (action === 'delete') {
        showCustomModal(
            "Delete Graph",
            `Are you sure you want to delete the graph "${graph.name}"? This action cannot be undone.`,
            true,
            async () => {
                try {
                    const res = await fetch(`/api/graphs/${graph.id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrfToken() } });
                    if (res.ok) {
                        loadDatabaseItems(true);
                    } else {
                        showCustomModal("Error", "Failed to delete the graph.");
                    }
                } catch (e) {
                    console.error(e);
                    showCustomModal("Error", "Delete failed due to a network or server error.");
                }
            }
        );
        return;
    }

    const graphId = graph.id;
    switch (action) {
        case 'download-gml':
            window.location.href = `/api/graphs/download/gml/${graphId}`;
            break;
        case 'download-graphml':
            window.location.href = `/api/graphs/download/graphml/${graphId}`;
            break;
        case 'download-json':
            window.location.href = `/api/graphs/download/json/${graphId}`;
            break;
    }
}

function loadGraphToEditor(graphMetadata) {
    async function doLoad() {
        try {
            const res = await fetch(`/api/graphs/${graphMetadata.id}`);
            if (!res.ok) throw new Error("Fetch failed");
            const graphData = await res.json();

            let nodes = typeof graphData.nodes === 'string' ? JSON.parse(graphData.nodes) : graphData.nodes;
            let edges = typeof graphData.edges === 'string' ? JSON.parse(graphData.edges) : graphData.edges;
            let isDirected = !!graphData.is_directed;

            import('../core/tabs.js').then(tabs => {
                // createNewTab -> activateTab -> contextSwitcher('MIS') is already called internally
                tabs.createNewTab('MIS', graphData.name, { nodes, edges });

                // Now just set the directed flag and trigger UI update
                import('../core/state.js').then(({ state }) => {
                    state.isDirected = isDirected;
                    const btnToggleDirected = document.getElementById('btnToggleDirected');
                    if (btnToggleDirected) {
                        btnToggleDirected.style.background = state.isDirected ? '#444' : 'transparent';
                        btnToggleDirected.style.border = state.isDirected ? '1px solid #666' : '1px solid transparent';
                    }
                });

                // Switch the sidebar panel to the editor view
                const tabEditor = document.getElementById('tabEditor');
                if (tabEditor) tabEditor.click();

                // Trigger layout if all nodes are at origin (freshly imported)
                setTimeout(() => {
                    const allZero = nodes.every(n => n.x === 0 && n.y === 0);
                    if (allZero && nodes.length > 0) {
                        document.getElementById('btnGraphLayout')?.click();
                    } else {
                        import('../engine/rendering/render.js').then(r => r.draw());
                    }
                    updateStats();
                }, 50);
            });

            closeExplorer();
        } catch (e) {
            console.error(e);
            showCustomModal("Error", "Failed to open graph.");
        }
    }
    doLoad();
}

async function handleAction(netMetadata, action) {
    if (action === 'delete') {
        showCustomModal(
            "Delete Petri Net",
            `Are you sure you want to delete "${netMetadata.name}"?`,
            true,
            async () => {
                try {
                    const res = await fetch(`/api/petri/saved/${netMetadata.id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrfToken() } });
                    if (res.ok) {
                        loadDatabaseItems(true);
                    } else {
                        showCustomModal("Error", "Failed to delete Petri net.");
                    }
                } catch (e) {
                    console.error(e);
                    showCustomModal("Error", "Delete failed due to an error.");
                }
            }
        );
        return;
    }

    const netId = netMetadata.id;
    switch (action) {
        case 'download-pnh':
            window.location.href = `/api/petri/download/pnh/${netId}`;
            break;
        case 'download-pnml':
            window.location.href = `/api/petri/download/pnml/${netId}`;
            break;
        case 'download-json':
            window.location.href = `/api/petri/download/json/${netId}`;
            break;
        case 'download-gspn':
            downloadGspn(netId);
            break;
    }
}

async function downloadGspn(netId) {
    try {
        const response = await fetch(`/api/petri/download/gspn/${netId}`);
        if (!response.ok) throw new Error('Failed to export GSPN format');
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        downloadFile(data.net_filename, data.net_content);

        setTimeout(() => {
            downloadFile(data.def_filename, data.def_content);
        }, 300);

    } catch (err) {
        console.error("Export error:", err);
        alert("Error exporting GSPN: " + err.message);
    }
}

function loadNetToEditor(netMetadata) {
    async function doLoad() {
        try {
            const res = await fetch(`/api/petri/saved/${netMetadata.id}`);
            if (!res.ok) throw new Error("Fetch failed");
            const fullNet = await res.json();
            const content = typeof fullNet.content_json === 'string' ? JSON.parse(fullNet.content_json) : fullNet.content_json;

            const event = new CustomEvent('petri-net-loaded', {
                detail: {
                    id: fullNet.id,
                    name: fullNet.name,
                    content: content
                }
            });
            window.dispatchEvent(event);

            closeExplorer();
        } catch (e) {
            console.error(e);
            alert("Failed to open net.");
        }
    }
    doLoad();
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
                loadDatabaseItems(true); // Refresh list
                alert(`Import successful: ${name}`);
            }
        } catch (err) {
            console.error("Import error:", err);
            alert("Error importing file: " + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// Converters
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
            if (val === -1) arcs.push({ sourceId: places[pIdx].id, targetId: transitions[t].id, type: 'place_to_transition', weight: 1 });
            else if (val === 1) arcs.push({ sourceId: transitions[t].id, targetId: places[pIdx].id, type: 'transition_to_place', weight: 1 });
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

function convertToPnh(json) {
    const places = json.places || [];
    const transitions = json.transitions || [];
    const arcs = json.arcs || [];

    const pMap = new Map();
    places.forEach((p, i) => pMap.set(p.id, i));

    const tMap = new Map();
    transitions.forEach((t, i) => tMap.set(t.id, i));

    const numP = places.length;
    const numT = transitions.length;

    let lines = [];
    lines.push(`${numP}`);
    lines.push(`${numT}`);

    for (let t = 0; t < numT; t++) {
        let row = [];
        const tId = transitions[t].id;

        for (let p = 0; p < numP; p++) {
            const pId = places[p].id;
            const arcIn = arcs.find(a => a.source === pId && a.target === tId);
            const arcOut = arcs.find(a => a.source === tId && a.target === pId);

            let val = 0;
            if (arcIn) val -= (arcIn.weight || 1);
            if (arcOut) val += (arcOut.weight || 1);

            if (val === 0) row.push('0');
            else if (val > 0) row.push(String(val));
            else row.push('x');
        }
        lines.push(row.join(' '));
    }

    let marking = [];
    for (let p = 0; p < numP; p++) {
        marking.push(places[p].tokens || 0);
    }
    lines.push(marking.join(' '));

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

    const transitions = json.transitions || [];
    transitions.forEach(t => {
        xml += `    <transition id="t${t.id}">\n`;
        xml += `      <name><text>${t.label || t.name || `t${t.id}`}</text></name>\n`;
        if (t.x !== undefined && t.y !== undefined) {
            xml += `      <graphics><position x="${t.x}" y="${t.y}"/></graphics>\n`;
        }
        xml += `    </transition>\n`;
    });

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
