
import { nodes, edges, camera, state, elements } from './state.js';

// --- COORDINATE SYSTEM ---
export function toWorld(screenX, screenY) {
    return {
        x: (screenX - camera.x) / camera.zoom,
        y: (screenY - camera.y) / camera.zoom
    };
}

export function toScreen(worldX, worldY) {
    return {
        x: (worldX * camera.zoom) + camera.x,
        y: (worldY * camera.zoom) + camera.y
    };
}

export function resizeCanvas() {
    const { canvas, container } = elements;
    if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        draw();
    }
}

// --- DRAWING ---
export function draw() {
    const { ctx, canvas } = elements;
    if (!ctx || !canvas) return;

    // Clear
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw Edges
    ctx.lineWidth = 2; // Fixed width in world space
    ctx.strokeStyle = '#cccccc'; // Light gray

    edges.forEach(edge => {
        const u = nodes.find(n => n.id === edge[0]);
        const v = nodes.find(n => n.id === edge[1]);
        // Handle both string (legacy) and object (NetworkX) label formats
        const rawLabel = edge[2];
        const label = (rawLabel && typeof rawLabel === 'object' && rawLabel.label) ? rawLabel.label : rawLabel;

        if (u && v) {
            // Draw Line
            ctx.beginPath();
            ctx.moveTo(u.x, u.y);
            ctx.lineTo(v.x, v.y);
            ctx.stroke();

            // Calculate Midpoint and Angle
            const midX = (u.x + v.x) / 2;
            const midY = (u.y + v.y) / 2;
            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const angle = Math.atan2(dy, dx);

            // Draw Arrowhead (at 80% distance or near target node radius)
            // Node radius is ~20.
            const dist = Math.sqrt(dx * dx + dy * dy);
            const arrowDist = Math.max(dist - 25, dist / 2); // Stop before node circle

            const arrowX = u.x + (arrowDist / dist) * dx;
            const arrowY = u.y + (arrowDist / dist) * dy;

            const headLen = 10;
            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(arrowX - headLen * Math.cos(angle - Math.PI / 6), arrowY - headLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(arrowX - headLen * Math.cos(angle + Math.PI / 6), arrowY - headLen * Math.sin(angle + Math.PI / 6));
            ctx.lineTo(arrowX, arrowY);
            ctx.fillStyle = '#cccccc';
            ctx.fill();

            // Draw Label
            if (label) {
                ctx.save();
                ctx.translate(midX, midY);
                // No rotation for readability, or align with line? Let's clear rect box for text.
                // ctx.rotate(angle); 

                ctx.fillStyle = '#222'; // Background box
                ctx.fillRect(-10, -8, 20, 16);

                ctx.fillStyle = '#FFD700'; // Gold text
                ctx.font = '12px JetBrains Mono, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, 0, 0);

                ctx.restore();
            }
        }
    });

    // Rubber Band for Edge Creation
    if (state.mode === 'edges' && state.selectedNode) {
        ctx.beginPath();
        ctx.moveTo(state.selectedNode.x, state.selectedNode.y);
        ctx.lineTo(state.mouseX, state.mouseY);
        ctx.strokeStyle = '#FFD700'; // Gold/Yellow
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#cccccc'; // Reset
    }

    // Determine highlighted nodes from current simulation step
    const currentMisSet = (state.currentStepIndex >= 0 && state.misSteps[state.currentStepIndex])
        ? new Set(state.misSteps[state.currentStepIndex].mis)
        : new Set();

    // Draw Nodes
    nodes.forEach(node => {
        // Halo for selected node (Edit Mode)
        if (state.selectedNode === node) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 28, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fill();
        }

        // Halo for MIS highlight (Simulation Mode)
        if (currentMisSet.has(node.id)) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
            ctx.fill();
        }

        // Node Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);

        // Color logic
        if (currentMisSet.has(node.id)) {
            ctx.fillStyle = '#FF4B4B'; // Red
        } else {
            ctx.fillStyle = '#1E90FF'; // Blue
        }

        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // ID Label inside
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id, node.x, node.y);

        // State Label (Marking) below
        if (node.label) {
            ctx.fillStyle = '#ccc';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(node.label, node.x, node.y + 35); // Offset below radius (20) + padding
        }
    });

    ctx.restore();
}
