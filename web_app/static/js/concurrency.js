
import { places, transitions, arcs } from './petri_state.js';
import { state, nodes, edges, elements, camera } from './state.js';
import { draw } from './render.js';

// Simple force-directed layout (same logic as MIS uses)
function runSimpleLayout() {
    const width = elements.canvas ? elements.canvas.width : 800;
    const height = elements.canvas ? elements.canvas.height : 600;
    const center = { x: width / 2, y: height / 2 };
    const k = 120; // Layout constant
    const iterations = 200;

    for (let iter = 0; iter < iterations; iter++) {
        // Repulsion between all nodes
        for (let i = 0; i < nodes.length; i++) {
            if (!nodes[i].vx) nodes[i].vx = 0;
            if (!nodes[i].vy) nodes[i].vy = 0;

            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const force = (k * k) / dist;
                nodes[i].vx += (dx / dist) * force;
                nodes[i].vy += (dy / dist) * force;
            }
        }

        // Attraction for connected nodes
        edges.forEach(edge => {
            const n1 = nodes.find(n => n.id === edge.source);
            const n2 = nodes.find(n => n.id === edge.target);
            if (!n1 || !n2) return;

            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            const force = (dist * dist) / k;

            n1.vx -= (dx / dist) * force;
            n1.vy -= (dy / dist) * force;
            n2.vx += (dx / dist) * force;
            n2.vy += (dy / dist) * force;
        });

        // Center gravity
        nodes.forEach(n => {
            n.vx += (center.x - n.x) * 0.03;
            n.vy += (center.y - n.y) * 0.03;
        });

        // Apply velocity with damping
        nodes.forEach(n => {
            n.vx *= 0.5;
            n.vy *= 0.5;
            const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
            if (speed > 30) {
                n.vx = (n.vx / speed) * 30;
                n.vy = (n.vy / speed) * 30;
            }
            n.x += n.vx;
            n.y += n.vy;
        });
    }

    // Center graph
    if (nodes.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            maxX = Math.max(maxX, n.x);
            minY = Math.min(minY, n.y);
            maxY = Math.max(maxY, n.y);
        });
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        nodes.forEach(n => {
            n.x -= (cx - center.x);
            n.y -= (cy - center.y);
        });
    }
}

export async function updateConcurrencyGraph() {
    console.log("Updating Concurrency Graph (using existing MIS infrastructure)...");

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

        if (data.status === 'success') {
            // RACE CONDITION CHECK: 
            // If user switched away from CONCURRENCY tab while API was loading, DO NOT update globals.
            if (state.appContext !== 'CONCURRENCY') {
                console.warn("Concurrency API returned but context changed. Aborting update.");
                return;
            }

            console.log("Concurrency Graph Data:", data);

            // CACHE PREVIOUS POSITIONS
            const prevPositions = new Map();
            nodes.forEach(n => {
                if (n.id !== undefined) prevPositions.set(n.id, { x: n.x, y: n.y });
            });

            // Clear global nodes and edges
            nodes.length = 0;
            edges.length = 0;

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

                nodes.push({
                    id: n.id,
                    label: n.label || `p${n.id}`,
                    x: posX,
                    y: posY,
                    vx: 0, vy: 0
                });
            });

            // Populate edges (undirected concurrency relations)
            // render.js expects edge format: [sourceId, targetId, optionalLabel]
            data.edges.forEach(edge => {
                edges.push([edge[0], edge[1]]);
            });

            // REMOVED CAMERA RESET to preserve user view

            // Run layout ONLY if significantly changed
            if (restoredCount < nodes.length) {
                runSimpleLayout();
            } else {
                console.log("Skipping concurrency layout - positions preserved.");
            }

            // Save data to state for persistence across tab switches
            state.concurrencyNodes = [...nodes];
            state.concurrencyEdges = [...edges];

            // Draw
            draw();

        } else {
            console.error("Concurrency API Error:", data.message);
        }

    } catch (err) {
        console.error("Failed to fetch Concurrency Graph:", err);
    }
}
