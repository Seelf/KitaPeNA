/**
 * benchmark_init.js — Main initialization function for the benchmarking module.
 * Sets up all event listeners, modals, and triggers state restore.
 */

import { getCsrfToken, setupSearch, updateDspnPreview, buildDspnArgs, selectListItems } from './benchmark_helpers.js';
import { perfCharts } from './benchmark_shared.js';
import { restoreBenchmarkState, attachStateListeners, scheduleSaveState } from './benchmark_state.js';
import { renderAlgoList } from './benchmark_lists.js';
import { renderRegexList, exportRegexes, exportSelectedRegexes, importRegexes } from './benchmark_regex.js';
import { runBenchmark } from './benchmark_runner.js';
import { addAggregationSelector } from './benchmark_charts.js';
import { initTableSettingsListeners, initExportListeners } from './benchmark_export.js';
import { initPetriFilterModal } from './benchmark_lists.js';
import { isBenchmarking, abortBenchmark, setAbortBenchmark } from './benchmark_shared.js';

export function initBenchmarking() {
    const btnRun = document.getElementById('btnRunBenchmark');
    if (btnRun) {
        btnRun.addEventListener('click', () => {
            if (isBenchmarking) {
                setAbortBenchmark(true);
                btnRun.textContent = "Stopping...";
                btnRun.disabled = true;
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

    const modalRegexTestInput = document.getElementById('modalRegexTestInput');
    if (modalRegexTestInput) {
        modalRegexTestInput.addEventListener('input', () => {
            const val = modalRegexTestInput.value;
            const res0 = document.getElementById('stage0Result');
            if (res0) res0.innerText = val;
            window.updateRegexPipeline();
        });
    }

    const stage0Result = document.getElementById('stage0Result');
    if (stage0Result) {
        stage0Result.addEventListener('mouseup', () => handleStageSelection(stage0Result, 0));
    }

    function handleStageSelection(el, stageIdx) {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        const oldTooltip = document.getElementById('regexStageAssistantTooltip');
        if (oldTooltip) oldTooltip.remove();

        if (!text || selection.rangeCount === 0) return;
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
            let generatedRegex = "";
            if (!isNaN(text) && text.length > 0) {
                generatedRegex = `.*?([0-9.]+)`;
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

            const pattern = patterns.join('\n');

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
    const handleConsoleSelection = () => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        const oldTooltip = document.getElementById('regexAssistantTooltip');
        if (oldTooltip) oldTooltip.remove();

        if (text && text.length > 0 && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
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
                    e.preventDefault();
                    document.getElementById('modalRegexId').value = '';
                    document.getElementById('modalRegexName').value = `Auto Regex (${text.substring(0, 10)})`;

                    let generatedRegex = "";
                    if (!isNaN(text)) {
                        generatedRegex = `.*?([0-9.]+)`;
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
                // Lazy import to break circular dep
                import('./benchmark_lists.js').then(m => m.loadBenchmarkGraphs());
            } else if (e.target.value === 'petri') {
                if (configPetri) {
                    configPetri.style.display = 'block';
                    import('./benchmark_lists.js').then(m => m.loadBenchmarkPetriNets());
                }
            } else if (e.target.value === 'pnh') {
                if (configPnh) {
                    configPnh.style.display = 'block';
                    import('./benchmark_lists.js').then(m => m.loadBenchmarkPnhFiles());
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
    }

    // Search Filtering
    setupSearch('searchBenchGraphs', 'benchSavedList');
    setupSearch('searchBenchPetri', 'benchPetriList');
    setupSearch('searchBenchPnh', 'benchPnhFileList');
    setupSearch('searchAlgos', 'algoListContainer');
    setupSearch('searchRegexes', 'regexListContainer');

    // Wire up window globals
    window.selectListItems = selectListItems;
    window.addAggregationSelector = addAggregationSelector;
    window.exportRegexes = exportRegexes;
    window.exportSelectedRegexes = exportSelectedRegexes;
    window.importRegexes = importRegexes;

    // Restore saved benchmark state, THEN render lists
    restoreBenchmarkState().then(() => {
        renderAlgoList();
        renderRegexList();
        attachStateListeners();
        initTableSettingsListeners();
        initExportListeners();
    });
    window.addEventListener('algosUpdated', renderAlgoList);

    initPetriFilterModal();
}
