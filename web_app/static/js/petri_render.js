
import { places, transitions, arcs, petriState } from './petri_state.js';
import { elements, camera } from './state.js';

export function drawPetri() {
    const { ctx, canvas } = elements;
    if (!ctx || !canvas) return;

    // Clear (same background)
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // DEBUG TRACE
    console.log(`DRAW PETRI: ${places.length} Places, ${transitions.length} Transitions. Camera: ${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}, Z=${camera.zoom}`);
    if (places.length > 0) console.log(`Place[0] coords: ${places[0].x}, ${places[0].y}`);

    // 1. Draw Arcs
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#cccccc';

    arcs.forEach(arc => {
        let source, target, sourceType, targetType;

        if (arc.type === 'place_to_transition') {
            source = places.find(p => p.id === arc.sourceId);
            target = transitions.find(t => t.id === arc.targetId);
            sourceType = 'place';
            targetType = 'transition';
        } else {
            source = transitions.find(t => t.id === arc.sourceId);
            target = places.find(p => p.id === arc.targetId);
            sourceType = 'transition';
            targetType = 'place';
        }

        if (source && target) {
            // Calculate angle from source to target
            const angle = Math.atan2(target.y - source.y, target.x - source.x);

            const start = getBorderPoint(source, sourceType, angle);
            const end = getBorderPoint(target, targetType, angle + Math.PI); // Angle from target back to source

            drawArrow(ctx, start.x, start.y, end.x, end.y);
        }
    });

    // Rubber Band for Arc Creation
    if (petriState.mode === 'arc' && petriState.selectedElement) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';

        const source = petriState.selectedElement.element;
        const sourceType = petriState.selectedElement.type;
        const angle = Math.atan2(petriState.mouseY - source.y, petriState.mouseX - source.x);
        const start = getBorderPoint(source, sourceType, angle);

        drawArrow(ctx, start.x, start.y, petriState.mouseX, petriState.mouseY, true);
        ctx.restore();
    }

    // 2. Draw Transistions (Rectangles)
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    const tWidth = 30;
    const tHeight = 50;

    transitions.forEach(t => {
        // Highlight selection
        // Highlight selection
        if (petriState.selectedElement === t) {
            if (petriState.mode === 'arc') {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#FFD700'; // Gold glow for arc source
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 2;
                ctx.fillStyle = '#fff';
            } else {
                ctx.fillStyle = '#4CAF50';
            }
        } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
        }

        ctx.fillRect(t.x - tWidth / 2, t.y - tHeight / 2, tWidth, tHeight);

        // Label
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Inter';
        ctx.fillText(t.label || `t${t.id}`, t.x, t.y + tHeight / 2 + 15);
    });

    // 3. Draw Places (Circles)
    const pRadius = 25;

    places.forEach(p => {
        // Highlight
        if (petriState.selectedElement === p) {
            if (petriState.mode === 'arc') {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#FFD700';
                ctx.strokeStyle = '#FFD700';
            } else {
                ctx.strokeStyle = '#4CAF50';
                ctx.shadowBlur = 0;
            }
            ctx.lineWidth = 4;
        } else {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, pRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#1e1e1e'; // Hollow
        ctx.fill();
        ctx.stroke();

        // Tokens
        if (p.tokens > 0) {
            ctx.fillStyle = '#fff';
            if (p.tokens < 5) {
                // Draw dots
                // Simple pattern for 1-4
                if (p.tokens === 1) {
                    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
                } else {
                    // scatter small dots
                    const offset = 10;
                    for (let i = 0; i < p.tokens; i++) {
                        const angle = (Math.PI * 2 * i) / p.tokens;
                        ctx.beginPath();
                        ctx.arc(p.x + Math.cos(angle) * offset, p.y + Math.sin(angle) * offset, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            } else {
                // Draw number
                ctx.font = 'bold 16px Inter';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.tokens, p.x, p.y);
            }
        }

        // Label
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Inter';
        ctx.fillText(p.label || `p${p.id}`, p.x, p.y + pRadius + 15);
    });

    ctx.shadowBlur = 0; // Reset shadow
    ctx.restore();
}

// Helper to find border point based on node type
function getBorderPoint(element, type, angle) {
    if (type === 'token') return { x: element.x, y: element.y }; // Should not happen for arcs

    if (type === 'place') {
        const r = 25; // Keeping hardcoded for now matching render logic
        return {
            x: element.x + Math.cos(angle) * r,
            y: element.y + Math.sin(angle) * r
        };
    } else { // transition
        // Rectangle intersection
        const w = 30;
        const h = 50;
        const hw = w / 2;
        const hh = h / 2;

        const tan = Math.tan(angle);
        let dx = 0, dy = 0;

        // Check intersections with vertical or horizontal sides
        // We want to find the point on the box boundary in direction of angle

        // This is a standard math problem. 
        // Based on angle sectors.
        // Aspect ratio of box corners is hh/hw = 25/15 = 5/3.

        // Normalize angle to -PI to PI
        // Easier: Ray casting against 4 segments.
        // Or simplified sector check.

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Avoid division by zero
        // if |tan| < h/w => intersect vertical sides
        // if |tan| > h/w => intersect horizontal sides

        // Let's use absolute comparison
        if (Math.abs(sin * hw) < Math.abs(cos * hh)) {
            // Intersects Left or Right (Vertical sides)
            dx = (cos > 0) ? hw : -hw;
            dy = dx * (sin / cos);
        } else {
            // Intersects Top or Bottom (Horizontal sides)
            dy = (sin > 0) ? hh : -hh;
            dx = dy * (cos / sin);
        }

        return {
            x: element.x + dx,
            y: element.y + dy
        };
    }
}

function drawArrow(ctx, x1, y1, x2, y2, isGhost = false) {
    const headLength = 15;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);

    // If Ghost, we don't have a target element structure easily available here, 
    // so we use simple offset or logic.
    // If NOT ghost, x1,y1 and x2,y2 are ALREADY computed border points.

    // For ghost: start is center of source (we need border), end is mouse (no border).
    // But caller 'drawPetri' handles ghost differently. 
    // Let's assume input coordinates are EXACT points to draw line between.

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead at (x2, y2)
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();

    if (isGhost) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.6)'; // Gold with opacity
        ctx.strokeStyle = '#FFD700';
    } else {
        ctx.fillStyle = '#cccccc';
    }
    ctx.fill();
}
