
import { state, nodes, edges, elements } from './state.js';
import { places, transitions, arcs } from './petri_state.js';

export function updateStats() {
    const stats = document.getElementById('graphStats');
    if (stats) {
        if (state.appContext === 'PETRI') {
            const totalTokens = places.reduce((sum, p) => sum + (p.tokens || 0), 0);
            stats.textContent = `Places: ${places.length} | Transitions: ${transitions.length} | Arcs: ${arcs.length} | Tokens: ${totalTokens}`;
        } else {
            // MIS / Reachability Graph
            let statusText = `Nodes: ${nodes.length} | Edges: ${edges.length}`;
            if (state.graphTruncated) {
                statusText += ' | ⚠️ TRUNCATED (possible unbounded net)';
            } else if (nodes.length > 0) {
                statusText += ' | ✓ Complete';
            }
            stats.textContent = statusText;
        }
    }

    // Dynamic Icon Update
    const iconNum = document.getElementById('iconNodeNum');
    if (iconNum) {
        if (state.appContext === 'PETRI') {
            // For Petri, maybe show places? Or total count? Let's show places + transitions
            iconNum.textContent = places.length + transitions.length;
        } else {
            const nextId = nodes.length > 0 ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
            iconNum.textContent = nextId;
        }
    }

    // Enable simulation buttons if graph exists
    const hasGraph = nodes.length > 0;
    const btnNext = document.getElementById('btnNext');
    const btnAuto = document.getElementById('btnAuto');
    const btnPrev = document.getElementById('btnPrev');

    if (btnNext) btnNext.disabled = !hasGraph;
    if (btnAuto) btnAuto.disabled = !hasGraph;
    if (btnPrev) btnPrev.disabled = true; // Always disabled until simulation starts
}

export function updateButtonStates() {
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');

    if (btnPrev) btnPrev.disabled = (state.currentStepIndex <= 0);
    if (btnNext) btnNext.disabled = (state.misSteps.length > 0 && state.currentStepIndex >= state.misSteps.length - 1);
}

export function updateResultsList() {
    console.log("Updating Results List. Steps:", state.misSteps.length);
    if (elements.resultsList) {
        if (state.misSteps.length > 0) {
            elements.resultsList.innerHTML = '';
            state.misSteps.forEach((step, index) => {
                const el = document.createElement('div');
                el.className = 'result-item';
                // Handle both raw array (old?) or object {mis: []} (new)
                const misArray = Array.isArray(step) ? step : (step.mis || []);
                el.textContent = `${index + 1}. { ${misArray.join(', ')} }`;
                el.onclick = () => {
                    import('./simulation.js').then(module => {
                        state.currentStepIndex = index;
                        module.stopAutoPlay();
                        module.highlightResultItem(index);
                        import('./render.js').then(r => r.draw());
                        updateButtonStates();
                    });
                };
                elements.resultsList.appendChild(el);
            });
        } else {
            elements.resultsList.innerHTML = '<div class="empty-state">Click Next or Auto to start simulation.</div>';
        }
    }
}

export function setMode(newMode) {
    state.mode = newMode;
    state.selectedNode = null;

    const btnModeView = document.getElementById('btnModeView');
    const btnModeNode = document.getElementById('btnModeNode');
    const btnModeEdge = document.getElementById('btnModeEdge');

    [btnModeView, btnModeNode, btnModeEdge].forEach(b => b && b.classList.remove('active'));

    if (state.mode === 'view' && btnModeView) btnModeView.classList.add('active');
    if (state.mode === 'nodes' && btnModeNode) btnModeNode.classList.add('active');
    if (state.mode === 'edges' && btnModeEdge) btnModeEdge.classList.add('active');

    if (elements.canvas) {
        elements.canvas.style.cursor = state.mode === 'view' ? 'grab' : 'crosshair';
    }
}

export function updateReadOnlyUI() {
    const isReadOnly = state.isGenerated;

    const btnModeNode = document.getElementById('btnModeNode');
    const btnModeEdge = document.getElementById('btnModeEdge');
    const btnDelete = document.getElementById('btnDelete');
    const btnClear = document.getElementById('btnClear');

    // Disable Creation Tools ONLY
    [btnModeNode, btnModeEdge].forEach(btn => {
        if (btn) {
            btn.disabled = isReadOnly;
            btn.style.opacity = isReadOnly ? '0.3' : '1';
            btn.style.pointerEvents = isReadOnly ? 'none' : 'auto';
        }
    });

    // Delete and Clear should remained ENABLED
    [btnDelete, btnClear].forEach(btn => {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    });

    // If currently in creation mode, switch to view
    if (isReadOnly && (state.mode === 'nodes' || state.mode === 'edges')) {
        setMode('view');
    }
}
