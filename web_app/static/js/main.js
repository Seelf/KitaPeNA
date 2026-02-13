// Author: Dawid Konarczak

console.log("Main.js module loading...");
import { initElements, state, nodes, edges, camera } from './state.js';
import { draw, resizeCanvas } from './render.js';
import { initInteractions, deleteSelectedNode } from './interactions.js';
import { initAdminConsole } from './admin.js';
import { updateStats, setMode, updateResultsList, updateButtonStates, updateReadOnlyUI, initViewSettings } from './ui.js';
import { saveToLocalStorage, loadFromLocalStorage, loadSavedGraphs, saveGraph, loadGraphFromDb, loadSavedPetriNets, loadPetriNetFromDb, savePetriNetDb, importPetriBatch } from './storage.js';
import { fetchSolution, advanceStep, startAutoPlay, stopAutoPlay, resetSimulation, highlightResultItem, updateSimulationSpeed } from './simulation.js';
import { drawPetri } from './petri_render.js';
import { petriState, places, transitions, arcs } from './petri_state.js';
import { initPetriInteractions, runAutoLayout } from './petri_interactions.js';
import { initTabs, triggerAutoSave } from './tabs.js';
import { initBenchmarking } from './benchmarking.js';
import { initAlgoManager } from './algo_manager.js';
import { initDatabaseExplorer, openDatabaseExplorer, closeExplorer } from './database_explorer.js';

console.log("App Initializing (Direct execution)...");


// 1. Init DOM Elements
initElements();
initViewSettings(); // Load view preferences

// 2. Init Interactions
initInteractions();
initPetriInteractions();

// 3. Load State & Restore UI
loadFromLocalStorage();

// RESTORE UI TAB STATE
// If context was restored as CONCURRENCY or PETRI, we must visualy select that tab
// and hide/show appropriate elements.
if (state.appContext === 'CONCURRENCY') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector('[data-tab="concurrency"]');
    if (btn) btn.classList.add('active');

    // Ensure sidebar is in view mode or appropriate state
    updateResultsList();
} else if (state.appContext === 'PETRI') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector('[data-tab="petri"]');
    if (btn) btn.classList.add('active');
}

// Force draw after restore
resizeCanvas();
window.requestAnimationFrame(draw);
initAdminConsole();

// --- CONTEXT SWITCHING ---
const tabContextGraph = document.getElementById('tabContextGraph');
const tabContextConcurrency = document.getElementById('tabContextConcurrency');
const tabContextPetri = document.getElementById('tabContextPetri');
const toolbarGraph = document.getElementById('toolbarGraph');
const toolbarPetri = document.getElementById('toolbarPetri');

// Moved from below to avoid ReferenceError
const tabEditor = document.getElementById('tabEditor');
const viewResults = document.getElementById('viewResults');
const tabDb = document.getElementById('tabDb');
const tabPerformance = document.getElementById('tabPerformance');
// dbContentPetri and dbContentGraphs removed (now handled by database_explorer.js)
const viewPerformance = document.getElementById('viewPerformance');
const mainEditorArea = document.getElementById('mainEditorArea');

// 3. Init Tabs (Pass switchContext callback)
// 3. Init Tabs (Moved to end)
// initTabs called at the end


function switchContext(ctx, skipSave = false) {
    // Guard: Do not allow switching if we are likely in a background update loop (this is a heuristic, but debugging helper)
    // Actually, switchContext should only be called by user interaction.

    // 1. SAVE BUFFER: Save active rendering buffer (nodes/edges) to CURRENT context storage
    // using deep copy to detach from buffer.
    // skipped if skipSave is true (e.g. when switching files, because the buffer belongs to the OLD file)
    if (!skipSave) {
        if (state.appContext === 'MIS') {
            state.misCamera = { ...camera };
            state.graphs.MIS.nodes = JSON.parse(JSON.stringify(nodes));
            state.graphs.MIS.edges = JSON.parse(JSON.stringify(edges));
        } else if (state.appContext === 'PETRI') {
            state.petriCamera = { ...camera };
            // Petri uses places/transitions/arcs, not nodes/edges.
        } else if (state.appContext === 'CONCURRENCY') {
            state.concurrencyCamera = { ...camera };
            state.graphs.CONCURRENCY.nodes = JSON.parse(JSON.stringify(nodes));
            state.graphs.CONCURRENCY.edges = JSON.parse(JSON.stringify(edges));
        }
    } else {
        console.log(`[MAIN] switchContext: Skipping save of buffer (File Switch detected). Target: ${ctx}`);
    }

    // 2. UPDATE CONTEXT
    state.appContext = ctx;

    // 3. RESTORE CAMERA
    const sourceCam = (ctx === 'MIS') ? state.misCamera : (ctx === 'PETRI' ? state.petriCamera : state.concurrencyCamera);
    if (sourceCam) {
        camera.x = sourceCam.x;
        camera.y = sourceCam.y;
        camera.zoom = sourceCam.zoom;
    } else if (ctx === 'CONCURRENCY') {
        camera.x = 0; camera.y = 0; camera.zoom = 1;
    }

    try {
        // Reset active classes
        if (tabContextGraph) tabContextGraph.classList.remove('active');
        if (tabContextPetri) tabContextPetri.classList.remove('active');
        if (tabContextConcurrency) tabContextConcurrency.classList.remove('active');

        // Hide all specific toolbars first
        if (toolbarGraph) toolbarGraph.style.display = 'none';
        if (toolbarPetri) toolbarPetri.style.display = 'none';

        // 4. LOAD BUFFER: Populate rendering buffer from NEW context storage
        if (ctx === 'MIS') {
            if (tabContextGraph) tabContextGraph.classList.add('active');
            if (toolbarGraph) toolbarGraph.style.display = 'flex';

            // Hide Concurrency-specific buttons
            const btnCheckTransitive = document.getElementById('btnCheckTransitive');
            const concurrencySeparator = document.getElementById('concurrencySeparator');
            if (btnCheckTransitive) btnCheckTransitive.style.display = 'none';
            if (concurrencySeparator) concurrencySeparator.style.display = 'none';

            // RESTORE DATA
            nodes.length = 0;
            edges.length = 0;

            if (state.graphs.MIS.nodes.length > 0) {
                state.graphs.MIS.nodes.forEach(n => nodes.push(n));
                state.graphs.MIS.edges.forEach(e => edges.push(e));
                console.log("Restored MIS Nodes:", nodes.length);
            }

            draw();
            updateStats();
            // Enforce Read Only Mode if Generated
            import('./ui.js').then(ui => ui.updateReadOnlyUI());

            // Show Explorer Results if Editor Tab is active
            if (tabEditor && tabEditor.classList.contains('active')) {
                viewResults.style.display = 'flex';
            }
        } else if (ctx === 'PETRI') {
            if (tabContextPetri) tabContextPetri.classList.add('active');
            if (toolbarPetri) toolbarPetri.style.display = 'flex';

            drawPetri();
            updateStats();

            // Show Explorer Results in Petri Mode too (for Reachable States list)
            if (viewResults) {
                if (tabEditor && tabEditor.classList.contains('active')) {
                    viewResults.style.display = 'flex';
                } else {
                    viewResults.style.display = 'none';
                }
            }
        } else if (ctx === 'CONCURRENCY') {
            if (tabContextConcurrency) tabContextConcurrency.classList.add('active');
            // Use same toolbar as MIS (read-only view)
            if (toolbarGraph) toolbarGraph.style.display = 'flex';

            // Show Concurrency-specific buttons
            const btnCheckTransitive = document.getElementById('btnCheckTransitive');
            const concurrencySeparator = document.getElementById('concurrencySeparator');
            if (btnCheckTransitive) btnCheckTransitive.style.display = 'block';
            if (concurrencySeparator) concurrencySeparator.style.display = 'block';

            // RESTORE DATA
            // Always restore from graphs.CONCURRENCY. If empty, it's empty.
            // The lazy-loading logic is handled below if needed, but primary source is graphs.CONCURRENCY.
            nodes.length = 0;
            edges.length = 0;

            if (state.graphs.CONCURRENCY.nodes.length > 0) {
                console.log(`[MAIN] Restoring Concurrency Nodes: ${state.graphs.CONCURRENCY.nodes.length}`);
                state.graphs.CONCURRENCY.nodes.forEach(n => nodes.push(n));
                state.graphs.CONCURRENCY.edges.forEach(e => edges.push(e));
                draw();
                updateStats();
            } else {
                // If empty, try to load fresh from API automatically
                console.log("[MAIN] Concurrency storage empty. Triggering initial fetch...");
                draw();
                import('./concurrency.js').then(m => {
                    m.updateConcurrencyGraph().then(() => {
                        updateStats();
                        updateResultsList();
                    });
                });
            }

            if (viewResults) viewResults.style.display = 'flex';
        }
    } catch (e) {
        console.error("Error during context switch:", e);
    }
    triggerAutoSave();
    // Skip for CONCURRENCY - it's updated asynchronously after API call
    if (ctx !== 'CONCURRENCY') {
        updateResultsList();
    }
}

if (tabContextGraph) tabContextGraph.addEventListener('click', () => switchContext('MIS'));
if (tabContextPetri) tabContextPetri.addEventListener('click', () => switchContext('PETRI'));
if (tabContextConcurrency) tabContextConcurrency.addEventListener('click', () => switchContext('CONCURRENCY'));

// --- MAIN RENDER LOOP DELEGATE ---
// Proxy draw for interactions
window.requestDraw = () => {
    if (state.appContext === 'MIS' || state.appContext === 'CONCURRENCY') draw();
    else drawPetri();
}

// 3. Setup UI Event Listeners
const btnStart = document.getElementById('btnStart');
const btnNext = document.getElementById('btnNext');
const btnPrev = document.getElementById('btnPrev');
const btnAuto = document.getElementById('btnAuto');
const btnClear = document.getElementById('btnClear');
const btnDelete = document.getElementById('btnDelete');
const speedSlider = document.getElementById('speedSlider');

// Petri Toolbar
const btnGenerate = document.getElementById('btnGenerateGraph');
const inputMaxStates = document.getElementById('inputMaxStates');

if (btnGenerate) {
    btnGenerate.addEventListener('click', async () => {
        const success = await generateReachabilityGraph(false);
        if (success) switchContext('MIS');
    });
}

if (inputMaxStates) {
    // Initialize value
    inputMaxStates.value = state.maxReachabilityStates || 1000;

    inputMaxStates.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (val && val > 0) {
            state.maxReachabilityStates = val;
            saveToLocalStorage(); // Persist setting
            triggerAutoSave();
            // Trigger update if we have content
            debouncedUpdateReachability();
        }
    });
}

// Toolbar - Simulation (MIS / Petri)
if (btnStart) {
    btnStart.addEventListener('click', async () => {
        // If in Petri Mode, generate Reachability Graph first
        if (state.appContext === 'PETRI') {
            await generateReachabilityGraph();
            return;
        }

        if (state.appContext !== 'MIS') return;
        if (nodes.length === 0) return;

        const success = await fetchSolution(btnStart);
        if (success) {
            draw();
            // Ensure we are in Reachability Graph mode to see results
            switchContext('MIS');
        }
    });
}

if (btnNext) {
    btnNext.addEventListener('click', async () => {
        if (state.appContext !== 'MIS') return;
        if (state.misSteps.length === 0) {
            const success = await fetchSolution(null); // Assuming fetchSolution meant generate? 
            // Wait, previous code was fetchSolution(null). Let's check view.
            // Oh, grep said line 156: generateReachabilityGraph().
            // Wait, I need to check line 156 content first to be safe.
            // I'll skip this edit if uncertain, or use view_file.
            // Actually, btnNext logic usually deals with MIS steps.
            // If I am in MIS context, I don't need to switch context.
            // So if generateReachabilityGraph was called here, it was to lazy-load.
            // I will use view_file first.
        }
        advanceStep();
    });
}

if (btnPrev) {
    btnPrev.addEventListener('click', () => {
        if (state.appContext !== 'MIS') return;
        if (state.currentStepIndex > 0) {
            state.currentStepIndex--;
            highlightResultItem(state.currentStepIndex);
            if (document.getElementById('resultsList').children[state.currentStepIndex]) {
                document.getElementById('resultsList').children[state.currentStepIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            draw();
            updateButtonStates();
        }
    });
}

if (btnAuto) {
    btnAuto.addEventListener('click', async () => {
        if (state.appContext !== 'MIS') return;
        if (state.isPlaying) {
            stopAutoPlay();
            return;
        }
        if (state.misSteps.length === 0) {
            const success = await fetchSolution(null);
            if (!success) return;
        }
        startAutoPlay();
    });
}

if (btnClear) {
    btnClear.addEventListener('click', () => {
        // Context aware clear
        if (nodes.length > 0) {
            if (!confirm("Are you sure you want to clear the graph? This cannot be undone.")) return;
        }
        nodes.length = 0;
        edges.length = 0;
        state.selectedNode = null;
        state.isGenerated = false; // Reset Read Only
        resetSimulation();
        updateStats();
        draw();

        // Update UI to unlock tools
        import('./ui.js').then(ui => ui.updateReadOnlyUI());

        localStorage.setItem('mis_autosave', JSON.stringify({ nodes: [], edges: [], camera: state.camera }));
    });
}

if (btnDelete) {
    btnDelete.addEventListener('click', deleteSelectedNode);
}

// Mode Buttons (Graph)
document.getElementById('btnModeView')?.addEventListener('click', () => setMode('view'));
document.getElementById('btnModeNode')?.addEventListener('click', () => setMode('nodes'));
document.getElementById('btnModeEdge')?.addEventListener('click', () => setMode('edges'));

// Speed Slider
if (speedSlider) {
    speedSlider.addEventListener('input', () => {
        const val = parseInt(speedSlider.value);
        state.simulationDelay = 2050 - (val * 20);
        if (state.simulationDelay < 30) state.simulationDelay = 30;
        updateSimulationSpeed();
    });
    speedSlider.dispatchEvent(new Event('input'));
}

// Tabs & DB
// Tabs & DB (Moved to top)
// Tabs & DB (Updated for Full Screen Explorer)
// viewDb removed
// btnDbGraphs, btnDbPetri removed

// Tab Scroll
const btnTabScrollLeft = document.getElementById('btnTabScrollLeft');
const btnTabScrollRight = document.getElementById('btnTabScrollRight');
const editorTabBar = document.getElementById('editorTabBar');

if (editorTabBar) {
    if (btnTabScrollLeft) {
        btnTabScrollLeft.addEventListener('click', () => {
            editorTabBar.scrollBy({ left: -150, behavior: 'smooth' });
        });
    }
    if (btnTabScrollRight) {
        btnTabScrollRight.addEventListener('click', () => {
            editorTabBar.scrollBy({ left: 150, behavior: 'smooth' });
        });
    }
}

// 3. Init Tabs (Pass switchContext callback)
initBenchmarking();
initAlgoManager();
initDatabaseExplorer(); // Init DB Explorer Elements

const viewDatabaseExplorer = document.getElementById('viewDatabaseExplorer');

if (tabEditor && tabDb && tabPerformance && mainEditorArea && viewPerformance) {

    // EDITOR TAB
    tabEditor.addEventListener('click', () => {
        tabEditor.classList.add('active');
        tabDb.classList.remove('active');
        tabPerformance.classList.remove('active');

        // Show Editor, Hide Others
        mainEditorArea.style.display = 'flex';
        viewPerformance.style.display = 'none';
        if (viewDatabaseExplorer) viewDatabaseExplorer.style.display = 'none';

        // Show Sidebar & Resizer
        const resizer = document.getElementById('resizer');
        const sidebar = document.querySelector('.sidebar-panel');
        if (resizer) resizer.style.display = '';
        if (sidebar) sidebar.style.display = '';

        // Restore Sidebar Results if needed
        if (state.appContext === 'MIS' || state.appContext === 'PETRI' || state.appContext === 'CONCURRENCY') {
            if (viewResults) viewResults.style.display = 'flex';
        } else {
            if (viewResults) viewResults.style.display = 'none';
        }

        state.activeActivityTab = 'tabEditor';
        saveToLocalStorage();

        // Canvas Resize
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            resizeCanvas();
        }, 50);
    });

    // DATABASE EXPLORER TAB (Full Screen)
    tabDb.addEventListener('click', () => {
        tabDb.classList.add('active');
        tabEditor.classList.remove('active');
        tabPerformance.classList.remove('active');

        // Show DB, Hide Others
        if (viewDatabaseExplorer) {
            viewDatabaseExplorer.style.display = 'flex';
            openDatabaseExplorer(); // Trigger fetch
        }
        mainEditorArea.style.display = 'none';
        viewPerformance.style.display = 'none';

        // Hide Sidebar & Resizer
        const resizer = document.getElementById('resizer');
        const sidebar = document.querySelector('.sidebar-panel');
        if (resizer) resizer.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';

        state.activeActivityTab = 'tabDb';
        saveToLocalStorage();
    });

    // PERFORMANCE TAB
    tabPerformance.addEventListener('click', () => {
        tabPerformance.classList.add('active');
        tabEditor.classList.remove('active');
        tabDb.classList.remove('active');

        // Show Performance, Hide Others
        viewPerformance.style.display = 'flex';
        mainEditorArea.style.display = 'none';
        if (viewDatabaseExplorer) viewDatabaseExplorer.style.display = 'none';

        // Hide Sidebar & Resizer
        const resizer = document.getElementById('resizer');
        const sidebar = document.querySelector('.sidebar-panel');
        if (resizer) resizer.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';

        state.activeActivityTab = 'tabPerformance';
        saveToLocalStorage();
    });
}

// (Old DB Tabs Toggle, Save Graph/Petri, Search/Filtering code removed — now handled by database_explorer.js)

// --- OPEN NET FROM DATABASE EXPLORER ---
window.openPetriNetInEditor = function (netData) {
    const net = netData.content || netData;
    const name = netData.name || 'Untitled';

    // Sanitize coordinates
    if (net.places) net.places.forEach(p => {
        if (p.x === undefined || p.x === null) p.x = 0;
        if (p.y === undefined || p.y === null) p.y = 0;
    });
    if (net.transitions) net.transitions.forEach(t => {
        if (t.x === undefined || t.x === null) t.x = 0;
        if (t.y === undefined || t.y === null) t.y = 0;
    });

    // Open in a new tab
    import('./tabs.js').then(tabs => {
        tabs.createNewTab('PETRI', name, net);

        setTimeout(() => {
            const allZero = [...places, ...transitions].every(n => (n.x === 0 && n.y === 0));
            if (allZero && (places.length > 0 || transitions.length > 0)) {
                runAutoLayout();
            } else {
                drawPetri();
            }
            updateStats();

            // Switch to editor
            tabEditor.click();
            switchContext('PETRI');
        }, 100);
    });
};


// Resize Handler Patch
window.addEventListener('resize', () => {
    const canvas = document.getElementById('graphCanvas');
    const container = document.getElementById('canvasContainer');
    if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        window.requestAnimationFrame(draw);
    }
});

// --- REACHABILITY GEN BUTTON ---
const btnPetriReachability = document.getElementById('btnPetriReachability');
if (btnPetriReachability) {
    btnPetriReachability.addEventListener('click', async () => {
        const success = await generateReachabilityGraph(false);
        if (success) {
            tabEditor.click();
            switchContext('MIS');
        }
    });
}

// --- PETRI SAVE TOOLBAR BUTTON ---
const btnPetriSave = document.getElementById('btnPetriSave');
if (btnPetriSave) {
    btnPetriSave.addEventListener('click', async () => {
        const name = prompt("Enter name for this Petri Net:");
        if (name) {
            // Ensure we have current nodes
            const content = { places, transitions, arcs };
            const success = await savePetriNetDb(name, content);
            if (success) {
                // If DB tab is active, refresh it
                if (tabDb && tabDb.classList.contains('active')) {
                    openDatabaseExplorer();
                }
            }
        }
    });
}

// 4. Initial Load
resizeCanvas();
loadFromLocalStorage();
setMode('view');
updateStats();
// switchContext('PETRI'); // Handled by initTabs now

// MIS Auto Layout
// MIS / Concurrency Auto Layout
const btnGraphLayout = document.getElementById('btnGraphLayout');
if (btnGraphLayout) {
    btnGraphLayout.addEventListener('click', () => {
        if (state.appContext === 'MIS') {
            runMisLayout();
        } else if (state.appContext === 'CONCURRENCY') {
            import('./concurrency.js').then(m => {
                if (m.runSimpleLayout) {
                    m.runSimpleLayout();
                    // Explicitly save the new layout
                    state.concurrencyNodes = JSON.parse(JSON.stringify(nodes));
                    state.concurrencyEdges = JSON.parse(JSON.stringify(edges));
                    triggerAutoSave();
                    console.log("Concurrency Layout applied and saved.");
                }
            });
        }
    });
}

// Transitive Orientability Check Button (Concurrency Graph only)
const btnCheckTransitive = document.getElementById('btnCheckTransitive');
console.log("btnCheckTransitive element:", btnCheckTransitive);
if (btnCheckTransitive) {
    btnCheckTransitive.addEventListener('click', () => {
        console.log("Transitive button clicked! Context:", state.appContext);
        if (state.appContext !== 'CONCURRENCY') {
            console.warn("Not in CONCURRENCY context, ignoring");
            return;
        }

        import('./concurrency.js').then(async m => {
            console.log("Concurrency module loaded, checking for function:", !!m.fetchTransitivity);
            if (m.fetchTransitivity) {
                try {
                    const result = await m.fetchTransitivity();
                    console.log("Transitive Orientability Check Result:", result);

                    // Save result to state for display in results panel
                    state.troResult = result;

                    // Refresh results panel to show TRO result
                    updateResultsList();
                } catch (err) {
                    console.error("Transitivity check failed:", err);
                }
            } else {
                console.error("fetchTransitivity function not found in module");
            }
        }).catch(err => {
            console.error("Failed to load concurrency module:", err);
        });
    });
} else {
    console.warn("btnCheckTransitive not found in DOM");
}

function runMisLayout() {
    // Simple Force-Directed Layout for MIS Graph
    if (state.appContext !== 'MIS') {
        console.warn("Attempted to run MIS Layout in non-MIS context. Aborting.");
        return;
    }
    const width = 800;
    const height = 600;
    const padding = 50;

    // Random init if all at 0,0
    if (nodes.every(n => n.x === 0 && n.y === 0)) {
        nodes.forEach(node => {
            node.x = Math.random() * (width - 2 * padding) + padding;
            node.y = Math.random() * (height - 2 * padding) + padding;
        });
    }

    // Init velocity
    nodes.forEach(node => {
        if (!node.vx) { node.vx = 0; node.vy = 0; }
    });

    const k = 150; // ideal length, slightly larger for MIS readability
    const iterations = 150;

    for (let i = 0; i < iterations; i++) {
        // Repulsion
        for (let a = 0; a < nodes.length; a++) {
            for (let b = a + 1; b < nodes.length; b++) {
                const u = nodes[a];
                const v = nodes[b];
                const dx = u.x - v.x;
                const dy = u.y - v.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (k * k) / dist;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                u.vx += fx; u.vy += fy;
                v.vx -= fx; v.vy -= fy;
            }
        }

        // Attraction
        edges.forEach(edge => {
            // Edge in MIS is [id1, id2] (ids)
            const u = nodes.find(n => n.id === edge[0]);
            const v = nodes.find(n => n.id === edge[1]);

            if (!u || !v) return;

            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist * dist) / k;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            u.vx += fx; u.vy += fy;
            v.vx -= fx; v.vy -= fy;
        });

        // Apply
        nodes.forEach(n => {
            n.x += Math.min(Math.max(n.vx * 0.1, -20), 20);
            n.y += Math.min(Math.max(n.vy * 0.1, -20), 20);
            n.vx *= 0.5; // damping
            n.vy *= 0.5;
        });
    }

    // Center graph
    if (nodes.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            maxX = Math.max(maxX, n.x);
            minY = Math.min(minY, n.y);
            maxY = Math.max(maxY, n.y);
        });

        // Calculate center of bounding box
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        // Center of the logical canvas (approximate)
        // We use a fixed center to keep it stable
        const center = { x: 400, y: 300 };

        // Shift all nodes to center
        nodes.forEach(n => {
            n.x -= (cx - center.x);
            n.y -= (cy - center.y);
        });

        // POST-LAYOUT SNAPPING
        // This must happen AFTER centering to ensure the final positions are on grid
        if (state.snapReachability) {
            const gridSize = 50;
            nodes.forEach(n => {
                n.x = Math.round(n.x / gridSize) * gridSize;
                n.y = Math.round(n.y / gridSize) * gridSize;
            });
        }
    }
    draw();
}

// --- REACHABILITY ---
// --- REACHABILITY ---
let reachabilityDebounceTimer = null;

export async function generateReachabilityGraph(background = false) {
    if (!background) console.log("Generating Reachability Graph (Foreground)...");

    // Use globals imported from petri_state.js
    if (places.length === 0 && transitions.length === 0) {
        if (!background) alert("Petri Net is empty.");
        return;
    }

    // 1. Prepare Payload
    const payload = {
        places: places.map(p => ({ ...p, tokens: parseInt(p.tokens) || 0 })),
        transitions: transitions,
        arcs: arcs,
        max_states: state.maxReachabilityStates || 1000
    };

    // SAVE INITIAL MARKING (M0)
    state.initialMarking = {};
    places.forEach(p => {
        state.initialMarking[p.id] = parseInt(p.tokens) || 0;
    });

    // 2. Call API
    // GUARD: Capture the tab ID that initiated this request
    const requestingTabId = state.activeTabId;

    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

        const response = await fetch('/api/petri/reachability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({
                places,
                transitions,
                arcs,
                max_states: state.maxReachabilityStates || 1000
            })
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Server status: ${response.status} - ${txt}`);
        }

        const data = await response.json();

        // GUARD: Check if we are still in the same tab
        if (state.activeTabId !== requestingTabId) {
            console.warn(`[REACHABILITY] Ignoring stale update. Requesting Tab: ${requestingTabId}, Current: ${state.activeTabId}`);
            return false;
        }

        if (data.status === 'success') {
            const newNodes = [];
            const newEdges = [];

            // CACHE PREVIOUS POSITIONS (From Graphs Storage, NOT Globals if background)
            const prevPositions = new Map();
            // Use existing stored nodes for position caching to ensure stability even if not currently viewing
            state.graphs.MIS.nodes.forEach(n => {
                if (n.id !== undefined) prevPositions.set(n.id, { x: n.x, y: n.y });
            });

            let restoredCount = 0;
            if (data.nodes && Array.isArray(data.nodes)) {
                data.nodes.forEach(n => {
                    const prev = prevPositions.get(n.id);
                    if (prev) {
                        n.x = prev.x;
                        n.y = prev.y;
                        restoredCount++;
                    } else {
                        // Random init if no layout
                        n.x = Math.random() * 800 + 50;
                        n.y = Math.random() * 600 + 50;
                    }
                    n.vx = 0; n.vy = 0;
                    newNodes.push(n);
                });
            }

            if (data.edges && Array.isArray(data.edges)) {
                newEdges.push(...data.edges);
            }

            // UPDATE STORAGE (Always safe)
            state.graphs.MIS.nodes = newNodes;
            state.graphs.MIS.edges = newEdges;

            // Invalidate Concurrency Graph since Reachability changed
            // Also update storage, not globals
            state.graphs.CONCURRENCY.nodes = [];
            state.graphs.CONCURRENCY.edges = [];

            // Reset Simulation
            state.misSteps = [];
            state.currentStepIndex = 0;

            // MARK AS GENERATED (Read Only) and store truncation status
            state.isGenerated = true;
            state.graphTruncated = data.truncated || false;

            // Force save to persist truncation status immediately
            triggerAutoSave();

            // SYNC TO VIEW ONLY IF ACTIVE
            if (state.appContext === 'MIS') {
                nodes.length = 0;
                edges.length = 0;
                newNodes.forEach(n => nodes.push(n));
                newEdges.forEach(e => edges.push(e));

                // Layout (MIS Layout) - ONLY for foreground updates or significant changes
                if (!background) {
                    if (restoredCount < newNodes.length) {
                        runMisLayout();
                    } else {
                        console.log("Skipping layout - positions restored from cache.");
                    }
                }

                updateReadOnlyUI();
                updateResultsList();
                draw();
                updateStats();
            } else {
                // In Petri/Concurrency mode, just update the background lists
                // We likely need to refresh "Reachable States" list in Petri mode
                if (state.appContext === 'PETRI') {
                    updateResultsList();
                }
                console.log(`Background Reachability Update: ${newNodes.length} nodes stored.`);
            }

            return true;
        } else {
            console.error("Reachability Error:", data.message);
            if (!background) alert("Error calculating reachability: " + data.message);
            return false;
        }
    } catch (error) {
        console.error("Reachability Request Failed:", error);
        if (!background) alert("Request failed. Check console.");
        return false;
    }
}

// Debounced Update
function debouncedUpdateReachability() {
    if (reachabilityDebounceTimer) clearTimeout(reachabilityDebounceTimer);
    reachabilityDebounceTimer = setTimeout(() => {
        generateReachabilityGraph(true); // Background update
    }, 500); // 500ms debounce
}

// Listen for interactions
window.addEventListener('petri-state-updated', () => {
    debouncedUpdateReachability();
});

console.log("Modules Loaded & App Started.");

// Force sync UI visibility on load
// This ensures that if we start in PETRI mode (via initTabs), the Results panel is hidden
if (state.appContext === 'PETRI' && viewResults) {
    viewResults.style.display = 'none';
}

// --- DEBUG CONSOLE TOGGLES ---
const debugOverlay = document.getElementById('debugOverlay');
const btnToggleDebug = document.getElementById('btnToggleDebug');
const btnCloseDebug = document.getElementById('btnCloseDebug');

if (btnToggleDebug && debugOverlay) {
    btnToggleDebug.textContent = "Debug";

    btnToggleDebug.addEventListener('click', () => {
        if (debugOverlay.style.display === 'none') {
            debugOverlay.style.display = 'flex';
        } else {
            debugOverlay.style.display = 'none';
        }
    });
}

if (btnCloseDebug && debugOverlay) {
    btnCloseDebug.addEventListener('click', () => {
        debugOverlay.style.display = 'none';
    });
}
// --- VIEW SETTINGS ---
const btnToggleSettings = document.getElementById('btnToggleSettings');
const settingsPanel = document.getElementById('settingsPanel');
const chkShowSidebar = document.getElementById('chkShowSidebar');
const chkShowToolbar = document.getElementById('chkShowToolbar');

if (btnToggleSettings && settingsPanel) {
    btnToggleSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.style.display = (settingsPanel.style.display === 'none') ? 'block' : 'none';
    });

    // Close on click outside
    window.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && e.target !== btnToggleSettings) {
            settingsPanel.style.display = 'none';
        }
    });
}

// Resizer Logic
const resizer = document.getElementById('resizer');
const sidebar = document.querySelector('.sidebar-panel');

if (resizer && sidebar) {
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        resizer.classList.add('resizing');

        const startX = e.clientX;
        const startWidth = sidebar.getBoundingClientRect().width;

        const onMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            // Sidebar is on the right, so moving mouse RIGHT (positive dx) decreases width
            // Moving mouse LEFT (negative dx) increases width
            const newWidth = startWidth - dx;

            if (newWidth >= 150 && newWidth <= 600) {
                sidebar.style.width = `${newWidth}px`;
                // Trigger canvas resize
                requestAnimationFrame(() => {
                    window.dispatchEvent(new Event('resize'));
                });
            }
        };

        const onMouseUp = () => {
            document.body.style.cursor = 'default';
            resizer.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            window.dispatchEvent(new Event('resize'));
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// 4. RESTORE ACTIVE TABS (AFTER INIT)
setTimeout(() => {
    console.log("[MAIN] Restoring Active Tabs from state:", state.activeActivityTab, state.activeDbTab);

    // Activity Tab
    if (state.activeActivityTab) {
        const el = document.getElementById(state.activeActivityTab);
        if (el) el.click();
    }

    // DB Sub-tab
    if (state.activeDbTab) {
        const el = document.getElementById(state.activeDbTab);
        if (el) el.click();
    }
}, 100);

// 3. Init Tabs (Pass switchContext callback)
initTabs((ctx) => {
    switchContext(ctx);
});


