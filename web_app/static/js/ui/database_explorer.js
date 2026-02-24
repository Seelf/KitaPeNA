
import { state } from '../core/state.js';

function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
}
import { updateStats, showCustomModal } from './ui.js';
import { savePetriNetDb, loadPetriNetFromDb } from '../core/storage.js';

// DOM Elements
let viewDatabaseExplorer, dbGrid, dbSearchInput, dbSortSelect, btnRefreshDb, dbViewSelect;
let dbMinP, dbMinT, dbMinA, dbMinK, dbModelClass;
let importNetInput, importFolderInput;
let dbStats;

// Pagination state
let currentPage = 1;
const itemsPerPage = 20;
let isLoading = false;
let hasMore = true;
let observer = null;
let sentinel = null;
let selectedNetIds = new Set();
let allLoadedNets = []; // Keep track of all current objects for duplicate detection
let currentNets = [];

export function initDatabaseExplorer() {
    viewDatabaseExplorer = document.getElementById('viewDatabaseExplorer');
    dbGrid = document.getElementById('dbGrid');
    dbSearchInput = document.getElementById('dbSearchInput');
    dbSortSelect = document.getElementById('dbSortSelect');
    btnRefreshDb = document.getElementById('btnRefreshDb');
    importNetInput = document.getElementById('importNetInput');
    importFolderInput = document.getElementById('importFolderInput');
    dbStats = document.getElementById('dbStats');

    dbMinP = document.getElementById('dbMinP');
    dbMinT = document.getElementById('dbMinT');
    dbMinA = document.getElementById('dbMinA');
    dbMinK = document.getElementById('dbMinK');
    dbModelClass = document.getElementById('dbModelClass');

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

    [dbMinP, dbMinT, dbMinA, dbMinK, dbModelClass].forEach(el => {
        if (el) el.addEventListener('change', () => loadDatabaseItems(true));
    });

    if (importNetInput) {
        importNetInput.addEventListener('change', handleImport);
    }
    if (importFolderInput) {
        importFolderInput.addEventListener('change', handleImport);
    }

    // Close dropdown when clicking outside
    window.addEventListener('click', function (e) {
        const btn = document.getElementById('btnImportDropdown');
        const menu = document.getElementById('importDropdownMenu');
        if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
            menu.style.display = 'none';
        }
    });

    // Drag and Drop support
    if (viewDatabaseExplorer) {
        viewDatabaseExplorer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            viewDatabaseExplorer.classList.add('drag-active');
            if (dbStats) dbStats.textContent = "Drop files or folders to import...";
        });
        viewDatabaseExplorer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            viewDatabaseExplorer.classList.remove('drag-active');
            if (dbStats) dbStats.textContent = "";
        });
        viewDatabaseExplorer.addEventListener('drop', handleDrop);
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

    // Bulk action listeners
    const btnBulkMenu = document.getElementById('btnDbBulkMenu');
    const menuBulk = document.getElementById('dbBulkMenu');

    if (btnBulkMenu && menuBulk) {
        btnBulkMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            menuBulk.style.display = menuBulk.style.display === 'none' ? 'block' : 'none';
        });
    }

    const btnSelectAll = document.getElementById('btnDbSelectAll');
    const btnSelectDupes = document.getElementById('btnDbSelectDuplicates');
    const btnDeleteSelected = document.getElementById('btnDbDeleteSelected');

    const btnClearSelection = document.getElementById('btnDbClearSelection');

    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            toggleSelectAll();
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnClearSelection) {
        btnClearSelection.addEventListener('click', () => {
            clearSelection();
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnSelectDupes) {
        btnSelectDupes.addEventListener('click', () => {
            selectDuplicates();
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnDeleteSelected) {
        btnDeleteSelected.addEventListener('click', () => {
            deleteSelectedNets();
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }

    const btnExportPnh = document.getElementById('btnDbExportPnh');
    const btnExportPnml = document.getElementById('btnDbExportPnml');
    const btnExportJson = document.getElementById('btnDbExportJson');

    if (btnExportPnh) {
        btnExportPnh.addEventListener('click', () => {
            bulkExport('pnh');
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnExportPnml) {
        btnExportPnml.addEventListener('click', () => {
            bulkExport('pnml');
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnExportJson) {
        btnExportJson.addEventListener('click', () => {
            bulkExport('json');
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }

    // Global click listener for dropdowns
    window.addEventListener('click', (e) => {
        if (menuBulk && !btnBulkMenu.contains(e.target) && !menuBulk.contains(e.target)) {
            menuBulk.style.display = 'none';
        }
    });
}

function updateBulkDeleteButton() {
    const btn = document.getElementById('btnDbDeleteSelected');
    const countSpan = document.getElementById('dbSelectedCount');
    const bulkBtn = document.getElementById('btnDbBulkMenu');
    if (!btn || !countSpan) return;

    const count = selectedNetIds.size;
    countSpan.textContent = count;
    // Show/hide the delete option in the dropdown
    btn.style.display = count > 0 ? 'flex' : 'none';

    // Export options visibility
    const divider = document.getElementById('dbBulkExportDivider');
    const pnh = document.getElementById('btnDbExportPnh');
    const pnml = document.getElementById('btnDbExportPnml');
    const json = document.getElementById('btnDbExportJson');
    const clearBtn = document.getElementById('btnDbClearSelection');
    const viewMode = dbViewSelect ? dbViewSelect.value : 'petri';

    if (divider) divider.style.display = count > 0 ? 'block' : 'none';
    if (clearBtn) clearBtn.style.display = count > 0 ? 'flex' : 'none';
    if (pnh) pnh.style.display = (count > 0 && viewMode === 'petri') ? 'flex' : 'none';
    if (pnml) pnml.style.display = (count > 0 && viewMode === 'petri') ? 'flex' : 'none';
    if (json) json.style.display = count > 0 ? 'flex' : 'none';

    // Update the main menu button
    if (bulkBtn) {
        if (count > 0) {
            bulkBtn.innerHTML = `Bulk (${count}) ▾`;
            bulkBtn.style.borderColor = 'var(--accent)';
            bulkBtn.style.color = 'var(--accent-light)';
        } else {
            bulkBtn.innerHTML = `Bulk ▾`;
            bulkBtn.style.borderColor = '';
            bulkBtn.style.color = '';
        }
    }
}

function toggleSelectAll() {
    if (selectedNetIds.size === allLoadedNets.length && allLoadedNets.length > 0) {
        selectedNetIds.clear();
    } else {
        allLoadedNets.forEach(net => selectedNetIds.add(net.id));
    }

    // Sync UI
    document.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.checked = selectedNetIds.has(parseInt(cb.dataset.id));
        cb.closest('.net-card').classList.toggle('selected', cb.checked);
    });
    updateBulkDeleteButton();
}

function clearSelection() {
    selectedNetIds.clear();
    // Sync UI
    document.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.checked = false;
        cb.closest('.net-card').classList.remove('selected');
    });
    updateBulkDeleteButton();
}

function selectDuplicates() {
    // Definition of duplicate for this tool: Same Name AND (if petri) same stats
    const seen = new Map();
    const dupes = [];

    allLoadedNets.forEach(net => {
        const stats = net.stats || {};
        const key = `${net.name}|${stats.places || 0}|${stats.transitions || 0}|${stats.arcs || 0}|${stats.tokens || 0}`;
        if (seen.has(key)) {
            // It's a duplicate of something we've already seen
            dupes.push(net.id);
        } else {
            seen.set(key, net.id);
        }
    });

    if (dupes.length === 0) {
        showCustomModal("Duplicates", "No duplicates found among currently loaded items.");
        return;
    }

    dupes.forEach(id => selectedNetIds.add(id));

    // Sync UI
    document.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.checked = selectedNetIds.has(parseInt(cb.dataset.id));
        cb.closest('.net-card').classList.toggle('selected', cb.checked);
    });
    updateBulkDeleteButton();
    showCustomModal("Duplicates", `Identified and selected ${dupes.length} duplicates.`);
}

async function deleteSelectedNets() {
    const count = selectedNetIds.size;
    if (count === 0) return;

    showCustomModal(
        "Bulk Delete",
        `Are you sure you want to delete ${count} selected items? This action cannot be undone.`,
        true,
        async () => {
            const ids = Array.from(selectedNetIds);
            const viewMode = dbViewSelect ? dbViewSelect.value : 'petri';
            const endpoint = viewMode === 'petri' ? '/api/petri/saved' : '/api/graphs';

            let successCount = 0;
            for (const id of ids) {
                try {
                    const res = await fetch(`${endpoint}/${id}`, {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': getCsrfToken() }
                    });
                    if (res.ok) successCount++;
                } catch (e) {
                    console.error(`Failed to delete ID ${id}`, e);
                }
            }

            selectedNetIds.clear();
            updateBulkDeleteButton();
            loadDatabaseItems(true);
            showCustomModal("Success", `Successfully deleted ${successCount} items.`);
        }
    );
}

async function bulkExport(format) {
    const ids = Array.from(selectedNetIds);
    if (ids.length === 0) return;

    const viewMode = dbViewSelect ? dbViewSelect.value : 'petri';
    const baseUrl = viewMode === 'petri' ? '/api/petri/download' : '/api/graphs/download';

    for (let i = 0; i < ids.length; i++) {
        // Stagger downloads to prevent browser blocking
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = `${baseUrl}/${format}/${ids[i]}`;
            link.download = ''; // Let browser/server decide
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, i * 300);
    }
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
        allLoadedNets = [];
        selectedNetIds.clear();
        updateBulkDeleteButton();
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
            if (dbModelClass && dbModelClass.value) params.append('class', dbModelClass.value);

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
        allLoadedNets = currentNets;
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
    const isSelected = selectedNetIds.has(net.id);

    card.innerHTML = `
        <div class="card-checkbox-wrapper">
            <input type="checkbox" class="card-checkbox" data-id="${net.id}" ${isSelected ? 'checked' : ''}>
        </div>
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

    // Selection UI
    const checkbox = card.querySelector('.card-checkbox');
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedNetIds.add(net.id);
            card.classList.add('selected');
        } else {
            selectedNetIds.delete(net.id);
            card.classList.remove('selected');
        }
        updateBulkDeleteButton();
    });

    if (isSelected) card.classList.add('selected');

    // Entire card click selects checkbox
    card.addEventListener('click', (e) => {
        // Skip if clicking buttons, links, or inputs
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) {
            return;
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    });

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
    const isSelected = selectedNetIds.has(graph.id);

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
        <div class="card-checkbox-wrapper">
            <input type="checkbox" class="card-checkbox" data-id="${graph.id}" ${isSelected ? 'checked' : ''}>
        </div>
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

    // Selection UI
    const checkbox = card.querySelector('.card-checkbox');
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedNetIds.add(graph.id);
            card.classList.add('selected');
        } else {
            selectedNetIds.delete(graph.id);
            card.classList.remove('selected');
        }
        updateBulkDeleteButton();
    });

    if (isSelected) card.classList.add('selected');

    // Entire card click selects checkbox
    card.addEventListener('click', (e) => {
        // Skip if clicking buttons, links, or inputs
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) {
            return;
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    });

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
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    e.target.value = ''; // Reset input
}

async function handleDrop(e) {
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
        // webkitGetAsEntry handles folders seamlessly
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

    // Disable inputs during import
    if (importNetInput) importNetInput.disabled = true;
    if (importFolderInput) importFolderInput.disabled = true;

    // Give user UI feedback
    if (dbStats) dbStats.textContent = `Importing ${files.length} file(s)...`;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Skip irrelevant files
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.json', '.pnh', '.pnml', '.xml'].includes(ext)) {
            continue;
        }

        try {
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
        } catch (err) {
            console.error(`Error importing file ${file.name}:`, err);
            failCount++;
        }
    }

    // Restore UI
    if (importNetInput) importNetInput.disabled = false;
    if (importFolderInput) importFolderInput.disabled = false;

    const menu = document.getElementById('importDropdownMenu');
    if (menu) menu.style.display = 'none';

    loadDatabaseItems(true); // Refresh list

    if (files.length === 1 && failCount === 0) {
        alert(`Import successful: ${files[0].name.split('.')[0]}`);
    } else if (files.length > 0) {
        alert(`Bulk Import Complete:\nSuccessfully stored: ${successCount}\nFailed/Ignored: ${failCount}`);
    }
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

function parsePnml(content) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, "text/xml");

    const places = [];
    const transitions = [];
    const arcs = [];

    const placeNodes = xmlDoc.getElementsByTagName("place");
    for (let i = 0; i < placeNodes.length; i++) {
        const p = placeNodes[i];
        let pIdStr = p.getAttribute("id");
        // Extract numeric ID if prefixed
        let pId = parseInt(pIdStr.replace(/[^0-9]/g, '')) || i;

        let label = pIdStr;
        const nameNode = p.querySelector("name text");
        if (nameNode) label = nameNode.textContent;

        let tokens = 0;
        const initMarkNode = p.querySelector("initialMarking text");
        if (initMarkNode) tokens = parseInt(initMarkNode.textContent) || 0;

        // Optionally extract x/y
        let x = undefined, y = undefined;
        const posNode = p.querySelector("graphics position");
        if (posNode) {
            x = parseFloat(posNode.getAttribute("x"));
            y = parseFloat(posNode.getAttribute("y"));
        }

        places.push({ id: pId, label: label, tokens: tokens, x: x, y: y });
    }

    const transNodes = xmlDoc.getElementsByTagName("transition");
    for (let i = 0; i < transNodes.length; i++) {
        const t = transNodes[i];
        let tIdStr = t.getAttribute("id");
        let tId = parseInt(tIdStr.replace(/[^0-9]/g, '')) || i;

        let label = tIdStr;
        const nameNode = t.querySelector("name text");
        if (nameNode) label = nameNode.textContent;

        let x = undefined, y = undefined;
        const posNode = t.querySelector("graphics position");
        if (posNode) {
            x = parseFloat(posNode.getAttribute("x"));
            y = parseFloat(posNode.getAttribute("y"));
        }

        transitions.push({ id: tId, label: label, x: x, y: y });
    }

    const arcNodes = xmlDoc.getElementsByTagName("arc");
    for (let i = 0; i < arcNodes.length; i++) {
        const a = arcNodes[i];
        const srcStr = a.getAttribute("source");
        const tgtStr = a.getAttribute("target");

        const srcId = parseInt(srcStr.replace(/[^0-9]/g, ''));
        const tgtId = parseInt(tgtStr.replace(/[^0-9]/g, ''));

        let weight = 1;
        const inscriptNode = a.querySelector("inscription text");
        if (inscriptNode) weight = parseInt(inscriptNode.textContent) || 1;

        // Determine direction by checking if src is in places
        const isSrcPlace = places.some(p => p.id === srcId);

        if (isSrcPlace) {
            arcs.push({ source: srcId, target: tgtId, type: 'place_to_transition', weight: weight });
        } else {
            arcs.push({ source: srcId, target: tgtId, type: 'transition_to_place', weight: weight });
        }
    }

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
