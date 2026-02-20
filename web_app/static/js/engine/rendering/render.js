
import { nodes, edges, camera, state, elements } from '../../core/state.js';
import { places } from '../../domain/petri/petri_state.js';

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
        if (window.requestDraw) window.requestDraw();
        else draw();
    }
}

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
export function draw() {
    const { ctx, canvas } = elements;
    if (!ctx || !canvas) return;

    // Clear
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    drawGrid(ctx, canvas, camera);

    // Draw Edges
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#cccccc';

    // 1. Group edges by node pairs to handle multi-edges
    const edgeGroups = {};
    edges.forEach(edge => {
        const u = edge[0]; // ID
        const v = edge[1]; // ID
        if (u === v) return; // Self-loops handled separately

        const key = u < v ? `${u}-${v}` : `${v}-${u}`;
        if (!edgeGroups[key]) edgeGroups[key] = [];
        edgeGroups[key].push(edge);
    });

    // 2. Draw Grouped Edges
    Object.values(edgeGroups).forEach(group => {
        const count = group.length;

        group.forEach((edge, index) => {
            const u = nodes.find(n => n.id === edge[0]);
            const v = nodes.find(n => n.id === edge[1]);
            const rawLabel = edge[2];
            const label = (rawLabel && typeof rawLabel === 'object' && rawLabel.label) ? rawLabel.label : rawLabel;

            if (u && v) {
                let curvature = 0;
                if (count > 1) {
                    const shift = (index - (count - 1) / 2) * 50;
                    curvature = shift;
                }

                ctx.beginPath();
                ctx.moveTo(u.x, u.y);

                const midX = (u.x + v.x) / 2;
                const midY = (u.y + v.y) / 2;

                // Calculate Control Point
                const isCanonical = u.id < v.id;
                const startNode = isCanonical ? u : v;
                const endNode = isCanonical ? v : u;

                const cDx = endNode.x - startNode.x;
                const cDy = endNode.y - startNode.y;
                const cDist = Math.sqrt(cDx * cDx + cDy * cDy);

                const cNx = -cDy / cDist;
                const cNy = cDx / cDist;

                let curveHeight = 0;
                if (count !== 1) {
                    const spacing = 70;
                    curveHeight = (index - (count - 1) / 2) * spacing;
                }

                const cpX = midX + cNx * curveHeight;
                const cpY = midY + cNy * curveHeight;

                if (Math.abs(curveHeight) < 1) {
                    ctx.lineTo(v.x, v.y);
                } else {
                    ctx.quadraticCurveTo(cpX, cpY, v.x, v.y);
                }
                ctx.stroke();

                // --- Arrowhead ---
                if (state.appContext !== 'CONCURRENCY') {
                    let arrowAngle;
                    if (Math.abs(curveHeight) < 1) {
                        const dx = v.x - u.x;
                        const dy = v.y - u.y;
                        arrowAngle = Math.atan2(dy, dx);
                    } else {
                        arrowAngle = Math.atan2(v.y - cpY, v.x - cpX);
                    }

                    const r = 25; // Node radius + buffer
                    const arrowTipX = v.x - Math.cos(arrowAngle) * r;
                    const arrowTipY = v.y - Math.sin(arrowAngle) * r;

                    const headLen = 10;
                    ctx.beginPath();
                    ctx.moveTo(arrowTipX, arrowTipY);
                    ctx.lineTo(arrowTipX - headLen * Math.cos(arrowAngle - Math.PI / 6), arrowTipY - headLen * Math.sin(arrowAngle - Math.PI / 6));
                    ctx.lineTo(arrowTipX - headLen * Math.cos(arrowAngle + Math.PI / 6), arrowTipY - headLen * Math.sin(arrowAngle + Math.PI / 6));
                    ctx.lineTo(arrowTipX, arrowTipY);
                    ctx.fillStyle = '#cccccc';
                    ctx.fill();
                }

                // --- Label ---
                if (label) {
                    let lblX, lblY;
                    if (Math.abs(curveHeight) < 1) {
                        lblX = midX;
                        lblY = midY;
                    } else {
                        lblX = (midX + cpX) / 2;
                        lblY = (midY + cpY) / 2;
                    }

                    ctx.save();
                    ctx.translate(lblX, lblY);

                    ctx.fillStyle = 'rgba(34, 34, 34, 0.8)';
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
    });

    // Rubber Band for Edge Creation
    if (state.mode === 'edges' && state.selectedNode) {
        ctx.beginPath();
        ctx.moveTo(state.selectedNode.x, state.selectedNode.y);
        ctx.lineTo(state.mouseX, state.mouseY);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#cccccc'; // Reset
    }

    const currentMisSet = (state.currentStepIndex >= 0 && state.misSteps[state.currentStepIndex])
        ? new Set(state.misSteps[state.currentStepIndex].mis)
        : new Set();

    // Draw Nodes
    nodes.forEach((node, index) => {
        // Halo for selected state
        if (index === state.selectedReachabilityIndex || state.selectedNode === node) {
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

        const COLOR_PALETTE = [
            '#FF6B6B', '#4ECDC4', '#FFE66D', '#1A535C', '#FF9F1C',
            '#2EC4B6', '#E71D36', '#7209B7', '#3A0CA3', '#4361EE',
            '#F72585', '#4895EF', '#56CFE1', '#4CC9F0', '#B5179E'
        ];

        // Node Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);

        // Color logic
        if (state.appContext === 'CONCURRENCY' && node.color) {
            // Use pre-computed optimal coloring
            ctx.fillStyle = COLOR_PALETTE[(node.color - 1) % COLOR_PALETTE.length];
        } else if (currentMisSet.has(node.id)) {
            ctx.fillStyle = '#FF4B4B'; // Red
        } else {
            ctx.fillStyle = '#1E90FF'; // Blue
        }

        function getContrastColor(hexColor) {
            const r = parseInt(hexColor.substr(1, 2), 16);
            const g = parseInt(hexColor.substr(3, 2), 16);
            const b = parseInt(hexColor.substr(5, 2), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (yiq >= 128) ? '#000000' : '#ffffff';
        }

        const nodeColor = ctx.fillStyle;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw ID inside
        ctx.fillStyle = getContrastColor(nodeColor);
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displayId = (parseInt(node.id) + 1).toString();
        ctx.fillText(displayId, node.x, node.y);

        // Draw Active Places Label BELOW
        if (node.marking) {
            let labelText = '';
            try {
                if (typeof places !== 'undefined' && places && places.length > 0) {
                    const parts = [];
                    const items = [];

                    Object.keys(node.marking).forEach(k => {
                        const pid = parseInt(k);
                        const count = node.marking[pid];
                        if (count > 0) {
                            const place = places.find(p => p.id === pid);
                            const name = place ? (place.label || `p${pid}`) : `p${pid}`;
                            items.push({ name, count });
                        }
                    });

                    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                    items.forEach(item => {
                        parts.push(item.count > 1 ? `${item.count}${item.name}` : item.name);
                    });

                    if (parts.length > 0) labelText = parts.join(', ');
                    else labelText = 'ø';
                }
            } catch (err) {
                console.error("Error generating label for node", node.id, err);
            }

            if (labelText) {
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '11px Inter';
                ctx.fillText(labelText, node.x, node.y + 35);
            }
        } else if (node.label) {
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '11px Inter';
            ctx.fillText(node.label, node.x, node.y + 35);
        }
    });

    ctx.restore();
}
