import { state, nodes, edges, camera, elements } from '../../core/state.js';
import { toWorld, toScreen, draw } from '../rendering/render.js';
import { updateStats, setMode, updateResultsList } from '../../ui/ui.js';
import { resetSimulation } from '../../domain/petri/simulation.js';
import { saveToLocalStorage } from '../../core/storage.js';
import { triggerAutoSave } from '../../core/tabs.js';
import { places } from '../../domain/petri/petri_state.js';
import { drawPetri } from '../rendering/petri_render.js';

function updateAndSave() {
    updateStats();
    resetSimulation();

    if (state.appContext === 'MIS') {
        state.graphs.MIS.nodes = JSON.parse(JSON.stringify(nodes));
        state.graphs.MIS.edges = JSON.parse(JSON.stringify(edges));
    } else if (state.appContext === 'CONCURRENCY') {
        state.graphs.CONCURRENCY.nodes = JSON.parse(JSON.stringify(nodes));
        state.graphs.CONCURRENCY.edges = JSON.parse(JSON.stringify(edges));
    }

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
        if (state.appContext !== 'MIS' && state.appContext !== 'CONCURRENCY') return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const clickedNode = getClickedNode(x, y);

        if (clickedNode) {
            if (state.mode === 'nodes' || state.mode === 'view') {
                state.isDraggingNode = true;
                state.dragNodeId = clickedNode.id;
                state.selectedNode = clickedNode;

                // Restore state from Reachability Node
                if (clickedNode.marking) {
                    let restoredCount = 0;

                    for (const p of places) {
                        if (clickedNode.marking[p.id] !== undefined) {
                            p.tokens = clickedNode.marking[p.id];
                            restoredCount++;
                        }
                    }

                    if (restoredCount > 0) {
                        drawPetri();
                        updateStats();
                        saveToLocalStorage();
                    }

                    const nodeIndex = nodes.findIndex(n => n.id === clickedNode.id);
                    if (nodeIndex >= 0) {
                        state.selectedReachabilityIndex = nodeIndex;
                        updateResultsList();
                        triggerAutoSave();
                    }
                }

                draw();
            } else if (state.mode === 'edges') {
                if (!state.selectedNode) {
                    state.selectedNode = clickedNode;

                    if (clickedNode.marking) {
                        const sorted = nodes.filter(n => n.marking).sort((a, b) => a.id - b.id);
                        const idx = sorted.findIndex(n => n.id === clickedNode.id);
                        if (idx !== -1) {
                            state.selectedReachabilityIndex = idx;
                            import('../../ui/ui.js').then(ui => {
                                ui.updateResultsList();
                                const list = document.getElementById('resultsList');
                                if (list && list.children[idx + 1]) list.children[idx + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                            });
                            import('../../domain/petri/petri_state.js').then(({ places }) => {
                                let restoredCount = 0;
                                for (const p of places) {
                                    if (clickedNode.marking[p.id] !== undefined) {
                                        p.tokens = clickedNode.marking[p.id];
                                        restoredCount++;
                                    }
                                }
                                if (restoredCount > 0) {
                                    import('../rendering/petri_render.js').then(pr => pr.drawPetri());
                                    import('../../ui/ui.js').then(ui => ui.updateStats());
                                    import('../../core/storage.js').then(s => s.saveToLocalStorage());
                                }
                            });
                        }
                    }
                } else {
                    if (state.selectedNode && state.selectedNode.id !== clickedNode.id) {
                        // Check for existing edge
                        // If directed, we only check exact match. If undirected, we check both directions.
                        const isDir = state.isDirected;
                        const existingEdgeIndex = edges.findIndex(e =>
                            (e[0] === state.selectedNode.id && e[1] === clickedNode.id) ||
                            (!isDir && e[1] === state.selectedNode.id && e[0] === clickedNode.id)
                        );

                        if (existingEdgeIndex >= 0) {
                            if (e.ctrlKey || e.metaKey) {
                                edges.splice(existingEdgeIndex, 1);
                                updateAndSave();
                            }
                        } else {
                            edges.push([state.selectedNode.id, clickedNode.id]);
                            updateAndSave();
                        }
                        state.selectedNode = null;
                    } else {
                        state.selectedNode = clickedNode;
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
            updateAndSave();
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
                let targetX = world.x;
                let targetY = world.y;

                // Snapping Logic
                const gridSize = 50;
                let shouldSnap = false;

                if (state.appContext === 'MIS' && state.snapReachability) shouldSnap = true;
                if (state.appContext === 'CONCURRENCY' && state.snapConcurrency) shouldSnap = true;

                if (shouldSnap) {
                    targetX = Math.round(targetX / gridSize) * gridSize;
                    targetY = Math.round(targetY / gridSize) * gridSize;
                }

                node.x = targetX;
                node.y = targetY;
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
            state.startPanX = 0;
            canvas.style.cursor = 'grab';
            saveToLocalStorage();
        }
    });

    canvas.addEventListener('wheel', (e) => {
        if (state.appContext !== 'MIS' && state.appContext !== 'CONCURRENCY') return;

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
        triggerAutoSave();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            deleteSelectedNode();
        }

        // List Navigation (Arrow keys)
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const isUp = (e.key === 'ArrowUp');

            if (state.appContext === 'MIS') {
                import('../../domain/petri/simulation.js').then(module => {
                    const maxIndex = state.misSteps.length - 1;
                    if (maxIndex < 0) return;

                    let newIndex = state.currentStepIndex + (isUp ? -1 : 1);
                    newIndex = Math.max(0, Math.min(newIndex, maxIndex));

                    if (newIndex !== state.currentStepIndex) {
                        state.currentStepIndex = newIndex;
                        module.stopAutoPlay();
                        module.highlightResultItem(newIndex);
                        import('../rendering/render.js').then(r => r.draw());
                        updateButtonStates();
                    }
                });
            } else if (state.appContext === 'PETRI') {
                import('../../ui/ui.js').then(ui => {
                    let displayList = state.reachabilityPath || nodes.filter(n => n.marking).sort((a, b) => a.id - b.id);
                    const listLength = displayList.length;

                    if (listLength === 0) return;

                    if (state.selectedReachabilityIndex === -1) {
                        state.selectedReachabilityIndex = 0;
                    } else {
                        // Cyclic Navigation
                        let newIndex = state.selectedReachabilityIndex + (isUp ? -1 : 1);

                        if (newIndex < 0) {
                            newIndex = listLength - 1;
                        } else if (newIndex >= listLength) {
                            newIndex = 0;
                        }
                        state.selectedReachabilityIndex = newIndex;
                    }

                    // Trigger Restore
                    const targetNode = displayList[state.selectedReachabilityIndex];
                    if (targetNode && targetNode.marking) {
                        import('../../domain/petri/petri_state.js').then(({ places }) => {
                            let restoredCount = 0;
                            for (const p of places) {
                                if (targetNode.marking[p.id] !== undefined) {
                                    p.tokens = targetNode.marking[p.id];
                                    restoredCount++;
                                }
                            }
                            if (restoredCount > 0) {
                                import('../rendering/petri_render.js').then(pr => pr.drawPetri());
                                ui.updateStats();
                                import('../../core/storage.js').then(s => s.saveToLocalStorage());
                                ui.updateResultsList();

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
