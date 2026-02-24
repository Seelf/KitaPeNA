/**
 * benchmark_regex.js — Regex CRUD, rendering, export/import for benchmarking.
 */

import { getCsrfToken } from './benchmark_helpers.js';
import { regexCache, setRegexCache } from './benchmark_shared.js';
import { applyPendingSelections } from './benchmark_state.js';

export async function renderRegexList() {
    const container = document.getElementById('regexListContainer');
    if (!container) return;
    container.innerHTML = '<div style="padding: 5px; color: #888;">Loading...</div>';

    try {
        const resp = await fetch('/api/algorithms/regex');
        let regexes = [];
        if (resp.ok) {
            regexes = await resp.json();
            setRegexCache(regexes);
        }

        container.innerHTML = '';

        if (regexes.length === 0) {
            container.innerHTML = '<div style="padding: 5px; color: #888; font-style: italic; font-size: 11px;">No regex settings created.</div>';
            return;
        }

        regexes.forEach(r => {
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
                const stagesContainer = document.getElementById('regexStagesContainer');
                stagesContainer.innerHTML = '';
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

                const stagesContainer = document.getElementById('regexStagesContainer');
                stagesContainer.innerHTML = '';
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

export function exportRegexes(regexArray) {
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
}

export function exportSelectedRegexes() {
    const selectedIds = Array.from(document.querySelectorAll('#regexListContainer .regex-item.selected'))
        .map(el => parseInt(el.dataset.id));

    if (selectedIds.length === 0) {
        alert("Select regexes to export first.");
        return;
    }

    const toExport = regexCache.filter(r => selectedIds.includes(r.id));
    exportRegexes(toExport);
}

export async function importRegexes(event) {
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
    event.target.value = '';
}
