/**
 * benchmark_lists.js — Rendering algorithm lists, loading graphs/petri nets/PNH files,
 * and managing the Petri filter modal.
 */

import { getCsrfToken, updateDspnPreview } from './benchmark_helpers.js';
import { applyPendingSelections } from './benchmark_state.js';

export async function renderAlgoList() {
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

        // Render Custom C++ Algos
        customAlgos.forEach(a => {
            const id = `custom_${a.name}`;
            const label = `C++: ${a.name}`;
            const color = a.compiled ? '#acf' : '#f88';
            const disabled = !a.compiled ? 'disabled' : '';
            const errBadge = a.compiled ? '' : ' <span style="font-size:10px; color:#f88">[ERR]</span>';

            const div = document.createElement('div');
            div.className = 'saved-item algo-item';
            div.dataset.id = id;
            div.innerHTML = `
                <input type="checkbox" value="${id}" ${disabled} style="margin-right: 10px; cursor: pointer;">
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

export async function loadBenchmarkGraphs() {
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

export async function loadBenchmarkPetriNets() {
    const list = document.getElementById('benchPetriList');
    if (!list) return;
    list.innerHTML = '<div style="padding: 5px; color: #888;">Loading...</div>';

    try {
        const params = new URLSearchParams({ per_page: '9999' });

        const modelClass = document.getElementById('benchPetriModelClass')?.value;
        const metaSearch = document.getElementById('benchPetriMetaSearch')?.value;
        const metaRegex = document.getElementById('benchPetriMetaRegex')?.value;
        const sort = document.getElementById('benchPetriSort')?.value;

        // Collect dynamic property filters
        const propFilters = [];
        const filterRows = document.querySelectorAll('.petri-prop-filter-row');
        filterRows.forEach(row => {
            const prop = row.querySelector('.prop-sel').value;
            const op = row.querySelector('.op-sel').value;
            const val = row.querySelector('.val-input').value;
            if (val !== '') {
                propFilters.push({ prop, op, val: parseInt(val, 10) });
            }
        });

        if (propFilters.length > 0) {
            params.set('prop_filters', JSON.stringify(propFilters));
        }

        if (modelClass) params.set('class', modelClass);
        if (metaSearch) params.set('meta_search', metaSearch);
        if (metaRegex) params.set('meta_regex', metaRegex);
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

export function initPetriFilterModal() {
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

    // Dynamic filters logic
    const btnAddFilter = document.getElementById('btnAddPetriPropFilter');
    const filtersContainer = document.getElementById('benchPetriPropFiltersContainer');
    const emptyMsg = document.getElementById('benchPetriPropFiltersEmpty');

    const updateEmptyMsg = () => {
        if (!filtersContainer || !emptyMsg) return;
        const rows = filtersContainer.querySelectorAll('.petri-prop-filter-row');
        emptyMsg.style.display = rows.length > 0 ? 'none' : 'block';
    };

    if (btnAddFilter && filtersContainer) {
        btnAddFilter.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'petri-prop-filter-row';
            row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
            row.innerHTML = `
                <select class="prop-sel" style="flex: 2; padding: 4px; background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-bright); border-radius: 4px;">
                    <option value="places">Places (P)</option>
                    <option value="transitions">Transitions (T)</option>
                    <option value="arcs">Arcs (A)</option>
                    <option value="tokens">Tokens (K)</option>
                </select>
                <select class="op-sel" style="flex: 1; padding: 4px; background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-bright); border-radius: 4px;">
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                    <option value="==">=</option>
                </select>
                <input type="number" class="val-input" min="0" placeholder="0" style="flex: 2; padding: 4px; background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-bright); border-radius: 4px;">
                <button class="btn btn-delete-row" style="background: none; border: none; color: #f66; cursor: pointer; padding: 4px;" title="Remove">✕</button>
            `;

            row.querySelector('.btn-delete-row').addEventListener('click', () => {
                row.remove();
                updateEmptyMsg();
            });

            filtersContainer.appendChild(row);
            updateEmptyMsg();
        });
    }

    const clearFiltersFn = () => {
        ['benchPetriModelClass', 'benchPetriMetaSearch', 'benchPetriMetaRegex'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        if (filtersContainer) {
            const rows = filtersContainer.querySelectorAll('.petri-prop-filter-row');
            rows.forEach(r => r.remove());
            updateEmptyMsg();
        }

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

export async function loadBenchmarkPnhFiles() {
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
