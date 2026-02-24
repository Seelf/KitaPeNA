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
let benchmarkResultsData = []; // Store tabular data for export
let rawBenchmarkChunks = []; // Store raw chunks to allow filtering/re-rendering
let lastBenchmarkPayload = null; // Store payload to know which algos/aggregations were run

// --- Benchmark State Persistence ---
let _saveStateTimer = null;
let _stateRestored = false;
let _pendingRestore = null; // Holds state to apply when lists finish loading

function collectBenchmarkState() {
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

    // 4. DSPN settings (hidden input + all individual modal fields)
    state.dspnArgs = document.getElementById('dspnArgsInput')?.value || '';
    // DSPN modal checkboxes
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
    // DSPN modal selects
    const dspnSelectIds = ['dspn_opt_verbose', 'dspn_opt_method', 'dspn_opt_solver', 'dspn_opt_prec'];
    state.dspnSelects = {};
    dspnSelectIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) state.dspnSelects[id] = el.value;
    });
    // DSPN modal text/number inputs
    const dspnInputIds = ['dspn_val_t', 'dspn_val_epsilon', 'dspn_val_maxiters', 'dspn_val_timeout'];
    state.dspnInputs = {};
    dspnInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) state.dspnInputs[id] = el.value;
    });

    // 4b. CMD script inline settings (path + args hidden inputs)
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

    // 9. Console output (full HTML)
    const consoleEl = document.getElementById('benchConsole');
    if (consoleEl) state.consoleHtml = consoleEl.innerHTML;

    // 10. Results table data
    state.resultsData = benchmarkResultsData;

    // 11. Table HTML (for quick restore)
    const thead = document.querySelector('#benchmarkResultsTable thead');
    const tbody = document.querySelector('#benchmarkResultsTable tbody');
    if (thead && tbody) {
        state.tableHeadHtml = thead.innerHTML;
        state.tableBodyHtml = tbody.innerHTML;
    }
    state.tableVisible = document.getElementById('benchmarkResultsTableContainer')?.style.display !== 'none';

    // 11b. Last benchmark payload and raw chunks (needed for column toggling after restore)
    if (lastBenchmarkPayload) {
        state.lastPayload = lastBenchmarkPayload;
    }
    if (rawBenchmarkChunks.length > 0) {
        state.rawChunks = rawBenchmarkChunks;
    }

    // 11c. Column checkbox states (which columns are toggled on/off)
    const colsContainer = document.getElementById('dynamicColsContainer');
    if (colsContainer) {
        state.columnStates = {};
        colsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.id) state.columnStates[cb.id] = cb.checked;
        });
    }

    // 12. Chart data (from Chart.js instances)
    state.chartData = {};
    Object.entries(perfCharts).forEach(([key, chart]) => {
        if (chart && chart.data) {
            // Extract only serializable options (Chart.js objects can have circular refs)
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

function scheduleSaveState() {
    if (!_stateRestored) return; // Don't save during restore
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
    }, 1500); // 1.5s debounce
}

/**
 * Called by each async list-rendering function after its DOM is populated.
 * Applies the matching pending selections from _pendingRestore.
 */
function applyPendingSelections(listType) {
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

        // Also restore CMD script settings (path/args hidden inputs)
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

        // Restore dspnArgsInput (it's recreated inside the algo list DOM)
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

async function restoreBenchmarkState() {
    try {
        const resp = await fetch('/api/benchmark/state');
        if (!resp.ok) {
            // No state — just fire initial UI setup
            document.getElementById('benchSourceSelect')?.dispatchEvent(new Event('change'));
            return;
        }
        const state = await resp.json();
        if (!state || Object.keys(state).length === 0) {
            _stateRestored = true;
            document.getElementById('benchSourceSelect')?.dispatchEvent(new Event('change'));
            return;
        }

        // Store state globally so list-rendering functions can apply selections
        _pendingRestore = state;

        // 1. Source mode + settings (set BEFORE dispatching change so lists load)
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

        // Dispatch source mode change (this triggers async loading of graphs/petri/pnh lists)
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

        // 3. DSPN settings — restore individual modal fields
        // Checkboxes
        if (state.dspnCheckboxes) {
            Object.entries(state.dspnCheckboxes).forEach(([id, checked]) => {
                const el = document.getElementById(id);
                if (el) el.checked = checked;
            });
        }
        // Selects
        if (state.dspnSelects) {
            Object.entries(state.dspnSelects).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            });
        }
        // Text/number inputs
        if (state.dspnInputs) {
            Object.entries(state.dspnInputs).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            });
        }
        // Update the dspnArgsInput hidden field + preview from restored modal values
        const dspnArgsEl = document.getElementById('dspnArgsInput');
        if (dspnArgsEl) {
            // If individual fields were restored, rebuild args from them
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
        if (state.resultsData) benchmarkResultsData = state.resultsData;
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

        // 5b. Restore column checkboxes and raw data for interactive toggling
        if (state.lastPayload) {
            lastBenchmarkPayload = state.lastPayload;
            initDynamicColumnCheckboxes(state.lastPayload);

            // Apply saved checkbox states
            if (state.columnStates) {
                Object.entries(state.columnStates).forEach(([id, checked]) => {
                    const cb = document.getElementById(id);
                    if (cb) cb.checked = checked;
                });
            }
        }
        if (state.rawChunks) {
            rawBenchmarkChunks = state.rawChunks;
            // Rebuild table with correct column visibility
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

                // Recreate the wrapper + canvas like initChart does
                const canvasWrapper = document.createElement('div');
                canvasWrapper.className = 'chart-wrapper';
                canvasWrapper.style.cssText = 'position: relative; flex: 1; min-height: 400px; width: 100%; margin-bottom: 20px;';

                const canvas = document.createElement('canvas');
                canvas.id = `perfChart_${key}`;
                canvasWrapper.appendChild(canvas);
                container.appendChild(canvasWrapper);

                const ChartLib = window.Chart || Chart;
                if (perfCharts[key]) perfCharts[key].destroy();

                perfCharts[key] = new ChartLib(canvas.getContext('2d'), {
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

                // Re-attach tick callback (functions can't be serialized to JSON)
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

function attachStateListeners() {
    // Listen to changes on all benchmark settings inputs
    const ids = [
        'benchSourceSelect', 'benchIterations', 'benchGraphCount', 'benchTimeout',
        'benchLogScale', 'benchStartN', 'benchEndN', 'benchStepN', 'benchDensity',
        'benchPetriGraphType', 'benchAtlasN'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', scheduleSaveState);
    });

    // Mutation observer on algo/regex/graph lists to detect checkbox changes
    const observeTargets = ['algoListContainer', 'regexListContainer', 'benchSavedList', 'benchPetriList', 'benchPnhFileList'];
    observeTargets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', () => setTimeout(scheduleSaveState, 100));
        }
    });

    // Aggregation changes
    const aggContainer = document.getElementById('aggregationContainer');
    if (aggContainer) aggContainer.addEventListener('change', scheduleSaveState);

    // DSPN modal: save after settings are applied
    const dspnModal = document.getElementById('dspnModal');
    if (dspnModal) {
        dspnModal.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', scheduleSaveState);
        });
    }
    const btnSaveDspn = document.getElementById('btnSaveDspnConfig');
    if (btnSaveDspn) btnSaveDspn.addEventListener('click', () => setTimeout(scheduleSaveState, 200));

    // CMD modal: save after script is saved
    const btnSaveCmd = document.getElementById('btnSaveCmd');
    if (btnSaveCmd) btnSaveCmd.addEventListener('click', () => setTimeout(scheduleSaveState, 500));
}

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

    // --- CMD MODAL INIT ---
    const cmdModal = document.getElementById('cmdModal');
    const closeCmdModal = document.getElementById('closeCmdModal');
    if (cmdModal && closeCmdModal) {
        closeCmdModal.onclick = () => cmdModal.style.display = 'none';
        window.addEventListener('click', (e) => { if (e.target == cmdModal) cmdModal.style.display = 'none'; });
    }

    const btnSaveCmd = document.getElementById('btnSaveCmd');
    if (btnSaveCmd) {
        btnSaveCmd.onclick = async () => {
            const id = document.getElementById('modalCmdId').value;
            const name = document.getElementById('modalCmdName').value;
            const path = document.getElementById('modalCmdPath').value;
            const args = document.getElementById('modalCmdArgs').value;

            if (!name || !path) { alert("Name and Path are required."); return; }

            try {
                const resp = await fetch('/api/algorithms/cmd', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({ id, name, cmd_path: path, cmd_args: args })
                });
                if (resp.ok) {
                    cmdModal.style.display = 'none';
                    renderAlgoList();
                } else {
                    const err = await resp.json();
                    alert("Error: " + (err.error || "Failed to save"));
                }
            } catch (err) { alert(err); }
        };
    }

    const btnExportCmd = document.getElementById('btnExportCmd');
    if (btnExportCmd) {
        btnExportCmd.onclick = () => {
            const name = document.getElementById('modalCmdName').value;
            const path = document.getElementById('modalCmdPath').value;
            const args = document.getElementById('modalCmdArgs').value;
            const data = { type: 'kitapena_cmd_script', version: '1.0', name, cmd_path: path, cmd_args: args };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name.replace(/\s+/g, '_')}_script.json`;
            a.click();
            URL.revokeObjectURL(url);
        };
    }

    // --- DSPN MODAL INIT ---
    const dspnModal = document.getElementById('dspnModal');
    const closeDspnModal = document.getElementById('closeDspnModal');
    if (dspnModal && closeDspnModal) {
        closeDspnModal.onclick = () => dspnModal.style.display = 'none';
        window.addEventListener('click', (e) => { if (e.target == dspnModal) dspnModal.style.display = 'none'; });

        // Tab Switching
        const cats = dspnModal.querySelectorAll('.dspn-cat');
        cats.forEach(cat => {
            cat.onclick = () => {
                cats.forEach(c => c.classList.remove('active'));
                cat.classList.add('active');
                const targetId = cat.dataset.target;
                dspnModal.querySelectorAll('.dspn-section').forEach(s => s.style.display = 'none');
                document.getElementById(targetId).style.display = 'block';
            };
        });

        // Live Preview Binding
        const dspnInputs = dspnModal.querySelectorAll('input, select');
        dspnInputs.forEach(input => {
            input.addEventListener('input', updateDspnPreview);
            input.addEventListener('change', updateDspnPreview);
        });

        document.getElementById('btnSaveDspnConfig').onclick = () => {
            const args = buildDspnArgs();
            const input = document.getElementById('dspnArgsInput');
            if (input) input.value = args;
            dspnModal.style.display = 'none';
        };
    }

    // --- REGEX MODAL INIT ---
    const regexModal = document.getElementById('regexModal');
    const closeRegexModal = document.getElementById('closeRegexModal');
    if (regexModal && closeRegexModal) {
        closeRegexModal.onclick = () => regexModal.style.display = 'none';
        window.addEventListener('click', (e) => { if (e.target == regexModal) regexModal.style.display = 'none'; });
    }

    // Live update when Stage 0 (Input) changes
    const modalRegexTestInput = document.getElementById('modalRegexTestInput');
    if (modalRegexTestInput) {
        modalRegexTestInput.addEventListener('input', () => {
            const val = modalRegexTestInput.value;
            const res0 = document.getElementById('stage0Result');
            if (res0) res0.innerText = val;
            window.updateRegexPipeline();
        });
    }

    // Selection listener for Stage 0
    const stage0Result = document.getElementById('stage0Result');
    if (stage0Result) {
        stage0Result.addEventListener('mouseup', () => handleStageSelection(stage0Result, 0));
    }

    function handleStageSelection(el, stageIdx) {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        // Remove old tooltip if it exists
        const oldTooltip = document.getElementById('regexStageAssistantTooltip');
        if (oldTooltip) oldTooltip.remove();

        if (!text || selection.rangeCount === 0) return;

        // Ensure selection is inside the correct result div
        if (!el.contains(selection.anchorNode)) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const tooltip = document.createElement('div');
        tooltip.id = 'regexStageAssistantTooltip';
        tooltip.style.position = 'fixed';
        tooltip.style.top = `${rect.top - 30}px`;
        tooltip.style.left = `${rect.left + (rect.width / 2)}px`;
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.background = '#b180ff';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '4px 8px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '11px';
        tooltip.style.cursor = 'pointer';
        tooltip.style.zIndex = '999999';
        tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';
        tooltip.innerText = 'Extract this';

        tooltip.onmousedown = (e) => {
            e.preventDefault();
            // Auto-generate regex for the NEXT stage
            let generatedRegex = "";
            if (!isNaN(text) && text.length > 0) {
                generatedRegex = `.*?([0-9.]+)`; // Generic number extractor
            } else {
                const escaped = text.replace(/[.*/+?^${}()|[\]\\]/g, '\\$&');
                generatedRegex = `.*?(${escaped})`;
            }

            window.addRegexStage(generatedRegex);
            window.updateRegexPipeline();

            tooltip.remove();
            selection.removeAllRanges();
        };

        document.body.appendChild(tooltip);

        // Auto-hide when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('mousedown', function hideTooltip(e) {
                if (e.target !== tooltip) {
                    tooltip.remove();
                    document.removeEventListener('mousedown', hideTooltip);
                }
            });
        }, 10);
    }

    window.addRegexStage = (val = '') => {
        const container = document.getElementById('regexStagesContainer');
        if (!container) return;

        const stageIdx = container.querySelectorAll('.regex-stage-item').length + 1;
        const stageDiv = document.createElement('div');
        stageDiv.className = 'regex-stage-item';
        stageDiv.dataset.index = stageIdx;
        stageDiv.style.background = 'rgba(255,255,255,0.02)';
        stageDiv.style.padding = '10px';
        stageDiv.style.borderRadius = '4px';
        stageDiv.style.border = '1px solid #333';

        stageDiv.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 10px; color: #b180ff; font-weight: bold; min-width: 50px;">STAGE ${stageIdx}</span>
                <input type="text" class="regex-stage-pattern" value="${val}" placeholder="Regex pattern..." 
                    style="flex: 1; font-family: monospace; font-size: 13px; padding: 6px 10px; background: #000; border: 1px solid #444; color: #fff;">
                <button type="button" class="btn-xs" onclick="this.closest('.regex-stage-item').remove(); window.updateRegexPipeline();" 
                    style="background: #442222; color: #f66; border: 1px solid #633;">✕</button>
            </div>
            <div style="font-size: 10px; color: #666; margin-bottom: 4px; text-transform: uppercase;">Stage ${stageIdx} Result:</div>
            <div class="stage-result-text" 
                 style="background: #000; padding: 6px; border: 1px solid #222; font-family: monospace; font-size: 11px; color: #23d18b; min-height: 18px; overflow: auto; white-space: pre-wrap;"></div>
        `;

        const input = stageDiv.querySelector('.regex-stage-pattern');
        input.addEventListener('input', window.updateRegexPipeline);

        const resultEl = stageDiv.querySelector('.stage-result-text');
        resultEl.addEventListener('mouseup', () => handleStageSelection(resultEl, stageIdx));

        container.appendChild(stageDiv);
    };

    window.updateRegexPipeline = () => {
        const testInput = document.getElementById('modalRegexTestInput').value;
        const res0 = document.getElementById('stage0Result');
        if (res0) res0.innerText = testInput;

        let lastResult = testInput;
        const stages = document.querySelectorAll('.regex-stage-item');

        stages.forEach((stage, idx) => {
            const pattern = stage.querySelector('.regex-stage-pattern').value;
            const resEl = stage.querySelector('.stage-result-text');

            if (!pattern || !lastResult) {
                resEl.innerText = "";
                resEl.style.color = '#666';
                lastResult = "";
                return;
            }

            try {
                const re = new RegExp(pattern);
                const match = lastResult.match(re);
                if (match) {
                    const extracted = match[1] !== undefined ? match[1] : match[0];
                    resEl.innerText = extracted;
                    resEl.style.color = '#23d18b';
                    lastResult = extracted;
                } else {
                    resEl.innerText = "NO MATCH";
                    resEl.style.color = '#f14c4c';
                    lastResult = "";
                }
            } catch (e) {
                resEl.innerText = "ERROR: " + e.message;
                resEl.style.color = '#f14c4c';
                lastResult = "";
            }
        });
    };

    const btnManageRegex = document.getElementById('btnManageRegex');
    if (btnManageRegex) {
        btnManageRegex.onclick = () => {
            document.getElementById('modalRegexId').value = '';
            document.getElementById('modalRegexName').value = '';
            document.getElementById('modalRegexTestInput').value = '';
            const stage0Res = document.getElementById('stage0Result');
            if (stage0Res) stage0Res.innerText = '';
            document.getElementById('regexStagesContainer').innerHTML = '';
            window.addRegexStage();
            regexModal.style.display = 'flex';
        };
    }

    const btnSaveRegex = document.getElementById('btnSaveRegex');
    if (btnSaveRegex) {
        btnSaveRegex.onclick = async () => {
            const id = document.getElementById('modalRegexId').value;
            const name = document.getElementById('modalRegexName').value;
            const testCase = document.getElementById('modalRegexTestInput').value;

            const stageInputs = document.querySelectorAll('.regex-stage-pattern');
            const patterns = Array.from(stageInputs).map(i => i.value).filter(Boolean);

            if (!name || patterns.length === 0) { alert("Name and at least one Pattern are required."); return; }

            const pattern = patterns.join('\n'); // Store joined by newline

            try {
                const resp = await fetch('/api/algorithms/regex', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({ id, name, pattern, stage0: testCase })
                });
                if (resp.ok) {
                    regexModal.style.display = 'none';
                    renderRegexList();
                } else {
                    const err = await resp.json();
                    alert("Error: " + (err.error || "Failed to save regex"));
                }
            } catch (err) { alert(err); }
        };
    }

    const btnRegexTest = document.getElementById('btnRegexTest');
    if (btnRegexTest) {
        btnRegexTest.onclick = () => {
            const stageInputs = document.querySelectorAll('.regex-stage-pattern');
            const patterns = Array.from(stageInputs).map(i => i.value).filter(Boolean);
            let currentText = document.getElementById('modalRegexTestInput').value;

            const statusEl = document.getElementById('regexTestStatus');
            const resultContainer = document.getElementById('regexTestResultContainer');
            const stepsEl = document.getElementById('regexTestSteps');

            if (patterns.length === 0 || !currentText) {
                statusEl.innerHTML = `<span style="color: #f66;">Provide patterns and test case.</span>`;
                return;
            }

            resultContainer.style.display = 'block';
            stepsEl.innerHTML = '';
            statusEl.innerHTML = '';

            try {
                let success = true;
                let lastExtracted = currentText;

                for (let i = 0; i < patterns.length; i++) {
                    const re = new RegExp(patterns[i]);
                    const match = lastExtracted.match(re);
                    const stepDiv = document.createElement('div');
                    stepDiv.style.borderLeft = '2px solid #333';
                    stepDiv.style.paddingLeft = '8px';
                    stepDiv.style.marginBottom = '5px';

                    if (match) {
                        const extracted = match[1] !== undefined ? match[1] : match[0];
                        stepDiv.innerHTML = `
                            <div style="color: #888; margin-bottom: 2px;">Stage ${i + 1}: <code style="color: #b180ff;">${patterns[i]}</code></div>
                            <div style="color: #23d18b; font-family: monospace; word-break: break-all;">→ "${extracted}"</div>
                        `;
                        lastExtracted = extracted;
                    } else {
                        success = false;
                        stepDiv.innerHTML = `
                            <div style="color: #888; margin-bottom: 2px;">Stage ${i + 1}: <code style="color: #b180ff;">${patterns[i]}</code></div>
                            <div style="color: #f14c4c;">FAILED: No match. Pipeline stopped.</div>
                        `;
                        stepsEl.appendChild(stepDiv);
                        break;
                    }
                    stepsEl.appendChild(stepDiv);
                }

                if (success) {
                    statusEl.innerHTML = `<span style="color: #23d18b;">Pipeline Success!</span>`;
                } else {
                    statusEl.innerHTML = `<span style="color: #f66;">Pipeline Failed.</span>`;
                }
            } catch (e) {
                statusEl.innerHTML = `<span style="color: #f14c4c;">Regex Error: ${e.message}</span>`;
            }
        };
    }

    // --- REGEX ASSISTANT ---
    // Listen for text selection in the console to suggest a regex
    const handleConsoleSelection = () => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        // Remove old tooltip if it exists
        const oldTooltip = document.getElementById('regexAssistantTooltip');
        if (oldTooltip) oldTooltip.remove();

        if (text && text.length > 0 && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            // Ensure selection is inside a console
            if (range.commonAncestorContainer.closest('.bench-console')) {
                const rect = range.getBoundingClientRect();
                const tooltip = document.createElement('div');
                tooltip.id = 'regexAssistantTooltip';
                tooltip.style.position = 'fixed';
                tooltip.style.top = `${rect.top - 30}px`;
                tooltip.style.left = `${rect.left + (rect.width / 2)}px`;
                tooltip.style.transform = 'translateX(-50%)';
                tooltip.style.background = '#b180ff';
                tooltip.style.color = '#fff';
                tooltip.style.padding = '4px 8px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.fontSize = '11px';
                tooltip.style.cursor = 'pointer';
                tooltip.style.zIndex = '999999';
                tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';
                tooltip.innerText = 'Create Regex';

                tooltip.onmousedown = (e) => {
                    e.preventDefault(); // Prevent selection clearing
                    document.getElementById('modalRegexId').value = '';
                    document.getElementById('modalRegexName').value = `Auto Regex (${text.substring(0, 10)})`;

                    let generatedRegex = "";
                    if (!isNaN(text)) {
                        generatedRegex = `.*?([0-9.]+)`; // Generic number matching
                    } else {
                        const escaped = text.replace(/[.*/+?^${}()|[\]\\]/g, '\\$&');
                        generatedRegex = `.*?(${escaped})`;
                    }

                    document.getElementById('modalRegexTestInput').value = range.commonAncestorContainer.textContent;
                    document.getElementById('regexStagesContainer').innerHTML = '';
                    window.addRegexStage(generatedRegex);
                    window.updateRegexPipeline();

                    regexModal.style.display = 'flex';
                    tooltip.remove();
                    selection.removeAllRanges();
                };

                document.body.appendChild(tooltip);

                // Auto-hide when clicking elsewhere
                setTimeout(() => {
                    document.addEventListener('mousedown', function hideTooltip(e) {
                        if (e.target !== tooltip) {
                            tooltip.remove();
                            document.removeEventListener('mousedown', hideTooltip);
                        }
                    });
                }, 10);
            }
        }
    };

    document.getElementById('benchConsole')?.addEventListener('mouseup', handleConsoleSelection);
    document.getElementById('largeBenchConsole')?.addEventListener('mouseup', handleConsoleSelection);

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
        // Initial trigger is done inside restoreBenchmarkState (or as fallback)
    }

    // Search Filtering
    setupSearch('searchBenchGraphs', 'benchSavedList');
    setupSearch('searchBenchPetri', 'benchPetriList');
    setupSearch('searchBenchPnh', 'benchPnhFileList');
    setupSearch('searchAlgos', 'algoListContainer');
    setupSearch('searchRegexes', 'regexListContainer');

    // Restore saved benchmark state, THEN render lists (which apply pending selections)
    restoreBenchmarkState().then(() => {
        renderAlgoList();
        renderRegexList();
        attachStateListeners();
        initTableSettingsListeners();
    });
    window.addEventListener('algosUpdated', renderAlgoList);

    initPetriFilterModal();
}

function updateDspnPreview() {
    const preview = document.getElementById('dspnCmdPreviewText');
    if (preview) preview.textContent = buildDspnArgs();
}

function buildDspnArgs() {
    let args = [];

    // Verbosity
    const v = document.getElementById('dspn_opt_verbose').value;
    if (v) args.push(v);

    // PT
    if (document.getElementById('dspn_opt_pt').checked) args.push('-pt');

    // Analysis State
    if (document.getElementById('dspn_opt_trg').checked) args.push('-trg');
    if (document.getElementById('dspn_opt_rg').checked) args.push('-rg');
    if (document.getElementById('dspn_opt_novpaths').checked) args.push('-no-vpaths');

    // Invariants
    if (document.getElementById('dspn_opt_pinv').checked) args.push('-pinv');
    if (document.getElementById('dspn_opt_tinv').checked) args.push('-tinv');
    if (document.getElementById('dspn_opt_traps').checked) args.push('-traps');

    // Prints
    if (document.getElementById('dspn_opt_dot').checked) args.push('-dot');
    if (document.getElementById('dspn_opt_allmeas').checked) args.push('-all-measures');

    // Solution
    if (document.getElementById('dspn_opt_s').checked) args.push('-s');
    const tVal = document.getElementById('dspn_val_t').value;
    if (tVal) args.push('-t ' + tVal);

    // Method
    const m = document.getElementById('dspn_opt_method').value;
    if (m) args.push(m);

    // Solver
    const s = document.getElementById('dspn_opt_solver').value;
    if (s) args.push(s);

    // Prec
    const p = document.getElementById('dspn_opt_prec').value;
    if (p) args.push(p);

    // Numerical
    const eps = document.getElementById('dspn_val_epsilon').value;
    if (eps) args.push('-epsilon ' + eps);
    const iters = document.getElementById('dspn_val_maxiters').value;
    if (iters) args.push('-max-iters ' + iters);
    const timeout = document.getElementById('dspn_val_timeout').value;
    if (timeout) args.push('-timeout ' + timeout);

    return args.join(' ');
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
                if (!item.classList.contains('algo-item') && !item.classList.contains('regex-item')) item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
}

let regexCache = [];

async function renderRegexList() {
    const container = document.getElementById('regexListContainer');
    if (!container) return;
    container.innerHTML = '<div style="padding: 5px; color: #888;">Loading...</div>';

    try {
        const resp = await fetch('/api/algorithms/regex');
        let regexes = [];
        if (resp.ok) {
            regexes = await resp.json();
            regexCache = regexes;
        }

        container.innerHTML = '';

        if (regexes.length === 0) {
            container.innerHTML = '<div style="padding: 5px; color: #888; font-style: italic; font-size: 11px;">No regex settings created.</div>';
            return;
        }

        regexes.forEach(r => {
            const rId = `regex_${r.id}`;
            const rDiv = document.createElement('div');
            rDiv.className = 'saved-item algo-item regex-item';
            rDiv.dataset.id = r.id;
            rDiv.innerHTML = `
                <input type="checkbox" value="${r.id}" style="margin-right: 10px; cursor: pointer;">
                <div style="display: flex; flex-direction: column;">
                    <span class="name" style="color: #b180ff; font-weight: bold; font-size: 13px;">${r.name}</span>
                    <span style="font-size: 10px; color: #888; font-family: monospace;">${r.pattern}</span>
                </div>
                <div style="margin-left: auto; display: flex; align-items: center; gap: 10px;">
                    <span class="actions" style="display: inline-flex; gap: 8px; align-items: flex-start;">
                        <button title="Duplicate" class="btn-duplicate-regex" style="font-size: 11px; color: #ccc; background: none; border: none; cursor: pointer;">📋</button>
                        <button title="Export" class="btn-export-regex" style="font-size: 11px; color: #ccc; background: none; border: none; cursor: pointer;">📥</button>
                        <button title="Edit" class="btn-edit-regex" style="font-size: 11px; color: #ccc; background: none; border: none; cursor: pointer;">✏️</button>
                        <button title="Delete" class="btn-delete-regex" style="font-size: 11px; color: #f66; background: none; border: none; cursor: pointer;">🗑️</button>
                    </span>
                </div>
            `;

            rDiv.querySelector('.btn-duplicate-regex').addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('modalRegexId').value = '';
                document.getElementById('modalRegexName').value = r.name + " (Copy)";
                document.getElementById('modalRegexTestInput').value = r.stage0 || '';
                const container = document.getElementById('regexStagesContainer');
                container.innerHTML = '';
                if (r.pattern) {
                    const stages = r.pattern.split('\n');
                    stages.forEach(s => window.addRegexStage(s));
                }
                window.updateRegexPipeline();
                document.getElementById('regexModal').style.display = 'flex';
            });

            rDiv.querySelector('.btn-export-regex').addEventListener('click', (e) => {
                e.stopPropagation();
                window.exportRegexes([r]);
            });

            rDiv.querySelector('.btn-edit-regex').addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('modalRegexId').value = r.id;
                document.getElementById('modalRegexName').value = r.name;
                document.getElementById('modalRegexTestInput').value = r.stage0 || '';

                // Populate stages
                const container = document.getElementById('regexStagesContainer');
                container.innerHTML = '';
                if (r.pattern) {
                    const stages = r.pattern.split('\n');
                    stages.forEach(s => window.addRegexStage(s));
                } else {
                    window.addRegexStage();
                }

                window.updateRegexPipeline();
                document.getElementById('regexModal').style.display = 'flex';
            });

            rDiv.querySelector('.btn-delete-regex').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm("Delete this Regex?")) return;
                try {
                    const resp = await fetch('/api/algorithms/regex/' + r.id, {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': getCsrfToken() }
                    });
                    if (resp.ok) renderRegexList();
                } catch (err) { }
            });

            rDiv.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const cb = rDiv.querySelector('input[type="checkbox"]');
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                }
                rDiv.classList.toggle('selected', cb.checked);
            });
            container.appendChild(rDiv);
        });
        applyPendingSelections('regexes');
    } catch (e) {
        console.error("Failed to load regexes", e);
        container.innerHTML = `<div style="color:red; padding:10px;">Error loading regexes</div>`;
    }
}

window.exportRegexes = function (regexArray) {
    if (!regexArray || regexArray.length === 0) {
        alert("No regexes provided for export.");
        return;
    }
    const exportData = regexArray.map(r => ({
        name: r.name,
        pattern: r.pattern,
        stage0: r.stage0
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regex_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.exportSelectedRegexes = function () {
    const selectedIds = Array.from(document.querySelectorAll('#regexListContainer .regex-item.selected'))
        .map(el => parseInt(el.dataset.id));

    if (selectedIds.length === 0) {
        alert("Select regexes to export first.");
        return;
    }

    const toExport = regexCache.filter(r => selectedIds.includes(r.id));
    window.exportRegexes(toExport);
};

window.importRegexes = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const regexArray = Array.isArray(data) ? data : [data];

            for (const r of regexArray) {
                if (!r.name || !r.pattern) continue;
                await fetch('/api/algorithms/regex', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({ name: r.name, pattern: r.pattern, stage0: r.stage0 || '' })
                });
            }
            renderRegexList();
            alert("Regexes imported successfully!");
        } catch (err) {
            alert("Failed to import regexes: " + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset for consecutive imports
};

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

        const respCmd = await fetch('/api/algorithms/cmd');
        let customCmds = [];
        if (respCmd.ok) {
            customCmds = await respCmd.json();
        }

        container.innerHTML = '';

        // Helper: Create Header
        const mkHeader = (title) => {
            const h = document.createElement('div');
            h.style.cssText = 'padding: 8px 10px; font-size: 10px; font-weight: bold; color: #888; text-transform: uppercase; background: rgba(0,0,0,0.1); border-bottom: 1px solid #333; margin-bottom: 5px; position: sticky; top: 0; z-index: 10;';
            h.innerText = title;
            return h;
        };

        // --- SECTION: SYSTEM ---
        container.appendChild(mkHeader('System Engines (Other tools)'));

        // --- Hardcoded DSPN-Tool Item ---
        const dspnDiv = document.createElement('div');
        dspnDiv.className = 'saved-item algo-item';
        dspnDiv.dataset.id = 'DSPN-Tool';
        dspnDiv.innerHTML = `
            <input type="checkbox" value="DSPN-Tool" style="margin-right: 10px; cursor: pointer;">
            <span class="name" style="color: #ff9f40; font-weight: bold;">[GreatSPN] DSPN-Tool</span>
            <span class="actions" style="margin-left: auto; display: inline-flex; gap: 8px; align-items: center; position: relative;">
                <button title="Settings" class="btn-settings-dspn" style="font-size: 14px; color: #ccc; background: none; border: none; cursor: pointer;">⚙️</button>
                <input type="hidden" id="dspnArgsInput" value="-nv">
            </span>
        `;
        // Toggle settings panel
        const dspnSettingsBtn = dspnDiv.querySelector('.btn-settings-dspn');
        dspnSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('dspnModal').style.display = 'flex';
            updateDspnPreview();
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

        // --- SECTION: USER ---
        container.appendChild(mkHeader('User Algorithms & Scripts'));

        // --- Generic CMD Buttons (Add / Import) ---
        const cmdActionsDiv = document.createElement('div');
        cmdActionsDiv.style.display = 'flex';
        cmdActionsDiv.style.gap = '5px';
        cmdActionsDiv.style.marginBottom = '5px';
        cmdActionsDiv.innerHTML = `
            <button id="btnNewCmd" style="flex:1; background: none; border: 1px dashed #555; color: #b180ff; border-radius: 4px; padding: 4px; cursor: pointer; font-size: 11px;">+ New CLI Script</button>
            <button id="btnImportCmd" style="background: none; border: 1px dashed #555; color: #acf; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px;" title="Import JSON">Import JSON</button>
        `;

        cmdActionsDiv.querySelector('#btnNewCmd').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('modalCmdId').value = '';
            document.getElementById('modalCmdName').value = '';
            document.getElementById('modalCmdPath').value = '';
            document.getElementById('modalCmdArgs').value = '{pnh}';
            document.getElementById('btnExportCmd').style.display = 'none';
            document.getElementById('cmdModal').style.display = 'flex';
        });

        cmdActionsDiv.querySelector('#btnImportCmd').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = async (re) => {
                    try {
                        const data = JSON.parse(re.target.result);
                        if (data.type !== 'kitapena_cmd_script') throw new Error("Invalid format.");
                        document.getElementById('modalCmdId').value = '';
                        document.getElementById('modalCmdName').value = data.name || 'Imported Script';
                        document.getElementById('modalCmdPath').value = data.cmd_path || '';
                        document.getElementById('modalCmdArgs').value = data.cmd_args || '';
                        document.getElementById('btnExportCmd').style.display = 'none';
                        document.getElementById('cmdModal').style.display = 'flex';
                    } catch (err) { alert("Import failed: " + err.message); }
                };
                reader.readAsText(file);
            };
            input.click();
        });
        container.appendChild(cmdActionsDiv);

        // --- Render Fetched Generic CMDs ---
        customCmds.forEach(cmd => {
            const cmdId = `cmd_${cmd.id}`;
            const cmdDiv = document.createElement('div');
            cmdDiv.className = 'saved-item algo-item';
            cmdDiv.dataset.id = cmdId;
            cmdDiv.innerHTML = `
                <input type="checkbox" value="${cmdId}" style="margin-right: 10px; cursor: pointer;">
                <span class="name" style="color: #b180ff; font-weight: bold;">[CMD] ${cmd.name}</span>
                <span class="actions" style="margin-left: auto; display: inline-flex; gap: 8px; align-items: center;">
                    <button title="Settings" class="btn-edit-cmd" style="font-size: 14px; color: #ccc; background: none; border: none; cursor: pointer;">⚙️</button>
                    <button title="Delete" class="btn-delete-cmd" style="font-size: 14px; color: #f66; background: none; border: none; cursor: pointer;">🗑️</button>
                </span>
                <input type="hidden" class="cmd-path-input" value="${cmd.cmd_path}">
                <input type="hidden" class="cmd-args-input" value="${cmd.cmd_args}">
            `;

            cmdDiv.querySelector('.btn-edit-cmd').addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('modalCmdId').value = cmd.id;
                document.getElementById('modalCmdName').value = cmd.name;
                document.getElementById('modalCmdPath').value = cmd.cmd_path;
                document.getElementById('modalCmdArgs').value = cmd.cmd_args;
                document.getElementById('btnExportCmd').style.display = 'inline-block';
                document.getElementById('cmdModal').style.display = 'flex';
            });

            cmdDiv.querySelector('.btn-delete-cmd').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm("Delete this CLI Script?")) return;
                try {
                    const resp = await fetch('/api/algorithms/cmd/' + cmd.id, {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': getCsrfToken() }
                    });
                    if (resp.ok) renderAlgoList();
                } catch (err) { }
            });

            cmdDiv.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const cb = cmdDiv.querySelector('input[type="checkbox"]');
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                }
                cmdDiv.classList.toggle('selected', cb.checked);
            });
            container.appendChild(cmdDiv);
        });
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

        applyPendingSelections('algos');
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

        applyPendingSelections('graphs');
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
        // Build query params from filter panel
        const params = new URLSearchParams({ per_page: '9999' });

        const minP = document.getElementById('benchPetriMinP')?.value;
        const minT = document.getElementById('benchPetriMinT')?.value;
        const minA = document.getElementById('benchPetriMinA')?.value;
        const minK = document.getElementById('benchPetriMinK')?.value;
        const modelClass = document.getElementById('benchPetriModelClass')?.value;
        const sort = document.getElementById('benchPetriSort')?.value;

        if (minP) params.set('min_p', minP);
        if (minT) params.set('min_t', minT);
        if (minA) params.set('min_a', minA);
        if (minK) params.set('min_k', minK);
        if (modelClass) params.set('class', modelClass);
        if (sort) params.set('sort', sort);

        const resp = await fetch(`/api/petri/saved?${params.toString()}`);
        const data = await resp.json();
        const nets = data.nets || data;

        list.innerHTML = '';
        if (!nets || nets.length === 0) {
            list.innerHTML = '<div style="padding: 5px; color: #888;">No Petri nets match filters.</div>';
            return;
        }

        nets.forEach(n => {
            const div = document.createElement('div');
            div.className = 'saved-item';

            // Build stats string
            const statStrs = [];
            if (n.stats) {
                if (n.stats.places !== undefined) statStrs.push(`P:${n.stats.places}`);
                if (n.stats.transitions !== undefined) statStrs.push(`T:${n.stats.transitions}`);
                if (n.stats.arcs !== undefined) statStrs.push(`A:${n.stats.arcs}`);
                if (n.stats.class) statStrs.push(`Class:${n.stats.class}`);
            }
            const statsStr = statStrs.length > 0 ? `<span style="color:#666; font-size:10px; margin-left:6px;">[ ${statStrs.join(' | ')} ]</span>` : '';

            div.innerHTML = `
                <input type="checkbox" name="benchPetriId" value="${n.id}" style="margin-right: 10px; cursor: pointer;">
                <span class="name">${n.name}${statsStr}</span>
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
        applyPendingSelections('petri');
    } catch (e) {
        list.innerText = "Error loading Petri nets.";
        console.error(e);
    }
}

// Petri filter modal open/close/apply/reset
function initPetriFilterModal() {
    const modal = document.getElementById('petriFilterModal');
    const btnOpen = document.getElementById('btnPetriFilters');
    const btnClose = document.getElementById('closePetriFilterModal');
    const btnApply = document.getElementById('btnApplyPetriFilters');
    const btnReset = document.getElementById('btnResetPetriFilters');

    if (btnOpen && modal) {
        btnOpen.addEventListener('click', () => { modal.style.display = 'flex'; });
    }
    if (btnClose && modal) {
        btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            loadBenchmarkPetriNets();
            if (modal) modal.style.display = 'none';
        });
    }

    const clearFiltersFn = () => {
        ['benchPetriMinP', 'benchPetriMinT', 'benchPetriMinA', 'benchPetriMinK', 'benchPetriModelClass'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const sortEl = document.getElementById('benchPetriSort');
        if (sortEl) sortEl.value = 'date_desc';
        loadBenchmarkPetriNets();
    };

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            clearFiltersFn();
            if (modal) modal.style.display = 'none';
        });
    }

    const btnClearPetriFilters = document.getElementById('btnClearPetriFilters');
    if (btnClearPetriFilters) {
        btnClearPetriFilters.addEventListener('click', clearFiltersFn);
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
        applyPendingSelections('pnh');
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
    container.insertAdjacentHTML('beforeend', '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;"><h3 style="margin:0;color:var(--accent);font-size:16px;">Charts</h3></div>');

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

    benchmarkResultsData = [];
    rawBenchmarkChunks = [];
    lastBenchmarkPayload = null;

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

    // Column visibility settings
    const showContext = document.getElementById('colShowContext')?.checked !== false; // default true
    const showAlgorithm = document.getElementById('colShowAlgorithm')?.checked !== false;

    // Extract selected Regexes for data extraction
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
                    showInTable: true // Internal backend flag, UI uses dynamic checkboxes now
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
                    customCmds: customCmds,
                    regexes: selectedRegexes,
                    baseTimeout: baseTimeout,
                    showContext: showContext,
                    showAlgorithm: showAlgorithm,
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
                    customCmds: customCmds,
                    regexes: selectedRegexes,
                    baseTimeout: baseTimeout,
                    showContext: showContext,
                    showAlgorithm: showAlgorithm,
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
                    customCmds: customCmds,
                    regexes: selectedRegexes,
                    baseTimeout: baseTimeout,
                    showContext: showContext,
                    showAlgorithm: showAlgorithm,
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
                    customCmds: customCmds,
                    regexes: selectedRegexes,
                    baseTimeout: baseTimeout,
                    showContext: showContext,
                    showAlgorithm: showAlgorithm,
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
                    customCmds: customCmds,
                    regexes: selectedRegexes,
                    baseTimeout: baseTimeout,
                    showContext: showContext,
                    showAlgorithm: showAlgorithm,
                    displayName: graph.name
                };

                if (abortBenchmark) throw new Error("Benchmark stopped by user.");
                await executeBenchmarkStep(payload);
            }
        }

        statusDiv.textContent = "Done.";

        // Show table
        if (benchmarkResultsData.length > 0) {
            document.getElementById('benchmarkResultsTableContainer').style.display = 'block';
        }

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
        scheduleSaveState(); // Persist results
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

        let results;
        const responseText = await response.text();
        try {
            results = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse benchmark response:", responseText);
            throw new Error(`Server returned invalid JSON. Status: ${response.status}. Body starts with: ${responseText.substring(0, 100)}`);
        }

        if (results.error) throw new Error(results.error);

        // Display Logs if any logs present in *first* aggregation object
        // assuming standard results dictionary
        let logList = [];
        const firstAgg = payload.aggregations && payload.aggregations[0];
        if (firstAgg && results[firstAgg] && results[firstAgg].logs) {
            logList = results[firstAgg].logs;
        } else if (results.logs) {
            logList = results.logs; // fallback
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
        scheduleSaveState(); // Incremental save after each step
        return results;
    } catch (e) {
        throw e;
    }
}

function appendResultsToTable(resultChunk, payload) {
    rawBenchmarkChunks.push(resultChunk);
    lastBenchmarkPayload = payload;
    if (rawBenchmarkChunks.length === 1) initDynamicColumnCheckboxes(payload);
    refreshBenchmarkTable();

    // Ensure visibility
    const tableContainer = document.getElementById('benchmarkResultsTableContainer');
    if (tableContainer) tableContainer.style.display = 'block';
    const settingsPanel = document.getElementById('tableSettingsPanel');
    if (settingsPanel) settingsPanel.style.display = 'block';
}






// Export CSV handler
document.addEventListener('DOMContentLoaded', () => {
    const btnExport = document.getElementById('btnExportBenchmarkCsv');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (benchmarkResultsData.length === 0) {
                alert("No data to export.");
                return;
            }

            // Get headers from first object
            const headers = Object.keys(benchmarkResultsData[0]);

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += headers.join(",") + "\n";

            benchmarkResultsData.forEach(row => {
                const rowStr = headers.map(h => {
                    let cell = row[h] === undefined ? "" : row[h].toString();
                    // Escape quotes and wrap in quotes if contains comma
                    if (cell.includes(",") || cell.includes("\"")) {
                        cell = `"${cell.replace(/"/g, '""')}"`;
                    }
                    return cell;
                }).join(",");
                csvContent += rowStr + "\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `benchmark_results_${new Date().getTime()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    const btnExportLatex = document.getElementById('btnExportBenchmarkLatex');
    if (btnExportLatex) {
        btnExportLatex.addEventListener('click', () => {
            if (benchmarkResultsData.length === 0) {
                alert("No data to export.");
                return;
            }

            const headers = Object.keys(benchmarkResultsData[0]);

            function escapeLatex(str) {
                if (str === null || str === undefined) return "";
                let s = str.toString();
                return s.replace(/\\/g, '\\textbackslash ')
                    .replace(/&/g, '\\&')
                    .replace(/%/g, '\\%')
                    .replace(/\$/g, '\\$')
                    .replace(/#/g, '\\#')
                    .replace(/_/g, '\\_')
                    .replace(/{/g, '\\{')
                    .replace(/}/g, '\\}')
                    .replace(/~/g, '\\textasciitilde ')
                    .replace(/\^/g, '\\textasciicircum ');
            }

            let latex = "\\begin{table}[h]\n\\centering\n";
            latex += "\\begin{tabular}{" + "l".repeat(headers.length) + "}\n\\hline\n";

            // Headers
            latex += headers.map(h => "\\textbf{" + escapeLatex(h) + "}").join(" & ") + " \\\\ \\hline\n";

            // Rows
            benchmarkResultsData.forEach(row => {
                const rowStr = headers.map(h => escapeLatex(row[h])).join(" & ");
                latex += rowStr + " \\\\\n";
            });

            latex += "\\hline\n\\end{tabular}\n";
            latex += "\\caption{Benchmark Results}\n";
            latex += "\\end{table}";

            const blob = new Blob([latex], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `benchmark_results_${new Date().getTime()}.tex`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }

    // Regex Import
    const importRegexInput = document.getElementById('importRegexInput');
    if (importRegexInput) {
        importRegexInput.addEventListener('change', window.importRegexes);
    }
});

function initDynamicColumnCheckboxes(payload) {
    const container = document.getElementById('dynamicColsContainer');
    if (!container) return;

    // Capture current states if possible (to prevent flicker during multi-step runs)
    const currentStates = {};
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        currentStates[cb.id] = cb.checked;
    });

    container.innerHTML = '';

    const createCheckbox = (id, labelText, defaultChecked = true) => {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; gap: 6px; color: #ddd; cursor: pointer; white-space: nowrap;';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = id;
        cb.className = 'premium';
        cb.checked = (currentStates[id] !== undefined) ? currentStates[id] : defaultChecked;
        cb.style.cursor = 'pointer';
        cb.addEventListener('change', () => { refreshBenchmarkTable(); scheduleSaveState(); });

        label.appendChild(cb);
        label.appendChild(document.createTextNode(labelText));
        return label;
    };

    // 1. Label
    const title = document.createElement('div');
    title.style.cssText = 'color: #888; text-transform: uppercase; font-weight: bold; font-size: 10px; margin-right: 5px;';
    title.textContent = 'Show Columns:';
    container.appendChild(title);

    // 2. Core columns
    container.appendChild(createCheckbox('colShowContext', 'Context', true));
    container.appendChild(createCheckbox('colShowAlgorithm', 'Algorithm', true));

    // 3. Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'width: 1px; height: 16px; background: #444; margin: 0 5px; align-self: center;';
    container.appendChild(sep);

    // 4. Aggregations
    if (payload.aggregations) {
        payload.aggregations.forEach(agg => {
            const id = `colShowAgg_${agg.replace(/[^a-zA-Z0-9]/g, '_')}`;
            container.appendChild(createCheckbox(id, agg.toUpperCase(), true));
        });
    }

    // 5. Regexes
    if (payload.regexes && payload.regexes.length > 0) {
        const sep2 = document.createElement('div');
        sep2.style.cssText = 'width: 1px; height: 16px; background: #444; margin: 0 5px; align-self: center;';
        container.appendChild(sep2);

        payload.regexes.forEach(r => {
            const id = `colShowRegex_${r.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            container.appendChild(createCheckbox(id, r.name, true));
        });
    }
}

function initTableSettingsListeners() {
    // Logic moved to dynamic initialization
}

function refreshBenchmarkTable() {
    if (rawBenchmarkChunks.length === 0 || !lastBenchmarkPayload) return;

    const tbody = document.querySelector('#benchmarkResultsTable tbody');
    const thead = document.querySelector('#benchmarkResultsTable thead');
    const payload = lastBenchmarkPayload;

    if (!tbody || !thead) return;

    // Clear UI state
    tbody.innerHTML = '';
    thead.innerHTML = '';
    benchmarkResultsData = [];

    // Determine which columns are active based on checkboxes
    const showContext = document.getElementById('colShowContext')?.checked !== false;
    const showAlgorithm = document.getElementById('colShowAlgorithm')?.checked !== false;

    const activeAggs = payload.aggregations.filter(agg => {
        const id = `colShowAgg_${agg.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const cb = document.getElementById(id);
        return cb ? cb.checked : true;
    });

    const activeRegexes = (payload.regexes || []).filter(r => {
        const id = `colShowRegex_${r.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const cb = document.getElementById(id);
        return cb ? cb.checked : true;
    });

    // 1. Build Header
    const trHead = document.createElement('tr');
    const headerCells = [];
    if (showContext) headerCells.push('Context');
    if (showAlgorithm) headerCells.push('Algorithm');
    activeAggs.forEach(agg => headerCells.push(`${agg.toUpperCase()} (ms)`));
    activeRegexes.forEach(r => headerCells.push(r.name));

    trHead.innerHTML = headerCells.map(h => `<th>${h}</th>`).join('');
    thead.appendChild(trHead);

    // Attach Sorting
    Array.from(trHead.querySelectorAll('th')).forEach((th, index) => {
        th.addEventListener('click', () => {
            const rows = Array.from(tbody.querySelectorAll('tr'));
            let sortOrder = th.dataset.order === 'asc' ? -1 : 1;
            th.dataset.order = sortOrder === 1 ? 'asc' : 'desc';
            rows.sort((a, b) => {
                let valA = a.children[index]?.innerText || '';
                let valB = b.children[index]?.innerText || '';
                if (!isNaN(parseFloat(valA)) && !isNaN(parseFloat(valB))) return (parseFloat(valA) - parseFloat(valB)) * sortOrder;
                return valA.localeCompare(valB, undefined, { numeric: true }) * sortOrder;
            });
            tbody.innerHTML = '';
            rows.forEach(row => tbody.appendChild(row));

            // Reset all headers, then mark the active one
            trHead.querySelectorAll('th').forEach(t => delete t.dataset.sort);
            th.dataset.sort = sortOrder === 1 ? 'asc' : 'desc';
        });
    });

    // 2. Build rows from ALL chunks
    rawBenchmarkChunks.forEach(chunk => {
        const aggregationsToUse = payload.aggregations;
        const anyAgg = aggregationsToUse.find(a => chunk[a]);
        if (!anyAgg || !chunk[anyAgg]) return;

        const labels = chunk[anyAgg].labels || [];
        const extractedDataArr = chunk[anyAgg].extracted_data || [];
        const timeoutsArr = chunk[anyAgg].timeouts || [];

        // Pre-build dataset map
        const dataMap = {};
        aggregationsToUse.forEach(agg => {
            dataMap[agg] = {};
            if (chunk[agg] && chunk[agg].datasets) {
                chunk[agg].datasets.forEach(ds => dataMap[agg][ds.label] = ds.data);
            }
        });

        for (let i = 0; i < labels.length; i++) {
            const ctxLabel = labels[i];
            const extractions = extractedDataArr[i] || {};
            const timeouts = timeoutsArr[i] || {};

            payload.algorithms.forEach(algo => {
                const isTimeout = timeouts[algo] === true;
                const rowData = {};
                const cells = [];

                if (showContext) {
                    rowData['Context'] = ctxLabel;
                    cells.push(`<td>${ctxLabel}</td>`);
                }
                if (showAlgorithm) {
                    rowData['Algorithm'] = algo;
                    cells.push(`<td>${algo}</td>`);
                }

                activeAggs.forEach(agg => {
                    const val = dataMap[agg]?.[algo]?.[i] !== undefined ? dataMap[agg][algo][i] : '-';
                    rowData[`${agg.toUpperCase()} (ms)`] = val;
                    cells.push(`<td>${val}</td>`);
                });

                activeRegexes.forEach(r => {
                    const val = extractions[algo]?.[r.name] !== undefined ? extractions[algo][r.name] : '-';
                    rowData[r.name] = val;
                    cells.push(`<td>${val}</td>`);
                });

                const tr = document.createElement('tr');
                if (isTimeout) tr.style.background = 'rgba(255, 68, 68, 0.2)';
                tr.innerHTML = cells.join('');
                tbody.appendChild(tr);
                benchmarkResultsData.push(rowData);
            });
        }
    });
}
