import { state, nodes, edges, elements } from '../../core/state.js';
import { places, transitions, arcs } from './petri_state.js';
import { draw } from '../../engine/rendering/render.js';
import { updateButtonStates, updateResultsList } from '../../ui/ui.js';
import { triggerAutoSave } from '../../core/tabs.js';

export function resetSimulation() {
    state.misSteps = [];
    state.currentStepIndex = -1;
    stopAutoPlay();

    updateResultsList();

    const btnPrev = document.getElementById('btnPrev');
    if (btnPrev) btnPrev.disabled = true;

    draw();
}

function appendResultItem(step, index) {
    if (!elements.resultsList) return;
    const div = document.createElement('div');
    div.className = 'result-item';

    const misText = `{ ${step.mis.join(', ')} }`;
    const span = document.createElement('span');
    span.textContent = `${index + 1}. ${misText}`;
    div.appendChild(span);

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
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
        if (btnStart) {
            btnStart.textContent = 'Start / Reset';
            btnStart.classList.remove('danger');
            btnStart.disabled = false;
        }
        return false;
    }

    if (nodes.length === 0) return false;

    state.misSteps = [];
    state.currentStepIndex = -1;
    if (elements.resultsList) elements.resultsList.innerHTML = '';

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
        btnStart.disabled = false;
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
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') break;

                    try {
                        const step = JSON.parse(jsonStr);

                        if (step.type === 'new_graph') {
                            nodes.length = 0;
                            edges.length = 0;

                            step.nodes.forEach(n => nodes.push(n));
                            step.edges.forEach(e => edges.push({ source: e[0], target: e[1], label: e[2]?.label }));

                            import('../../ui/ui.js').then(ui => {
                                const tabContextGraph = document.getElementById('tabContextGraph');
                                if (tabContextGraph) tabContextGraph.click();
                            });

                            continue;
                        }

                        state.misSteps.push(step);
                        appendResultItem(step, step.index);

                        if (step.index % 5 === 0) {
                            if (typeof triggerAutoSave === 'function') triggerAutoSave();
                        }

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
            if (typeof triggerAutoSave === 'function') triggerAutoSave();
            return false;
        }

        console.error("Fetch/Stream Error:", err);
        return false;
    } finally {
        if (state.abortController) {
            state.abortController = null;
        }

        if (btnStart) {
            btnStart.textContent = 'Start / Reset';
            btnStart.classList.remove('danger');
            btnStart.disabled = false;
        }
    }
}

export function advanceStep() {
    if (state.currentStepIndex < state.misSteps.length - 1) {
        state.currentStepIndex++;

        highlightResultItem(state.currentStepIndex);

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
