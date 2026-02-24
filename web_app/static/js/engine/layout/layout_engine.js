
import { state, camera } from '../../core/state.js';
import { draw } from '../rendering/render.js';

/**
 * Generalized Force-Directed Layout Engine
 * Consolidates layout logic from MIS, Petri, and Concurrency views.
 */
export function runForceDirectedLayout(nodes, edges, options = {}) {
    if (!nodes || nodes.length === 0) return;

    const {
        iterations = 100,
        k = 100,
        repulsionStrength = 1.0,
        attractionStrength = 1.0,
        gravityStrength = 0.02,
        damping = 0.5,
        maxVelocity = 10,
        width = 800,
        height = 600,
        padding = 50,
        center = { x: 400, y: 300 },
        snapToGrid = false,
        gridSize = 50,
        isPetri = false, // Special handling for Petri arc types
        onUpdate = null
    } = options;

    // 1. Initialize positions if all at 0,0 or NaN
    const needsInit = nodes.every(n => (n.x === 0 && n.y === 0) || isNaN(n.x) || isNaN(n.y));
    if (needsInit) {
        nodes.forEach((node, i) => {
            node.x = Math.random() * (width - 2 * padding) + padding;
            node.y = Math.random() * (height - 2 * padding) + padding;
            node.vx = 0;
            node.vy = 0;
        });
    }

    // 2. Main Simulation Loop
    for (let i = 0; i < iterations; i++) {
        const cooling = 1 - (i / iterations);

        // Repulsion
        for (let a = 0; a < nodes.length; a++) {
            for (let b = a + 1; b < nodes.length; b++) {
                const u = nodes[a];
                const v = nodes[b];
                const dx = u.x - v.x;
                const dy = u.y - v.y;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq) || 1;

                const force = ((k * k) / dist) * repulsionStrength * cooling;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                u.vx = (u.vx || 0) + fx;
                u.vy = (u.vy || 0) + fy;
                v.vx = (v.vx || 0) - fx;
                v.vy = (v.vy || 0) - fy;
            }
        }

        // Attraction
        edges.forEach(edge => {
            let u, v;

            // Handle different edge formats: [id1, id2] or {sourceId/targetId} or {source/target}
            if (Array.isArray(edge)) {
                u = nodes.find(n => n.id === edge[0]);
                v = nodes.find(n => n.id === edge[1]);
            } else if (edge.sourceId !== undefined) {
                // Petri style or hybrid
                u = nodes.find(n => n.id === edge.sourceId && (isPetri ? (edge.type === 'place_to_transition' ? 'tokens' in n : !('tokens' in n)) : true));
                v = nodes.find(n => n.id === edge.targetId && (isPetri ? (edge.type === 'transition_to_place' ? 'tokens' in n : !('tokens' in n)) : true));
            } else {
                // Concurrency style {source, target}
                u = nodes.find(n => n.id === edge.source);
                v = nodes.find(n => n.id === edge.target);
            }

            if (!u || !v) return;

            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 1;

            const force = (distSq / k) * attractionStrength * cooling;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            u.vx = (u.vx || 0) + fx;
            u.vy = (u.vy || 0) + fy;
            v.vx = (v.vx || 0) - fx;
            v.vy = (v.vy || 0) - fy;
        });

        // Gravity/Center Attraction
        nodes.forEach(n => {
            n.vx = (n.vx || 0) + (center.x - n.x) * gravityStrength * cooling;
            n.vy = (n.vy || 0) + (center.y - n.y) * gravityStrength * cooling;
        });

        // Apply Forces
        nodes.forEach(n => {
            const vx = Math.min(Math.max(n.vx * 0.1, -maxVelocity), maxVelocity);
            const vy = Math.min(Math.max(n.vy * 0.1, -maxVelocity), maxVelocity);
            n.x += vx;
            n.y += vy;
            n.vx *= damping;
            n.vy *= damping;
        });
    }

    // 3. Post-processing: Centering & Snapping
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

            if (snapToGrid) {
                n.x = Math.round(n.x / gridSize) * gridSize;
                n.y = Math.round(n.y / gridSize) * gridSize;
            }
        });
    }

    if (onUpdate) onUpdate();
}
