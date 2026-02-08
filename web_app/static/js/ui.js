
import { state, nodes, edges, elements } from './state.js';
import { places, transitions, arcs } from './petri_state.js';
import { drawPetri } from './petri_render.js';
import { saveToLocalStorage } from './storage.js';

export function updateStats() {
    const stats = document.getElementById('graphStats');
    if (stats) {
        if (state.appContext === 'PETRI') {
            const totalTokens = places.reduce((sum, p) => sum + (p.tokens || 0), 0);
            stats.textContent = `Places: ${places.length} | Transitions: ${transitions.length} | Arcs: ${arcs.length} | Tokens: ${totalTokens}`;
        } else if (state.appContext === 'CONCURRENCY') {
            // Concurrency now uses global nodes/edges (same as MIS)
            stats.textContent = `Concurrency Graph | Places: ${nodes.length} | Concurrent Pairs: ${edges.length}`;
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
        } else if (state.appContext === 'CONCURRENCY') {
            // CONCURRENCY now uses global nodes (shared with MIS)
            iconNum.textContent = nodes.length;
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
    console.log("Updating Results List. Context:", state.appContext);
    if (!elements.resultsList) return;

    elements.resultsList.innerHTML = '';

    if (state.appContext === 'MIS') {
        // --- MIS RESULTS ---
        if (state.misSteps.length > 0) {
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
    } else if (state.appContext === 'PETRI') {
        // --- PETRI REACHABILITY STATES ---
        // Check if we have reachability graph nodes
        const reachabilityNodes = nodes.filter(n => n.marking); // Only nodes with marking data

        if (reachabilityNodes.length > 0) {
            const header = document.createElement('div');
            header.className = 'result-header'; // You might need to add CSS for this, or reuse existing
            header.style.padding = '5px 10px';
            header.style.fontWeight = 'bold';
            header.style.color = '#ccc';
            header.textContent = `Reachable States (${reachabilityNodes.length})`;
            elements.resultsList.appendChild(header);

            reachabilityNodes.sort((a, b) => a.id - b.id).forEach((node, index) => {
                const el = document.createElement('div');
                el.className = 'result-item';
                if (index === state.selectedReachabilityIndex) el.classList.add('active'); // Highlight

                // Dynamic Label Generation (Client-Side) from current Place labels
                let labelText = node.label || 'Unknown';

                if (state.appContext === 'PETRI' && node.marking) {
                    const parts = [];
                    const items = [];

                    Object.keys(node.marking).forEach(k => {
                        const pid = parseInt(k);
                        const count = node.marking[pid];
                        if (count > 0) {
                            const place = places.find(p => p.id === pid);
                            const name = place ? (place.label || `p${pid}`) : `p${pid}`;
                            items.push({ name, count });
                        }
                    });

                    // Sort Alphabetically
                    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                    items.forEach(item => {
                        if (item.count > 1) {
                            parts.push(`${item.count}${item.name}`);
                        } else {
                            parts.push(item.name);
                        }
                    });

                    if (parts.length > 0) labelText = parts.join(', ');
                    else labelText = 'ø'; // Empty
                }

                el.textContent = `State ${node.id}: ${labelText}`;
                el.title = JSON.stringify(node.marking);

                el.onclick = () => {
                    state.selectedReachabilityIndex = index; // Update index on click
                    // Restore State Logic
                    console.log(`Restoring Petri State ${node.id} from list`, node.marking);
                    // Update places tokens
                    let restoredCount = 0;
                    for (const p of places) {
                        if (node.marking[p.id] !== undefined) {
                            p.tokens = node.marking[p.id];
                            restoredCount++;
                        }
                    }
                    if (restoredCount > 0) {
                        import('./petri_render.js').then(pr => pr.drawPetri());
                        updateStats();
                        saveToLocalStorage();
                        // Highlight selected item
                        updateResultsList(); // Re-render to show highlight
                    }
                };
                elements.resultsList.appendChild(el);
            });

            // Scroll to active element
            const activeEl = elements.resultsList.querySelector('.active');
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            elements.resultsList.innerHTML = '<div class="empty-state">No reachable states found. Run "Generate Graph" first.</div>';
        }
    } else if (state.appContext === 'CONCURRENCY') {
        // Concurrency now uses global nodes (same as MIS)
        if (nodes.length > 0) {
            const header = document.createElement('div');
            header.className = 'result-header';
            header.style.padding = '5px 10px';
            header.style.fontWeight = 'bold';
            header.style.color = '#ccc';
            header.textContent = `Places (${nodes.length})`;
            elements.resultsList.appendChild(header);

            nodes.forEach(node => {
                const el = document.createElement('div');
                el.className = 'result-item';
                el.textContent = node.label || `p${node.id}`;
                elements.resultsList.appendChild(el);
            });
        } else {
            elements.resultsList.innerHTML = '<div class="empty-state">No concurrency graph. Switch to Structural view first.</div>';
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
            // Only update if changed to avoid focus loss
            if (btn.disabled !== isReadOnly) {
                btn.disabled = isReadOnly;
                btn.style.opacity = isReadOnly ? '0.3' : '1';
                btn.style.pointerEvents = isReadOnly ? 'none' : 'auto';
            }
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
    // COMMENTED OUT: This might be causing "switch"-like behavior if tools are active
    // if (isReadOnly && (state.mode === 'nodes' || state.mode === 'edges')) {
    //    setMode('view');
    // }
}

export function initViewSettings() {
    const chkSnapReachability = document.getElementById('chkSnapReachability');
    if (chkSnapReachability) {
        // Load saved preference from localStorage
        const savedSnapReach = localStorage.getItem('kitapena_snapReachability');
        if (savedSnapReach !== null) {
            state.snapReachability = savedSnapReach === 'true';
        }
        chkSnapReachability.checked = state.snapReachability;

        chkSnapReachability.addEventListener('change', (e) => {
            state.snapReachability = e.target.checked;
            localStorage.setItem('kitapena_snapReachability', state.snapReachability);
        });
    }

    const chkSnapConcurrency = document.getElementById('chkSnapConcurrency');
    if (chkSnapConcurrency) {
        // Load saved preference from localStorage
        const savedSnapConc = localStorage.getItem('kitapena_snapConcurrency');
        if (savedSnapConc !== null) {
            state.snapConcurrency = savedSnapConc === 'true';
        }
        chkSnapConcurrency.checked = state.snapConcurrency;

        chkSnapConcurrency.addEventListener('change', (e) => {
            state.snapConcurrency = e.target.checked;
            localStorage.setItem('kitapena_snapConcurrency', state.snapConcurrency);
        });
    }
}
