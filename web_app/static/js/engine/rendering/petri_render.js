
import { places, transitions, arcs, petriState } from '../../domain/petri/petri_state.js';
import { elements, camera } from '../../core/state.js';

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

export function drawPetri() {
    const { ctx, canvas } = elements;
    if (!ctx || !canvas) return;

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    drawGrid(ctx, canvas, camera);

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
            const angle = Math.atan2(target.y - source.y, target.x - source.x);

            const start = getBorderPoint(source, sourceType, angle);
            const end = getBorderPoint(target, targetType, angle + Math.PI);

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
        ctx.textAlign = 'center';
        const tLabelX = t.x + (t.labelOffsetX || 0);
        const tLabelY = t.y + tHeight / 2 + 15 + (t.labelOffsetY || 0);
        ctx.fillText(t.label || `t${t.id}`, tLabelX, tLabelY);
    });

    // 3. Draw Places (Circles)
    const pRadius = 25;

    places.forEach(p => {
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
                // Simple pattern for 1-4
                if (p.tokens === 1) {
                    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
                } else {
                    const offset = 10;
                    for (let i = 0; i < p.tokens; i++) {
                        const angle = (Math.PI * 2 * i) / p.tokens;
                        ctx.beginPath();
                        ctx.arc(p.x + Math.cos(angle) * offset, p.y + Math.sin(angle) * offset, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            } else {
                ctx.font = 'bold 16px Inter';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.tokens, p.x, p.y);
            }
        }

        // Label
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        const pLabelX = p.x + (p.labelOffsetX || 0);
        const pLabelY = p.y + pRadius + 15 + (p.labelOffsetY || 0);
        ctx.fillText(p.label || `p${p.id}`, pLabelX, pLabelY);
    });

    ctx.shadowBlur = 0;
    ctx.restore();
}

function getBorderPoint(element, type, angle) {
    if (type === 'token') return { x: element.x, y: element.y };

    if (type === 'place') {
        const r = 25;
        return {
            x: element.x + Math.cos(angle) * r,
            y: element.y + Math.sin(angle) * r
        };
    } else { // transition
        const w = 30;
        const h = 50;
        const hw = w / 2;
        const hh = h / 2;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let dx = 0, dy = 0;

        if (Math.abs(sin * hw) < Math.abs(cos * hh)) {
            // Intersects Vertical sides
            dx = (cos > 0) ? hw : -hw;
            dy = dx * (sin / cos);
        } else {
            // Intersects Horizontal sides
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

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();

    if (isGhost) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.strokeStyle = '#FFD700';
    } else {
        ctx.fillStyle = '#cccccc';
    }
    ctx.fill();
}
