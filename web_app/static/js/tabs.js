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

    // 1. Save current state to the active tab (if it exists)
    if (activeTabId) {
        saveCurrentStateToTab(activeTabId);
    }

    // 2. Set new active
    activeTabId = id;
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
        contextSwitcher(targetContext);
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
    // This prevents shared object references (e.g. modifying a node in Tab A changing it in Tab B if they were cloned)
    if (tab.type === 'MIS') {
        const stateDump = {
            nodes: nodes,
            edges: edges,
            camera: misCamera,
            activeContext: state.appContext
        };
        tab.data = JSON.parse(JSON.stringify(stateDump));
    } else {
        console.log("Saving Petri Tab. MIS Steps:", state.misSteps.length);
        const stateDump = {
            places: places,
            transitions: transitions,
            arcs: arcs,
            nextPlaceId: petriState.nextPlaceId,
            nextTransitionId: petriState.nextTransitionId,
            camera: state.petriCamera,
            activeContext: state.appContext,
            // START REACHABILITY PERSISTENCE
            nodes: nodes,
            edges: edges,
            misSteps: state.misSteps,
            isGenerated: state.isGenerated,
            graphTruncated: state.graphTruncated,
            misCamera: state.misCamera
            // END REACHABILITY PERSISTENCE
        };
        tab.data = JSON.parse(JSON.stringify(stateDump));
    }
}

function restoreStateFromTab(tab) {
    if (tab.type === 'MIS') {
        nodes.length = 0;
        edges.length = 0;
        if (tab.data.nodes) tab.data.nodes.forEach(n => nodes.push(n));
        if (tab.data.edges) tab.data.edges.forEach(e => edges.push(e));

        if (tab.data.camera) {
            misCamera.x = tab.data.camera.x;
            misCamera.y = tab.data.camera.y;
            misCamera.zoom = tab.data.camera.zoom;
        }

    } else {
        places.length = 0;
        transitions.length = 0;
        arcs.length = 0;
        if (tab.data.places) tab.data.places.forEach(p => places.push(p));
        if (tab.data.transitions) tab.data.transitions.forEach(t => transitions.push(t));
        if (tab.data.arcs) tab.data.arcs.forEach(a => arcs.push(a));

        // Dynamically calculate next IDs if not present explicitly (safe for imported files)
        const maxPlaceId = places.reduce((max, p) => Math.max(max, p.id), -1);
        const maxTransId = transitions.reduce((max, t) => Math.max(max, t.id), -1);

        petriState.nextPlaceId = (tab.data.nextPlaceId !== undefined) ? tab.data.nextPlaceId : (maxPlaceId + 1);
        petriState.nextTransitionId = (tab.data.nextTransitionId !== undefined) ? tab.data.nextTransitionId : (maxTransId + 1);

        // Clear previous Reachability Graph state BEFORE restoring
        nodes.length = 0;
        edges.length = 0;

        if (tab.data.nodes) {
            const seenIds = new Set();
            tab.data.nodes.forEach(n => {
                if (!seenIds.has(n.id)) {
                    nodes.push(n);
                    seenIds.add(n.id);
                }
            });
        }
        if (tab.data.edges) {
            const seenEdges = new Set();
            tab.data.edges.forEach(e => {
                let key;
                if (Array.isArray(e)) {
                    // ID format: [source, target, label]
                    // Label can be a string or object {label: "t1"}
                    const rawLabel = e[2];
                    const labelStr = (rawLabel && typeof rawLabel === 'object' && rawLabel.label) ? rawLabel.label : String(rawLabel || '');
                    key = `${e[0]}-${e[1]}-${labelStr}`;
                } else {
                    key = `${e.source}-${e.target}-${e.label || ''}`;
                }

                if (!seenEdges.has(key)) {
                    edges.push(e);
                    seenEdges.add(key);
                }
            });
        }

        state.misSteps = tab.data.misSteps || [];
        state.isGenerated = tab.data.isGenerated || false;
        state.graphTruncated = tab.data.graphTruncated || false;

        // Restore MIS Camera if saved
        if (tab.data.misCamera) {
            state.misCamera.x = tab.data.misCamera.x;
            state.misCamera.y = tab.data.misCamera.y;
            state.misCamera.zoom = tab.data.misCamera.zoom;
        }

        // Force stop simulation on reload
        state.isPlaying = false;
        state.currentStepIndex = -1; // Reset step index or keep it? 
        // User said "stop simulation", maybe they want to restart cleanly?
        // But if we have results, maybe we want to see them?
        // Let's keep results but stop playing.

        // We need to trigger UI updates for results list
        // We can't import updateResultsList here easily because circular deps?
        // tabs.js imports updateStats loop...
        // We'll rely on the main loop or call an update function on main?
        // Let's rely on activateTab calling render/updateStats eventually?
        // activateTab calls renderTabBar and switchContext.
        // switchContext updates UI.
        // END REACHABILITY RESTORE
    }
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
export function triggerAutoSave() {
    saveSession();
}
