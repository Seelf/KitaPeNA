
import { state, nodes, edges } from '../../core/state.js';
import { places, transitions, arcs } from './petri_state.js';
import { updateStats, updateResultsList, updateReadOnlyUI } from '../../ui/ui.js';
import { draw } from '../../engine/rendering/render.js';
import { drawPetri } from '../../engine/rendering/petri_render.js';
import { triggerAutoSave } from '../../core/tabs.js';
import { runForceDirectedLayout } from '../../engine/layout/layout_engine.js';

let reachabilityDebounceTimer = null;

/**
 * Communicates with the backend to generate a Reachability Graph from current Petri Net.
 */
export async function generateReachabilityGraph(background = false) {
    if (!background) console.log("Generating Reachability Graph...");

    if (places.length === 0 && transitions.length === 0) {
        if (!background) alert("Petri Net is empty.");
        return false;
    }

    state.initialMarking = {};
    places.forEach(p => {
        state.initialMarking[p.id] = parseInt(p.tokens) || 0;
    });

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

        // Check if we are still in the same tab
        if (state.activeTabId !== requestingTabId) {
            console.warn(`[REACHABILITY] Ignoring stale update.`);
            return false;
        }

        if (data.status === 'success') {
            return processReachabilityData(data, background);
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

function processReachabilityData(data, background) {
    const newNodes = [];
    const newEdges = [];

    // Cache previous positions
    const prevPositions = new Map();
    state.graphs.MIS.nodes.forEach(n => {
        if (n.id !== undefined) prevPositions.set(n.id, { x: n.x, y: n.y });
    });

    let restoredCount = 0;
    if (data.nodes && Array.isArray(data.nodes)) {
        data.nodes.forEach(n => {
            const prev = prevPositions.get(n.id);
            if (prev) {
                n.x = prev.x; n.y = prev.y;
                restoredCount++;
            } else {
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

    state.graphs.MIS.nodes = newNodes;
    state.graphs.MIS.edges = newEdges;

    // Invalidate Concurrency Graph
    state.graphs.CONCURRENCY.nodes = [];
    state.graphs.CONCURRENCY.edges = [];

    state.misSteps = [];
    state.currentStepIndex = 0;
    state.isGenerated = true;
    state.graphTruncated = data.truncated || false;

    triggerAutoSave();

    if (state.appContext === 'MIS') {
        nodes.length = 0;
        edges.length = 0;
        newNodes.forEach(n => nodes.push(n));
        newEdges.forEach(e => edges.push(e));

        if (!background && restoredCount < newNodes.length) {
            runForceDirectedLayout(nodes, edges, {
                iterations: 150,
                k: 150,
                snapToGrid: state.snapReachability
            });
        }

        updateReadOnlyUI();
        updateResultsList();
        draw();
        updateStats();
    } else if (state.appContext === 'PETRI') {
        updateResultsList();
    }

    return true;
}

export function debouncedUpdateReachability() {
    if (reachabilityDebounceTimer) clearTimeout(reachabilityDebounceTimer);
    reachabilityDebounceTimer = setTimeout(() => {
        generateReachabilityGraph(true);
    }, 500);
}
