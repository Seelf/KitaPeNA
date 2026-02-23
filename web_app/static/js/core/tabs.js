import { state, nodes, edges, camera as misCamera } from './state.js';
import { petriState, places, transitions, arcs } from '../domain/petri/petri_state.js';
import { draw } from '../engine/rendering/render.js';
import { drawPetri } from '../engine/rendering/petri_render.js';
import { updateStats } from '../ui/ui.js';

// Tab State
let tabs = [];
let activeTabId = null;
let nextTabId = 1;

let contextSwitcher = null;

const tabBar = document.getElementById('editorTabBar');
let autoSaveTimer = null;

export function initTabs(switchContextCallback) {
    contextSwitcher = switchContextCallback;

    // Try to restore session
    if (!restoreSession()) {
        createNewTab('PETRI');
    }
    // restoreSession already calls contextSwitcher and renderTabBar;
    // no need to call activateTab again here (it would return early anyway).
}

export function createNewTab(type = 'PETRI', name = null, content = null) {
    const id = `tab_${nextTabId++}`;
    const defaultName = type === 'MIS' ? 'Graph' : 'Petri Net';
    const title = name || defaultName;

    // Initial Data
    let data = {};
    if (type === 'MIS') {
        const initNodes = content && content.nodes ? JSON.parse(JSON.stringify(content.nodes)) : [];
        const initEdges = content && content.edges ? JSON.parse(JSON.stringify(content.edges)) : [];
        data = {
            graphs: {
                MIS: { nodes: initNodes, edges: initEdges },
                CONCURRENCY: { nodes: [], edges: [] }
            },
            camera: { x: 0, y: 0, zoom: 1 }
        };
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
    saveSession();
    return id;
}

export function getTabs() {
    return tabs;
}

export function getActiveTab() {
    return tabs.find(t => t.id === activeTabId);
}

export function activateTab(id) {
    if (activeTabId === id) return;

    cancelAutoSave();

    // 1. Save current state
    if (activeTabId) {
        saveCurrentStateToTab(activeTabId);
    }

    // 2. Set new active
    activeTabId = id;
    state.activeTabId = id;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    // 3. Restore state
    restoreStateFromTab(tab);
    state.activeDocumentType = tab.type;

    // 4. Update UI
    renderTabBar();

    // Switch context
    if (contextSwitcher) {
        const targetContext = tab.data.activeContext || tab.type;
        contextSwitcher(targetContext, true);
    }

    saveSession();
}

export function closeTab(id, event) {
    if (event) event.stopPropagation();

    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    tabs.splice(index, 1);

    if (activeTabId === id) {
        if (tabs.length > 0) {
            activateTab(tabs[tabs.length - 1].id);
        } else {
            activeTabId = null;
            createNewTab('PETRI');
        }
    } else {
        renderTabBar();
        saveSession();
    }
}

function saveCurrentStateToTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Use JSON parse/stringify for Deep Copy
    if (tab.type === 'MIS') {
        const stateDump = {
            graphs: state.graphs,
            camera: misCamera,
            activeContext: state.appContext,
            troResult: state.troResult,
            coloringResult: state.coloringResult
        };
        tab.data = JSON.parse(JSON.stringify(stateDump));
    } else {
        // Sync cameras
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

        // Sync buffer to storage
        if (state.appContext === 'MIS') {
            state.graphs.MIS.nodes = JSON.parse(JSON.stringify(nodes));
            state.graphs.MIS.edges = JSON.parse(JSON.stringify(edges));
        } else if (state.appContext === 'CONCURRENCY') {
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

            graphs: state.graphs,

            misSteps: state.misSteps,
            isGenerated: state.isGenerated,
            graphTruncated: state.graphTruncated,
            maxReachabilityStates: state.maxReachabilityStates,
            misCamera: state.misCamera,
            concurrencyCamera: state.concurrencyCamera,

            troResult: state.troResult,
            coloringResult: state.coloringResult
        };
        tab.data = JSON.parse(JSON.stringify(stateDump));
    }
}

function restoreStateFromTab(tab) {
    // Clear global buffers
    nodes.length = 0;
    edges.length = 0;

    // Reset Defaults
    state.troResult = null;
    state.coloringResult = null;

    // Reset graphs container
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

        if (tab.data.troResult) state.troResult = tab.data.troResult;
        if (tab.data.coloringResult) state.coloringResult = tab.data.coloringResult;

        // CRITICAL: push restored graph data to global buffers
        if (state.graphs && state.graphs.MIS) {
            state.graphs.MIS.nodes.forEach(n => nodes.push(n));
            state.graphs.MIS.edges.forEach(e => edges.push(e));
        }

    } else {
        places.length = 0;
        transitions.length = 0;
        arcs.length = 0;
        if (tab.data.places) tab.data.places.forEach(p => places.push(p));
        if (tab.data.transitions) tab.data.transitions.forEach(t => transitions.push(t));
        if (tab.data.arcs) tab.data.arcs.forEach(a => arcs.push(a));

        const maxPlaceId = places.reduce((max, p) => Math.max(max, p.id), -1);
        const maxTransId = transitions.reduce((max, t) => Math.max(max, t.id), -1);

        petriState.nextPlaceId = (tab.data.nextPlaceId !== undefined) ? tab.data.nextPlaceId : (maxPlaceId + 1);
        petriState.nextTransitionId = (tab.data.nextTransitionId !== undefined) ? tab.data.nextTransitionId : (maxTransId + 1);

        // Restore Graphs
        if (tab.data.graphs) {
            state.graphs = JSON.parse(JSON.stringify(tab.data.graphs));
        } else {
            // Legacy Migration
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

        if (tab.data.troResult) state.troResult = tab.data.troResult;
        if (tab.data.coloringResult) state.coloringResult = tab.data.coloringResult;

        const inputMax = document.getElementById('inputMaxStates');
        if (inputMax) inputMax.value = state.maxReachabilityStates;

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

    state.isPlaying = false;
    state.currentStepIndex = -1;
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
    // Single Add Button with Dropdown
    const addContainer = document.createElement('div');
    addContainer.style.position = 'relative';
    addContainer.style.display = 'inline-block';

    const addBtn = document.createElement('div');
    addBtn.className = 'editor-tab-add';
    addBtn.innerHTML = '+';
    addBtn.title = 'New File';

    const dropdown = document.createElement('div');
    dropdown.style.display = 'none';
    dropdown.style.position = 'absolute';
    dropdown.style.top = '100%';
    dropdown.style.left = '0';
    dropdown.style.backgroundColor = '#2d2d2d';
    dropdown.style.border = '1px solid #444';
    dropdown.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    dropdown.style.zIndex = '99999';
    dropdown.style.minWidth = '140px';
    dropdown.style.padding = '5px 0';
    dropdown.style.marginTop = '2px';

    const optPetri = document.createElement('div');
    optPetri.innerHTML = '🧬 Petri Net';
    optPetri.style.padding = '8px 15px';
    optPetri.style.cursor = 'pointer';
    optPetri.style.color = '#ccc';
    optPetri.style.fontSize = '12px';
    optPetri.onmouseover = () => optPetri.style.backgroundColor = '#444';
    optPetri.onmouseout = () => optPetri.style.backgroundColor = 'transparent';
    optPetri.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = 'none';
        createNewTab('PETRI');
    });

    const optGraph = document.createElement('div');
    optGraph.innerHTML = '🕸️ Graph';
    optGraph.style.padding = '8px 15px';
    optGraph.style.cursor = 'pointer';
    optGraph.style.color = '#ccc';
    optGraph.style.fontSize = '12px';
    optGraph.onmouseover = () => optGraph.style.backgroundColor = '#444';
    optGraph.onmouseout = () => optGraph.style.backgroundColor = 'transparent';
    optGraph.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = 'none';
        createNewTab('MIS');
    });

    dropdown.appendChild(optPetri);
    dropdown.appendChild(optGraph);

    // Append to body to avoid overflow clipping from the tabs bar
    document.body.appendChild(dropdown);

    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.style.display === 'none') {
            const rect = addBtn.getBoundingClientRect();
            dropdown.style.left = rect.left + 'px';
            dropdown.style.top = rect.bottom + 'px';
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    }, { once: false });

    addContainer.appendChild(addBtn);
    tabBar.appendChild(addContainer);
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

// --- Persistence ---

function saveSession() {
    if (activeTabId) {
        saveCurrentStateToTab(activeTabId);
    }

    const sessionData = {
        tabs: tabs,
        activeTabId: activeTabId,
        nextTabId: nextTabId
    };

    try {
        localStorage.setItem('editor_session', JSON.stringify(sessionData));
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
            state.activeDocumentType = tab.type;
            if (contextSwitcher) {
                const targetContext = tab.data?.activeContext || tab.type;
                // skipSave=true prevents overwriting the just-restored nodes with an empty buffer
                contextSwitcher(targetContext, true);
            }
        }

        return true;
    } catch (e) {
        console.error("Failed to restore session:", e);
        return false;
    }
}

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
