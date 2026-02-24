/**
 * benchmark_runner.js — Benchmark execution logic.
 */

import { getCsrfToken, appendLog } from './benchmark_helpers.js';
import { benchmarkUrl, abortBenchmark, setAbortBenchmark, isBenchmarking, setIsBenchmarking, benchmarkResultsData, setBenchmarkResultsData, rawBenchmarkChunks, setRawBenchmarkChunks, lastBenchmarkPayload, setLastBenchmarkPayload, regexCache } from './benchmark_shared.js';
import { initChart, updateChart } from './benchmark_charts.js';
import { appendResultsToTable, initDynamicColumnCheckboxes } from './benchmark_export.js';
import { scheduleSaveState } from './benchmark_state.js';

export async function runBenchmark() {
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
    setIsBenchmarking(true);
    setAbortBenchmark(false);
    btnRun.textContent = "Running...";
    btnRun.classList.add('btn-running');
    statusDiv.textContent = "Initializing...";

    // Find aggregations
    const aggItems = document.querySelectorAll('.aggregation-item');
    const selectedAggregations = Array.from(aggItems).map(item => {
        const sel = item.querySelector('.benchAggregationSelect');
        return sel ? sel.value : null;
    }).filter(Boolean);

    const uniqueAggregations = [...new Set(selectedAggregations)];

    // Initialize Charts
    initChart(algos, uniqueAggregations, mode);

    // Clear Console & Data
    const consoleEl = document.getElementById('benchConsole');
    const largeConsoleEl = document.getElementById('largeBenchConsole');
    if (consoleEl) consoleEl.innerHTML = '';
    if (largeConsoleEl) largeConsoleEl.innerHTML = '';

    setBenchmarkResultsData([]);
    setRawBenchmarkChunks([]);
    setLastBenchmarkPayload(null);

    const resultsTbody = document.querySelector('#benchmarkResultsTable tbody');
    const resultsThead = document.querySelector('#benchmarkResultsTable thead');
    const dynamicColsContainer = document.getElementById('dynamicColsContainer');

    if (resultsTbody) resultsTbody.innerHTML = '';
    if (resultsThead) resultsThead.innerHTML = '';
    if (dynamicColsContainer) dynamicColsContainer.innerHTML = '';

    document.getElementById('benchmarkResultsTableContainer').style.display = 'none';
    document.getElementById('tableSettingsPanel').style.display = 'none';

    appendLog(`[${new Date().toLocaleTimeString()}] Starting Benchmark Run...`, 'system');
    appendLog(`Algorithms: ${algos.join(', ')}`, 'system');
    appendLog(`Mode: ${mode}`, 'system');
    appendLog('------------------------------------------', 'system');

    // Extract custom CMD mappings
    const customCmds = {};
    algos.forEach(algo_id => {
        if (algo_id.startsWith('cmd_')) {
            const row = document.querySelector(`div[data-id="${algo_id}"]`);
            if (row) {
                const path = row.querySelector('.cmd-path-input').value;
                const args = row.querySelector('.cmd-args-input').value;
                customCmds[algo_id] = { cmd_path: path, cmd_args: args };
            }
        }
    });

    // Column visibility
    const showContext = document.getElementById('colShowContext')?.checked !== false;
    const showAlgorithm = document.getElementById('colShowAlgorithm')?.checked !== false;

    // Extract selected Regexes
    const selectedRegexes = [];
    const regexContainer = document.getElementById('regexListContainer');
    if (regexContainer) {
        const items = regexContainer.querySelectorAll('.regex-item.selected');
        items.forEach(el => {
            const rid = el.dataset.id;
            const regexData = regexCache.find(r => String(r.id) === String(rid));
            if (regexData) {
                selectedRegexes.push({
                    id: regexData.id,
                    name: regexData.name,
                    pattern: regexData.pattern,
                    showInTable: true
                });
            }
        });
    }

    try {
        if (mode === 'random') {
            const startN = parseInt(document.getElementById('benchStartN').value) || 10;
            const endN = parseInt(document.getElementById('benchEndN').value) || 100;
            const stepN = parseInt(document.getElementById('benchStepN').value) || 10;
            const density = parseFloat(document.getElementById('benchDensity').value) || 0.5;

            for (let n = startN; n <= endN; n += stepN) {
                statusDiv.textContent = `Running Random Graph N=${n}...`;

                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'random', iterations, graph_count: graphCount,
                    start_n: n, end_n: n, step_n: stepN, density,
                    algorithms: algos, aggregations: uniqueAggregations,
                    dspnOptions, customCmds, regexes: selectedRegexes,
                    baseTimeout, showContext, showAlgorithm, displayName: `N=${n}`
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        } else if (mode === 'saved') {
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

                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'saved', iterations, graph_ids: [graph.id],
                    algorithms: algos, aggregations: uniqueAggregations,
                    dspnOptions, customCmds, regexes: selectedRegexes,
                    baseTimeout, showContext, showAlgorithm, displayName: graph.name
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        } else if (mode === 'petri') {
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
                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'petri', iterations, petri_ids: [petri.id],
                    petri_graph_type: graphType,
                    algorithms: algos, aggregations: uniqueAggregations,
                    dspnOptions, customCmds, regexes: selectedRegexes,
                    baseTimeout, showContext, showAlgorithm, displayName: petri.name
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        } else if (mode === 'pnh') {
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

                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'pnh_files', iterations, filenames: [fname],
                    algorithms: algos, aggregations: uniqueAggregations,
                    dspnOptions, customCmds, regexes: selectedRegexes,
                    baseTimeout, showContext, showAlgorithm, displayName: fname
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
            if (!Array.isArray(graphs)) graphs = graphs.graphs;

            for (let i = 0; i < graphs.length; i++) {
                const graph = graphs[i];
                statusDiv.textContent = `Running Atlas Graph (${i + 1}/${graphs.length})...`;

                const isDspnSelected = algos.includes('DSPN-Tool');
                const dspnArgsInput = document.getElementById('dspnArgsInput');
                const dspnOptions = isDspnSelected && dspnArgsInput ? dspnArgsInput.value : '';
                const baseTimeout = parseInt(document.getElementById('benchTimeout')?.value) || null;

                const payload = {
                    mode: 'atlas', iterations, atlas_n: atlasN, atlas_id: graph.id,
                    algorithms: algos, aggregations: uniqueAggregations,
                    dspnOptions, customCmds, regexes: selectedRegexes,
                    baseTimeout, showContext, showAlgorithm, displayName: graph.name
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        }

        statusDiv.textContent = "Done.";

        if (benchmarkResultsData.length > 0) {
            document.getElementById('benchmarkResultsTableContainer').style.display = 'block';
        }

    } catch (e) {
        console.error(e);
        statusDiv.textContent = e.message.includes("stopped") ? "Stopped." : "Error: " + e.message;
        appendLog(`Benchmark process: ${e.message}`, 'error');
    } finally {
        setIsBenchmarking(false);
        setAbortBenchmark(false);
        btnRun.disabled = false;
        btnRun.textContent = "Run Benchmark";
        btnRun.classList.remove('btn-running', 'btn-danger');
        btnRun.classList.add('btn-primary');
        scheduleSaveState();
    }
}

export async function executeBenchmarkStep(payload) {
    try {
        const ctx = payload.displayName || (payload.start_n ? `N=${payload.start_n}` : "Unknown");
        appendLog(`>>> Executing ${payload.algorithms.join(', ')} on ${ctx}`, 'system');

        const response = await fetch(benchmarkUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify(payload)
        });

        let results;
        const responseText = await response.text();
        try {
            results = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse benchmark response:", responseText);
            throw new Error(`Server returned invalid JSON. Status: ${response.status}. Body starts with: ${responseText.substring(0, 100)}`);
        }

        if (results.error) throw new Error(results.error);

        // Display Logs
        let logList = [];
        const firstAgg = payload.aggregations && payload.aggregations[0];
        if (firstAgg && results[firstAgg] && results[firstAgg].logs) {
            logList = results[firstAgg].logs;
        } else if (results.logs) {
            logList = results.logs;
        }

        if (logList && logList.length > 0) {
            logList.forEach(log => {
                const logType = log.includes('Result') ? 'success' : 'info';
                appendLog(log, logType);
            });
        }

        if (!response.ok) {
            throw new Error(results.error || `Server error: ${response.status}`);
        }

        updateChart(results, payload.aggregations);
        appendResultsToTable(results, payload);
        scheduleSaveState();
        return results;
    } catch (e) {
        throw e;
    }
}
