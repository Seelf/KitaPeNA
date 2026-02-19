
// Petri Net State

export const places = [];

export const transitions = [];

export const arcs = [];

export const petriState = {
    selectedElement: null, // place, transition, or arc
    mode: 'view', // 'view', 'place', 'transition', 'arc'
    nextPlaceId: 0,
    nextTransitionId: 0,
    mouseX: 0,
    mouseY: 0,
    snapToGrid: true,
    gridSize: 50,

    simulationRunning: false
};

export function clearPetri() {
    places.length = 0;
    transitions.length = 0;
    arcs.length = 0;
    petriState.nextPlaceId = 0;
    petriState.nextTransitionId = 0;
    petriState.selectedElement = null;
}
