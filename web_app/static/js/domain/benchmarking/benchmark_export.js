/**
 * benchmark_export.js — Results table, dynamic column checkboxes, CSV & LaTeX export.
 */

import { benchmarkResultsData, setBenchmarkResultsData, rawBenchmarkChunks, lastBenchmarkPayload, setLastBenchmarkPayload, setRawBenchmarkChunks } from './benchmark_shared.js';
import { scheduleSaveState } from './benchmark_state.js';

export function appendResultsToTable(resultChunk, payload) {
    const chunks = [...rawBenchmarkChunks, resultChunk];
    setRawBenchmarkChunks(chunks);
    setLastBenchmarkPayload(payload);
    if (chunks.length === 1) initDynamicColumnCheckboxes(payload);
    refreshBenchmarkTable();

    const tableContainer = document.getElementById('benchmarkResultsTableContainer');
    if (tableContainer) tableContainer.style.display = 'block';
    const settingsPanel = document.getElementById('tableSettingsPanel');
    if (settingsPanel) settingsPanel.style.display = 'block';
}

export function initDynamicColumnCheckboxes(payload) {
    const container = document.getElementById('dynamicColsContainer');
    if (!container) return;

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

    const title = document.createElement('div');
    title.style.cssText = 'color: #888; text-transform: uppercase; font-weight: bold; font-size: 10px; margin-right: 5px;';
    title.textContent = 'Show Columns:';
    container.appendChild(title);

    container.appendChild(createCheckbox('colShowContext', 'Context', true));
    container.appendChild(createCheckbox('colShowAlgorithm', 'Algorithm', true));

    const sep = document.createElement('div');
    sep.style.cssText = 'width: 1px; height: 16px; background: #444; margin: 0 5px; align-self: center;';
    container.appendChild(sep);

    if (payload.aggregations) {
        payload.aggregations.forEach(agg => {
            const id = `colShowAgg_${agg.replace(/[^a-zA-Z0-9]/g, '_')}`;
            container.appendChild(createCheckbox(id, agg.toUpperCase(), true));
        });
    }

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

export function refreshBenchmarkTable() {
    if (rawBenchmarkChunks.length === 0 || !lastBenchmarkPayload) return;

    const tbody = document.querySelector('#benchmarkResultsTable tbody');
    const thead = document.querySelector('#benchmarkResultsTable thead');
    const payload = lastBenchmarkPayload;

    if (!tbody || !thead) return;

    tbody.innerHTML = '';
    thead.innerHTML = '';
    setBenchmarkResultsData([]);

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

    // Build Header
    const trHead = document.createElement('tr');
    const headerCells = [];
    if (showContext) headerCells.push('Context');
    if (showAlgorithm) headerCells.push('Algorithm');
    activeAggs.forEach(agg => headerCells.push(`${agg.toUpperCase()} (ms)`));
    activeRegexes.forEach(r => headerCells.push(r.name));

    trHead.innerHTML = headerCells.map(h => `<th>${h}</th>`).join('');
    thead.appendChild(trHead);

    // Sorting
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

            trHead.querySelectorAll('th').forEach(t => delete t.dataset.sort);
            th.dataset.sort = sortOrder === 1 ? 'asc' : 'desc';
        });
    });

    // Build rows from ALL chunks
    const newResultsData = [];
    rawBenchmarkChunks.forEach(chunk => {
        const aggregationsToUse = payload.aggregations;
        const anyAgg = aggregationsToUse.find(a => chunk[a]);
        if (!anyAgg || !chunk[anyAgg]) return;

        const labels = chunk[anyAgg].labels || [];
        const extractedDataArr = chunk[anyAgg].extracted_data || [];
        const timeoutsArr = chunk[anyAgg].timeouts || [];

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
                newResultsData.push(rowData);
            });
        }
    });
    setBenchmarkResultsData(newResultsData);
}

export function initTableSettingsListeners() {
    // Logic moved to dynamic initialization
}

// CSV & LaTeX Export (attached on DOMContentLoaded)
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

export function initExportListeners() {
    const btnExport = document.getElementById('btnExportBenchmarkCsv');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (benchmarkResultsData.length === 0) {
                alert("No data to export.");
                return;
            }

            const headers = Object.keys(benchmarkResultsData[0]);

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += headers.join(",") + "\n";

            benchmarkResultsData.forEach(row => {
                const rowStr = headers.map(h => {
                    let cell = row[h] === undefined ? "" : row[h].toString();
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

            let latex = "\\begin{table}[h]\n\\centering\n";
            latex += "\\begin{tabular}{" + "l".repeat(headers.length) + "}\n\\hline\n";
            latex += headers.map(h => "\\textbf{" + escapeLatex(h) + "}").join(" & ") + " \\\\ \\hline\n";

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
}
