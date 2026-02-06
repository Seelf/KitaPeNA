import { state, nodes, edges, camera, elements } from './state.js';
import { toWorld, toScreen, draw } from './render.js';
import { updateStats, setMode } from './ui.js';
import { resetSimulation } from './simulation.js';
import { saveToLocalStorage } from './storage.js';
import { triggerAutoSave } from './tabs.js';

function updateAndSave() {
    updateStats();
    resetSimulation();
    saveToLocalStorage();
    triggerAutoSave();
}

function getClickedNode(screenX, screenY) {
    const world = toWorld(screenX, screenY);
    const radius = 25;
    for (const node of nodes) {
        const dx = world.x - node.x;
        const dy = world.y - node.y;
        if (dx * dx + dy * dy < radius * radius) {
            return node;
        }
    }
    return null;
}

export function deleteSelectedNode() {
    if (!state.selectedNode) return;

    const idToRemove = state.selectedNode.id;

    // Remove node
    const nodeIndex = nodes.findIndex(n => n.id === idToRemove);
    if (nodeIndex >= 0) {
        nodes.splice(nodeIndex, 1);
    }

    // Remove connected edges
    for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i][0] === idToRemove || edges[i][1] === idToRemove) {
            edges.splice(i, 1);
        }
    }

    state.selectedNode = null;
    updateStats();
    resetSimulation();
    saveToLocalStorage();
    draw();
}

export function initInteractions() {
    const { canvas } = elements;
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
        if (state.appContext !== 'MIS') return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const clickedNode = getClickedNode(x, y);

        if (clickedNode) {
            if (state.mode === 'nodes' || state.mode === 'view') {
                // Drag Mode
                state.isDraggingNode = true;
                state.dragNodeId = clickedNode.id;
                state.selectedNode = clickedNode;
                draw();
            } else if (state.mode === 'edges') {
                // Edge Creation Mode
                if (!state.selectedNode) {
                    state.selectedNode = clickedNode;
                } else {
                    if (state.selectedNode !== clickedNode) {
                        // Check for existing edge
                        const existingEdgeIndex = edges.findIndex(e =>
                            (e[0] === state.selectedNode.id && e[1] === clickedNode.id) ||
                            (e[1] === state.selectedNode.id && e[0] === clickedNode.id)
                        );

                        if (existingEdgeIndex >= 0) {
                            // Edge exists. 
                            if (e.ctrlKey || e.metaKey) {
                                // Delete only if Ctrl/Cmd is pressed
                                edges.splice(existingEdgeIndex, 1);
                                updateStats();
                                resetSimulation();
                                saveToLocalStorage();
                            }
                            // Otherwise do nothing (prevent accidental deletion)
                        } else {
                            // Edge does not exist -> Create
                            edges.push([state.selectedNode.id, clickedNode.id]);
                            updateStats();
                            resetSimulation();
                            saveToLocalStorage();
                        }
                        state.selectedNode = null; // Deselect after action
                    } else {
                        state.selectedNode = null; // Deselect if clicking same
                    }
                }
                draw();
            }
            return;
        }

        // Clicked empty space
        if (state.mode === 'nodes') {
            const world = toWorld(x, y);
            const newId = nodes.length > 0 ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
            nodes.push({ id: newId, x: world.x, y: world.y });
            updateStats();
            resetSimulation();
            saveToLocalStorage();
            draw();
        } else if (state.mode === 'edges') {
            state.selectedNode = null;
            draw();
        } else if (state.mode === 'view') {
            state.isPanning = true;
            state.startPanX = e.clientX;
            state.startPanY = e.clientY;
            canvas.style.cursor = 'grabbing';
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = toWorld(mouseX, mouseY);

        state.mouseX = world.x;
        state.mouseY = world.y;

        if (state.mode === 'edges' && state.selectedNode) {
            draw();
        }

        if (state.isDraggingNode && state.dragNodeId !== null) {
            const node = nodes.find(n => n.id === state.dragNodeId);
            if (node) {
                node.x = world.x;
                node.y = world.y;
                draw();
            }
        } else if (state.isPanning) {
            const dx = e.clientX - state.startPanX;
            const dy = e.clientY - state.startPanY;

            camera.x += dx;
            camera.y += dy;

            state.startPanX = e.clientX;
            state.startPanY = e.clientY;
            draw();
            saveToLocalStorage();
        }
    });

    window.addEventListener('mouseup', () => {
        if (state.isDraggingNode) {
            state.isDraggingNode = false;
            state.dragNodeId = null;
            saveToLocalStorage();
        }
        if (state.isPanning) {
            state.isPanning = false;
            canvas.style.cursor = 'grab'; // back to grab if in view mode
            saveToLocalStorage();
        }
    });

    canvas.addEventListener('wheel', (e) => {
        if (state.appContext !== 'MIS') return;
        e.preventDefault();
        if (e.ctrlKey) {
            // Zoom
            const zoomIntensity = 0.002;
            const delta = -e.deltaY * zoomIntensity;
            const newZoom = Math.min(Math.max(camera.zoom + delta, 0.1), 5); // 0.1x to 5x

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
        draw();
        saveToLocalStorage();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            deleteSelectedNode();
        }
    });

    // Handle Resize
    window.addEventListener('resize', () => {
        const { container } = elements;
        if (canvas && container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            draw();
        }
    });
}
