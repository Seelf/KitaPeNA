/**
 * benchmark_state.js — State persistence for benchmarking module.
 * Handles collecting, saving, and restoring benchmark UI state from the server.
 */

import { getCsrfToken } from './benchmark_helpers.js';
import { perfCharts, setPerfCharts, benchmarkResultsData, setBenchmarkResultsData, rawBenchmarkChunks, setRawBenchmarkChunks, lastBenchmarkPayload, setLastBenchmarkPayload } from './benchmark_shared.js';
import { buildDspnArgs, updateDspnPreview } from './benchmark_helpers.js';
import { initDynamicColumnCheckboxes, refreshBenchmarkTable } from './benchmark_export.js';

let _saveStateTimer = null;
export let _stateRestored = false;
export let _pendingRestore = null;

export function collectBenchmarkState() {
    const state = {};

    // 1. Source mode + settings
    state.sourceMode = document.getElementById('benchSourceSelect')?.value || 'random';
    state.iterations = document.getElementById('benchIterations')?.value || '5';
    state.graphCount = document.getElementById('benchGraphCount')?.value || '5';
    state.timeout = document.getElementById('benchTimeout')?.value || '';
    state.logScale = document.getElementById('benchLogScale')?.checked || false;

    // Random mode params
    state.startN = document.getElementById('benchStartN')?.value || '';
    state.endN = document.getElementById('benchEndN')?.value || '';
    state.stepN = document.getElementById('benchStepN')?.value || '';
    state.density = document.getElementById('benchDensity')?.value || '';

    // Petri graph type
    state.petriGraphType = document.getElementById('benchPetriGraphType')?.value || 'concurrency';

    // Atlas N
    state.atlasN = document.getElementById('benchAtlasN')?.value || '7';

    const aggItems = document.querySelectorAll('.aggregation-item');
    state.aggregations = [];
    aggItems.forEach(item => {
        const sel = item.querySelector('.benchAggregationSelect');
        if (sel) state.aggregations.push(sel.value);
    });

    // 3. Selected algorithms
    const algoContainer = document.getElementById('algoListContainer');
    if (algoContainer) {
        state.selectedAlgos = Array.from(algoContainer.querySelectorAll('.algo-item.selected')).map(el => el.dataset.id);
    }

    // 4. DSPN settings
    state.dspnArgs = document.getElementById('dspnArgsInput')?.value || '';
    const dspnCheckboxIds = [
        'dspn_opt_pt', 'dspn_opt_trg', 'dspn_opt_rg', 'dspn_opt_novpaths',
        'dspn_opt_s', 'dspn_opt_pinv', 'dspn_opt_tinv', 'dspn_opt_traps',
        'dspn_opt_dot', 'dspn_opt_allmeas'
    ];
    state.dspnCheckboxes = {};
    dspnCheckboxIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) state.dspnCheckboxes[id] = el.checked;
    });
    const dspnSelectIds = ['dspn_opt_verbose', 'dspn_opt_method', 'dspn_opt_solver', 'dspn_opt_prec'];
    state.dspnSelects = {};
    dspnSelectIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) state.dspnSelects[id] = el.value;
    });
    const dspnInputIds = ['dspn_val_t', 'dspn_val_epsilon', 'dspn_val_maxiters', 'dspn_val_timeout'];
    state.dspnInputs = {};
    dspnInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) state.dspnInputs[id] = el.value;
    });

    // 4b. CMD script inline settings
    state.cmdSettings = {};
    if (algoContainer) {
        algoContainer.querySelectorAll('.algo-item').forEach(item => {
            const id = item.dataset.id;
            if (id && id.startsWith('cmd_')) {
                const pathInput = item.querySelector('.cmd-path-input');
                const argsInput = item.querySelector('.cmd-args-input');
                if (pathInput && argsInput) {
                    state.cmdSettings[id] = {
                        path: pathInput.value,
                        args: argsInput.value
                    };
                }
            }
        });
    }

    // 5. Selected regexes
    const regexContainer = document.getElementById('regexListContainer');
    if (regexContainer) {
        state.selectedRegexes = Array.from(regexContainer.querySelectorAll('.regex-item.selected')).map(el => el.dataset.id);
    }

    // 6. Selected saved graphs
    state.selectedGraphIds = Array.from(document.querySelectorAll('input[name="benchGraphId"]:checked')).map(cb => cb.value);

    // 7. Selected petri nets
    state.selectedPetriIds = Array.from(document.querySelectorAll('input[name="benchPetriId"]:checked')).map(cb => cb.value);

    // 8. Selected PNH files
    state.selectedPnhFiles = Array.from(document.querySelectorAll('input[name="benchPnhFilename"]:checked')).map(cb => cb.value);

    // 9. Console output
    const consoleEl = document.getElementById('benchConsole');
    if (consoleEl) state.consoleHtml = consoleEl.innerHTML;

    // 10. Results table data
    state.resultsData = benchmarkResultsData;

    // 11. Table HTML
    const thead = document.querySelector('#benchmarkResultsTable thead');
    const tbody = document.querySelector('#benchmarkResultsTable tbody');
    if (thead && tbody) {
        state.tableHeadHtml = thead.innerHTML;
        state.tableBodyHtml = tbody.innerHTML;
    }
    state.tableVisible = document.getElementById('benchmarkResultsTableContainer')?.style.display !== 'none';

    // 11b. Last benchmark payload and raw chunks
    if (lastBenchmarkPayload) {
        state.lastPayload = lastBenchmarkPayload;
    }
    if (rawBenchmarkChunks.length > 0) {
        state.rawChunks = rawBenchmarkChunks;
    }

    // 11c. Column checkbox states
    const colsContainer = document.getElementById('dynamicColsContainer');
    if (colsContainer) {
        state.columnStates = {};
        colsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.id) state.columnStates[cb.id] = cb.checked;
        });
    }

    // 12. Chart data
    state.chartData = {};
    Object.entries(perfCharts).forEach(([key, chart]) => {
        if (chart && chart.data) {
            const opts = chart.options || {};
            let safeOptions;
            try {
                safeOptions = JSON.parse(JSON.stringify({
                    responsive: opts.responsive,
                    maintainAspectRatio: opts.maintainAspectRatio,
                    scales: opts.scales,
                    title: opts.title,
                    legend: opts.legend,
                    tooltips: opts.tooltips,
                    hover: opts.hover
                }));
            } catch (_) {
                safeOptions = { responsive: true, maintainAspectRatio: false };
            }
            state.chartData[key] = {
                type: chart.config.type || 'bar',
                labels: chart.data.labels,
                datasets: chart.data.datasets.map(ds => ({
                    label: ds.label,
                    data: [...ds.data],
                    borderColor: ds.borderColor,
                    backgroundColor: ds.backgroundColor,
                    fill: ds.fill !== undefined ? ds.fill : false,
                    barPercentage: ds.barPercentage,
                    categoryPercentage: ds.categoryPercentage
                })),
                options: safeOptions
            };
        }
    });

    return state;
}

export function scheduleSaveState() {
    if (!_stateRestored) return;
    if (_saveStateTimer) clearTimeout(_saveStateTimer);
    _saveStateTimer = setTimeout(() => {
        const state = collectBenchmarkState();
        fetch('/api/benchmark/state', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify(state)
        }).catch(err => console.error('Failed to save benchmark state:', err));
    }, 1500);
}

export function applyPendingSelections(listType) {
    if (!_pendingRestore) return;
    const state = _pendingRestore;

    if (listType === 'algos' && state.selectedAlgos && state.selectedAlgos.length) {
        const container = document.getElementById('algoListContainer');
        if (container) {
            state.selectedAlgos.forEach(id => {
                const item = container.querySelector(`[data-id="${id}"]`);
                if (item) {
                    const cb = item.querySelector('input[type="checkbox"]');
                    if (cb) { cb.checked = true; item.classList.add('selected'); }
                }
            });
        }

        if (state.cmdSettings) {
            Object.entries(state.cmdSettings).forEach(([cmdId, settings]) => {
                const item = container.querySelector(`[data-id="${cmdId}"]`);
                if (item) {
                    const pathInput = item.querySelector('.cmd-path-input');
                    const argsInput = item.querySelector('.cmd-args-input');
                    if (pathInput) pathInput.value = settings.path;
                    if (argsInput) argsInput.value = settings.args;
                }
            });
        }

        const dspnArgsEl = document.getElementById('dspnArgsInput');
        if (dspnArgsEl && (state.dspnCheckboxes || state.dspnSelects || state.dspnInputs)) {
            dspnArgsEl.value = buildDspnArgs();
        } else if (dspnArgsEl && state.dspnArgs) {
            dspnArgsEl.value = state.dspnArgs;
        }
    }

    if (listType === 'regexes' && state.selectedRegexes && state.selectedRegexes.length) {
        const container = document.getElementById('regexListContainer');
        if (container) {
            state.selectedRegexes.forEach(id => {
                const item = container.querySelector(`[data-id="${id}"]`);
                if (item) {
                    const cb = item.querySelector('input[type="checkbox"]');
                    if (cb) { cb.checked = true; item.classList.add('selected'); }
                }
            });
        }
    }

    if (listType === 'graphs' && state.selectedGraphIds && state.selectedGraphIds.length) {
        state.selectedGraphIds.forEach(val => {
            const cb = document.querySelector(`input[name="benchGraphId"][value="${val}"]`);
            if (cb) { cb.checked = true; cb.closest('.saved-item')?.classList.add('selected'); }
        });
    }

    if (listType === 'petri' && state.selectedPetriIds && state.selectedPetriIds.length) {
        state.selectedPetriIds.forEach(val => {
            const cb = document.querySelector(`input[name="benchPetriId"][value="${val}"]`);
            if (cb) { cb.checked = true; cb.closest('.saved-item')?.classList.add('selected'); }
        });
    }

    if (listType === 'pnh' && state.selectedPnhFiles && state.selectedPnhFiles.length) {
        state.selectedPnhFiles.forEach(val => {
            const cb = document.querySelector(`input[name="benchPnhFilename"][value="${val}"]`);
            if (cb) { cb.checked = true; cb.closest('.saved-item')?.classList.add('selected'); }
        });
    }
}

export async function restoreBenchmarkState() {
    try {
        const resp = await fetch('/api/benchmark/state');
        if (!resp.ok) {
            document.getElementById('benchSourceSelect')?.dispatchEvent(new Event('change'));
            return;
        }
        const state = await resp.json();
        if (!state || Object.keys(state).length === 0) {
            _stateRestored = true;
            document.getElementById('benchSourceSelect')?.dispatchEvent(new Event('change'));
            return;
        }

        _pendingRestore = state;

        // 1. Source mode + settings
        if (state.iterations) document.getElementById('benchIterations').value = state.iterations;
        if (state.graphCount && document.getElementById('benchGraphCount')) document.getElementById('benchGraphCount').value = state.graphCount;
        if (state.timeout && document.getElementById('benchTimeout')) document.getElementById('benchTimeout').value = state.timeout;
        if (state.logScale && document.getElementById('benchLogScale')) document.getElementById('benchLogScale').checked = state.logScale;

        if (state.startN && document.getElementById('benchStartN')) document.getElementById('benchStartN').value = state.startN;
        if (state.endN && document.getElementById('benchEndN')) document.getElementById('benchEndN').value = state.endN;
        if (state.stepN && document.getElementById('benchStepN')) document.getElementById('benchStepN').value = state.stepN;
        if (state.density && document.getElementById('benchDensity')) document.getElementById('benchDensity').value = state.density;

        if (state.petriGraphType && document.getElementById('benchPetriGraphType')) document.getElementById('benchPetriGraphType').value = state.petriGraphType;
        if (state.atlasN && document.getElementById('benchAtlasN')) document.getElementById('benchAtlasN').value = state.atlasN;

        const sourceSelect = document.getElementById('benchSourceSelect');
        if (sourceSelect && state.sourceMode) {
            sourceSelect.value = state.sourceMode;
            sourceSelect.dispatchEvent(new Event('change'));
        }

        // 2. Aggregations
        if (state.aggregations && state.aggregations.length > 0) {
            const aggContainer = document.getElementById('aggregationContainer');
            if (aggContainer) {
                const firstSelect = aggContainer.querySelector('.benchAggregationSelect');
                if (firstSelect) firstSelect.value = state.aggregations[0];
                for (let i = 1; i < state.aggregations.length; i++) {
                    if (window.addAggregationSelector) window.addAggregationSelector();
                    const allItems = aggContainer.querySelectorAll('.aggregation-item');
                    const lastItem = allItems[allItems.length - 1];
                    if (lastItem) {
                        const sel = lastItem.querySelector('.benchAggregationSelect');
                        if (sel) sel.value = state.aggregations[i];
                    }
                }
            }
        }

        // 3. DSPN settings
        if (state.dspnCheckboxes) {
            Object.entries(state.dspnCheckboxes).forEach(([id, checked]) => {
                const el = document.getElementById(id);
                if (el) el.checked = checked;
            });
        }
        if (state.dspnSelects) {
            Object.entries(state.dspnSelects).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            });
        }
        if (state.dspnInputs) {
            Object.entries(state.dspnInputs).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            });
        }
        const dspnArgsEl = document.getElementById('dspnArgsInput');
        if (dspnArgsEl) {
            if (state.dspnCheckboxes || state.dspnSelects || state.dspnInputs) {
                dspnArgsEl.value = buildDspnArgs();
            } else if (state.dspnArgs) {
                dspnArgsEl.value = state.dspnArgs;
            }
        }
        updateDspnPreview();

        // 4. Console output
        const consoleEl = document.getElementById('benchConsole');
        if (consoleEl && state.consoleHtml) consoleEl.innerHTML = state.consoleHtml;
        const largeConsoleEl = document.getElementById('largeBenchConsole');
        if (largeConsoleEl && state.consoleHtml) largeConsoleEl.innerHTML = state.consoleHtml;

        // 5. Results table
        if (state.resultsData) setBenchmarkResultsData(state.resultsData);
        if (state.tableHeadHtml) {
            const thead = document.querySelector('#benchmarkResultsTable thead');
            if (thead) thead.innerHTML = state.tableHeadHtml;
        }
        if (state.tableBodyHtml) {
            const tbody = document.querySelector('#benchmarkResultsTable tbody');
            if (tbody) tbody.innerHTML = state.tableBodyHtml;
        }
        if (state.tableVisible) {
            document.getElementById('benchmarkResultsTableContainer').style.display = 'block';
            const settingsPanel = document.getElementById('tableSettingsPanel');
            if (settingsPanel) settingsPanel.style.display = 'block';
        }

        // 5b. Restore column checkboxes and raw data
        if (state.lastPayload) {
            setLastBenchmarkPayload(state.lastPayload);
            initDynamicColumnCheckboxes(state.lastPayload);

            if (state.columnStates) {
                Object.entries(state.columnStates).forEach(([id, checked]) => {
                    const cb = document.getElementById(id);
                    if (cb) cb.checked = checked;
                });
            }
        }
        if (state.rawChunks) {
            setRawBenchmarkChunks(state.rawChunks);
            refreshBenchmarkTable();
        }

        // 6. Chart data
        if (state.chartData && Object.keys(state.chartData).length) {
            const container = document.getElementById('perfChartsContainer');
            if (container) {
                container.innerHTML = '';
                container.insertAdjacentHTML('beforeend', '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;"><h3 style="margin:0;color:var(--accent);font-size:16px;">Charts</h3></div>');
            }

            Object.entries(state.chartData).forEach(([key, chartState]) => {
                const container = document.getElementById('perfChartsContainer');
                if (!container) return;

                const canvasWrapper = document.createElement('div');
                canvasWrapper.className = 'chart-wrapper';
                canvasWrapper.style.cssText = 'position: relative; flex: 1; min-height: 400px; width: 100%; margin-bottom: 20px;';

                const canvas = document.createElement('canvas');
                canvas.id = `perfChart_${key}`;
                canvasWrapper.appendChild(canvas);
                container.appendChild(canvasWrapper);

                const ChartLib = window.Chart || Chart;
                if (perfCharts[key]) perfCharts[key].destroy();

                const newCharts = { ...perfCharts };
                newCharts[key] = new ChartLib(canvas.getContext('2d'), {
                    type: chartState.type || 'bar',
                    data: {
                        labels: chartState.labels || [],
                        datasets: (chartState.datasets || []).map(ds => ({
                            ...ds,
                            fill: ds.fill !== undefined ? ds.fill : false
                        }))
                    },
                    options: chartState.options || {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                });
                setPerfCharts(newCharts);

                const chart = perfCharts[key];
                if (chart.options.scales && chart.options.scales.yAxes && chart.options.scales.yAxes[0]) {
                    chart.options.scales.yAxes[0].ticks = chart.options.scales.yAxes[0].ticks || {};
                    chart.options.scales.yAxes[0].ticks.callback = function (value) {
                        if (document.getElementById('benchLogScale')?.checked) {
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
        }

        console.log('[Benchmark] State restored from server.');
    } catch (e) {
        console.error('Failed to restore benchmark state:', e);
        document.getElementById('benchSourceSelect')?.dispatchEvent(new Event('change'));
    } finally {
        _stateRestored = true;
    }
}

export function attachStateListeners() {
    const ids = [
        'benchSourceSelect', 'benchIterations', 'benchGraphCount', 'benchTimeout',
        'benchLogScale', 'benchStartN', 'benchEndN', 'benchStepN', 'benchDensity',
        'benchPetriGraphType', 'benchAtlasN'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', scheduleSaveState);
    });

    const observeTargets = ['algoListContainer', 'regexListContainer', 'benchSavedList', 'benchPetriList', 'benchPnhFileList'];
    observeTargets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', () => setTimeout(scheduleSaveState, 100));
        }
    });

    const aggContainer = document.getElementById('aggregationContainer');
    if (aggContainer) aggContainer.addEventListener('change', scheduleSaveState);

    const dspnModal = document.getElementById('dspnModal');
    if (dspnModal) {
        dspnModal.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', scheduleSaveState);
        });
    }
    const btnSaveDspn = document.getElementById('btnSaveDspnConfig');
    if (btnSaveDspn) btnSaveDspn.addEventListener('click', () => setTimeout(scheduleSaveState, 200));

    const btnSaveCmd = document.getElementById('btnSaveCmd');
    if (btnSaveCmd) btnSaveCmd.addEventListener('click', () => setTimeout(scheduleSaveState, 500));
}
