
import { places, transitions, arcs } from './petri_state.js';
import { state, nodes, edges, elements, camera } from './state.js';
import { draw } from './render.js';

// Simple force-directed layout (same logic as MIS uses)
export function runSimpleLayout() {
    if (nodes.length === 0) return;

    const width = elements.canvas ? elements.canvas.width : 800;
    const height = elements.canvas ? elements.canvas.height : 600;
    const center = { x: width / 2, y: height / 2 };

    // Initialize positions in a small circle if nodes are clustered
    const allSamePos = nodes.every(n =>
        Math.abs(n.x - nodes[0].x) < 10 && Math.abs(n.y - nodes[0].y) < 10
    );

    if (allSamePos || nodes.some(n => isNaN(n.x) || isNaN(n.y))) {
        // Arrange in a compact circle
        const radius = 50 + nodes.length * 5; // Small initial radius
        nodes.forEach((n, i) => {
            const angle = (2 * Math.PI * i) / nodes.length;
            n.x = center.x + radius * Math.cos(angle);
            n.y = center.y + radius * Math.sin(angle);
        });
    }

    // Reset velocities
    nodes.forEach(n => { n.vx = 0; n.vy = 0; });

    const k = 20; // Ideal edge length (smaller = tighter graph)
    const iterations = 300;

    for (let iter = 0; iter < iterations; iter++) {
        const cooling = 1 - iter / iterations; // Cooling factor

        // Repulsion between all node pairs
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (k * k) / dist * cooling;

                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                nodes[i].vx += fx;
                nodes[i].vy += fy;
                nodes[j].vx -= fx;
                nodes[j].vy -= fy;
            }
        }

        // Attraction for connected nodes
        edges.forEach(edge => {
            const n1 = nodes.find(n => n.id === edge.source);
            const n2 = nodes.find(n => n.id === edge.target);
            if (!n1 || !n2) return;

            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist / k) * cooling;

            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            n1.vx -= fx;
            n1.vy -= fy;
            n2.vx += fx;
            n2.vy += fy;
        });

        // Strong center gravity
        nodes.forEach(n => {
            n.vx += (center.x - n.x) * 0.02 * cooling;
            n.vy += (center.y - n.y) * 0.02 * cooling;
        });

        // Apply velocity with damping and speed limit
        nodes.forEach(n => {
            n.vx *= 0.85;
            n.vy *= 0.85;
            const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
            const maxSpeed = 50 * cooling + 5;
            if (speed > maxSpeed) {
                n.vx = (n.vx / speed) * maxSpeed;
                n.vy = (n.vy / speed) * maxSpeed;
            }
            n.x += n.vx;
            n.y += n.vy;
        });
    }

    // Final centering pass
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
    });
    const graphCx = (minX + maxX) / 2;
    const graphCy = (minY + maxY) / 2;

    nodes.forEach(n => {
        n.x -= graphCx - center.x;
        n.y -= graphCy - center.y;
    });

    // Snap to grid if enabled
    if (state.snapConcurrency) {
        const gridSize = 50;
        nodes.forEach(n => {
            n.x = Math.round(n.x / gridSize) * gridSize;
            n.y = Math.round(n.y / gridSize) * gridSize;
        });
    }

    // Reset camera to show centered graph
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;

    console.log(`Layout complete. ${nodes.length} nodes arranged.`);
    draw();
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
            // Use existing stored nodes from GRAPH storage
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
