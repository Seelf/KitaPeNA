import { state, nodes, edges, elements } from './state.js';
import { draw } from './render.js';
import { updateButtonStates, updateResultsList } from './ui.js';
import { triggerAutoSave } from './tabs.js';

export function resetSimulation() {
    state.misSteps = [];
    state.currentStepIndex = -1;
    stopAutoPlay();

    // Clear list but keep empty state
    updateResultsList();

    // Buttons state managed by button disabled props in UI
    const btnPrev = document.getElementById('btnPrev');
    if (btnPrev) btnPrev.disabled = true;

    draw();
}

// Helper to create UI item
function appendResultItem(step, index) {
    if (!elements.resultsList) return;
    const div = document.createElement('div');
    div.className = 'result-item';

    // Main Text
    const misText = `{ ${step.mis.join(', ')} }`;
    const span = document.createElement('span');
    span.textContent = `${index + 1}. ${misText}`;
    div.appendChild(span);

    // Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy-result';
    copyBtn.innerHTML = '📋';
    copyBtn.title = 'Copy to clipboard';

    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(misText).then(() => {
            copyBtn.innerHTML = '✓';
            setTimeout(() => copyBtn.innerHTML = '📋', 1000);
        }).catch(err => console.error('Copy failed', err));
    });
    div.appendChild(copyBtn);

    div.addEventListener('click', () => {
        state.currentStepIndex = index;
        stopAutoPlay();
        highlightResultItem(index);
        draw();
        updateButtonStates();
        div.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    elements.resultsList.appendChild(div);
}

export async function fetchSolution(btnStart) {
    // 1. Check if solving is in progress -> Stop it
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
        if (btnStart) {
            btnStart.textContent = 'Start / Reset';
            btnStart.classList.remove('danger');
            btnStart.disabled = false;
        }
        return false; // Stopped manually
    }

    if (nodes.length === 0) return false;

    // 2. Start Solving
    state.misSteps = [];
    state.currentStepIndex = -1;
    if (elements.resultsList) elements.resultsList.innerHTML = '';

    // Init AbortController
    state.abortController = new AbortController();

    const payload = {};

    if (state.appContext === 'PETRI') {
        payload.places = places;
        payload.transitions = transitions;
        payload.arcs = arcs;
    } else {
        payload.nodes = nodes.map(n => n.id);
        payload.edges = edges;
    }

    if (btnStart) {
        btnStart.textContent = 'Solving... (Stop)';
        btnStart.classList.add('danger');
        btnStart.disabled = false; // Enabled so we can click to stop
    }

    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

        const response = await fetch('/api/solve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify(payload),
            signal: state.abortController.signal
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log("Stream complete");
                if (typeof triggerAutoSave === 'function') triggerAutoSave();
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            console.log("Received Chunk:", chunk);
            buffer += chunk;
            const lines = buffer.split('\n\n');
            buffer = lines.pop(); // Keep incomplete chunk

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') break;

                    try {
                        const step = JSON.parse(jsonStr);

                        // Handle Reachability Graph Context Switch
                        if (step.type === 'new_graph') {
                            // Switch to Graph Mode (Results View)
                            // We need to verify if we want to overwrite existing graph or just show in analysis?
                            // User request: "Determining reachability graph".
                            // Usually this implies seeing it.

                            // 1. Clear current Graph nodes/edges
                            nodes.length = 0;
                            edges.length = 0;

                            // 2. Load new Reachability Graph
                            step.nodes.forEach(n => nodes.push(n));
                            step.edges.forEach(e => edges.push({ source: e[0], target: e[1], label: e[2]?.label }));

                            // 3. Switch Mode
                            // We should probably switch to 'MIS' context to view the graph?
                            // Or keep PETRI but show Graph?
                            // The `state.appContext` controls the render loop.
                            // If we stay in 'PETRI', `drawPetri` is called and shows the Petri Net.
                            // We MUST switch to 'MIS' (Graph Mode) to see the Reachability Graph.

                            import('./ui.js').then(ui => {
                                // Force context switch to Graph
                                const tabContextGraph = document.getElementById('tabContextGraph');
                                if (tabContextGraph) tabContextGraph.click();
                            });

                            continue; // This step was just graph setup, wait for MIS steps
                        }

                        state.misSteps.push(step);
                        appendResultItem(step, step.index);

                        // Trigger Auto Save periodically or on important steps?
                        // If we save on every step, it might be heavy.
                        // Let's save every 5 steps or so? Or just rely on main loop?
                        // Main loop saves every 60s or something?
                        // Let's import triggerAutoSave from main.js if possible, or tabs logic.
                        // simulation.js is a dynamic module.
                        // We can dynamic import tabs.

                        if (step.index % 5 === 0) {
                            if (typeof triggerAutoSave === 'function') triggerAutoSave();
                        }

                        // Auto-select first result immediately
                        if (step.index === 0) {
                            state.currentStepIndex = 0;
                            highlightResultItem(0);
                            draw();
                            updateButtonStates();
                        }
                    } catch (e) {
                        console.error("Parse error", e);
                    }
                }
            }

            // Explicit check if stopped manually during processing
            if (!state.abortController) {
                console.log("Loop detected manual stop");
                break;
            }
        }
        triggerAutoSave();
        return true;

    } catch (err) {
        const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');

        if (isAbort) {
            console.log('Solver aborted by user.');
            // SAVE STATE ON ABORT
            if (typeof triggerAutoSave === 'function') triggerAutoSave();
            return false;
        }

        console.error("Fetch/Stream Error:", err);
        // Suppress alert to prevent ghost errors on page load/unload
        // alert('Failed to connect to server: ' + (err.message || err));
        return false;
    } finally {
        // Reset UI only if not running (done or failed, but if aborted we already handled it top, 
        // actually we should handle cleanup here for safety)
        if (state.abortController) {
            state.abortController = null; // Clear if we finished naturally
        }

        if (btnStart) {
            // Check if we are still "solving" (this finally block runs on abort too)
            // But we handled explicit abort UI above. If natural finish:
            btnStart.textContent = 'Start / Reset';
            btnStart.classList.remove('danger');
            btnStart.disabled = false;
        }
    }
}

export function advanceStep() {
    if (state.currentStepIndex < state.misSteps.length - 1) {
        state.currentStepIndex++;

        // Highlighting Logic only
        highlightResultItem(state.currentStepIndex);

        // Auto scroll
        if (elements.resultsList && elements.resultsList.children[state.currentStepIndex]) {
            elements.resultsList.children[state.currentStepIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        draw();
        updateButtonStates();
    } else {
        stopAutoPlay();
    }
}

export function highlightResultItem(index) {
    if (!elements.resultsList) return;
    Array.from(elements.resultsList.children).forEach(child => child.classList.remove('active'));
    if (elements.resultsList.children[index]) {
        elements.resultsList.children[index].classList.add('active');
    }
}

export function startAutoPlay() {
    state.isPlaying = true;
    const btnAuto = document.getElementById('btnAuto');
    if (btnAuto) btnAuto.textContent = 'Pause';

    // Ensure we don't have multiple intervals
    if (state.playInterval) clearInterval(state.playInterval);
    state.playInterval = setInterval(advanceStep, state.simulationDelay);
}

export function stopAutoPlay() {
    state.isPlaying = false;
    const btnAuto = document.getElementById('btnAuto');
    if (btnAuto) btnAuto.textContent = 'Auto Play';

    if (state.playInterval) clearInterval(state.playInterval);
    state.playInterval = null;
}

export function updateSimulationSpeed() {
    if (state.isPlaying) {
        clearInterval(state.playInterval);
        state.playInterval = setInterval(advanceStep, state.simulationDelay);
    }
}
