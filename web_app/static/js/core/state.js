// Application State definitions

export const nodes = [];
export const edges = [];
export const camera = { x: 0, y: 0, zoom: 1 };

export const state = {
    // State Identifiers
    appContext: 'PETRI', // 'PETRI', 'MIS', 'CONCURRENCY'
    activeDocumentType: 'PETRI', // 'PETRI', 'MIS'
    activeTabId: null, // Guard for async operations across tabs
    selectedNode: null,
    isDirected: false, // For standard graphs

    // Mode
    mode: 'select', // 'select', 'node', 'edge'
    isDraggingNode: false,
    isPanning: false,
    startPanX: 0,
    startPanY: 0,
    mouseX: 0,
    mouseY: 0,
    dragNodeId: null,

    // Petri Simulation Path (Cycle)
    reachabilityPath: null,
    initialMarking: null,

    // Simulation State
    misSteps: [],
    currentStepIndex: -1,
    isPlaying: false,
    playInterval: null,
    simulationDelay: 800,
    abortController: null,

    // Generated Graph State (Read Only Mode)
    isGenerated: false,
    graphTruncated: false,
    selectedReachabilityIndex: -1,
    maxReachabilityStates: 1000,

    // Independent Cameras
    misCamera: { x: 0, y: 0, zoom: 1 },
    petriCamera: { x: 0, y: 0, zoom: 1 },
    concurrencyCamera: { x: 0, y: 0, zoom: 1 },

    // Connected Graphs Data (Separated by Context)
    graphs: {
        MIS: { nodes: [], edges: [] },
        CONCURRENCY: { nodes: [], edges: [] }
    },

    troResult: null, // Transitive Orientability result
    coloringResult: null, // Optimal Coloring result

    // View Settings
    snapReachability: false,
    snapConcurrency: false,
    showSidebar: true,
    showToolbar: true,
    showDbBulk: true,
    activeActivityTab: 'tabEditor',
    activeDbTab: 'btnDbPetri'
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
