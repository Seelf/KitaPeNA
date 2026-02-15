
import { state, nodes, edges, camera } from './state.js';
import { draw, resizeCanvas } from '../engine/rendering/render.js';
import { drawPetri } from '../engine/rendering/petri_render.js';
import { updateStats, updateResultsList, updateButtonStates } from '../ui/ui.js';
import { triggerAutoSave } from './tabs.js';

/**
 * Manages app contexts (MIS, PETRI, CONCURRENCY) and UI visibility.
 */
export function switchContext(ctx, skipSave = false) {
    if (!skipSave) {
        saveBufferToStorage();
    }

    state.appContext = ctx;
    restoreCameraForContext(ctx);

    try {
        updateTabButtons(ctx);
        updateToolbars(ctx);

        if (ctx === 'MIS') {
            prepareMisView();
        } else if (ctx === 'PETRI') {
            preparePetriView();
        } else if (ctx === 'CONCURRENCY') {
            prepareConcurrencyView();
        }
    } catch (e) {
        console.error("Error during context switch:", e);
    }

    triggerAutoSave();
    if (ctx !== 'CONCURRENCY') {
        updateResultsList();
    }
}

function saveBufferToStorage() {
    if (state.appContext === 'MIS') {
        state.misCamera = { ...camera };
        state.graphs.MIS.nodes = JSON.parse(JSON.stringify(nodes));
        state.graphs.MIS.edges = JSON.parse(JSON.stringify(edges));
    } else if (state.appContext === 'PETRI') {
        state.petriCamera = { ...camera };
    } else if (state.appContext === 'CONCURRENCY') {
        state.concurrencyCamera = { ...camera };
        state.graphs.CONCURRENCY.nodes = JSON.parse(JSON.stringify(nodes));
        state.graphs.CONCURRENCY.edges = JSON.parse(JSON.stringify(edges));
    }
}

function restoreCameraForContext(ctx) {
    const sourceCam = (ctx === 'MIS') ? state.misCamera : (ctx === 'PETRI' ? state.petriCamera : state.concurrencyCamera);
    if (sourceCam) {
        camera.x = sourceCam.x;
        camera.y = sourceCam.y;
        camera.zoom = sourceCam.zoom;
    } else if (ctx === 'CONCURRENCY') {
        camera.x = 0; camera.y = 0; camera.zoom = 1;
    }
}

function updateTabButtons(ctx) {
    const tabs = {
        'MIS': 'tabContextGraph',
        'PETRI': 'tabContextPetri',
        'CONCURRENCY': 'tabContextConcurrency'
    };
    Object.values(tabs).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    const activeId = tabs[ctx];
    if (activeId) {
        const el = document.getElementById(activeId);
        if (el) el.classList.add('active');
    }
}

function updateToolbars(ctx) {
    const toolbarGraph = document.getElementById('toolbarGraph');
    const toolbarPetri = document.getElementById('toolbarPetri');
    if (toolbarGraph) toolbarGraph.style.display = (ctx === 'MIS' || ctx === 'CONCURRENCY') ? 'flex' : 'none';
    if (toolbarPetri) toolbarPetri.style.display = (ctx === 'PETRI') ? 'flex' : 'none';

    // Concurrency-specific buttons
    const btnCheckTransitive = document.getElementById('btnCheckTransitive');
    const concurrencySeparator = document.getElementById('concurrencySeparator');
    const display = (ctx === 'CONCURRENCY') ? 'block' : 'none';
    if (btnCheckTransitive) btnCheckTransitive.style.display = display;
    if (concurrencySeparator) concurrencySeparator.style.display = display;
}

function prepareMisView() {
    nodes.length = 0;
    edges.length = 0;

    if (state.graphs.MIS.nodes.length > 0) {
        state.graphs.MIS.nodes.forEach(n => nodes.push(n));
        state.graphs.MIS.edges.forEach(e => edges.push(e));
    }

    draw();
    updateStats();
    import('../ui/ui.js').then(ui => ui.updateReadOnlyUI());

    const tabEditor = document.getElementById('tabEditor');
    const viewResults = document.getElementById('viewResults');
    if (tabEditor?.classList.contains('active') && viewResults) {
        viewResults.style.display = 'flex';
    }
}

function preparePetriView() {
    drawPetri();
    updateStats();

    const tabEditor = document.getElementById('tabEditor');
    const viewResults = document.getElementById('viewResults');
    if (viewResults) {
        viewResults.style.display = tabEditor?.classList.contains('active') ? 'flex' : 'none';
    }
}

function prepareConcurrencyView() {
    nodes.length = 0;
    edges.length = 0;

    if (state.graphs.CONCURRENCY.nodes.length > 0) {
        state.graphs.CONCURRENCY.nodes.forEach(n => nodes.push(n));
        state.graphs.CONCURRENCY.edges.forEach(e => edges.push(e));
        draw();
        updateStats();
    } else {
        draw();
        import('../domain/concurrency/concurrency.js').then(m => {
            m.updateConcurrencyGraph().then(() => {
                updateStats();
                updateResultsList();
            });
        });
    }

    const viewResults = document.getElementById('viewResults');
    if (viewResults) viewResults.style.display = 'flex';
}

export function initResizer() {
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
                const newWidth = startWidth - dx;

                if (newWidth >= 150 && newWidth <= 600) {
                    sidebar.style.width = `${newWidth}px`;
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
}
