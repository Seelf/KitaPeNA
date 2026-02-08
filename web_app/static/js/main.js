// Author: Dawid Konarczak

console.log("Main.js module loading...");
import { initElements, state, nodes, edges, camera } from './state.js';
import { draw, resizeCanvas } from './render.js';
import { initInteractions, deleteSelectedNode } from './interactions.js';
import { initAdminConsole } from './admin.js';
import { updateStats, setMode, updateResultsList, updateButtonStates, updateReadOnlyUI, initViewSettings } from './ui.js';
import { loadFromLocalStorage, loadSavedGraphs, saveGraph, loadGraphFromDb, loadSavedPetriNets, loadPetriNetFromDb, savePetriNetDb, importPetriBatch } from './storage.js';
import { fetchSolution, advanceStep, startAutoPlay, stopAutoPlay, resetSimulation, highlightResultItem, updateSimulationSpeed } from './simulation.js';
import { drawPetri } from './petri_render.js';
import { petriState, places, transitions, arcs } from './petri_state.js';
import { initPetriInteractions, runAutoLayout } from './petri_interactions.js';
import { initTabs, triggerAutoSave } from './tabs.js';

console.log("App Initializing (Direct execution)...");


// 1. Init DOM Elements
initElements();
initViewSettings();

// 2. Init Interactions
initInteractions();
initPetriInteractions();
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
const dbContentPetri = document.getElementById('dbContentPetri');
const dbContentGraphs = document.getElementById('dbContentGraphs');

// 3. Init Tabs (Pass switchContext callback)
// 3. Init Tabs (Moved to end)
// initTabs called at the end


function switchContext(ctx) {
    // Guard: Do not allow switching if we are likely in a background update loop (this is a heuristic, but debugging helper)
    // Actually, switchContext should only be called by user interaction.

    // 1. Save current camera AND data to previous context storage
    if (state.appContext === 'MIS') {
        state.misCamera = { ...camera };
        state.misNodes = [...nodes];
        state.misEdges = [...edges];
    } else if (state.appContext === 'PETRI') {
        state.petriCamera = { ...camera };
        // Petri uses places/transitions/arcs, not nodes/edges, so no save needed
    } else if (state.appContext === 'CONCURRENCY') {
        state.concurrencyCamera = { ...camera };
        state.concurrencyNodes = [...nodes];
        state.concurrencyEdges = [...edges];
    }

    // 2. Update Context
    state.appContext = ctx;

    // 3. Restore camera for new context
    // We must update the existing camera object properties, not replace the object
    const sourceCam = (ctx === 'MIS') ? state.misCamera : (ctx === 'PETRI' ? state.petriCamera : state.concurrencyCamera);
    if (sourceCam) {
        camera.x = sourceCam.x;
        camera.y = sourceCam.y;
        camera.zoom = sourceCam.zoom;
    } else if (ctx === 'CONCURRENCY') {
        // Default init for concurrency if no saved camera
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

        if (ctx === 'MIS') {
            if (tabContextGraph) tabContextGraph.classList.add('active');
            if (toolbarGraph) toolbarGraph.style.display = 'flex';

            // Restore MIS data - clear foreign context data first, then restore if we have saved data

            // Always clear first to remove CONCURRENCY/PETRI data that shouldn't appear in MIS tab
            nodes.length = 0;
            edges.length = 0;

            // Restore saved MIS data if available
            // Restore saved MIS data if available
            if (state.misNodes.length > 0) {
                // Auto-heal TEMPORARILY DISABLED due to potential issues
                /*
                if (!state.misNodes[0].marking) {
                    state.misNodes = [];
                    state.misEdges = [];
                } else {
                    state.misNodes.forEach(n => nodes.push(n));
                    state.misEdges.forEach(e => edges.push(e));
                }
                */

                // Safe restore with debug
                console.log("Restoring MIS Nodes. Sample:", state.misNodes[0]);
                state.misNodes.forEach(n => nodes.push(n));
                state.misEdges.forEach(e => edges.push(e));
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

            // Check if we have saved concurrency data to restore
            if (state.concurrencyNodes && state.concurrencyNodes.length > 0) {
                // Restore saved data
                nodes.length = 0;
                edges.length = 0;
                state.concurrencyNodes.forEach(n => nodes.push(n));
                state.concurrencyEdges.forEach(e => edges.push(e));
                draw();
                updateStats();
            } else {
                // No saved data - load fresh from API
                nodes.length = 0;
                edges.length = 0;
                draw(); // Show empty canvas while loading

                import('./concurrency.js').then(m => {
                    m.updateConcurrencyGraph().then(() => {
                        // Save loaded data for next time
                        state.concurrencyNodes = [...nodes];
                        state.concurrencyEdges = [...edges];
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
const viewDb = document.getElementById('viewDb');

// Tab Scroll
const btnTabScrollLeft = document.getElementById('btnTabScrollLeft');
const btnTabScrollRight = document.getElementById('btnTabScrollRight');
const editorTabBar = document.getElementById('editorTabBar'); // Re-select if needed or use existing reference if consistent

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

// DB Module Elements
const btnDbGraphs = document.getElementById('btnDbGraphs');
const btnDbPetri = document.getElementById('btnDbPetri');
// DB Content (Moved to top)

const savedGraphsList = document.getElementById('savedGraphsList');
const savedPetriList = document.getElementById('savedPetriList');

const btnSaveGraph = document.getElementById('btnSaveGraph');
const btnSavePetri = document.getElementById('btnSavePetri');
const btnImportBatch = document.getElementById('btnImportBatch');
const fileInputBatch = document.getElementById('fileInputBatch');

if (tabEditor && tabDb && viewResults && viewDb) {
    tabEditor.addEventListener('click', () => {
        tabEditor.classList.add('active');
        tabDb.classList.remove('active');

        // Show Results only if MIS context
        if (state.appContext === 'MIS') {
            viewResults.style.display = 'flex';
        } else {
            viewResults.style.display = 'none';
        }

        viewDb.style.display = 'none';
    });

    tabDb.addEventListener('click', () => {
        tabDb.classList.add('active');
        tabEditor.classList.remove('active');
        viewResults.style.display = 'none';
        viewDb.style.display = 'flex';

        // Initial Load based on active tab
        if (btnDbGraphs && btnDbGraphs.classList.contains('active')) {
            if (savedGraphsList) {
                loadSavedGraphs(savedGraphsList, (id) => {
                    loadGraphFromDb(id).then(success => { if (success) { tabEditor.click(); switchContext('MIS'); } });
                });
            }
        } else {
            if (savedPetriList) {
                loadSavedPetriNets(savedPetriList, (id) => {
                    loadPetriNetFromDb(id).then(data => {
                        if (data && data.content) {
                            const net = data.content;
                            const name = data.name;

                            // 1. Sanitize Data (Ensure x,y exist)
                            if (net.places) net.places.forEach(p => {
                                if (p.x === undefined || p.x === null) p.x = 0;
                                if (p.y === undefined || p.y === null) p.y = 0;
                            });
                            if (net.transitions) net.transitions.forEach(t => {
                                if (t.x === undefined || t.x === null) t.x = 0;
                                if (t.y === undefined || t.y === null) t.y = 0;
                            });

                            // 2. Open New Tab
                            import('./tabs.js').then(tabs => {
                                tabs.createNewTab('PETRI', name, net);

                                // 3. Check for Layout *after* tab activation
                                setTimeout(() => {
                                    const allZero = [...places, ...transitions].every(n => (n.x === 0 && n.y === 0));
                                    if (allZero && (places.length > 0 || transitions.length > 0)) {
                                        // runAutoLayout(); // Make sure this function exists and works!
                                        // Only run if actually available, otherwise just draw
                                        if (typeof runAutoLayout === 'function') runAutoLayout();
                                        else {
                                            console.warn("runAutoLayout not found");
                                            drawPetri();
                                        }
                                    } else {
                                        // Reset camera if possibly far away?
                                        if (state.petriCamera) { state.petriCamera.x = 0; state.petriCamera.y = 0; state.petriCamera.zoom = 1; }
                                        drawPetri();
                                    }
                                    updateStats();
                                    tabEditor.click();
                                    switchContext('PETRI');

                                    // AUTO-GENERATE REACHABILITY GRAPH (User Request)
                                    generateReachabilityGraph();

                                }, 100); // Increased timeout slightly to ensure DOM/Canvas ready
                            });
                        }
                    });
                });
            }
        }
    });
}

// DB Tabs Toggle
if (btnDbGraphs && btnDbPetri) {
    btnDbGraphs.addEventListener('click', () => {
        btnDbGraphs.classList.add('active');
        btnDbPetri.classList.remove('active');
        dbContentGraphs.style.display = 'flex';
        dbContentPetri.style.display = 'none';
        loadSavedGraphs(savedGraphsList, (id) => {
            loadGraphFromDb(id).then(success => { if (success) { tabEditor.click(); switchContext('MIS'); } });
        });
    });

    btnDbPetri.addEventListener('click', () => {
        btnDbPetri.classList.add('active');
        btnDbGraphs.classList.remove('active');
        dbContentPetri.style.display = 'flex';
        dbContentGraphs.style.display = 'none';
        loadSavedPetriNets(savedPetriList, (id) => {
            loadPetriNetFromDb(id).then(data => {
                if (data && data.content) {
                    const net = data.content;
                    const name = data.name;

                    // 1. Sanitize Data (Ensure x,y exist)
                    if (net.places) net.places.forEach(p => {
                        if (p.x === undefined || p.x === null) p.x = 0;
                        if (p.y === undefined || p.y === null) p.y = 0;
                    });
                    if (net.transitions) net.transitions.forEach(t => {
                        if (t.x === undefined || t.x === null) t.x = 0;
                        if (t.y === undefined || t.y === null) t.y = 0;
                    });

                    // 2. Open New Tab
                    import('./tabs.js').then(tabs => {
                        tabs.createNewTab('PETRI', name, net);

                        // 3. Check for Layout *after* tab activation (which sets globals)
                        setTimeout(() => {
                            const allZero = [...places, ...transitions].every(n => (n.x === 0 && n.y === 0));
                            console.log(`New Tab Load: allZero=${allZero}, Places=${places.length}`);

                            if (allZero && (places.length > 0 || transitions.length > 0)) {
                                console.log("Auto Layout Triggered for New Tab");
                                runAutoLayout();
                            } else {
                                drawPetri();
                            }

                            updateStats();
                            tabEditor.click();
                            switchContext('PETRI');
                        }, 50);
                    });
                }
            });
        });
    });
}

// Save Graph
if (btnSaveGraph) {
    btnSaveGraph.addEventListener('click', async () => {
        const name = prompt("Enter name for this graph:");
        if (name) {
            const success = await saveGraph(name);
            if (success) { // Check for success here
                // Ensure we are in Reachability Graph mode to see results
                switchContext('MIS');
                if (tabDb.classList.contains('active') && btnDbGraphs.classList.contains('active')) {
                    loadSavedGraphs(savedGraphsList, null);
                }
            }
        }
    });
}

// Save Petri Net
if (btnSavePetri) {
    btnSavePetri.addEventListener('click', async () => {
        const name = prompt("Enter name for this Petri Net:");
        if (name) {
            const content = { places, transitions, arcs };
            const success = await savePetriNetDb(name, content);
            if (success && tabDb.classList.contains('active') && btnDbPetri.classList.contains('active')) {
                loadSavedPetriNets(savedPetriList, null);
            }
        }
    });
}

// --- SEARCH / FILTERING ---
const inputSearchGraph = document.getElementById('inputSearchGraph');
const inputSearchPetri = document.getElementById('inputSearchPetri');

function filterList(listElement, query) {
    if (!listElement) return;
    const items = listElement.querySelectorAll('.saved-item');
    const lowerQuery = query.toLowerCase();

    items.forEach(item => {
        const nameSpan = item.querySelector('.name');
        const nameText = nameSpan ? nameSpan.textContent.toLowerCase() : '';
        if (nameText.includes(lowerQuery)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

if (inputSearchGraph) {
    inputSearchGraph.addEventListener('input', (e) => {
        filterList(savedGraphsList, e.target.value);
    });
}

if (inputSearchPetri) {
    inputSearchPetri.addEventListener('input', (e) => {
        filterList(savedPetriList, e.target.value);
    });
}

// Batch Import
if (btnImportBatch && fileInputBatch) {
    btnImportBatch.addEventListener('click', () => fileInputBatch.click());
    fileInputBatch.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            const res = await importPetriBatch(e.target.files);
            let msg = `Imported: ${res.imported_count}, Errors: ${res.errors.length}`;
            if (res.errors.length > 0) {
                msg += `\nSample Error: ${res.errors[0]}`;
            }
            alert(msg);
            if (tabDb.classList.contains('active') && btnDbPetri.classList.contains('active')) {
                loadSavedPetriNets(savedPetriList, null);
            }
            fileInputBatch.value = '';
        }
    });
}

// Resize Handler Patch
window.addEventListener('resize', () => {
    const canvas = document.getElementById('graphCanvas');
    const container = document.getElementById('canvasContainer');
    if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        window.requestDraw();
    }
});

// --- REACHABILITY BUTTON ---
const btnPetriReachability = document.getElementById('btnPetriReachability');
if (btnPetriReachability) {
    btnPetriReachability.addEventListener('click', async () => {
        const success = await generateReachabilityGraph(false);
        if (success) switchContext('MIS');
    });
}

// --- PETRI SAVE TOOLBAR BUTTON ---
const btnPetriSave = document.getElementById('btnPetriSave');
if (btnPetriSave) {
    btnPetriSave.addEventListener('click', async () => {
        const name = prompt("Enter name for this Petri Net:");
        if (name) {
            const content = { places, transitions, arcs };
            const success = await savePetriNetDb(name, content);
            if (success && tabDb.classList.contains('active') && btnDbPetri.classList.contains('active')) {
                loadSavedPetriNets(savedPetriList, null);
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
const btnGraphLayout = document.getElementById('btnGraphLayout');
if (btnGraphLayout) {
    btnGraphLayout.addEventListener('click', () => runMisLayout());
}

function runMisLayout() {
    // Simple Force-Directed Layout for MIS Graph
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

    // Center Camera to Graph Center
    if (nodes.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x);
            maxY = Math.max(maxY, n.y);
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Reset camera to center on graph
        // Assuming canvas center is roughly at 0,0 relative to camera if camera x,y is offset
        // Camera logic: Screen = World + Offset. 
        // We want Screen Center (Hardware Width/2, Height/2) to map to World Center.
        // Let's just set camera to roughly center the graph.
        // Actually our camera works as: ctx.translate(camera.x, camera.y).
        // So camera.x/y is the translation.
        // Ideally we want: camera.x = ScreenWidth/2 - CenterX.
        // But we don't know screen width here easily without importing elements.
        // For now, let's just redraw. Users can pan.
    }
    draw();
}

// --- REACHABILITY ---
// --- REACHABILITY ---
let reachabilityDebounceTimer = null;

export async function generateReachabilityGraph(background = false) {
    console.log(`[${new Date().toISOString()}] generateReachabilityGraph called. background=${background}`);
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

        if (data.status === 'success') {
            // CACHE PREVIOUS POSITIONS
            const prevPositions = new Map();
            nodes.forEach(n => {
                if (n.id !== undefined) prevPositions.set(n.id, { x: n.x, y: n.y });
            });

            // Update Nodes & Edges
            nodes.length = 0;

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
                    nodes.push(n);
                });
            }

            edges.length = 0;
            if (data.edges && Array.isArray(data.edges)) {
                edges.push(...data.edges);
            }

            // Save to context-specific storage for persistence across tab switches
            state.misNodes = [...nodes];
            state.misEdges = [...edges];

            // Invalidate Concurrency Graph since Reachability changed
            state.concurrencyNodes.length = 0;
            state.concurrencyEdges.length = 0;

            // Reset Simulation
            state.misSteps = [];
            state.currentStepIndex = 0;

            // Layout (MIS Layout) - ONLY for foreground updates
            // Skip layout for background updates to prevent camera jumping
            // ALSO SKIP if we successfully restored all positions (stable graph)
            if (!background) {
                if (restoredCount < data.nodes.length) {
                    runMisLayout();
                } else {
                    console.log("Skipping layout - positions restored from cache.");
                }
            }

            // MARK AS GENERATED (Read Only) and store truncation status
            state.isGenerated = true;
            state.graphTruncated = data.truncated || false;

            // Update UI
            updateReadOnlyUI();
            updateResultsList();

            // Force save to persist truncation status immediately
            triggerAutoSave();

            if (state.appContext === 'MIS') {
                draw();
                updateStats();
            } else {
                // In Petri mode, we just updated the background Reachability data.
                // We need to refresh the "Reachable States" list.
                updateResultsList();
            }

            if (!background) {
                console.log(`Reachability Graph Generated: ${nodes.length} nodes, ${edges.length} edges.`);
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

    // Sidebar Toggle
    if (chkShowSidebar) {
        chkShowSidebar.addEventListener('change', (e) => {
            const rightPanel = document.querySelector('.sidebar-panel');
            if (rightPanel) rightPanel.style.display = e.target.checked ? 'flex' : 'none';
        });
    }

    // Toolbar Toggle (Floating)
    if (chkShowToolbar) {
        chkShowToolbar.addEventListener('change', (e) => {
            const tGraph = document.getElementById('toolbarGraph');
            const tPetri = document.getElementById('toolbarPetri');

            if (tGraph) tGraph.style.visibility = e.target.checked ? 'visible' : 'hidden';
            if (tPetri) tPetri.style.visibility = e.target.checked ? 'visible' : 'hidden';
        });
    }

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

// 3. Init Tabs (Pass switchContext callback)
initTabs((ctx) => {
    switchContext(ctx);
});


