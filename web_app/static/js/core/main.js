
// Author: Dawid Konarczak
console.log("Main.js module loading...");

import { initElements, state, nodes, edges, camera } from './state.js';
import { draw, resizeCanvas } from '../engine/rendering/render.js';
import { initInteractions, deleteSelectedNode } from '../engine/interactions/interactions.js';
import { initAdminConsole } from '../ui/admin.js';
import { updateStats, setMode, updateResultsList, updateButtonStates, updateReadOnlyUI, initViewSettings } from '../ui/ui.js';
import { saveToLocalStorage, loadFromLocalStorage, savePetriNetDb } from './storage.js';
import { fetchSolution, advanceStep, startAutoPlay, stopAutoPlay, resetSimulation, highlightResultItem, updateSimulationSpeed } from '../domain/petri/simulation.js';
import { drawPetri } from '../engine/rendering/petri_render.js';
import { places, transitions, arcs } from '../domain/petri/petri_state.js';
import { initPetriInteractions, runAutoLayout } from '../engine/interactions/petri_interactions.js';
import { initTabs, triggerAutoSave } from './tabs.js';
import { initBenchmarking } from '../domain/benchmarking/benchmarking.js';
import { initAlgoManager } from '../domain/algo/algo_manager.js';
import { initDatabaseExplorer, openDatabaseExplorer } from '../ui/database_explorer.js';

// New Modules
import { runForceDirectedLayout } from '../engine/layout/layout_engine.js';
import { switchContext, initResizer } from './view_manager.js';
import { generateReachabilityGraph, debouncedUpdateReachability } from '../domain/petri/petri_analyzer.js';

console.log("App Initializing (Direct execution)...");

// 1. Init DOM Elements & Systems
initElements();
initViewSettings();
initInteractions();
initPetriInteractions();
initAdminConsole();
initBenchmarking();
initAlgoManager();
initDatabaseExplorer();
initResizer();

// 2. Load State & Restore UI
loadFromLocalStorage();

// Force draw after restore
resizeCanvas();
window.requestAnimationFrame(draw);

// 3. Tab Context Handlers
const tabContextGraph = document.getElementById('tabContextGraph');
const tabContextPetri = document.getElementById('tabContextPetri');
const tabContextConcurrency = document.getElementById('tabContextConcurrency');

if (tabContextGraph) tabContextGraph.addEventListener('click', () => switchContext('MIS'));
if (tabContextPetri) tabContextPetri.addEventListener('click', () => switchContext('PETRI'));
if (tabContextConcurrency) tabContextConcurrency.addEventListener('click', () => switchContext('CONCURRENCY'));

// 4. Global Render Delegate
window.requestDraw = () => {
    if (state.appContext === 'MIS' || state.appContext === 'CONCURRENCY') draw();
    else drawPetri();
}

// 5. Toolbar Handlers (MIS / Petri)
const btnStart = document.getElementById('btnStart');
const btnNext = document.getElementById('btnNext');
const btnPrev = document.getElementById('btnPrev');
const btnAuto = document.getElementById('btnAuto');
const btnClear = document.getElementById('btnClear');
const btnDelete = document.getElementById('btnDelete');
const speedSlider = document.getElementById('speedSlider');
const btnGenerate = document.getElementById('btnGenerateGraph');
const inputMaxStates = document.getElementById('inputMaxStates');

if (btnGenerate) {
    btnGenerate.addEventListener('click', async () => {
        const success = await generateReachabilityGraph(false);
        if (success) switchContext('MIS');
    });
}

if (inputMaxStates) {
    inputMaxStates.value = state.maxReachabilityStates || 1000;
    inputMaxStates.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (val > 0) {
            state.maxReachabilityStates = val;
            saveToLocalStorage();
            triggerAutoSave();
            debouncedUpdateReachability();
        }
    });
}

if (btnStart) {
    btnStart.addEventListener('click', async () => {
        if (state.appContext === 'PETRI') {
            await generateReachabilityGraph();
            return;
        }
        if (state.appContext !== 'MIS' || nodes.length === 0) return;
        if (await fetchSolution(btnStart)) {
            draw();
            switchContext('MIS');
        }
    });
}

if (btnNext) {
    btnNext.addEventListener('click', async () => {
        if (state.appContext === 'MIS') advanceStep();
    });
}

if (btnPrev) {
    btnPrev.addEventListener('click', () => {
        if (state.appContext !== 'MIS' || state.currentStepIndex <= 0) return;
        state.currentStepIndex--;
        highlightResultItem(state.currentStepIndex);
        const list = document.getElementById('resultsList');
        if (list?.children[state.currentStepIndex]) {
            list.children[state.currentStepIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        draw();
        updateButtonStates();
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
            if (!await fetchSolution(null)) return;
        }
        startAutoPlay();
    });
}

if (btnClear) {
    btnClear.addEventListener('click', () => {
        if (nodes.length > 0 && !confirm("Clear the graph? This cannot be undone.")) return;
        nodes.length = 0;
        edges.length = 0;
        state.selectedNode = null;
        state.isGenerated = false;
        resetSimulation();
        updateStats();
        draw();
        updateReadOnlyUI();
        localStorage.setItem('mis_autosave', JSON.stringify({ nodes: [], edges: [], camera: state.camera }));
    });
}

if (btnDelete) btnDelete.addEventListener('click', deleteSelectedNode);

// 6. Mode & Speed Controls
document.getElementById('btnModeView')?.addEventListener('click', () => setMode('view'));
document.getElementById('btnModeNode')?.addEventListener('click', () => setMode('nodes'));
document.getElementById('btnModeEdge')?.addEventListener('click', () => setMode('edges'));

if (speedSlider) {
    speedSlider.addEventListener('input', () => {
        const val = parseInt(speedSlider.value);
        state.simulationDelay = 2050 - (val * 20);
        if (state.simulationDelay < 30) state.simulationDelay = 30;
        updateSimulationSpeed();
    });
    speedSlider.dispatchEvent(new Event('input'));
}

// 7. Tab Scroll Logic
const btnTabScrollLeft = document.getElementById('btnTabScrollLeft');
const btnTabScrollRight = document.getElementById('btnTabScrollRight');
const editorTabBar = document.getElementById('editorTabBar');

if (editorTabBar) {
    btnTabScrollLeft?.addEventListener('click', () => editorTabBar.scrollBy({ left: -150, behavior: 'smooth' }));
    btnTabScrollRight?.addEventListener('click', () => editorTabBar.scrollBy({ left: 150, behavior: 'smooth' }));
}

// 8. Main View Navigation (Tabs)
const tabEditor = document.getElementById('tabEditor');
const tabDb = document.getElementById('tabDb');
const tabPerformance = document.getElementById('tabPerformance');
const viewPerformance = document.getElementById('viewPerformance');
const viewDatabaseExplorer = document.getElementById('viewDatabaseExplorer');
const mainEditorContainer = document.getElementById('mainEditorContainer');
const viewResults = document.getElementById('viewResults');

if (tabEditor && tabDb && tabPerformance) {
    tabEditor.addEventListener('click', () => {
        tabEditor.classList.add('active');
        tabDb.classList.remove('active');
        tabPerformance.classList.remove('active');
        if (mainEditorContainer) mainEditorContainer.style.display = 'flex';
        if (viewPerformance) viewPerformance.style.display = 'none';
        if (viewDatabaseExplorer) viewDatabaseExplorer.style.display = 'none';

        if (viewResults) {
            viewResults.style.display = (['MIS', 'PETRI', 'CONCURRENCY'].includes(state.appContext)) ? 'flex' : 'none';
        }
        state.activeActivityTab = 'tabEditor';
        saveToLocalStorage();
        setTimeout(() => resizeCanvas(), 50);
    });

    tabDb.addEventListener('click', () => {
        tabDb.classList.add('active');
        tabEditor.classList.remove('active');
        tabPerformance.classList.remove('active');
        if (viewDatabaseExplorer) {
            viewDatabaseExplorer.style.display = 'flex';
            import('../ui/database_explorer.js').then(db => db.openDatabaseExplorer());
        }
        if (mainEditorContainer) mainEditorContainer.style.display = 'none';
        if (viewPerformance) viewPerformance.style.display = 'none';
        state.activeActivityTab = 'tabDb';
        saveToLocalStorage();
    });

    tabPerformance.addEventListener('click', () => {
        tabPerformance.classList.add('active');
        tabEditor.classList.remove('active');
        tabDb.classList.remove('active');
        if (viewPerformance) viewPerformance.style.display = 'flex';
        if (mainEditorContainer) mainEditorContainer.style.display = 'none';
        if (viewDatabaseExplorer) viewDatabaseExplorer.style.display = 'none';
        state.activeActivityTab = 'tabPerformance';
        saveToLocalStorage();
    });
}

// 9. External Access Logic (Petri Net Loading)
window.openPetriNetInEditor = function (netData) {
    const net = netData.content || netData;
    const name = netData.name || 'Untitled';

    // Sanitize coordinates
    [...(net.places || []), ...(net.transitions || [])].forEach(n => {
        if (n.x === undefined) n.x = 0;
        if (n.y === undefined) n.y = 0;
    });

    import('./tabs.js').then(tabs => {
        tabs.createNewTab('PETRI', name, net);
        setTimeout(() => {
            const allZero = [...places, ...transitions].every(n => (n.x === 0 && n.y === 0));
            if (allZero && (places.length > 0 || transitions.length > 0)) runAutoLayout();
            else drawPetri();
            updateStats();
            tabEditor.click();
            switchContext('PETRI');
        }, 100);
    });
};

const btnPetriReachability = document.getElementById('btnPetriReachability');
if (btnPetriReachability) {
    btnPetriReachability.addEventListener('click', async () => {
        if (await generateReachabilityGraph(false)) {
            tabEditor.click();
            switchContext('MIS');
        }
    });
}

const btnPetriSave = document.getElementById('btnPetriSave');
if (btnPetriSave) {
    btnPetriSave.addEventListener('click', async () => {
        const name = prompt("Enter name for this Petri Net:");
        if (name && await savePetriNetDb(name, { places, transitions, arcs })) {
            if (tabDb?.classList.contains('active')) openDatabaseExplorer();
        }
    });
}

// 10. Layout Handlers
const btnGraphLayout = document.getElementById('btnGraphLayout');
if (btnGraphLayout) {
    btnGraphLayout.addEventListener('click', () => {
        if (state.appContext === 'MIS') {
            runForceDirectedLayout(nodes, edges, {
                iterations: 150,
                k: 150,
                snapToGrid: state.snapReachability,
                onUpdate: () => draw()
            });
        } else if (state.appContext === 'CONCURRENCY') {
            import('../domain/concurrency/concurrency.js').then(m => m.runSimpleLayout());
        }
    });
}

// 11. Concurrency Analysis
const btnCheckTransitive = document.getElementById('btnCheckTransitive');
if (btnCheckTransitive) {
    btnCheckTransitive.addEventListener('click', () => {
        if (state.appContext !== 'CONCURRENCY') return;
        import('../domain/concurrency/concurrency.js').then(async m => {
            const result = await m.fetchTransitivity();
            state.troResult = result;
            updateResultsList();
        });
    });
}

// 12. Initialization Finalization
window.addEventListener('resize', () => resizeCanvas());
window.addEventListener('petri-state-updated', () => debouncedUpdateReachability());
window.addEventListener('petri-net-loaded', (e) => window.openPetriNetInEditor(e.detail));

setTimeout(() => {
    if (state.activeActivityTab) document.getElementById(state.activeActivityTab)?.click();
    if (state.activeDbTab) document.getElementById(state.activeDbTab)?.click();
}, 100);

initTabs((ctx) => switchContext(ctx));

// Final UI Polishing
if (state.appContext === 'PETRI' && viewResults) viewResults.style.display = 'none';

// Debug Overlay Toggles
const debugOverlay = document.getElementById('debugOverlay');
const btnToggleDebug = document.getElementById('btnToggleDebug');
const btnCloseDebug = document.getElementById('btnCloseDebug');

if (btnToggleDebug && debugOverlay) {
    btnToggleDebug.addEventListener('click', () => {
        debugOverlay.style.display = (debugOverlay.style.display === 'none') ? 'flex' : 'none';
    });
}
if (btnCloseDebug && debugOverlay) {
    btnCloseDebug.addEventListener('click', () => debugOverlay.style.display = 'none');
}

// View Settings Popover
const btnToggleSettings = document.getElementById('btnToggleSettings');
const settingsPanel = document.getElementById('settingsPanel');
if (btnToggleSettings && settingsPanel) {
    btnToggleSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.style.display = (settingsPanel.style.display === 'none') ? 'block' : 'none';
    });
    window.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && e.target !== btnToggleSettings) settingsPanel.style.display = 'none';
    });
}

console.log("Modules Loaded & App Started.");
