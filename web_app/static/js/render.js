
import { nodes, edges, camera, state, elements } from './state.js';
import { places } from './petri_state.js';

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
    // Draw Edges
    ctx.lineWidth = 2; // Fixed width in world space
    ctx.strokeStyle = '#cccccc'; // Light gray

    // 1. Group edges by node pairs to handle multi-edges
    const edgeGroups = {};
    edges.forEach(edge => {
        const u = edge[0]; // ID
        const v = edge[1]; // ID
        if (u === v) return; // Self-loops handled separately later (TODO)

        const key = u < v ? `${u}-${v}` : `${v}-${u}`;
        if (!edgeGroups[key]) edgeGroups[key] = [];
        edgeGroups[key].push(edge);
    });

    // 2. Draw Grouped Edges
    Object.values(edgeGroups).forEach(group => {
        const isMulti = group.length > 1;
        // DEBUG: Log group info to debug missing edges
        if (state.currentStepIndex % 60 === 0 && Math.random() < 0.05) { // Throttle logs
            console.log(`Render Group: ${group.length} edges`, group);
        }

        // Count edges for each direction in this group for balancing? 
        // Simpler: Just spread them out based on index.
        // If we have A->B and B->A (2 edges), we want one curve + one curve -.

        const count = group.length;

        group.forEach((edge, index) => {
            const u = nodes.find(n => n.id === edge[0]);
            const v = nodes.find(n => n.id === edge[1]);
            // Handle both string (legacy) and object (NetworkX) label formats
            const rawLabel = edge[2];
            const label = (rawLabel && typeof rawLabel === 'object' && rawLabel.label) ? rawLabel.label : rawLabel;

            if (u && v) {
                // Calculate Curve Factor
                // 0 for single edge.
                // For multiple: 
                // index 0 -> 0.2
                // index 1 -> -0.2
                // index 2 -> 0.4
                // index 3 -> -0.4

                let curvature = 0;
                if (count > 1) {
                    // Try to alternating sides
                    // If A->B and B->A, we want them to curve strictly on "their right" relative to direction?
                    // Or just use index spread.
                    // Let's use index spread relative to the SORTED pair A-B.
                    // So if we have A->B (idx 0) and B->A (idx 1).
                    // We just shift logic slightly.

                    // Simple logic:
                    // spread offset: (index - (count-1)/2) * spacing
                    // This centers them around straight line?
                    // Better: Alternating: 0, 1, -1, 2, -2... * scale

                    // Let's try "canonical right" curvature for bidirectional graphs.
                    // If we just use standard shift:
                    const shift = (index - (count - 1) / 2) * 50; // visual offset distance
                    curvature = shift; // This handles 'distance' from straight line

                    // WAIT: 'curvature' usually implies a ratio of distance.
                    // Let's call it control point offset.
                }

                // If purely bidirectional (1 A->B, 1 B->A), index 0 gives -0.5*50 = -25?
                // Let's refine.
                // 2 edges: -25, +25.
                // 3 edges: -50, 0, 50.

                // Draw Line / Curve
                ctx.beginPath();
                ctx.moveTo(u.x, u.y);

                const midX = (u.x + v.x) / 2;
                const midY = (u.y + v.y) / 2;
                const dx = v.x - u.x;
                const dy = v.y - u.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);

                // Calculate Control Point
                // FIX: Use Canonical Direction (minID -> maxID) so normal is consistent
                // This prevents oppposite edges (A->B and B->A) from having their curvature cancelled out.
                const isCanonical = u.id < v.id;
                const startNode = isCanonical ? u : v;
                const endNode = isCanonical ? v : u;

                const cDx = endNode.x - startNode.x;
                const cDy = endNode.y - startNode.y;
                const cDist = Math.sqrt(cDx * cDx + cDy * cDy);

                // Canonical Normal (Left relative to start->end)
                const cNx = -cDy / cDist;
                const cNy = cDx / cDist;

                // Index-based spread with Alternating Pattern for better visibility
                // Logic: 0 -> 0 (Straight), 1 -> +1, 2 -> -1, 3 -> +2, 4 -> -2 ...
                // But for standard "Fan", let's keeps it simple but ensure NO straight line if possible?
                // Actually, straight line is fine if labels don't overlap.
                // The problem with previous (index - (count-1)/2) is that for large counts, it spreads wide but center is crowded.

                // Let's use Alternating Strategy to ensure labels are distinct:
                // indices: 0, 1, 2, 3...
                // offsets: 0, 60, -60, 120, -120...

                let curveHeight = 0;
                if (count === 1) {
                    curveHeight = 0;
                } else {
                    // Start from 0? No, let's start from outward.
                    // If even count (2): -30, +30.
                    // If odd count (3): -60, 0, +60? Or 0, -60, +60.

                    // Let's us simple centering logic but with much larger spacing step.
                    // spacing = 60 was good.
                    // Maybe we need to shift the label perpendicular to the curve peak?

                    // Let's stick to the symmetric fan but strictly enforce non-zero if count=2.
                    // (index - (count - 1) / 2) works for symmetry.
                    // count=3: -1, 0, 1.
                    // count=10: -4.5 ... 4.5.  Limit is 4.5*60 = 270px.

                    const spacing = 70;
                    curveHeight = (index - (count - 1) / 2) * spacing;

                    // Prevent near-zero curvature from looking like straight line if ambiguous?
                    // No, 0 is fine.
                }

                const cpX = midX + cNx * curveHeight;
                const cpY = midY + cNy * curveHeight;

                if (Math.abs(curveHeight) < 1) {
                    // Straight line
                    ctx.lineTo(v.x, v.y);
                } else {
                    ctx.quadraticCurveTo(cpX, cpY, v.x, v.y);
                }
                ctx.stroke();

                // --- Arrowhead ---
                // Tangent at the end of the curve (t=1).
                // Vector CP -> V gives the approximate tangent at V.
                let arrowAngle;
                if (Math.abs(curveHeight) < 1) {
                    arrowAngle = angle;
                } else {
                    arrowAngle = Math.atan2(v.y - cpY, v.x - cpX);
                }

                // Recalculate arrow position on the boundary of the node
                // Node radius ~20.
                // We can just step back from V along the ArrowAngle.
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

                // --- Label ---
                // Should be at t=0.5 (the peak/CP for quadratic? No, B(0.5) is midpoint of curve)
                // B(0.5) = 0.25 P0 + 0.5 P1 + 0.25 P2
                // This is (Mid(P0,P2) + P1) / 2
                // = (Mid(U,V) + CP) / 2

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

                    ctx.fillStyle = 'rgba(34, 34, 34, 0.8)'; // Semi-transparent box
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
    nodes.forEach((node, index) => {
        // Halo for selected state (from list or graph click) - use same style as edit mode
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

        // Draw ID inside (1-based)
        ctx.fillStyle = '#eee';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Ensure ID is treated as number and incremented
        const displayId = (parseInt(node.id) + 1).toString();
        ctx.fillText(displayId, node.x, node.y);

        // Draw Active Places Label BELOW
        if (node.marking) {
            let labelText = '';
            try {
                // Ensure places is available
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
                ctx.fillStyle = '#aaaaaa'; // Citrine/Light Gray
                ctx.font = '11px Inter';
                // Offset below radius (20) + padding (15)
                ctx.fillText(labelText, node.x, node.y + 35);
            }
        }
    });

    ctx.restore();
}
