
import { places, transitions, arcs } from './petri_state.js';
import { concurrencyState, drawConcurrency } from './concurrency_render.js';
import { state, elements } from './state.js';

export async function updateConcurrencyGraph() {
    console.log("Updating Concurrency Graph...");

    // Prepare Payload
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
            console.log("Concurrency Graph Data:", data);

            // Map data to state
            // Keep existing positions if possible? 
            // Or just re-layout every time since mostly structural change?
            // Re-layout is safer for now.

            concurrencyState.nodes = data.nodes.map(n => ({
                id: n.id,
                label: n.label,
                x: Math.random() * 800, // Random init
                y: Math.random() * 600,
                vx: 0, vy: 0
            }));

            concurrencyState.edges = data.edges; // [[id1, id2], ...]

            runConcurrencyLayout();

        } else {
            console.error("Concurrency API Error:", data.message);
        }

    } catch (err) {
        console.error("Failed to fetch Concurrency Graph:", err);
    }
}

function runConcurrencyLayout() {
    // Simple Force Directed Layout implementation (since we can't easily import d3 here without CDN/Build steps)
    // Or reuse the one from main.js if accessible?
    // Let's implement a simple one here for self-containment.

    const nodes = concurrencyState.nodes;
    const edges = concurrencyState.edges;
    const width = elements.canvas ? elements.canvas.width : 800;
    const height = elements.canvas ? elements.canvas.height : 600;
    const center = { x: width / 2, y: height / 2 };

    const k = 100; // Layout constant (spacing)
    const iterations = 300;

    for (let iter = 0; iter < iterations; iter++) {
        // Repulsion
        for (let i = 0; i < nodes.length; i++) {
            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const n1 = nodes[i];
                const n2 = nodes[j];
                const dx = n1.x - n2.x;
                const dy = n1.y - n2.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const force = (k * k) / dist;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                n1.vx += fx;
                n1.vy += fy;
            }
        }

        // Attraction
        edges.forEach(edge => {
            const n1 = nodes.find(n => n.id === edge[0]);
            const n2 = nodes.find(n => n.id === edge[1]);
            if (!n1 || !n2) return;

            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            const force = (dist * dist) / k;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            n1.vx -= fx;
            n1.vy -= fy;
            n2.vx += fx;
            n2.vy += fy;
        });

        // Center Gravity
        nodes.forEach(n => {
            const dx = center.x - n.x;
            const dy = center.y - n.y;
            n.vx += dx * 0.05;
            n.vy += dy * 0.05;
        });

        // Update
        nodes.forEach(n => {
            // Velocity Damping
            n.vx *= 0.5;
            n.vy *= 0.5;

            // Limit speed
            const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
            if (speed > 50) {
                n.vx = (n.vx / speed) * 50;
                n.vy = (n.vy / speed) * 50;
            }

            n.x += n.vx;
            n.y += n.vy;
        });
    }

    // Center properly
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

            // Apply zoom/pan init logic if needed
        });

        // Reset Camera
        concurrencyState.camera.x = 0;
        concurrencyState.camera.y = 0;
        concurrencyState.camera.zoom = 1;

        // Initial draw
        drawConcurrency();
    }
}
