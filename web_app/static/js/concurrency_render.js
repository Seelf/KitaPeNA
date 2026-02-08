
import { elements } from './state.js';

// State specific to Concurrency Graph
export const concurrencyState = {
    nodes: [],
    edges: [], // [id1, id2] - undirected
    camera: { x: 0, y: 0, zoom: 1 },
    isDragging: false,
    lastX: 0,
    lastY: 0,
    dragNode: null
};

// --- COORDINATE SYSTEM ---
export function toWorld(screenX, screenY) {
    const { canvas } = elements;
    const rect = canvas.getBoundingClientRect();
    const x = (screenX - rect.left - concurrencyState.camera.x) / concurrencyState.camera.zoom;
    const y = (screenY - rect.top - concurrencyState.camera.y) / concurrencyState.camera.zoom;
    return { x, y };
}

// Draw grid background
function drawGrid(ctx, canvas, cam) {
    const gridSize = 50;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    const startX = Math.floor((-cam.x / cam.zoom) / gridSize) * gridSize;
    const startY = Math.floor((-cam.y / cam.zoom) / gridSize) * gridSize;
    const endX = Math.ceil((canvas.width - cam.x) / cam.zoom / gridSize) * gridSize;
    const endY = Math.ceil((canvas.height - cam.y) / cam.zoom / gridSize) * gridSize;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
    }
    ctx.stroke();
    ctx.restore();
}

// --- DRAWING ---
export function drawConcurrency() {
    const { ctx, canvas } = elements;
    if (!ctx || !canvas) return;

    // Clear
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(concurrencyState.camera.x, concurrencyState.camera.y);
    ctx.scale(concurrencyState.camera.zoom, concurrencyState.camera.zoom);

    // Draw grid
    drawGrid(ctx, canvas, concurrencyState.camera);

    // Draw Edges (Undirected)
    ctx.strokeStyle = '#00bcd4'; // Cyan
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;

    concurrencyState.edges.forEach(edge => {
        // edge is [id1, id2]
        const n1 = concurrencyState.nodes.find(n => n.id === edge[0]);
        const n2 = concurrencyState.nodes.find(n => n.id === edge[1]);

        if (n1 && n2) {
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
        }
    });

    ctx.globalAlpha = 1.0;

    // Draw Nodes (Places)
    concurrencyState.nodes.forEach(node => {
        // Body
        ctx.beginPath();
        ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = '#2196f3'; // Blue
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label (below node, with offset support)
        ctx.fillStyle = '#fff';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelX = node.x + (node.labelOffsetX || 0);
        const labelY = node.y + 25 + (node.labelOffsetY || 0);
        ctx.fillText(node.label || `p${node.id}`, labelX, labelY);
    });

    ctx.restore();
}

// --- INTERACTIONS ---
// We can mostly reuse interaction patterns, but need to route them in `interactions.js`
