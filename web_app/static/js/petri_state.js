
// Petri Net State

export const places = [
    // { id: 1, x: 0, y: 0, tokens: 0, label: 'p1' }
];

export const transitions = [
    // { id: 1, x: 100, y: 0, label: 't1' }
];

export const arcs = [
    // { sourceId: 'p1', targetId: 't1', type: 'place_to_transition', weight: 1 }
];

export const petriState = {
    selectedElement: null, // place, transition, or arc
    mode: 'view', // 'view', 'place', 'transition', 'arc'
    nextPlaceId: 0,
    nextTransitionId: 0,
    mouseX: 0,
    mouseY: 0,

    // Auto-Layout
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
