import { places, transitions, arcs } from '../petri/petri_state.js';
import { state, nodes, edges, elements, camera } from '../../core/state.js';
import { draw } from '../../engine/rendering/render.js';

import { runForceDirectedLayout } from '../../engine/layout/layout_engine.js';

export function runSimpleLayout() {
    if (nodes.length === 0) return;

    const width = elements.canvas ? elements.canvas.width : 800;
    const height = elements.canvas ? elements.canvas.height : 600;

    runForceDirectedLayout(nodes, edges, {
        iterations: 300,
        k: 20,
        gravityStrength: 0.02,
        damping: 0.85,
        maxVelocity: 50,
        width,
        height,
        snapToGrid: state.snapConcurrency,
        onUpdate: () => {
            camera.x = 0;
            camera.y = 0;
            camera.zoom = 1;
            draw();
        }
    });

    console.log(`Layout complete. ${nodes.length} nodes arranged.`);
}

/**
 * Check if the concurrency graph is transitively orientable (comparability graph).
 * Calls the backend API for analysis.
 */
export async function fetchTransitivity() {
    if (nodes.length === 0) {
        return { isOrientable: true, message: "Empty graph is trivially transitively orientable." };
    }

    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        const payload = {
            nodes: nodes.map(n => ({ id: n.id, label: n.label })),
            edges: edges // [u, v] format
        };

        const response = await fetch('/api/analysis/transitivity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.status === 'success') {
            return {
                isOrientable: data.isOrientable,
                message: data.message
            };
        } else {
            console.error("Transitivity API Error:", data.message);
            return {
                isOrientable: false,
                message: `Analysis Error: ${data.message}`
            };
        }
    } catch (err) {
        console.error("Failed to fetch transitivity:", err);
        return {
            isOrientable: false,
            message: "Network Error during analysis."
        };
    }
}

/**
 * Computes optimal graph coloring via backend.
 * Returns { chromaticNumber, coloring: Map<nodeId, colorIndex> }
 */
export async function fetchColoring() {
    if (nodes.length === 0) return { chromaticNumber: 0, coloring: new Map() };

    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        const payload = {
            nodes: nodes.map(n => ({ id: n.id, label: n.label })),
            edges: edges
        };

        const response = await fetch('/api/analysis/coloring', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.status === 'success') {
            // Convert coloring object {id: color} to Map
            const colorMap = new Map();
            if (data.coloring) {
                Object.entries(data.coloring).forEach(([k, v]) => {
                    colorMap.set(parseInt(k), v);
                });
            }
            return {
                chromaticNumber: data.chromaticNumber,
                coloring: colorMap
            };
        } else {
            console.error("Coloring API Error:", data.message);
            return { chromaticNumber: 0, coloring: new Map() };
        }
    } catch (err) {
        console.error("Failed to fetch coloring:", err);
        return { chromaticNumber: 0, coloring: new Map() };
    }
}

export async function updateConcurrencyGraph() {
    console.log("Updating Concurrency Graph (using existing MIS infrastructure)...");

    // GUARD: Capture the tab ID that initiated this request
    const requestingTabId = state.activeTabId;

    const payload = {
        places: places.map(p => ({ ...p, tokens: parseInt(p.tokens) || 0 })),
        transitions: transitions,
        arcs: arcs
    };

    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

        const response = await fetch('/api/petri/concurrency', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // GUARD: Check if we are still in the same tab
        if (state.activeTabId !== requestingTabId) {
            console.warn(`[CONCURRENCY] Ignoring stale update. Requesting Tab: ${requestingTabId}, Current: ${state.activeTabId}`);
            return;
        }

        if (data.status === 'success') {
            console.log("Concurrency Graph Data:", data);

            const newNodes = [];
            const newEdges = [];

            // CACHE PREVIOUS POSITIONS (From Graphs Storage)
            const prevPositions = new Map();
            state.graphs.CONCURRENCY.nodes.forEach(n => {
                if (n.id !== undefined) {
                    prevPositions.set(n.id, { x: n.x, y: n.y });
                }
            });
            console.log(`[CONCURRENCY DEBUG] Cached ${prevPositions.size} previous positions.`);

            // Populate nodes from places
            const width = elements.canvas ? elements.canvas.width : 800;
            const height = elements.canvas ? elements.canvas.height : 600;

            let restoredCount = 0;
            data.nodes.forEach(n => {
                let posX, posY;
                const prev = prevPositions.get(n.id);

                if (prev) {
                    posX = prev.x;
                    posY = prev.y;
                    restoredCount++;
                } else {
                    posX = Math.random() * width * 0.6 + width * 0.2;
                    posY = Math.random() * height * 0.6 + height * 0.2;
                }

                newNodes.push({
                    id: n.id,
                    label: n.label || `p${n.id}`,
                    x: posX,
                    y: posY,
                    vx: 0, vy: 0
                });
            });

            // Populate edges
            data.edges.forEach(edge => {
                newEdges.push([edge[0], edge[1]]);
            });

            // UPDATE STORAGE (Always safe)
            state.graphs.CONCURRENCY.nodes = newNodes;
            state.graphs.CONCURRENCY.edges = newEdges;

            // SYNC TO VIEW ONLY IF ACTIVE
            if (state.appContext === 'CONCURRENCY') {
                nodes.length = 0;
                edges.length = 0;
                newNodes.forEach(n => nodes.push(n));
                newEdges.forEach(e => edges.push(e));

                // Run layout ONLY if significantly changed
                if (restoredCount < nodes.length) {
                    runSimpleLayout();
                } else {
                    console.log("Skipping concurrency layout - positions preserved.");
                }

                draw();
            } else {
                console.log("Concurrency Graph updated in background storage.");
            }

        } else {
            console.error("Concurrency API Error:", data.message);
        }

    } catch (err) {
        console.error("Failed to fetch Concurrency Graph:", err);
    }
}
