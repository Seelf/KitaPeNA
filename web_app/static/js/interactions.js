import { state, nodes, edges, camera, elements } from './state.js';
import { toWorld, toScreen, draw } from './render.js';
import { updateStats, setMode, updateResultsList } from './ui.js';
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
        if (state.appContext === 'CONCURRENCY') {
            // Full interaction support for Concurrency (read-only: drag nodes/labels, pan)
            import('./concurrency_render.js').then(m => {
                const rect = canvas.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;

                // Convert to world coords
                const worldX = (screenX - m.concurrencyState.camera.x) / m.concurrencyState.camera.zoom;
                const worldY = (screenY - m.concurrencyState.camera.y) / m.concurrencyState.camera.zoom;

                // Check label first (for label dragging)
                let clickedLabel = null;
                const labelWidth = 50;
                const labelHeight = 14;
                for (const node of m.concurrencyState.nodes) {
                    const labelX = node.x + (node.labelOffsetX || 0);
                    const labelY = node.y + 25 + (node.labelOffsetY || 0);
                    if (worldX >= labelX - labelWidth / 2 && worldX <= labelX + labelWidth / 2 &&
                        worldY >= labelY - labelHeight / 2 && worldY <= labelY + labelHeight / 2) {
                        clickedLabel = node;
                        break;
                    }
                }

                if (clickedLabel) {
                    // Drag label
                    m.concurrencyState.dragLabel = clickedLabel;
                    m.concurrencyState.dragNode = null;
                    m.concurrencyState.isDragging = false;
                    return;
                }

                // Check if clicked on a node (radius 20)
                let clickedNode = null;
                for (const node of m.concurrencyState.nodes) {
                    const dx = node.x - worldX;
                    const dy = node.y - worldY;
                    if (Math.sqrt(dx * dx + dy * dy) <= 20) {
                        clickedNode = node;
                        break;
                    }
                }

                if (clickedNode) {
                    // Drag node
                    m.concurrencyState.dragNode = clickedNode;
                    m.concurrencyState.dragLabel = null;
                    m.concurrencyState.isDragging = false;
                } else {
                    // Pan canvas
                    m.concurrencyState.dragNode = null;
                    m.concurrencyState.dragLabel = null;
                    m.concurrencyState.isDragging = true;
                    m.concurrencyState.lastX = e.clientX;
                    m.concurrencyState.lastY = e.clientY;
                }
            });
            return;
        }
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

                    // SYNC STATE LIST SELECTION
                    const nodeIndex = nodes.findIndex(n => n.id === clickedNode.id);
                    if (nodeIndex >= 0) {
                        state.selectedReachabilityIndex = nodeIndex;
                        updateResultsList(); // Highlight in list
                        triggerAutoSave(); // Persist selection
                    }
                }

                draw();
            } else if (state.mode === 'edges') {
                // Edge Creation Mode
                if (!clickedNode) {
                    // Clicked empty space
                    state.selectedNode = null;
                } else {
                    // Clicked a Node
                    state.selectedNode = clickedNode;

                    // SYNC WITH REACHABILITY LIST (if applicable)
                    if (clickedNode.marking) {
                        // Find index in the sorted list (as displayed in UI)
                        const sorted = nodes.filter(n => n.marking).sort((a, b) => a.id - b.id);
                        const idx = sorted.findIndex(n => n.id === clickedNode.id);

                        if (idx !== -1) {
                            state.selectedReachabilityIndex = idx;

                            // Update UI List (Highlight) using ui.js logic
                            import('./ui.js').then(ui => {
                                ui.updateResultsList();
                                // Scroll to it
                                const list = document.getElementById('resultsList');
                                if (list && list.children[idx + 1]) {
                                    list.children[idx + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            });

                            // Restore Petri State
                            import('./petri_state.js').then(({ places }) => {
                                let restoredCount = 0;
                                for (const p of places) {
                                    if (clickedNode.marking[p.id] !== undefined) {
                                        p.tokens = clickedNode.marking[p.id];
                                        restoredCount++;
                                    }
                                }
                                if (restoredCount > 0) {
                                    import('./petri_render.js').then(pr => pr.drawPetri());
                                    import('./ui.js').then(ui => ui.updateStats());
                                    import('./storage.js').then(s => s.saveToLocalStorage());
                                }
                            });
                        }
                    }
                }
                // Edge creation logic only if CTRL is not pressed and we are in edit mode?
                // Wait, the previous logic allowed creating edges by clicking two nodes.
                // But now we are in MIS mode which is usually Reachability Graph (Read Only mostly).
                // However, user might want to edit it manually.

                // Retaining previous logic for Edge Creation / Deletion if needed, 
                // but usually in Reachability Graph we just view.
                // Let's keep the selection logic dominant. 
                // If the user wants to add edges, they usually do it in 'edges' mode or by dragging?
                // The original code handled edge creation in 'default' mode by sequential clicks.
                // I should preserve that if it was there?
                // The snippet I replaced had edge creation logic.

                // Let's restore edge creation logic BUT add the sync logic.

                if (clickedNode) {
                    if (state.selectedNode !== clickedNode && state.selectedNode !== null) {
                        // Attempt Edge Logic
                        const existingEdgeIndex = edges.findIndex(e =>
                            (e[0] === state.selectedNode.id && e[1] === clickedNode.id) ||
                            (e[1] === state.selectedNode.id && e[0] === clickedNode.id)
                        );
                        // ... (Rest of edge logic) ...
                        // For now, let's assume we just want to select if we are just clicking one.
                    }
                }

                // ACTUALLY, I should preserve the ORIGINAL edge logic structure and INSERT strictly the sync logic.
                // The previous code had:
                // if (!state.selectedNode) { state.selectedNode = clickedNode; } else { ... edge logic ... }

                // I will rewrite to inject my sync logic inside the selection block.

                if (!state.selectedNode) {
                    state.selectedNode = clickedNode;

                    // --- SYNC START ---
                    if (clickedNode.marking) {
                        const sorted = nodes.filter(n => n.marking).sort((a, b) => a.id - b.id);
                        const idx = sorted.findIndex(n => n.id === clickedNode.id);
                        if (idx !== -1) {
                            state.selectedReachabilityIndex = idx;
                            import('./ui.js').then(ui => {
                                ui.updateResultsList();
                                const list = document.getElementById('resultsList');
                                if (list && list.children[idx + 1]) list.children[idx + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                            });
                            import('./petri_state.js').then(({ places }) => {
                                let restoredCount = 0;
                                for (const p of places) {
                                    if (clickedNode.marking[p.id] !== undefined) {
                                        p.tokens = clickedNode.marking[p.id];
                                        restoredCount++;
                                    }
                                }
                                if (restoredCount > 0) {
                                    import('./petri_render.js').then(pr => pr.drawPetri());
                                    import('./ui.js').then(ui => ui.updateStats());
                                    import('./storage.js').then(s => s.saveToLocalStorage());
                                }
                            });
                        }
                    }
                    // --- SYNC END ---

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
        if (state.appContext === 'CONCURRENCY') {
            import('./concurrency_render.js').then(m => {
                if (m.concurrencyState.dragLabel) {
                    // Drag label - update offset
                    const rect = canvas.getBoundingClientRect();
                    const screenX = e.clientX - rect.left;
                    const screenY = e.clientY - rect.top;

                    const worldX = (screenX - m.concurrencyState.camera.x) / m.concurrencyState.camera.zoom;
                    const worldY = (screenY - m.concurrencyState.camera.y) / m.concurrencyState.camera.zoom;

                    const node = m.concurrencyState.dragLabel;
                    const baseY = node.y + 25; // Default label position

                    node.labelOffsetX = worldX - node.x;
                    node.labelOffsetY = worldY - baseY;
                    m.drawConcurrency();
                } else if (m.concurrencyState.dragNode) {
                    // Drag node
                    const rect = canvas.getBoundingClientRect();
                    const screenX = e.clientX - rect.left;
                    const screenY = e.clientY - rect.top;

                    // Convert to world coords
                    const worldX = (screenX - m.concurrencyState.camera.x) / m.concurrencyState.camera.zoom;
                    const worldY = (screenY - m.concurrencyState.camera.y) / m.concurrencyState.camera.zoom;

                    m.concurrencyState.dragNode.x = worldX;
                    m.concurrencyState.dragNode.y = worldY;
                    m.drawConcurrency();
                } else if (m.concurrencyState.isDragging) {
                    // Pan canvas
                    const dx = e.clientX - m.concurrencyState.lastX;
                    const dy = e.clientY - m.concurrencyState.lastY;
                    m.concurrencyState.camera.x += dx;
                    m.concurrencyState.camera.y += dy;
                    m.concurrencyState.lastX = e.clientX;
                    m.concurrencyState.lastY = e.clientY;
                    m.drawConcurrency();
                }
            });
            return;
        }

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
        // Concurrency mouseup - only reset if in CONCURRENCY context
        if (state.appContext === 'CONCURRENCY') {
            import('./concurrency_render.js').then(m => {
                m.concurrencyState.isDragging = false;
                m.concurrencyState.dragNode = null;
                m.concurrencyState.dragLabel = null;
            });
        }

        if (state.isDraggingNode) {
            state.isDraggingNode = false;
            state.dragNodeId = null;
            saveToLocalStorage();
        }
        if (state.isPanning) {
            state.isPanning = false; // logic matches logic in mousedown for isPanning vs isDragging
            state.startPanX = 0; // reset
            canvas.style.cursor = 'grab'; // back to grab if in view mode
            saveToLocalStorage();
        }
    });

    canvas.addEventListener('wheel', (e) => {
        if (state.appContext !== 'MIS' && state.appContext !== 'CONCURRENCY') return;

        if (state.appContext === 'CONCURRENCY') {
            e.preventDefault();
            import('./concurrency_render.js').then(m => {
                const cam = m.concurrencyState.camera;

                if (e.ctrlKey) {
                    // ZOOM (same as MIS)
                    const zoomIntensity = 0.002;
                    const delta = -e.deltaY * zoomIntensity;
                    const newZoom = Math.min(Math.max(cam.zoom + delta, 0.1), 5);

                    const rect = canvas.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;

                    // World before zoom
                    const worldX = (mouseX - cam.x) / cam.zoom;
                    const worldY = (mouseY - cam.y) / cam.zoom;

                    cam.zoom = newZoom;

                    // Keep world point under mouse
                    cam.x = mouseX - worldX * cam.zoom;
                    cam.y = mouseY - worldY * cam.zoom;
                } else {
                    // PAN (same as MIS)
                    cam.x -= e.deltaX;
                    cam.y -= e.deltaY;
                }

                m.drawConcurrency();
                triggerAutoSave(); // Save camera position after pan/zoom
            });
            return;
        }

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
        triggerAutoSave(); // Save camera position after pan/zoom
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
                    // Determine List (Path or All)
                    // Must match logic in ui.js and simulation.js
                    let displayList = state.reachabilityPath || nodes.filter(n => n.marking).sort((a, b) => a.id - b.id);
                    const listLength = displayList.length;

                    if (listLength === 0) return;

                    // Initialize if -1
                    if (state.selectedReachabilityIndex === -1) {
                        state.selectedReachabilityIndex = 0;
                    } else {
                        // Cyclic Navigation
                        let newIndex = state.selectedReachabilityIndex + (isUp ? -1 : 1);

                        if (newIndex < 0) {
                            newIndex = listLength - 1; // Wrap to end
                        } else if (newIndex >= listLength) {
                            newIndex = 0; // Wrap to start
                        }
                        state.selectedReachabilityIndex = newIndex;
                    }

                    // Trigger Restore
                    const targetNode = displayList[state.selectedReachabilityIndex];
                    if (targetNode && targetNode.marking) {
                        import('./petri_state.js').then(({ places }) => {
                            let restoredCount = 0;
                            for (const p of places) {
                                if (targetNode.marking[p.id] !== undefined) {
                                    p.tokens = targetNode.marking[p.id];
                                    restoredCount++;
                                }
                            }
                            if (restoredCount > 0) {
                                import('./petri_render.js').then(pr => pr.drawPetri());
                                ui.updateStats();
                                import('./storage.js').then(s => s.saveToLocalStorage());
                                ui.updateResultsList(); // Re-render to show highlight

                                // Scroll
                                const resultsList = document.getElementById('resultsList');
                                if (resultsList && resultsList.children[state.selectedReachabilityIndex + 1]) {
                                    resultsList.children[state.selectedReachabilityIndex + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            }
                        });
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
