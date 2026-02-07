import { state, nodes, edges, camera, elements } from './state.js';
import { toWorld, toScreen, draw } from './render.js';
import { updateStats, setMode } from './ui.js';
import { resetSimulation } from './simulation.js';
import { saveToLocalStorage } from './storage.js';
import { triggerAutoSave } from './tabs.js';
import { places } from './petri_state.js';
import { drawPetri } from './petri_render.js';

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
                // Drag Mode or View Mode -> Select Node
                state.isDraggingNode = true;
                state.dragNodeId = clickedNode.id;
                state.selectedNode = clickedNode;

                // RESTORE STATE FROM REACHABILITY NODE
                if (clickedNode.marking) {
                    console.log(`Restoring state from Node ${clickedNode.id}:`, clickedNode.marking);
                    let restoredCount = 0;

                    // Update places tokens
                    for (const p of places) {
                        if (clickedNode.marking[p.id] !== undefined) {
                            p.tokens = clickedNode.marking[p.id];
                            restoredCount++;
                        }
                    }

                    if (restoredCount > 0) {
                        // Update visual feedback
                        drawPetri(); // Redraw Petri net (in background context)
                        updateStats(); // Update token counts UI
                        saveToLocalStorage(); // Persist changes
                    }
                }

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

        // List Navigation (Arrow keys)
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault(); // Prevent page scroll
            const isUp = (e.key === 'ArrowUp');

            if (state.appContext === 'MIS') {
                import('./simulation.js').then(module => {
                    const maxIndex = state.misSteps.length - 1;
                    if (maxIndex < 0) return;

                    let newIndex = state.currentStepIndex + (isUp ? -1 : 1);
                    newIndex = Math.max(0, Math.min(newIndex, maxIndex));

                    if (newIndex !== state.currentStepIndex) {
                        state.currentStepIndex = newIndex;
                        module.stopAutoPlay();
                        module.highlightResultItem(newIndex);
                        import('./render.js').then(r => r.draw());
                        updateButtonStates();
                    }
                });
            } else if (state.appContext === 'PETRI') {
                import('./ui.js').then(ui => {
                    // We need to know how many items are in the list.
                    // The list matches `nodes` filtered by `marking`
                    // BUT `nodes` array might include nodes without marking if logic changed, 
                    // though currently all reachability nodes have marking.
                    // We need the sorted list used in ui.js.

                    const reachabilityNodes = nodes.filter(n => n.marking).sort((a, b) => a.id - b.id);
                    const maxIndex = reachabilityNodes.length - 1;
                    if (maxIndex < 0) return;

                    // Initialize if -1
                    if (state.selectedReachabilityIndex === -1) {
                        state.selectedReachabilityIndex = 0; // Select first if started
                    } else {
                        state.selectedReachabilityIndex += (isUp ? -1 : 1);
                    }

                    state.selectedReachabilityIndex = Math.max(0, Math.min(state.selectedReachabilityIndex, maxIndex));

                    // Trigger Restore
                    const targetNode = reachabilityNodes[state.selectedReachabilityIndex];
                    if (targetNode) {
                        // Restore Logic (Duplicated from interactions.js click or ui.js click)
                        // Ideally checking marking existence
                        let restoredCount = 0;
                        for (const p of places) {
                            if (targetNode.marking[p.id] !== undefined) {
                                p.tokens = targetNode.marking[p.id];
                                restoredCount++;
                            }
                        }
                        if (restoredCount > 0) {
                            drawPetri();
                            updateStats();
                            saveToLocalStorage();
                            ui.updateResultsList(); // Re-render to show highlight
                        }
                    }
                });
            }
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
