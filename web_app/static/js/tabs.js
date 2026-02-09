import { state, nodes, edges, camera as misCamera } from './state.js';
import { petriState, places, transitions, arcs } from './petri_state.js';
import { draw } from './render.js';
import { drawPetri } from './petri_render.js';
import { updateStats } from './ui.js';

// Tab State
let tabs = [];
let activeTabId = null;
let nextTabId = 1;

let contextSwitcher = null; // Callback

const tabBar = document.getElementById('editorTabBar');
let autoSaveTimer = null;

export function initTabs(switchContextCallback) {
    contextSwitcher = switchContextCallback;

    // Try to restore session
    if (!restoreSession()) {
        // Create initial default tab only if restore failed
        createNewTab('PETRI');
    } else {
        // If restored, ensure UI is updated for the active tab
        if (activeTabId) {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                activateTab(tab.id); // This will trigger restoreStateFromTab and switchContext
            }
        }
    }
}

export function createNewTab(type = 'PETRI', name = null, content = null) {
    const id = `tab_${nextTabId++}`;
    const title = name || `Untitled-${nextTabId - 1}`;

    // Initial Data
    let data = {};
    if (type === 'MIS') {
        data = content || { nodes: [], edges: [], camera: { x: 0, y: 0, zoom: 1 } };
    } else {
        data = content || { places: [], transitions: [], arcs: [], nextPlaceId: 1, nextTransitionId: 1 };
    }

    const tab = {
        id: id,
        title: title,
        type: type,
        data: data,
        isDirty: false
    };

    tabs.push(tab);
    renderTabBar();
    activateTab(id);
    saveSession(); // Save after creating
    return id;
}

export function activateTab(id) {
    if (activeTabId === id) return;

    // Stop any pending auto-saves from previous tab context
    cancelAutoSave();

    // 1. Save current state to the active tab (if it exists)
    if (activeTabId) {
        saveCurrentStateToTab(activeTabId);
    }

    // 2. Set new active
    activeTabId = id;
    state.activeTabId = id; // Set global guard
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    // 3. Restore state from new tab
    restoreStateFromTab(tab);

    // 4. Update UI
    renderTabBar();

    // Switch context (Mode)
    if (contextSwitcher) {
        // Prefer saved context (e.g. if we were viewing Reachability Graph in a Petri tab)
        // Fallback to tab.type (e.g. Petri for Petri tab)
        const targetContext = tab.data.activeContext || tab.type;
        // Pass TRUE to skip saving the old buffer (which belongs to the PREVIOUS file)
        contextSwitcher(targetContext, true);
    }

    saveSession(); // Save after activation
}

export function closeTab(id, event) {
    if (event) event.stopPropagation();

    // Confirm if dirty? (Skip for now for simplicity)

    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    tabs.splice(index, 1);

    if (activeTabId === id) {
        // Switch to another tab
        if (tabs.length > 0) {
            activateTab(tabs[tabs.length - 1].id);
        } else {
            // No tabs left? Create default
            activeTabId = null; // reset so createNewTab doesn't try to save
            createNewTab('PETRI');
        }
    } else {
        renderTabBar();
        saveSession(); // Save after closing (if not switched, needed here)
    }
}

function saveCurrentStateToTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Use JSON parse/stringify for Deep Copy to ensure total isolation of tab states
    if (tab.type === 'MIS') {
        const stateDump = {
            // NEW: Save entire graphs container
            graphs: state.graphs,
            camera: misCamera,
            activeContext: state.appContext,
            // Results
            troResult: state.troResult,
            coloringResult: state.coloringResult
        };
        tab.data = JSON.parse(JSON.stringify(stateDump));
    } else {
        // Sync main camera to the appropriate context camera before saving
        if (state.appContext === 'PETRI') {
            state.petriCamera.x = misCamera.x;
            state.petriCamera.y = misCamera.y;
            state.petriCamera.zoom = misCamera.zoom;
        } else if (state.appContext === 'MIS') {
            state.misCamera.x = misCamera.x;
            state.misCamera.y = misCamera.y;
            state.misCamera.zoom = misCamera.zoom;
        } else if (state.appContext === 'CONCURRENCY') {
            state.concurrencyCamera.x = misCamera.x;
            state.concurrencyCamera.y = misCamera.y;
            state.concurrencyCamera.zoom = misCamera.zoom;
        }

        // Before saving, ensure global nodes BUFFER is synced to specific storage if dirty/active
        if (state.appContext === 'MIS') {
            console.log(`[TABS] Saving MIS Buffer to Storage. Nodes: ${nodes.length}`);
            state.graphs.MIS.nodes = JSON.parse(JSON.stringify(nodes));
            state.graphs.MIS.edges = JSON.parse(JSON.stringify(edges));
        } else if (state.appContext === 'CONCURRENCY') {
            console.log(`[TABS] Saving Concurrency Buffer to Storage. Nodes: ${nodes.length}`);
            state.graphs.CONCURRENCY.nodes = JSON.parse(JSON.stringify(nodes));
            state.graphs.CONCURRENCY.edges = JSON.parse(JSON.stringify(edges));
        }

        const stateDump = {
            places: places,
            transitions: transitions,
            arcs: arcs,
            nextPlaceId: petriState.nextPlaceId,
            nextTransitionId: petriState.nextTransitionId,
            camera: state.petriCamera,
            activeContext: state.appContext,

            // START REACHABILITY PERSISTENCE (ISOLATED)
            // NEW: Save entire graphs container
            graphs: state.graphs,

            misSteps: state.misSteps,
            isGenerated: state.isGenerated,
            graphTruncated: state.graphTruncated,
            maxReachabilityStates: state.maxReachabilityStates,
            misCamera: state.misCamera,
            concurrencyCamera: state.concurrencyCamera,

            // Results persistence
            troResult: state.troResult,
            coloringResult: state.coloringResult
            // END REACHABILITY PERSISTENCE
        };
        tab.data = JSON.parse(JSON.stringify(stateDump));
    }
}

function restoreStateFromTab(tab) {
    // CRITICAL: WIPE GLOBAL BUFFERS IMMEDIATELY
    // This prevents any stale data from previous tab from lingering
    nodes.length = 0;
    edges.length = 0;

    // Reset Global State Defaults first
    state.troResult = null;
    state.coloringResult = null;

    // Explicitly reset graphs to avoid leaking if tab data is missing
    state.graphs = {
        MIS: { nodes: [], edges: [] },
        CONCURRENCY: { nodes: [], edges: [] }
    };

    if (tab.type === 'MIS') {
        // Restore Graphs
        if (tab.data.graphs) {
            state.graphs = tab.data.graphs;
        } else {
            // Legacy Fallback
            if (tab.data.misNodes) state.graphs.MIS.nodes = tab.data.misNodes;
            if (tab.data.misEdges) state.graphs.MIS.edges = tab.data.misEdges;
        }

        if (tab.data.camera) {
            misCamera.x = tab.data.camera.x;
            misCamera.y = tab.data.camera.y;
            misCamera.zoom = tab.data.camera.zoom;
        }

        // Restore Results
        if (tab.data.troResult) state.troResult = tab.data.troResult;
        if (tab.data.coloringResult) state.coloringResult = tab.data.coloringResult;

    } else {
        places.length = 0;
        transitions.length = 0;
        arcs.length = 0;
        if (tab.data.places) tab.data.places.forEach(p => places.push(p));
        if (tab.data.transitions) tab.data.transitions.forEach(t => transitions.push(t));
        if (tab.data.arcs) tab.data.arcs.forEach(a => arcs.push(a));

        // Dynamically calculate next IDs
        const maxPlaceId = places.reduce((max, p) => Math.max(max, p.id), -1);
        const maxTransId = transitions.reduce((max, t) => Math.max(max, t.id), -1);

        petriState.nextPlaceId = (tab.data.nextPlaceId !== undefined) ? tab.data.nextPlaceId : (maxPlaceId + 1);
        petriState.nextTransitionId = (tab.data.nextTransitionId !== undefined) ? tab.data.nextTransitionId : (maxTransId + 1);

        // RESTORE ISOLATED DATA
        // DEEP COPY to ensure working state does not reference tab storage directly
        if (tab.data.graphs) {
            console.log(`[TABS] Restoring Graphs from Data. MIS Nodes: ${tab.data.graphs.MIS?.nodes?.length}, CONCURRENCY Nodes: ${tab.data.graphs.CONCURRENCY?.nodes?.length}`);
            state.graphs = JSON.parse(JSON.stringify(tab.data.graphs));
            console.log(`[TABS] State.graphs restored. MIS Nodes: ${state.graphs.MIS.nodes.length}`);
        } else {
            console.log("[TABS] No graphs in tab data. creating fresh structure.");
            // Legacy Migration (create fresh structure)
            state.graphs = {
                MIS: { nodes: [], edges: [] },
                CONCURRENCY: { nodes: [], edges: [] }
            };

            if (tab.data.misData) {
                state.graphs.MIS.nodes = JSON.parse(JSON.stringify(tab.data.misData.nodes || []));
                state.graphs.MIS.edges = JSON.parse(JSON.stringify(tab.data.misData.edges || []));
            }
            if (tab.data.concurrencyData) {
                state.graphs.CONCURRENCY.nodes = JSON.parse(JSON.stringify(tab.data.concurrencyData.nodes || []));
                state.graphs.CONCURRENCY.edges = JSON.parse(JSON.stringify(tab.data.concurrencyData.edges || []));
            }
        }

        state.misSteps = tab.data.misSteps || [];
        state.isGenerated = tab.data.isGenerated || false;
        state.graphTruncated = tab.data.graphTruncated || false;
        state.maxReachabilityStates = tab.data.maxReachabilityStates || 1000;

        // Restore Results
        if (tab.data.troResult) state.troResult = tab.data.troResult;
        if (tab.data.coloringResult) state.coloringResult = tab.data.coloringResult;

        // Update input if exists
        const inputMax = document.getElementById('inputMaxStates');
        if (inputMax) inputMax.value = state.maxReachabilityStates;

        // Restore all context cameras
        if (tab.data.camera) {
            state.petriCamera.x = tab.data.camera.x || 0;
            state.petriCamera.y = tab.data.camera.y || 0;
            state.petriCamera.zoom = tab.data.camera.zoom || 1;
        }

        if (tab.data.misCamera) {
            state.misCamera.x = tab.data.misCamera.x || 0;
            state.misCamera.y = tab.data.misCamera.y || 0;
            state.misCamera.zoom = tab.data.misCamera.zoom || 1;
        }

        if (tab.data.concurrencyCamera) {
            state.concurrencyCamera.x = tab.data.concurrencyCamera.x || 0;
            state.concurrencyCamera.y = tab.data.concurrencyCamera.y || 0;
            state.concurrencyCamera.zoom = tab.data.concurrencyCamera.zoom || 1;
        }
    }

    // Force stop simulation on reload
    state.isPlaying = false;
    state.currentStepIndex = -1;

    // Trigger results update (needs to happen after we return, handled by activateTab -> switchContext -> updateResultsList)
}

function renderTabBar() {
    if (!tabBar) return;
    tabBar.innerHTML = '';

    tabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = `editor-tab ${tab.id === activeTabId ? 'active' : ''}`;
        el.innerHTML = `
            <span class="icon">${tab.type === 'MIS' ? '🕸️' : '🧬'}</span>
            <span class="title">${tab.title}</span>
            <span class="close">×</span>
        `;

        el.addEventListener('click', () => activateTab(tab.id));
        el.querySelector('.close').addEventListener('click', (e) => closeTab(tab.id, e));

        tabBar.appendChild(el);
    });

    // Add "+" Button
    const addBtn = document.createElement('div');
    addBtn.className = 'editor-tab-add';
    addBtn.innerHTML = '+';
    addBtn.title = 'New Tab';
    addBtn.addEventListener('click', () => {
        // Simple heuristic: if last was MIS, create MIS, else Petri
        // Or just prompt/default. Let's default to PETRI as this is the focus.
        createNewTab('PETRI');
    });
    tabBar.appendChild(addBtn);
}

export function renameActiveTab(newName) {
    if (!activeTabId) return;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        tab.title = newName;
        renderTabBar();
        saveSession();
    }
}

// --- PERSISTENCE ---

function saveSession() {
    // 1. Sync current global state to the active tab object
    if (activeTabId) {
        saveCurrentStateToTab(activeTabId);
    }

    // 2. Serialize
    const sessionData = {
        tabs: tabs,
        activeTabId: activeTabId,
        nextTabId: nextTabId
    };

    try {
        localStorage.setItem('editor_session', JSON.stringify(sessionData));
        // Also save text timestamps or other metadata if needed
    } catch (e) {
        console.error("Failed to save session:", e);
    }
}

function restoreSession() {
    try {
        const str = localStorage.getItem('editor_session');
        if (!str) return false;

        const sessionData = JSON.parse(str);
        if (!sessionData.tabs || !Array.isArray(sessionData.tabs)) return false;

        tabs = sessionData.tabs;
        nextTabId = sessionData.nextTabId || (tabs.length + 1);

        // Restore Active Tab
        const targetId = sessionData.activeTabId;

        if (targetId && tabs.find(t => t.id === targetId)) {
            activeTabId = targetId;
        } else if (tabs.length > 0) {
            activeTabId = tabs[0].id;
        }

        renderTabBar();

        if (activeTabId) {
            const tab = tabs.find(t => t.id === activeTabId);
            restoreStateFromTab(tab);
            if (contextSwitcher) {
                const targetContext = tab.data.activeContext || tab.type;
                contextSwitcher(targetContext);
            }
        }

        return true;
    } catch (e) {
        console.error("Failed to restore session:", e);
        return false;
    }
}

// Hook saveSession into state modifiers
// We need to export a way to force save when content changes (autosave)
export function cancelAutoSave() {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
}

export function triggerAutoSave() {
    cancelAutoSave();
    autoSaveTimer = setTimeout(() => {
        if (activeTabId) saveCurrentStateToTab(activeTabId);
        saveSession();
    }, 1000);
}
