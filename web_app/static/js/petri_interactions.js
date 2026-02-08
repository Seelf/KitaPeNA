// Author: Dawid Konarczak
import { triggerAutoSave } from './tabs.js';
import { petriState, places, transitions, arcs } from './petri_state.js';
import { drawPetri } from './petri_render.js';
import { toWorld, toScreen } from './render.js';
import { state, camera, elements } from './state.js';
import { updateStats, updateResultsList } from './ui.js';

// Global listeners already set up in main for interactions.js but we need specific ones for Petri
// We will attach listeners to canvas in initPetriInteractions

// Wrapper helper
function updateAndSave() {
    updateStats();
    // triggerReachabilityUpdate(); // Old placeholder
    triggerAutoSave();
    window.dispatchEvent(new CustomEvent('petri-state-updated'));
}

// ...

// Replace calls to updateStats/triggerReachabilityUpdate with updateAndSave() or append triggerAutoSave()

// Example Replacement Locations:

// 1. Clear All
// line 174: updateAndSave(); -> updateAndSave();

// 2. Import
// line 485: updateAndSave(); -> updateAndSave();

// 3. Delete Place/Trans/Arc
// line 255: updateAndSave(); -> updateAndSave();

// 4. Place Creation
// line 272: updateAndSave(); -> updateAndSave();

// 5. Transition Creation
// line 286: updateAndSave(); -> updateAndSave();

// 6. Token Change
// line 297: updateAndSave(); -> updateAndSave();

// 7. Arc Delete (Duplicate)
// line 326: updateAndSave(); -> updateAndSave();

// 8. Arc Create
// line 338: updateAndSave(); -> updateAndSave();

// 9. Auto Layout
// line 575: triggerAutoSave(); (added)

// 10. Dragging
// line 377: drawPetri(); -> drawPetri(); if (!petriState.isPanning) triggerAutoSave(); // Maybe debounce dragging save?
// For dragging, usually save on mouseup is better.

// 11. MouseUp
// line 395: if (petriState.mode === 'view') canvas.style.cursor = 'grab';
// Add: if (petriState.isDragging || petriState.isPanning) triggerAutoSave();


// Global listeners already set up in main for interactions.js but we need specific ones for Petri
// We will attach listeners to canvas in initPetriInteractions

function logToScreen(msg) {
    const el = document.getElementById('debugLogContainer'); // Changed from debugOverlay
    if (el) {
        try {
            const time = new Date().toLocaleTimeString().split(' ')[0];
            el.innerHTML += `<div><span style="opacity:0.5">[${time}]</span> ${msg}</div>`;
            el.scrollTop = el.scrollHeight;
        } catch (err) {
            console.error("LogToScreen Error:", err);
        }
    }
    console.log(msg);
}

function checkIntegrity() {
    const pIds = new Set();
    places.forEach(p => {
        if (pIds.has(p.id)) {
            logToScreen(`CRITICAL ERROR: Duplicate Place ID detected: ${p.id}`);
            alert(`CRITICAL ERROR: Duplicate Place ID detected: ${p.id}. The graph state is corrupted.`);
        }
        pIds.add(p.id);
    });

    const tIds = new Set();
    transitions.forEach(t => {
        if (tIds.has(t.id)) {
            logToScreen(`CRITICAL ERROR: Duplicate Transition ID detected: ${t.id}`);
            alert(`CRITICAL ERROR: Duplicate Transition ID detected: ${t.id}.`);
        }
        tIds.add(t.id);
    });
}

// Hit detection for labels (for label dragging)
function getClickedLabel(worldX, worldY) {
    const pRadius = 25;
    const tHeight = 50;
    const labelWidth = 50; // Approximate text width
    const labelHeight = 14; // Approximate text height

    // Check place labels
    for (const p of places) {
        const labelX = p.x + (p.labelOffsetX || 0);
        const labelY = p.y + pRadius + 15 + (p.labelOffsetY || 0);

        if (worldX >= labelX - labelWidth / 2 && worldX <= labelX + labelWidth / 2 &&
            worldY >= labelY - labelHeight / 2 && worldY <= labelY + labelHeight / 2) {
            return { type: 'place', element: p };
        }
    }

    // Check transition labels
    for (const t of transitions) {
        const labelX = t.x + (t.labelOffsetX || 0);
        const labelY = t.y + tHeight / 2 + 15 + (t.labelOffsetY || 0);

        if (worldX >= labelX - labelWidth / 2 && worldX <= labelX + labelWidth / 2 &&
            worldY >= labelY - labelHeight / 2 && worldY <= labelY + labelHeight / 2) {
            return { type: 'transition', element: t };
        }
    }

    return null;
}

function getClickedElement(worldX, worldY) {
    // Check transitions (rects)
    const tWidth = 30;
    const tHeight = 50;
    for (const t of transitions) {
        if (worldX >= t.x - tWidth / 2 && worldX <= t.x + tWidth / 2 &&
            worldY >= t.y - tHeight / 2 && worldY <= t.y + tHeight / 2) {
            return { type: 'transition', element: t };
        }
    }

    // Check places (circles)
    const pRadius = 25;
    for (const p of places) {
        const dx = worldX - p.x;
        const dy = worldY - p.y;
        if (dx * dx + dy * dy <= pRadius * pRadius) {
            return { type: 'place', element: p };
        }
    }

    // Check Arcs (Line segments)
    const hitDist = 10;
    for (const a of arcs) {
        let u, v;
        if (a.type === 'place_to_transition') {
            u = places.find(p => p.id === a.sourceId);
            v = transitions.find(t => t.id === a.targetId);
        } else {
            u = transitions.find(t => t.id === a.sourceId);
            v = places.find(p => p.id === a.targetId);
        }

        if (u && v) {
            const A = worldX - u.x;
            const B = worldY - u.y;
            const C = v.x - u.x;
            const D = v.y - u.y;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            if (lenSq !== 0) param = dot / lenSq;

            let xx, yy;
            if (param < 0) {
                xx = u.x;
                yy = u.y;
            } else if (param > 1) {
                xx = v.x;
                yy = v.y;
            } else {
                xx = u.x + param * C;
                yy = u.y + param * D;
            }

            const dx = worldX - xx;
            const dy = worldY - yy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < hitDist) {
                return { type: 'arc', element: a };
            }
        }
    }

    return null;
}

export function setPetriMode(newMode) {
    petriState.mode = newMode;
    petriState.selectedElement = null;

    const buttons = {
        'view': document.getElementById('btnPetriPan'),
        'place': document.getElementById('btnPetriPlace'),
        'transition': document.getElementById('btnPetriTransition'),
        'arc': document.getElementById('btnPetriArc'),
        'token': document.getElementById('btnPetriToken'),
        'delete': document.getElementById('btnPetriDelete')
    };

    Object.values(buttons).forEach(btn => btn?.classList.remove('active'));
    if (buttons[newMode]) buttons[newMode].classList.add('active');

    const canvas = document.getElementById('graphCanvas');
    if (canvas) {
        if (newMode === 'view') canvas.style.cursor = 'grab';
        else if (newMode === 'delete') canvas.style.cursor = 'not-allowed';
        else canvas.style.cursor = 'crosshair';
    }
}

let isPetriInitialized = false;

export function initPetriInteractions() {
    if (isPetriInitialized) {
        console.warn("initPetriInteractions called twice! Skipping.");
        return;
    }
    isPetriInitialized = true;
    const btnPetriRename = document.getElementById('btnPetriRename');
    const graphCanvas = document.getElementById('graphCanvas');
    console.log("Initializing Petri Interactions...");

    const canvas = document.getElementById('graphCanvas');
    if (!canvas) return;

    // Prevent Context Menu in Petri Mode
    canvas.addEventListener('contextmenu', (e) => {
        if (state.appContext === 'PETRI') {
            e.preventDefault();
        }
    });

    // Tool Handlers
    function setActiveTool(btn, mode) {
        document.querySelectorAll('#toolbarPetri .tool-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        petriState.mode = mode;
        petriState.selectedElement = null; // Deselect
        drawPetri();

        // Update cursor based on mode
        if (graphCanvas) {
            if (mode === 'view') graphCanvas.style.cursor = 'grab';
            else if (mode === 'delete') graphCanvas.style.cursor = 'not-allowed';
            else if (mode === 'rename') graphCanvas.style.cursor = 'text';
            else graphCanvas.style.cursor = 'crosshair';
        }
    }

    // Toolbar Listeners
    const btnPetriPan = document.getElementById('btnPetriPan');
    const btnPetriPlace = document.getElementById('btnPetriPlace');
    const btnPetriTransition = document.getElementById('btnPetriTransition');
    const btnPetriArc = document.getElementById('btnPetriArc');
    const btnPetriToken = document.getElementById('btnPetriToken');
    const btnPetriDelete = document.getElementById('btnPetriDelete');

    // Snap helper function
    function snapToGrid(value) {
        return Math.round(value / petriState.gridSize) * petriState.gridSize;
    }

    function snapAllElements() {
        if (!petriState.snapToGrid) return;
        places.forEach(p => {
            p.x = snapToGrid(p.x);
            p.y = snapToGrid(p.y);
        });
        transitions.forEach(t => {
            t.x = snapToGrid(t.x);
            t.y = snapToGrid(t.y);
        });
    }

    if (btnPetriPan) btnPetriPan.addEventListener('click', () => {
        setActiveTool(btnPetriPan, 'view');
        // Snap all elements to grid when entering view mode
        snapAllElements();
        drawPetri();
        updateAndSave();
    });
    if (btnPetriPlace) btnPetriPlace.addEventListener('click', () => setActiveTool(btnPetriPlace, 'place'));
    if (btnPetriTransition) btnPetriTransition.addEventListener('click', () => setActiveTool(btnPetriTransition, 'transition'));
    if (btnPetriArc) btnPetriArc.addEventListener('click', () => setActiveTool(btnPetriArc, 'arc'));
    if (btnPetriToken) btnPetriToken.addEventListener('click', () => setActiveTool(btnPetriToken, 'token'));
    if (btnPetriDelete) btnPetriDelete.addEventListener('click', () => setActiveTool(btnPetriDelete, 'delete'));
    if (btnPetriRename) btnPetriRename.addEventListener('click', () => setActiveTool(btnPetriRename, 'rename'));

    // Snap-to-Grid Toggle with localStorage persistence
    const chkSnapToGrid = document.getElementById('chkSnapToGrid');
    if (chkSnapToGrid) {
        // Load saved preference from localStorage
        const savedSnap = localStorage.getItem('kitapena_snapToGrid');
        if (savedSnap !== null) {
            petriState.snapToGrid = savedSnap === 'true';
        }
        chkSnapToGrid.checked = petriState.snapToGrid;

        chkSnapToGrid.addEventListener('change', () => {
            petriState.snapToGrid = chkSnapToGrid.checked;
            localStorage.setItem('kitapena_snapToGrid', petriState.snapToGrid);
            if (petriState.snapToGrid) {
                snapAllElements();
                drawPetri();
                updateAndSave();
            }
        });
    }

    document.getElementById('btnPetriClear')?.addEventListener('click', () => {
        if (confirm("Clear Petri Net?")) {
            places.length = 0;
            transitions.length = 0;
            arcs.length = 0;
            petriState.nextPlaceId = 1;
            petriState.nextTransitionId = 1;
            drawPetri();
            drawPetri();
            updateAndSave();
        }
    });

    // Import / Layout
    const btnImport = document.getElementById('btnPetriImport');
    const fileInput = document.getElementById('fileInputPnh');
    const btnLayout = document.getElementById('btnPetriLayout');

    if (btnImport && fileInput) {
        btnImport.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                await importPnhFile(file);
                fileInput.value = ''; // reset
            }
        });
    }

    if (btnLayout) {
        btnLayout.addEventListener('click', () => runAutoLayout());
    }

    // CANVAS INTERACTIONS
    canvas.addEventListener('mousedown', (e) => {
        if (state.appContext !== 'PETRI') return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const world = toWorld(x, y);

        const clicked = getClickedElement(world.x, world.y);
        console.log(`Click at World(${Math.round(world.x)}, ${Math.round(world.y)}) -> Hit:`, clicked ? `${clicked.type} #${clicked.element.id}` : 'None');

        if (petriState.mode === 'delete' && clicked) {
            console.log("Deleting:", clicked);
            if (clicked.type === 'place') {
                const idx = places.indexOf(clicked.element);
                if (idx > -1) places.splice(idx, 1);
                // Remove attached arcs
                logToScreen(`Deleting Place ID=${clicked.element.id}. Checking ${arcs.length} arcs.`);
                // Dump IDs of ALL arcs to ensure sanity
                // logToScreen("Arcs: " + arcs.map(a => `${a.type[0]}:${a.sourceId}->${a.targetId}`).join(", "));

                for (let i = arcs.length - 1; i >= 0; i--) {
                    const a = arcs[i];
                    logToScreen(`Check Arc #${i}: ${a.type} S=${a.sourceId} T=${a.targetId}`);

                    if (a.sourceId === clicked.element.id && a.type === 'place_to_transition') {
                        logToScreen(`MATCH! Removing Arc #${i} (Source P=${a.sourceId})`);
                        arcs.splice(i, 1);
                    }
                    else if (a.targetId === clicked.element.id && a.type === 'transition_to_place') {
                        logToScreen(`MATCH! Removing Arc #${i} (Target P=${a.targetId})`);
                        arcs.splice(i, 1);
                    }
                }
            } else if (clicked.type === 'transition') {
                const idx = transitions.indexOf(clicked.element);
                if (idx > -1) transitions.splice(idx, 1);
                // Remove attached arcs
                logToScreen(`Deleting Transition ID=${clicked.element.id}. Checking ${arcs.length} arcs.`);
                for (let i = arcs.length - 1; i >= 0; i--) {
                    const a = arcs[i];
                    if (a.sourceId === clicked.element.id && a.type === 'transition_to_place') {
                        logToScreen(`MATCH! Removing Arc #${i} (Source T=${a.sourceId})`);
                        arcs.splice(i, 1);
                    }
                    else if (a.targetId === clicked.element.id && a.type === 'place_to_transition') {
                        logToScreen(`MATCH! Removing Arc #${i} (Target T=${a.targetId})`);
                        arcs.splice(i, 1);
                    }
                }
            } else if (clicked.type === 'arc') {
                const idx = arcs.indexOf(clicked.element);
                if (idx > -1) arcs.splice(idx, 1);
            }
            drawPetri();
            updateAndSave();
            return;
        }

        if (petriState.mode === 'place') {
            if (!clicked) {
                const newId = petriState.nextPlaceId++;
                console.log(`Adding Place: ID=${newId}, Label=p${newId}`);
                places.push({
                    id: newId,
                    x: world.x, y: world.y,
                    tokens: 0,
                    label: `p${newId}`
                });
                checkIntegrity();
                drawPetri();
                updateAndSave();
            }
        } else if (petriState.mode === 'transition') {
            if (!clicked) {
                const newId = petriState.nextTransitionId++;
                console.log(`Adding Transition: ID=${newId}, Label=t${newId}`);
                transitions.push({
                    id: newId,
                    x: world.x, y: world.y,
                    label: `t${newId}`
                });
                checkIntegrity();
                drawPetri();
                updateAndSave();
            }
        } else if (petriState.mode === 'rename') {
            if (clicked) {
                const el = clicked.element;
                const type = clicked.type;

                // Prompt user
                const currentName = el.label || (type === 'place' ? `p${el.id}` : `t${el.id}`);
                const newName = prompt(`Rename ${type} (ID: ${el.id}):`, currentName);

                if (newName !== null && newName.trim() !== "") {
                    el.label = newName.trim();
                    drawPetri();
                    updateAndSave();
                    updateResultsList(); // Immediate UI update for names
                }
            }
        } else if (petriState.mode === 'token') {
            if (clicked && clicked.type === 'place') {
                if (e.button === 2) {
                    if (clicked.element.tokens > 0) clicked.element.tokens--;
                } else if (e.button === 0) {
                    clicked.element.tokens++;
                }
                drawPetri();
                updateAndSave();
            }
        } else if (petriState.mode === 'arc') {
            // ...
            if (clicked) {
                if (!petriState.selectedElement) {
                    petriState.selectedElement = clicked; // Start of arc
                } else {
                    // Try to connect
                    const start = petriState.selectedElement;
                    const end = clicked;

                    if (start.type !== end.type) {
                        // Valid connection (P->T or T->P)
                        // Check duplicates
                        const arcType = (start.type === 'place') ? 'place_to_transition' : 'transition_to_place';

                        const existsIndex = arcs.findIndex(a =>
                            a.sourceId === start.element.id &&
                            a.targetId === end.element.id &&
                            a.type === arcType
                        );

                        if (existsIndex !== -1) {
                            console.log("Arc already exists, skipping duplicate.");
                            // Delete only if Ctrl/Cmd is pressed (legacy behavior, but we have Eraser now)
                            if (e.ctrlKey || e.metaKey) {
                                arcs.splice(existsIndex, 1);
                                updateAndSave();
                            }
                        } else {
                            // Add new arc
                            console.log(`Creating Arc: ${start.type}(${start.element.id}) -> ${end.type}(${end.element.id})`);
                            arcs.push({
                                sourceId: start.element.id,
                                targetId: end.element.id,
                                type: arcType,
                                weight: 1
                            });
                            updateAndSave();
                        }
                    }
                    petriState.selectedElement = null; // Reset
                }
            } else {
                petriState.selectedElement = null; // Clicked empty space cancel
            }
            drawPetri();
        } else if (petriState.mode === 'view') {
            petriState.isPanning = true;
            petriState.startPanX = e.clientX;
            petriState.startPanY = e.clientY;

            // Check label first (higher priority for label dragging)
            const clickedLabel = getClickedLabel(world.x, world.y);
            if (clickedLabel) {
                petriState.isDraggingLabel = true;
                petriState.dragLabelElement = clickedLabel.element;
                petriState.isPanning = false;
                canvas.style.cursor = 'move';
            } else if (clicked) {
                petriState.isDragging = true;
                petriState.dragElement = clicked;
                canvas.style.cursor = 'grabbing';
            } else {
                canvas.style.cursor = 'grabbing';
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (state.appContext !== 'PETRI') return;

        const rect = canvas.getBoundingClientRect();
        const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);

        petriState.mouseX = world.x;
        petriState.mouseY = world.y;

        if (petriState.mode === 'arc' && petriState.selectedElement) {
            drawPetri();
        }

        if (petriState.isDraggingLabel && petriState.dragLabelElement) {
            // Drag label - update offset
            const el = petriState.dragLabelElement;
            const pRadius = 25;
            const tHeight = 50;

            // Calculate new offset based on mouse position
            // Determine if it's a place or transition by checking if it has 'tokens' property
            const isPlace = 'tokens' in el;
            const baseY = isPlace ? (el.y + pRadius + 15) : (el.y + tHeight / 2 + 15);

            el.labelOffsetX = world.x - el.x;
            el.labelOffsetY = world.y - baseY;
            drawPetri();
        } else if (petriState.isDragging && petriState.dragElement) {
            petriState.dragElement.element.x = world.x;
            petriState.dragElement.element.y = world.y;
            drawPetri();
        } else if (petriState.isPanning) {
            const dx = e.clientX - petriState.startPanX;
            const dy = e.clientY - petriState.startPanY;
            camera.x += dx;
            camera.y += dy;
            petriState.startPanX = e.clientX;
            petriState.startPanY = e.clientY;
            drawPetri();
        }
    });

    window.addEventListener('mouseup', () => {
        if (state.appContext !== 'PETRI') return;

        // Snap dragged element to grid before releasing
        if (petriState.snapToGrid && petriState.dragElement) {
            const el = petriState.dragElement.element;
            el.x = snapToGrid(el.x);
            el.y = snapToGrid(el.y);
            drawPetri();
        }

        petriState.isDragging = false;
        petriState.dragElement = null;
        petriState.isDraggingLabel = false;
        petriState.dragLabelElement = null;
        petriState.isPanning = false;
        if (petriState.mode === 'view') canvas.style.cursor = 'grab';

        // Save on interaction end
        if (state.appContext === 'PETRI') {
            triggerAutoSave();
        }
    });

    // Zoom / Pan with Wheel (Trackpad)
    canvas.addEventListener('wheel', (e) => {
        if (state.appContext !== 'PETRI') return;
        e.preventDefault();

        if (e.ctrlKey) {
            // Zoom
            const zoomIntensity = 0.002;
            const delta = -e.deltaY * zoomIntensity;
            const newZoom = Math.min(Math.max(camera.zoom + delta, 0.1), 5);

            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldBefore = toWorld(mouseX, mouseY);

            camera.zoom = newZoom;

            const screenAfter = toScreen(worldBefore.x, worldBefore.y);
            camera.x += (mouseX - screenAfter.x);
            camera.y += (mouseY - screenAfter.y);
        } else {
            // Pan
            camera.x -= e.deltaX;
            camera.y -= e.deltaY;
        }
        drawPetri();
        triggerAutoSave(); // Save camera position after pan/zoom
    }, { passive: false });
}

// IMPORT LOGIC
let isImporting = false;
async function importPnhFile(file) {
    if (isImporting) {
        console.warn("Import already in progress. Skipping.");
        return;
    }
    isImporting = true;
    console.log("Starting Import PNH:", file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/petri/import', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.status === 'success') {
            // Apply data
            places.length = 0;
            transitions.length = 0;
            arcs.length = 0;

            data.places.forEach(p => places.push({ ...p, x: 0, y: 0 })); // Init pos 0,0
            data.transitions.forEach(t => transitions.push({ ...t, x: 0, y: 0 }));
            data.arcs.forEach(a => arcs.push(a));

            // Recalculate Next IDs based on MAX(id, name_number)
            let maxP = 0;
            places.forEach(p => {
                const idVal = parseInt(p.id) || 0;
                // Parse label like "p123"
                const labelMatch = (p.label || "").match(/^p(\d+)$/);
                const labelVal = labelMatch ? parseInt(labelMatch[1]) : 0;

                maxP = Math.max(maxP, idVal, labelVal);
            });
            petriState.nextPlaceId = maxP + 1;

            let maxT = 0;
            transitions.forEach(t => {
                const idVal = parseInt(t.id) || 0;
                // Parse label like "t123"
                const labelMatch = (t.label || "").match(/^t(\d+)$/);
                const labelVal = labelMatch ? parseInt(labelMatch[1]) : 0;

                maxT = Math.max(maxT, idVal, labelVal);
            });
            petriState.nextTransitionId = maxT + 1;

            console.log(`[Import] Places: ${places.length}, MaxID: ${maxP} -> Next: ${petriState.nextPlaceId}`);
            console.log(`[Import] Trans: ${transitions.length}, MaxID: ${maxT} -> Next: ${petriState.nextTransitionId}`);

            checkIntegrity();
            runAutoLayout();
            updateAndSave();
            await forceReachabilityUpdate();
            alert(`Imported: ${places.length} places, ${transitions.length} transitions.`);
        } else {
            alert('Import failed: ' + data.message);
        }
    } catch (e) {
        console.error(e);
        logToScreen("Import Exception: " + e.message);
        alert('Upload failed: ' + e.message);
    } finally {
        isImporting = false;
        drawPetri(); // Ensure draw happens at the end
        triggerAutoSave();
        console.log("Import finished.");
    }
}

export function runAutoLayout() {
    // Simple Force-Directed Layout
    const width = 800;
    const height = 600;
    const padding = 50;

    // Random init
    [...places, ...transitions].forEach(node => {
        node.x = Math.random() * (width - 2 * padding) + padding;
        node.y = Math.random() * (height - 2 * padding) + padding;
        node.vx = 0;
        node.vy = 0;
    });

    const k = 100; // ideal length
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
        // Repulsion
        const all = [...places, ...transitions];
        for (let a = 0; a < all.length; a++) {
            for (let b = a + 1; b < all.length; b++) {
                const u = all[a];
                const v = all[b];
                const dx = u.x - v.x;
                const dy = u.y - v.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (k * k) / dist;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                u.vx += fx; u.vy += fy;
                v.vx -= fx; v.vy -= fy;
            }
        }

        // Attraction
        arcs.forEach(arc => {
            let u, v;
            if (arc.type === 'place_to_transition') {
                u = places.find(p => p.id === arc.sourceId);
                v = transitions.find(t => t.id === arc.targetId);
            } else {
                u = transitions.find(t => t.id === arc.sourceId);
                v = places.find(p => p.id === arc.targetId);
            }
            if (!u || !v) return;

            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist * dist) / k;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            u.vx += fx; u.vy += fy;
            v.vx -= fx; v.vy -= fy;
        });

        // Apply
        all.forEach(n => {
            n.x += Math.min(Math.max(n.vx * 0.1, -10), 10);
            n.y += Math.min(Math.max(n.vy * 0.1, -10), 10);
            n.vx *= 0.5; // damping
            n.vy *= 0.5;
        });
    }

    // Center Camera
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
    camera.zoom = 1;
    drawPetri();
    triggerAutoSave();
}



