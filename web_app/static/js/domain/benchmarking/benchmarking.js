function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
}

window.selectListItems = function (containerId, bool) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const items = container.querySelectorAll('.saved-item, .algo-item');
    items.forEach(item => {
        if (item.style.display === 'none') return;
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && !cb.disabled) {
            cb.checked = bool;
            item.classList.toggle('selected', bool);
        }
    });
};

// Performance Benchmarking Module

const benchmarkUrl = '/api/benchmark';

let perfCharts = {}; // Map of charts
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

    // Logarithmic Scale Live Toggle
    const logScaleToggle = document.getElementById('benchLogScale');
    if (logScaleToggle) {
        logScaleToggle.addEventListener('change', (e) => {
            const isLog = e.target.checked;
            Object.values(perfCharts).forEach(chart => {
                if (chart && chart.options && chart.options.scales && chart.options.scales.yAxes[0]) {
                    chart.options.scales.yAxes[0].type = isLog ? 'logarithmic' : 'linear';
                    chart.options.scales.yAxes[0].ticks = chart.options.scales.yAxes[0].ticks || {};
                    chart.options.scales.yAxes[0].ticks.callback = function (value, index, values) {
                        if (isLog) {
                            if (value === 10 || value === 100 || value === 1000 || value === 10000 || value === 100000) {
                                return value.toString();
                            }
                            return '';
                        }
                        return value;
                    };
                    chart.update();
                }
            });
        });
    }

    // Toggle Logic (Dropdown)
    const sourceSelect = document.getElementById('benchSourceSelect');
    const configRandom = document.getElementById('configRandom');
    const configSaved = document.getElementById('configSaved');
    const configPetri = document.getElementById('configPetri');
    const configPnh = document.getElementById('configPnh');
    const configRandomCount = document.getElementById('configRandomCount');
    const configAtlas = document.getElementById('configAtlas');

    if (sourceSelect) {
        sourceSelect.addEventListener('change', (e) => {
            configRandom.style.display = 'none';
            configSaved.style.display = 'none';
            if (configPetri) configPetri.style.display = 'none';
            if (configPnh) configPnh.style.display = 'none';
            if (configRandomCount) configRandomCount.style.display = 'none';
            if (configAtlas) configAtlas.style.display = 'none';

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
            } else if (e.target.value === 'atlas') {
                if (configAtlas) {
                    configAtlas.style.display = 'block';
                }
            } else {
                configRandom.style.display = 'block';
                if (configRandomCount) configRandomCount.style.display = 'block';
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

        // --- Hardcoded DSPN-Tool Item ---
        const dspnDiv = document.createElement('div');
        dspnDiv.className = 'saved-item algo-item';
        dspnDiv.dataset.id = 'DSPN-Tool';
        dspnDiv.innerHTML = `
            <input type="checkbox" value="DSPN-Tool" style="margin-right: 10px; cursor: pointer;">
            <span class="name" style="color: #ff9f40; font-weight: bold;">[GreatSPN] DSPN-Tool</span>
            <span class="actions" style="margin-left: auto; display: inline-flex; gap: 8px; align-items: center; position: relative;">
                <button title="Settings" class="btn-settings-dspn" style="font-size: 14px; color: #ccc; background: none; border: none; cursor: pointer;">⚙️</button>
                <div class="dspn-settings-panel" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 5px; background: #222; border: 1px solid #555; padding: 10px; z-index: 10001; box-shadow: 0 4px 10px rgba(0,0,0,0.5); min-width: 200px;">
                    <label style="display: block; color: #ccc; font-size: 11px; margin-bottom: 3px;">CLI Arguments</label>
                    <input type="text" id="dspnArgsInput" value="-pinv" style="width: 100%; padding: 4px; background: #111; color: white; border: 1px solid #444; font-family: monospace;">
                </div>
            </span>
        `;
        // Toggle settings panel
        const dspnSettingsBtn = dspnDiv.querySelector('.btn-settings-dspn');
        const dspnSettingsPanel = dspnDiv.querySelector('.dspn-settings-panel');
        dspnSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dspnSettingsPanel.style.display = dspnSettingsPanel.style.display === 'none' ? 'block' : 'none';
        });
        dspnSettingsPanel.addEventListener('click', (e) => {
            e.stopPropagation(); // keep open while interacting with input
        });
        document.addEventListener('click', (e) => {
            if (!dspnDiv.contains(e.target)) {
                dspnSettingsPanel.style.display = 'none';
            }
        });

        dspnDiv.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('input[type="text"]')) return;
            const cb = dspnDiv.querySelector('input[type="checkbox"]');
            if (e.target !== cb) {
                cb.checked = !cb.checked;
            }
            dspnDiv.classList.toggle('selected', cb.checked);
        });
        container.appendChild(dspnDiv);
        // --------------------------------

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
                <span class="name">${g.name} <small style="color: #666;">(${g.is_directed ? 'Directed' : 'Undirected'})</small></span>
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


function colorizeConsoleOutput(text) {
    if (!text) return "";
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // ANSI / CLI style syntax highlighting

    // 1. Numbers (including floats)
    html = html.replace(/\b(\d+(\.\d+)?)\b/g, '<span style="color: #b5cea8;">$1</span>');

    // 2. Error / Warning keywords
    html = html.replace(/\b(Error|Warning|Failed|Exception|Skipped)\b/gi, '<span style="color: #f14c4c; font-weight: bold;">$1</span>');

    // 3. Success / Good keywords
    html = html.replace(/\b(Success|Done|Ready)\b/gi, '<span style="color: #23d18b; font-weight: bold;">$1</span>');

    // 4. Action / Info keywords
    html = html.replace(/\b(Command|Executing|Starting|Completed|Running)\b/gi, '<span style="color: #569cd6;">$1</span>');

    // 5. Special Tool Names
    html = html.replace(/\b(DSPN-Tool|GreatSPN)\b/g, '<span style="color: #ff9f40; font-weight: bold;">$1</span>');

    // 6. CLI Flags (-flag)
    html = html.replace(/(\B-\w+)/g, '<span style="color: #dcdcaa;">$1</span>');

    // 7. Data patterns like vectors entirely enclosed in brackets
    html = html.replace(/(\[.*?\])/g, '<span style="color: #ce9178;">$1</span>');

    // 8. Newlines to breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

function appendLog(text, type = 'info') {
    const consoleEl = document.getElementById('benchConsole');
    const largeConsoleEl = document.getElementById('largeBenchConsole');

    [consoleEl, largeConsoleEl].forEach(el => {
        if (!el) return;
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.innerHTML = colorizeConsoleOutput(text);
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
    });
}

window.addAggregationSelector = function () {
    const container = document.getElementById('aggregationContainer');
    const newDiv = document.createElement('div');
    newDiv.className = 'input-group aggregation-item';
    newDiv.style.cssText = 'display: flex; gap: 5px; align-items: flex-end; margin-top: 5px;';
    newDiv.innerHTML = `
        <div style="flex: 1;">
            <select class="benchAggregationSelect">
                <option value="mean">Mean (Average)</option>
                <option value="median">Median (Middle Value)</option>
                <option value="min">Minimum (Best Time)</option>
                <option value="max">Maximum (Worst Time)</option>
                <option value="p95">95th Percentile</option>
            </select>
        </div>
        <button type="button" class="btn btn-sm btn-danger" style="height: 38px; padding: 0 15px;" onclick="this.parentElement.remove()">-</button>
    `;
    container.appendChild(newDiv);
};

const COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#ff9f40', '#4bc0c0'];

function initChart(algoNames, aggregations, mode) {
    const container = document.getElementById('perfChartsContainer');
    if (!container) return;

    // Clear old charts completely
    container.innerHTML = '';

    // Destroy previous Chart instances
    Object.values(perfCharts).forEach(chart => {
        if (chart) chart.destroy();
    });
    perfCharts = {};

    aggregations.forEach((agg, index) => {
        // Create canvas
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'chart-wrapper';
        canvasWrapper.style.cssText = 'position: relative; flex: 1; min-height: 400px; width: 100%; margin-bottom: 20px;';

        const c = document.createElement('canvas');
        c.id = `perfChart_${agg}_${index}`;
        canvasWrapper.appendChild(c);
        container.appendChild(canvasWrapper);

        const ctx = c.getContext('2d');

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

        let titleName = "Execution Time / Size";
        if (agg === 'mean') titleName = "Mean (Average) Time";
        else if (agg === 'median') titleName = "Median Time";
        else if (agg === 'min') titleName = "Minimum (Best) Time";
        else if (agg === 'max') titleName = "Maximum (Worst) Time";
        else if (agg === 'p95') titleName = "95th Percentile Time";

        let xLabel = 'Graph / Node Count (N)';

        if (mode === 'random') {
            xLabel = 'Random Graph Node Count (N)';
        } else if (mode === 'saved') {
            xLabel = 'Saved Graph Instance';
            titleName += ' over Custom Data';
        } else if (mode === 'petri') {
            xLabel = 'Petri Net Translation';
            titleName += ' over Petri Nets';
        } else if (mode === 'pnh_files') {
            xLabel = 'File Name';
            titleName += ' over Datasets';
        } else if (mode === 'atlas') {
            xLabel = 'Atlas Graph Designation';
            titleName += ' against NetworkX Atlas';
        }

        perfCharts[agg] = new ChartLib(ctx, {
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
                    text: titleName
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
                            labelString: xLabel
                        },
                        gridLines: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            fontColor: '#ccc'
                        }
                    }],
                    yAxes: [{
                        type: document.getElementById('benchLogScale')?.checked ? 'logarithmic' : 'linear',
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
                            beginAtZero: true,
                            callback: function (value, index, values) {
                                if (document.getElementById('benchLogScale')?.checked) {
                                    if (value === 10 || value === 100 || value === 1000 || value === 10000 || value === 100000) {
                                        return value.toString();
                                    }
                                    return '';
                                }
                                return value;
                            }
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
    });
}

function updateChart(resultChunk, aggregations) {
    aggregations.forEach(agg => {
        const chart = perfCharts[agg];
        if (!chart) return;
        const dataForAgg = resultChunk[agg];
        if (!dataForAgg) return;

        if (dataForAgg.labels && dataForAgg.labels.length > 0) {
            chart.data.labels.push(...dataForAgg.labels);
        }

        dataForAgg.datasets.forEach(remoteDs => {
            const localDs = chart.data.datasets.find(d => d.label === remoteDs.label);
            if (localDs && remoteDs.data.length > 0) {
                localDs.data.push(...remoteDs.data);
            }
        });

        chart.update();
    });
}

async function runBenchmark() {
    const btnRun = document.getElementById('btnRunBenchmark');
    const statusDiv = document.getElementById('benchmarkStatus');
    const sourceSelect = document.getElementById('benchSourceSelect');
    const mode = sourceSelect ? sourceSelect.value : 'random';

    const iterations = parseInt(document.getElementById('benchIterations').value) || 5;
    const graphCount = parseInt(document.getElementById('benchGraphCount')?.value) || 5;

    // Get Algorithms from Dynamic List
    const algos = [];
    const container = document.getElementById('algoListContainer');
    if (container) {
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

    // Find aggregations arrays
    const aggSelects = document.querySelectorAll('.benchAggregationSelect');
    const selectedAggregations = Array.from(aggSelects).map(s => s.value);

    // Remove duplicates
    const uniqueAggregations = [...new Set(selectedAggregations)];

    // Initialize Charts
    initChart(algos, uniqueAggregations, mode);

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

                // DSPN Specific Settings
                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'random',
                    iterations: iterations,
                    graph_count: graphCount,
                    start_n: n,
                    end_n: n,
                    step_n: stepN,
                    density: density,
                    algorithms: algos,
                    aggregations: uniqueAggregations,
                    dspnOptions: dspnOptions,
                    baseTimeout: baseTimeout,
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

                // DSPN Specific Settings
                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'saved',
                    iterations: iterations,
                    graph_ids: [graph.id],
                    algorithms: algos,
                    aggregations: uniqueAggregations,
                    dspnOptions: dspnOptions,
                    baseTimeout: baseTimeout,
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

                // DSPN Specific Settings
                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'petri',
                    iterations: iterations,
                    petri_ids: [petri.id],
                    petri_graph_type: graphType,
                    algorithms: algos,
                    aggregations: uniqueAggregations,
                    dspnOptions: dspnOptions,
                    baseTimeout: baseTimeout,
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

                // DSPN Specific Settings
                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'pnh_files',
                    iterations: iterations,
                    filenames: [fname],
                    algorithms: algos,
                    aggregations: uniqueAggregations,
                    dspnOptions: dspnOptions,
                    baseTimeout: baseTimeout,
                    displayName: fname
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        } else if (mode === 'atlas') {
            const atlasN = parseInt(document.getElementById('benchAtlasN').value) || 7;

            if (atlasN < 2 || atlasN > 7) {
                alert("Atlas Vertex Count must be between 2 and 7.");
                btnRun.disabled = false;
                btnRun.textContent = "Run Benchmark";
                return;
            }

            statusDiv.textContent = `Generating Atlas Graphs for N=${atlasN} on server...`;
            const resp = await fetch(`/api/benchmark/atlas/${atlasN}`, { headers: { 'X-CSRFToken': getCsrfToken() } });
            let graphs = await resp.json();

            if (graphs.error) throw new Error(graphs.error);
            if (!Array.isArray(graphs)) graphs = graphs.graphs; // fallback if wrapped

            for (let i = 0; i < graphs.length; i++) {
                const graph = graphs[i];
                statusDiv.textContent = `Running Atlas Graph (${i + 1}/${graphs.length})...`;

                // DSPN Specific Settings
                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'atlas',
                    iterations: iterations,
                    atlas_n: atlasN,
                    atlas_id: graph.id,
                    algorithms: algos,
                    aggregations: uniqueAggregations,
                    dspnOptions: dspnOptions,
                    baseTimeout: baseTimeout,
                    displayName: graph.name
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

        // Remove obsolete legacy injector
        const response = await fetch(benchmarkUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify(payload)
        });

        const results = await response.json();
        if (results.error) throw new Error(results.error);

        // Display Logs if any logs present in *first* aggregation object
        // assuming standard results dictionary
        let logList = [];
        if (payload.aggregations && results[payload.aggregations[0]] && results[payload.aggregations[0]].logs) {
            logList = results[payload.aggregations[0]].logs;
        } else if (results.logs) {
            logList = results.logs; // fallback
        }

        if (Array.isArray(logList)) {
            logList.forEach(log => {
                const logType = log.includes('Result') ? 'success' : 'info';
                appendLog(log, logType);
            });
        }

        updateChart(results, payload.aggregations);
    } catch (e) {
        throw e;
    }
}
