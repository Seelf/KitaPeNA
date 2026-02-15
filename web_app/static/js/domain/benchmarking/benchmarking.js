
function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
}

window.selectListItems = function (containerId, bool) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const items = container.querySelectorAll('.saved-item, .algo-item');
    items.forEach(item => {
        if (item.style.display === 'none') return; // Skip filtered items
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && !cb.disabled) {
            cb.checked = bool;
            item.classList.toggle('selected', bool);
        }
    });
};

// Performance Benchmarking Module

const benchmarkUrl = '/api/benchmark';

let perfChart = null;
let abortBenchmark = false;
let isBenchmarking = false;

export function initBenchmarking() {
    const btnRun = document.getElementById('btnRunBenchmark');
    if (btnRun) {
        btnRun.addEventListener('click', () => {
            if (isBenchmarking) {
                abortBenchmark = true;
                btnRun.textContent = "Stopping...";
                btnRun.disabled = true;
                // Force stop on backend
                fetch('/api/benchmark/stop', { method: 'POST', headers: { 'X-CSRFToken': getCsrfToken() } }).catch(err => console.error("Stop error:", err));
            } else {
                runBenchmark();
            }
        });

        btnRun.addEventListener('mouseenter', () => {
            if (isBenchmarking && !abortBenchmark) {
                btnRun.textContent = "Stop";
                btnRun.classList.add('btn-danger');
                btnRun.classList.remove('btn-primary');
            }
        });

        btnRun.addEventListener('mouseleave', () => {
            if (isBenchmarking && !abortBenchmark) {
                btnRun.textContent = "Running...";
                btnRun.classList.remove('btn-danger');
                btnRun.classList.add('btn-primary');
            }
        });
    }

    const btnClear = document.getElementById('btnClearConsole');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            document.getElementById('benchConsole').innerHTML = '<div class="console-line system">Console cleared.</div>';
            const large = document.getElementById('largeBenchConsole');
            if (large) large.innerHTML = '<div class="console-line system">Console cleared.</div>';
        });
    }

    const btnClearLarge = document.getElementById('btnClearLargeConsole');
    if (btnClearLarge) {
        btnClearLarge.addEventListener('click', () => {
            document.getElementById('benchConsole').innerHTML = '<div class="console-line system">Console cleared.</div>';
            document.getElementById('largeBenchConsole').innerHTML = '<div class="console-line system">Console cleared.</div>';
        });
    }

    const btnExpand = document.getElementById('btnExpandConsole');
    const modal = document.getElementById('largeConsoleModal');
    if (btnExpand && modal) {
        btnExpand.addEventListener('click', () => {
            modal.style.display = 'flex';
            const largeConsole = document.getElementById('largeBenchConsole');
            if (largeConsole) largeConsole.scrollTop = largeConsole.scrollHeight;
        });
    }

    const btnClose = document.getElementById('closeLargeConsole');
    if (btnClose && modal) {
        btnClose.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });

    // Toggle Logic (Dropdown)
    const sourceSelect = document.getElementById('benchSourceSelect');
    const configRandom = document.getElementById('configRandom');
    const configSaved = document.getElementById('configSaved');
    const configPetri = document.getElementById('configPetri');
    const configPnh = document.getElementById('configPnh');

    if (sourceSelect) {
        sourceSelect.addEventListener('change', (e) => {
            configRandom.style.display = 'none';
            configSaved.style.display = 'none';
            if (configPetri) configPetri.style.display = 'none';
            if (configPnh) configPnh.style.display = 'none';

            if (e.target.value === 'saved') {
                configSaved.style.display = 'block';
                loadBenchmarkGraphs();
            } else if (e.target.value === 'petri') {
                if (configPetri) {
                    configPetri.style.display = 'block';
                    loadBenchmarkPetriNets();
                }
            } else if (e.target.value === 'pnh') {
                if (configPnh) {
                    configPnh.style.display = 'block';
                    loadBenchmarkPnhFiles();
                }
            } else {
                configRandom.style.display = 'block';
            }
        });
        // Initial Trigger
        sourceSelect.dispatchEvent(new Event('change'));
    }

    // Search Filtering
    setupSearch('searchBenchGraphs', 'benchSavedList');
    setupSearch('searchBenchPetri', 'benchPetriList');
    setupSearch('searchBenchPnh', 'benchPnhFileList');
    setupSearch('searchAlgos', 'algoListContainer');

    // Load Algos Initially
    renderAlgoList();
    window.addEventListener('algosUpdated', renderAlgoList);
}

function setupSearch(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        // Target .algo-item or direct div children depending on list type
        const items = list.children;
        Array.from(items).forEach(item => {
            const label = item.innerText.toLowerCase();
            if (label.includes(query)) {
                item.style.display = 'flex'; // Restore flex for algo-items, or block for others
                if (!item.classList.contains('algo-item')) item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
}

async function renderAlgoList() {
    const container = document.getElementById('algoListContainer');
    if (!container) return;
    container.innerHTML = '<div style="padding: 5px; color: #888;">Loading...</div>';

    try {
        const resp = await fetch('/api/algorithms');
        let customAlgos = [];
        if (resp.ok) {
            customAlgos = await resp.json();
        }

        container.innerHTML = '';

        // Helper: Create Action Buttons
        const mkActions = (name) => `
            <span style="margin-left: auto; display: inline-flex; gap: 4px;">
                <button title="Edit" onclick="event.preventDefault(); window.dispatchEvent(new CustomEvent('openAlgoEditor', { detail: { name: '${name}' } }));" style="background:none; border:none; cursor:pointer; color:#888; padding:0 2px; font-size:12px;">✏️</button>
                <button title="Duplicate" onclick="event.preventDefault(); duplicateAlgoObj('${name}');" style="background:none; border:none; cursor:pointer; color:#888; padding:0 2px; font-size:12px;">📄</button>
                <button title="Delete" onclick="event.preventDefault(); deleteAlgoObj('${name}');" style="background:none; border:none; cursor:pointer; color:#f66; padding:0 2px; font-size:12px;">🗑️</button>
            </span>
        `;

        // Render Custom
        customAlgos.forEach(a => {
            const id = `custom_${a.name}`;
            const label = `C++: ${a.name}`;
            const color = a.compiled ? '#acf' : '#f88';
            const disabled = !a.compiled ? 'disabled' : '';
            const checked = ''; // Always unchecked by default as per user request
            const errBadge = a.compiled ? '' : ' <span style="font-size:10px; color:#f88">[ERR]</span>';

            const div = document.createElement('div');
            div.className = 'saved-item algo-item';
            div.dataset.id = id;
            div.innerHTML = `
                <input type="checkbox" value="${id}" ${checked} ${disabled} style="margin-right: 10px; cursor: pointer;">
                <span class="name" style="color: ${color};">${label}${errBadge}</span>
                <span class="actions" style="margin-left: auto; display: inline-flex; gap: 8px; align-items: center;">
                    <button title="Edit" onclick="event.preventDefault(); window.dispatchEvent(new CustomEvent('openAlgoEditor', { detail: { name: '${a.name}' } }));" class="btn-delete" style="font-size: 12px; color: #888;">✏️</button>
                    <button title="Duplicate" onclick="event.preventDefault(); duplicateAlgoObj('${a.name}');" class="btn-delete" style="font-size: 12px; color: #888;">📄</button>
                    <button title="Delete" onclick="event.preventDefault(); deleteAlgoObj('${a.name}');" class="btn-delete" style="color: #f66;">🗑️</button>
                </span>
            `;

            div.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const cb = div.querySelector('input');
                if (cb.disabled) return;
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                }
                div.classList.toggle('selected', cb.checked);
            });

            container.appendChild(div);
        });

    } catch (e) {
        console.error("Failed to load algos", e);
        container.innerHTML = `<div style="color:red; padding:10px;">Error loading algorithms</div>`;
    }
}

async function loadBenchmarkGraphs() {
    const list = document.getElementById('benchSavedList');
    if (!list) return;
    list.innerHTML = '<div style="padding: 5px; color: #888;">Loading...</div>';

    try {
        const resp = await fetch('/api/graphs');
        const graphs = await resp.json();

        list.innerHTML = '';
        if (graphs.length === 0) {
            list.innerHTML = '<div style="padding: 5px; color: #888;">No saved graphs found.</div>';
            return;
        }

        graphs.forEach(g => {
            const div = document.createElement('div');
            div.className = 'saved-item';
            div.innerHTML = `
                <input type="checkbox" name="benchGraphId" value="${g.id}" style="margin-right: 10px; cursor: pointer;">
                <span class="name">${g.name}</span>
                <span class="date">${new Date(g.created_at).toLocaleDateString()}</span>
            `;
            div.addEventListener('click', (e) => {
                const cb = div.querySelector('input');
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                }
                div.classList.toggle('selected', cb.checked);
            });
            list.appendChild(div);
        });

    } catch (e) {
        list.innerText = "Error loading graphs.";
        console.error(e);
    }
}

async function loadBenchmarkPetriNets() {
    const list = document.getElementById('benchPetriList');
    if (!list) return;
    list.innerHTML = '<div style="padding: 5px; color: #888;">Loading...</div>';

    try {
        const resp = await fetch('/api/petri/saved?per_page=9999');
        const data = await resp.json();
        const nets = data.nets || data;

        list.innerHTML = '';
        if (!nets || nets.length === 0) {
            list.innerHTML = '<div style="padding: 5px; color: #888;">No saved Petri nets found.</div>';
            return;
        }

        nets.forEach(n => {
            const div = document.createElement('div');
            div.className = 'saved-item';
            div.innerHTML = `
                <input type="checkbox" name="benchPetriId" value="${n.id}" style="margin-right: 10px; cursor: pointer;">
                <span class="name">${n.name}</span>
                <span class="date">${new Date(n.created_at).toLocaleDateString()}</span>
            `;
            div.addEventListener('click', (e) => {
                const cb = div.querySelector('input');
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                }
                div.classList.toggle('selected', cb.checked);
            });
            list.appendChild(div);
        });
    } catch (e) {
        list.innerText = "Error loading Petri nets.";
        console.error(e);
    }
}

async function loadBenchmarkPnhFiles() {
    const list = document.getElementById('benchPnhFileList');
    if (!list) return;
    list.innerHTML = '<div style="padding: 5px; color: #888;">Loading...</div>';

    try {
        const resp = await fetch('/api/petri/pnh');
        const files = await resp.json();

        list.innerHTML = '';
        if (files.length === 0) {
            list.innerHTML = '<div style="padding: 5px; color: #888;">No .pnh files found in web_app/pnh_files/</div>';
            return;
        }

        files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'saved-item';
            div.innerHTML = `
                <input type="checkbox" name="benchPnhFilename" value="${f.name}" style="margin-right: 10px; cursor: pointer;">
                <span class="name">${f.name}</span>
                <span class="date">${new Date(f.mtime * 1000).toLocaleDateString()}</span>
            `;
            div.addEventListener('click', (e) => {
                const cb = div.querySelector('input');
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                }
                div.classList.toggle('selected', cb.checked);
            });
            list.appendChild(div);
        });
    } catch (e) {
        list.innerText = "Error loading PNH files.";
        console.error(e);
    }
}


function appendLog(text, type = 'info') {
    const consoleEl = document.getElementById('benchConsole');
    const largeConsoleEl = document.getElementById('largeBenchConsole');

    [consoleEl, largeConsoleEl].forEach(el => {
        if (!el) return;
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        if (text.includes('\n')) {
            line.innerText = text;
        } else {
            line.textContent = text;
        }
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
    });
}

const COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#ff9f40', '#4bc0c0'];

function initChart(algoNames) {
    const ctx = document.getElementById('perfChart').getContext('2d');

    if (perfChart) {
        perfChart.destroy();
    }

    const datasets = algoNames.map((name, i) => ({
        label: name,
        data: [],
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: COLORS[i % COLORS.length],
        fill: false,
        barPercentage: 0.8,
        categoryPercentage: 0.9
    }));

    const ChartLib = window.Chart || Chart;
    perfChart = new ChartLib(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            title: {
                display: true,
                text: 'Execution Time vs Graph / Problem Size'
            },
            tooltips: {
                mode: 'index',
                intersect: false,
            },
            hover: {
                mode: 'nearest',
                intersect: true
            },
            scales: {
                xAxes: [{
                    stacked: false,
                    display: true,
                    scaleLabel: {
                        display: true,
                        labelString: 'Graph / Node Count (N)'
                    },
                    gridLines: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        fontColor: '#ccc'
                    }
                }],
                yAxes: [{
                    stacked: false,
                    display: true,
                    scaleLabel: {
                        display: true,
                        labelString: 'Time (ms)'
                    },
                    gridLines: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        fontColor: '#ccc',
                        beginAtZero: true
                    }
                }]
            },
            legend: {
                labels: {
                    fontColor: '#ccc'
                }
            }
        }
    });
}

function updateChart(resultChunk) {
    if (!perfChart) return;

    if (resultChunk.labels && resultChunk.labels.length > 0) {
        perfChart.data.labels.push(resultChunk.labels[0]);
    }

    resultChunk.datasets.forEach(remoteDs => {
        const localDs = perfChart.data.datasets.find(d => d.label === remoteDs.label);
        if (localDs && remoteDs.data.length > 0) {
            localDs.data.push(remoteDs.data[0]);
        }
    });

    perfChart.update();
}

async function runBenchmark() {
    const btnRun = document.getElementById('btnRunBenchmark');
    const statusDiv = document.getElementById('benchmarkStatus');
    const sourceSelect = document.getElementById('benchSourceSelect');
    const mode = sourceSelect ? sourceSelect.value : 'random';

    const iterations = parseInt(document.getElementById('benchIterations').value) || 5;

    // Get Algorithms from Dynamic List
    const algos = [];
    const container = document.getElementById('algoListContainer');
    if (container) {
        // Updated: Use .selected class on .algo-item
        const items = container.querySelectorAll('.algo-item.selected');
        items.forEach(el => {
            let val = el.dataset.id;

            if (val.startsWith('custom_')) {
                val = val.replace('custom_', '');
            }

            algos.push(val);
        });
    }

    if (algos.length === 0) {
        alert("Please select at least one algorithm.");
        return;
    }

    // UI Busy State
    isBenchmarking = true;
    abortBenchmark = false;
    btnRun.textContent = "Running...";
    btnRun.classList.add('btn-running');
    statusDiv.textContent = "Initializing...";

    // Initialize Chart
    initChart(algos);

    // Clear Console
    const consoleEl = document.getElementById('benchConsole');
    const largeConsoleEl = document.getElementById('largeBenchConsole');
    if (consoleEl) consoleEl.innerHTML = '';
    if (largeConsoleEl) largeConsoleEl.innerHTML = '';

    appendLog(`[${new Date().toLocaleTimeString()}] Starting Benchmark Run...`, 'system');
    appendLog(`Algorithms: ${algos.join(', ')}`, 'system');
    appendLog(`Mode: ${mode}`, 'system');
    appendLog('------------------------------------------', 'system');

    try {
        if (mode === 'random') {
            const startN = parseInt(document.getElementById('benchStartN').value) || 10;
            const endN = parseInt(document.getElementById('benchEndN').value) || 100;
            const stepN = parseInt(document.getElementById('benchStepN').value) || 10;
            const density = parseFloat(document.getElementById('benchDensity').value) || 0.5;

            // Generate Steps
            for (let n = startN; n <= endN; n += stepN) {
                statusDiv.textContent = `Running Random Graph N=${n}...`;

                const payload = {
                    mode: 'random',
                    iterations: iterations,
                    start_n: n,
                    end_n: n,
                    step_n: stepN,
                    density: density,
                    algorithms: algos,
                    displayName: `N=${n}`
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        } else if (mode === 'saved') {
            // Saved Graphs
            const checkboxes = document.querySelectorAll('input[name="benchGraphId"]:checked');
            const graphTasks = Array.from(checkboxes).map(cb => ({
                id: parseInt(cb.value),
                name: cb.closest('.saved-item').querySelector('.name').innerText
            }));

            if (graphTasks.length === 0) {
                alert("Please select at least one graph.");
                btnRun.disabled = false;
                btnRun.textContent = "Run Benchmark";
                return;
            }

            for (let i = 0; i < graphTasks.length; i++) {
                const graph = graphTasks[i];
                statusDiv.textContent = `Running Saved Graph (${i + 1}/${graphTasks.length})...`;

                const payload = {
                    mode: 'saved',
                    iterations: iterations,
                    graph_ids: [graph.id],
                    algorithms: algos,
                    displayName: graph.name
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        } else if (mode === 'petri') {
            // Petri Nets
            const checkboxes = document.querySelectorAll('input[name="benchPetriId"]:checked');
            const petriTasks = Array.from(checkboxes).map(cb => ({
                id: parseInt(cb.value),
                name: cb.closest('.saved-item').querySelector('.name').innerText
            }));

            if (petriTasks.length === 0) {
                alert("Please select at least one Petri net.");
                btnRun.disabled = false;
                btnRun.textContent = "Run Benchmark";
                return;
            }

            for (let i = 0; i < petriTasks.length; i++) {
                const petri = petriTasks[i];
                statusDiv.textContent = `Running Petri Net (${i + 1}/${petriTasks.length})...`;

                const graphType = document.getElementById('benchPetriGraphType').value;

                const payload = {
                    mode: 'petri',
                    iterations: iterations,
                    petri_ids: [petri.id],
                    petri_graph_type: graphType,
                    algorithms: algos,
                    displayName: petri.name
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        } else if (mode === 'pnh') {
            // PNH Files from folder
            const checkboxes = document.querySelectorAll('input[name="benchPnhFilename"]:checked');
            const filenames = Array.from(checkboxes).map(cb => cb.value);

            if (filenames.length === 0) {
                alert("Please select at least one PNH file.");
                btnRun.disabled = false;
                btnRun.textContent = "Run Benchmark";
                return;
            }

            for (let i = 0; i < filenames.length; i++) {
                const fname = filenames[i];
                statusDiv.textContent = `Running PNH File (${i + 1}/${filenames.length})...`;

                const payload = {
                    mode: 'pnh_files',
                    iterations: iterations,
                    filenames: [fname],
                    algorithms: algos,
                    displayName: fname
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        }

        statusDiv.textContent = "Done.";

    } catch (e) {
        console.error(e);
        statusDiv.textContent = e.message.includes("stopped") ? "Stopped." : "Error: " + e.message;
        appendLog(`Benchmark process: ${e.message}`, 'error');
    } finally {
        isBenchmarking = false;
        abortBenchmark = false;
        btnRun.disabled = false;
        btnRun.textContent = "Run Benchmark";
        btnRun.classList.remove('btn-running', 'btn-danger');
        btnRun.classList.add('btn-primary');
    }
}

async function executeBenchmarkStep(payload) {
    try {
        // Show step header in console
        const ctx = payload.displayName || (payload.start_n ? `N=${payload.start_n}` : "Unknown");
        appendLog(`>>> Executing ${payload.algorithms.join(', ')} on ${ctx}`, 'system');

        const response = await fetch(benchmarkUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify(payload)
        });

        const results = await response.json();
        if (results.error) throw new Error(results.error);

        // Display Logs if any
        if (results.logs && Array.isArray(results.logs)) {
            results.logs.forEach(log => {
                const logType = log.includes('Result') ? 'success' : 'info';
                appendLog(log, logType);
            });
        }

        updateChart(results);
    } catch (e) {
        throw e;
    }
}
