/**
 * explorer_actions.js — CRUD operations, selection management, bulk actions.
 */

import { getCsrfToken, selectedNetIds, allLoadedNets, dbViewSelect, showCustomModal, updateStats } from './explorer_shared.js';
import { downloadFile } from './explorer_converters.js';
import { loadDatabaseItems, closeExplorer } from './explorer_init.js';

export function updateBulkDeleteButton() {
    const btn = document.getElementById('btnDbDeleteSelected');
    const countSpan = document.getElementById('dbSelectedCount');
    const bulkBtn = document.getElementById('btnDbBulkMenu');
    if (!btn || !countSpan) return;

    const count = selectedNetIds.size;
    countSpan.textContent = count;
    btn.style.display = count > 0 ? 'flex' : 'none';

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

export function toggleSelectAll() {
    if (selectedNetIds.size === allLoadedNets.length && allLoadedNets.length > 0) {
        selectedNetIds.clear();
    } else {
        allLoadedNets.forEach(net => selectedNetIds.add(net.id));
    }

    document.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.checked = selectedNetIds.has(parseInt(cb.dataset.id));
        cb.closest('.net-card').classList.toggle('selected', cb.checked);
    });
    updateBulkDeleteButton();
}

export function clearSelection() {
    selectedNetIds.clear();
    document.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.checked = false;
        cb.closest('.net-card').classList.remove('selected');
    });
    updateBulkDeleteButton();
}

export function selectDuplicates() {
    const seen = new Map();
    const dupes = [];

    allLoadedNets.forEach(net => {
        const stats = net.stats || {};
        const key = `${net.name}|${stats.places || 0}|${stats.transitions || 0}|${stats.arcs || 0}|${stats.tokens || 0}`;
        if (seen.has(key)) {
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

    document.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.checked = selectedNetIds.has(parseInt(cb.dataset.id));
        cb.closest('.net-card').classList.toggle('selected', cb.checked);
    });
    updateBulkDeleteButton();
    showCustomModal("Duplicates", `Identified and selected ${dupes.length} duplicates.`);
}

export async function deleteSelectedNets() {
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

export async function bulkExport(format) {
    const ids = Array.from(selectedNetIds);
    if (ids.length === 0) return;

    const viewMode = dbViewSelect ? dbViewSelect.value : 'petri';
    const baseUrl = viewMode === 'petri' ? '/api/petri/download' : '/api/graphs/download';

    for (let i = 0; i < ids.length; i++) {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = `${baseUrl}/${format}/${ids[i]}`;
            link.download = '';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, i * 300);
    }
}

export async function handleAction(netMetadata, action) {
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

export async function handleGraphAction(graph, action) {
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

export function loadNetToEditor(netMetadata) {
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

export function loadGraphToEditor(graphMetadata) {
    async function doLoad() {
        try {
            const res = await fetch(`/api/graphs/${graphMetadata.id}`);
            if (!res.ok) throw new Error("Fetch failed");
            const graphData = await res.json();

            let nodes = typeof graphData.nodes === 'string' ? JSON.parse(graphData.nodes) : graphData.nodes;
            let edges = typeof graphData.edges === 'string' ? JSON.parse(graphData.edges) : graphData.edges;
            let isDirected = !!graphData.is_directed;

            import('../../core/tabs.js').then(tabs => {
                tabs.createNewTab('MIS', graphData.name, { nodes, edges });

                import('../../core/state.js').then(({ state }) => {
                    state.isDirected = isDirected;
                    const btnToggleDirected = document.getElementById('btnToggleDirected');
                    if (btnToggleDirected) {
                        btnToggleDirected.style.background = state.isDirected ? '#444' : 'transparent';
                        btnToggleDirected.style.border = state.isDirected ? '1px solid #666' : '1px solid transparent';
                    }
                });

                const tabEditor = document.getElementById('tabEditor');
                if (tabEditor) tabEditor.click();

                setTimeout(() => {
                    const allZero = nodes.every(n => n.x === 0 && n.y === 0);
                    if (allZero && nodes.length > 0) {
                        document.getElementById('btnGraphLayout')?.click();
                    } else {
                        import('../../engine/rendering/render.js').then(r => r.draw());
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

export async function updateNetClass(netMetadata, newClass) {
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
