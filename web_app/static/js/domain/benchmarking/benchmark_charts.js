/**
 * benchmark_charts.js — Chart.js initialization and update logic.
 */

import { perfCharts, setPerfCharts } from './benchmark_shared.js';

export const COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#ff9f40', '#4bc0c0'];

export function initChart(algoNames, aggregations, mode) {
    const container = document.getElementById('perfChartsContainer');
    if (!container) return;

    container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;"><h3 style="margin:0;color:var(--accent);font-size:16px;">Charts</h3></div>');

    Object.values(perfCharts).forEach(chart => {
        if (chart) chart.destroy();
    });
    const newCharts = {};

    aggregations.forEach((agg, index) => {
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

        newCharts[agg] = new ChartLib(ctx, {
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

    setPerfCharts(newCharts);
}

export function updateChart(resultChunk, aggregations) {
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

export function addAggregationSelector() {
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
}
