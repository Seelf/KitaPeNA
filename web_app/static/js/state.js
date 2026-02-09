
// Application State
export const nodes = [];
export const edges = [];

export const camera = { x: 0, y: 0, zoom: 1 };

export const state = {
    // State Identifiers
    appContext: 'PETRI', // 'PETRI', 'MIS', 'CONCURRENCY'
    activeTabId: null, // Guard for async operations across tabs
    selectedNode: null,
    // Mode
    mode: 'select', // 'select', 'node', 'edge's'
    isDraggingNode: false,
    isPanning: false,
    startPanX: 0,
    startPanY: 0,
    mouseX: 0,
    mouseY: 0,
    dragNodeId: null,

    // Petri Simulation Path (Cycle)
    reachabilityPath: null, // Array of Node IDs or Nodes to display in order
    initialMarking: null, // { placeId: tokens }

    // Simulation State
    misSteps: [],
    currentStepIndex: -1,
    isPlaying: false,
    playInterval: null,
    simulationDelay: 800,
    abortController: null,

    // Generated Graph State (Read Only Mode)
    isGenerated: false,
    graphTruncated: false, // True if reachability graph was cut off due to max_states limit
    selectedReachabilityIndex: -1, // For keyboard navigation in Petri Reachability list
    maxReachabilityStates: 1000, // User configurable limit

    // Independent Cameras
    misCamera: { x: 0, y: 0, zoom: 1 },
    petriCamera: { x: 0, y: 0, zoom: 1 },
    concurrencyCamera: { x: 0, y: 0, zoom: 1 },

    // CONNECTED GRAPHS DATA (Separated by Context)
    graphs: {
        MIS: { nodes: [], edges: [] },
        CONCURRENCY: { nodes: [], edges: [] }
    },

    troResult: null, // Transitive Orientability result { isOrientable, message }
    coloringResult: null, // Optimal Coloring result { chromaticNumber, coloring: Map/Object }

    // View Settings
    snapReachability: false,
    snapConcurrency: false
};

export const elements = {
    canvas: null,
    ctx: null,
    container: null,
    resultsList: null
};

export function initElements() {
    elements.canvas = document.getElementById('graphCanvas');
    elements.ctx = elements.canvas.getContext('2d');
    elements.container = document.getElementById('canvasContainer');
    elements.resultsList = document.getElementById('resultsList');
}
