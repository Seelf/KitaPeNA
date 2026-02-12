
import { state, nodes, edges, camera } from './state.js';
import { draw } from './render.js';
import { updateStats } from './ui.js';
import { resetSimulation } from './simulation.js';

import { triggerAutoSave } from './tabs.js';

// --- LOCAL STORAGE ---
// --- LOCAL STORAGE ---
export function saveToLocalStorage() {
    const data = {
        nodes: nodes,
        edges: edges,
        camera: camera,
        // Extended State for Persistence
        appContext: state.appContext,
        troResult: state.troResult,
        misSteps: state.misSteps,
        // NEW: Save the entire graphs container
        graphs: state.graphs,
        activeActivityTab: state.activeActivityTab,
        activeDbTab: state.activeDbTab
    };
    localStorage.setItem('mis_autosave', JSON.stringify(data));

    // Also trigger full session save (Tabs)
    triggerAutoSave();
}

export function loadFromLocalStorage() {
    try {
        const dataStr = localStorage.getItem('mis_autosave');
        if (dataStr) {
            const data = JSON.parse(dataStr);
            console.log("Loading from storage...", data);

            // Restore Context & Results
            if (data.appContext) state.appContext = data.appContext;
            if (data.troResult) state.troResult = data.troResult;
            if (data.coloringResult) state.coloringResult = data.coloringResult;
            if (data.misSteps) state.misSteps = data.misSteps || [];
            if (data.activeActivityTab) state.activeActivityTab = data.activeActivityTab;
            if (data.activeDbTab) state.activeDbTab = data.activeDbTab;

            // Restore Graphs Container
            if (data.graphs) {
                state.graphs = data.graphs;
            } else {
                // Migration path: Try to recover from old keys if graphs not present
                if (data.misNodes) state.graphs.MIS = { nodes: data.misNodes || [], edges: data.misEdges || [] };
                if (data.concurrencyNodes) state.graphs.CONCURRENCY = { nodes: data.concurrencyNodes || [], edges: data.concurrencyEdges || [] };
            }

            // Restore Active Buffer (visuals)
            if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
                nodes.length = 0;
                nodes.push(...data.nodes);
                edges.length = 0;
                edges.push(...data.edges);

                if (data.camera) {
                    camera.x = data.camera.x || 0;
                    camera.y = data.camera.y || 0;
                    camera.zoom = data.camera.zoom || 1;
                }

                updateStats();
                console.log("Graph restored from localStorage. Context:", state.appContext);

                // If in concurrency mode, ensure UI updates
                if (state.appContext === 'CONCURRENCY') {
                    // We need to trigger the UI update in main.js or here
                    // But updateResultsList needs elements to be ready.
                    // It is safe to call it if elements are init.
                    if (elements.resultsList) {
                        import('./ui.js').then(ui => ui.updateResultsList());
                    }
                }
            }
        }
    } catch (e) {
        console.error("Failed to load autosave:", e);
    }
}

// --- GRAAFF (MIS) API ---

export async function loadSavedGraphs(listElement, loadCallback) {
    try {
        const response = await fetch('/api/graphs');
        const graphs = await response.json();

        listElement.innerHTML = '';
        if (graphs.length === 0) {
            listElement.innerHTML = '<div class="empty-msg">No saved graphs</div>';
            return;
        }

        graphs.forEach(g => {
            const item = document.createElement('div');
            item.className = 'saved-item';
            item.title = g.name; // Tooltip with full name
            // Simple row with name and delete button
            item.innerHTML = `
                <span class="name">${g.name}</span>
                <span class="date">${new Date(g.created_at).toLocaleString()}</span>
                <button class="btn-delete" title="Delete">×</button>
            `;

            // Click on name to load
            item.querySelector('.name').addEventListener('click', () => {
                if (loadCallback) loadCallback(g.id);
            });

            // Click on delete
            item.querySelector('.btn-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Delete graph "${g.name}"?`)) {
                    await deleteGraph(g.id);
                    loadSavedGraphs(listElement, loadCallback); // refresh
                }
            });

            listElement.appendChild(item);
        });

    } catch (e) {
        console.error("Error loading saved graphs:", e);
        listElement.innerHTML = '<div class="error-msg">Error loading data</div>';
    }
}

export async function loadGraphFromDb(id) {
    try {
        const response = await fetch(`/api/graphs/${id}`);
        if (!response.ok) throw new Error('Failed to fetch');

        const data = await response.json();
        const nodesData = JSON.parse(data.nodes);
        const edgesData = JSON.parse(data.edges);

        // Update State
        nodes.length = 0;
        edges.length = 0;
        nodesData.forEach(n => nodes.push(n));
        edgesData.forEach(e => edges.push(e));

        return true;
    } catch (e) {
        console.error("Error loading graph:", e);
        alert("Failed to load graph.");
        return false;
    }
}

export async function saveGraph(name) {
    if (!name) return;
    try {
        const response = await fetch('/api/graphs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                nodes: nodes,
                edges: edges
            })
        });
        const res = await response.json();
        if (res.status === 'success') {
            alert('Graph saved!');
            return true;
        } else {
            alert('Error saving: ' + res.error);
            return false;
        }
    } catch (e) {
        alert('Save failed: ' + e.message);
        return false;
    }
}

export async function deleteGraph(id, callback) {
    try {
        await fetch('/api/graphs/' + id, { method: 'DELETE' });
        if (callback) callback();
    } catch (e) {
        alert('Delete failed');
    }
}


// --- PETRI NET API ---

export async function loadSavedPetriNets(listElement, loadCallback) {
    if (!listElement) return;
    listElement.innerHTML = 'Loading...';
    try {
        const response = await fetch('/api/petri/saved');
        const nets = await response.json();

        listElement.innerHTML = '';
        if (nets.length === 0) {
            listElement.innerHTML = '<div class="empty-msg">No saved models</div>';
            return;
        }

        nets.forEach(n => {
            const item = document.createElement('div');
            item.className = 'saved-item';
            item.title = n.name; // Tooltip with full name
            item.innerHTML = `
                <span class="name">${n.name}</span>
                <span class="date">${new Date(n.created_at).toLocaleString()}</span>
                <button class="btn-delete" title="Delete">×</button>
            `;

            item.querySelector('.name').addEventListener('click', () => {
                if (loadCallback) loadCallback(n.id);
            });

            item.querySelector('.btn-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Delete Petri net "${n.name}"?`)) {
                    await deletePetriNet(n.id);
                    loadSavedPetriNets(listElement, loadCallback);
                }
            });

            listElement.appendChild(item);
        });
    } catch (e) {
        console.error("Error loading saved nets:", e);
        listElement.innerHTML = '<div class="error-msg">Error loading data</div>';
    }
}

export async function loadPetriNetFromDb(id) {
    try {
        const response = await fetch(`/api/petri/saved/${id}`);
        if (!response.ok) throw new Error('Failed to fetch');

        const data = await response.json();
        return {
            name: data.name,
            content: JSON.parse(data.content_json)
        };
    } catch (e) {
        console.error("Error loading Petri net:", e);
        alert("Failed to load model.");
        return null; // Return null on failure
    }
}

export async function savePetriNetDb(name, content) {
    try {
        const response = await fetch('/api/petri/saved', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                content: content
            })
        });

        const res = await response.json();
        if (res.status === 'success') {
            return true;
        } else {
            console.error(res);
            return false;
        }
    } catch (e) {
        console.error(e);
        alert("Failed to save model.");
        return false;
    }
}

async function deletePetriNet(id) {
    await fetch(`/api/petri/saved/${id}`, { method: 'DELETE' });
}

export async function importPetriBatch(files) {
    const formData = new FormData();
    let count = 0;
    for (let i = 0; i < files.length; i++) {
        if (files[i].name.toLowerCase().endsWith('.pnh')) {
            formData.append('files', files[i]);
            count++;
        }
    }

    if (count === 0) {
        return { status: 'error', message: 'No .pnh files found in selection' };
    }

    try {
        const response = await fetch('/api/petri/import_batch', {
            method: 'POST',
            body: formData
        });
        return await response.json();
    } catch (e) {
        console.error(e);
        return { status: 'error', message: 'Upload failed' };
    }
}
