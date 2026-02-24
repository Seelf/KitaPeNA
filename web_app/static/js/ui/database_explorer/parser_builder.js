/**
 * parser_builder.js — Universal Parser Builder modal, CRUD routing, and live extraction testing.
 */

import { getCsrfToken } from './explorer_shared.js';
import { loadDatabaseItems } from './explorer_init.js';

let parserCache = [];
let debounceTimer = null;

export async function initParserBuilder() {
    const btnOpen = document.getElementById('btnOpenParserModal');
    const modal = document.getElementById('parserModal');
    const btnClose = document.getElementById('closeParserModal');

    if (btnOpen && modal) {
        btnOpen.addEventListener('click', () => {
            modal.style.display = 'flex';
            renderParserList();
            clearParserEditor();
        });
    }

    if (btnClose && modal) {
        btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
    }

    // Editor wiring
    const btnAddRule = document.getElementById('btnAddParserRule');
    if (btnAddRule) btnAddRule.addEventListener('click', () => addRuleRow());

    const btnTest = document.getElementById('btnParserTest');
    if (btnTest) btnTest.addEventListener('click', runLiveTest);

    const sampleInput = document.getElementById('modalParserSample');
    if (sampleInput) {
        sampleInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runLiveTest, 500);
        });
    }

    const btnNew = document.getElementById('btnNewParser');
    if (btnNew) btnNew.addEventListener('click', clearParserEditor);

    const btnSave = document.getElementById('btnSaveParser');
    if (btnSave) btnSave.addEventListener('click', saveParser);

    // Import Wiring
    const btnImport = document.getElementById('btnImportParserJson');
    const fileInput = document.getElementById('inputImportParser');
    if (btnImport && fileInput) {
        btnImport.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', importParserFile);
    }
}

async function fetchParsers() {
    try {
        const res = await fetch('/api/petri/parsers');
        if (res.ok) {
            parserCache = await res.json();
        }
    } catch (err) {
        console.error("Failed to load parsers", err);
    }
    return parserCache;
}

export async function getParserCache() {
    if (parserCache.length === 0) {
        await fetchParsers();
    }
    return parserCache;
}

export async function renderParserList() {
    const container = document.getElementById('parserListContainer');
    if (!container) return;
    container.innerHTML = '<div style="padding: 5px; color: #888;">Loading...</div>';

    await fetchParsers();
    container.innerHTML = '';

    if (parserCache.length === 0) {
        container.innerHTML = '<div style="padding: 5px; color: #888; font-style: italic; font-size: 11px;">No custom parsers created.</div>';
        return;
    }

    parserCache.forEach(p => {
        const pDiv = document.createElement('div');
        pDiv.className = 'saved-item algo-item';
        pDiv.style.cursor = 'pointer';
        pDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; flex: 1;">
                <span class="name" style="color: #66b2ff; font-weight: bold; font-size: 13px;">${p.name}</span>
                <span style="font-size: 10px; color: #888;">${p.description || 'No description'}</span>
            </div>
            <div class="actions" style="display: flex; gap: 8px;">
                <button title="Duplicate" class="btn-duplicate" style="font-size: 11px; color: #ccc; background: none; border: none; cursor: pointer;">📋</button>
                <button title="Export" class="btn-export" style="font-size: 11px; color: #ccc; background: none; border: none; cursor: pointer;">📥</button>
                <button title="Delete" class="btn-delete" style="font-size: 11px; color: #f66; background: none; border: none; cursor: pointer;">🗑️</button>
            </div>
        `;

        pDiv.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            loadParserIntoEditor(p);
        });

        pDiv.querySelector('.btn-duplicate').addEventListener('click', (e) => {
            e.stopPropagation();
            const copy = JSON.parse(JSON.stringify(p));
            copy.id = null;
            copy.name += " (Copy)";
            loadParserIntoEditor(copy);
        });

        pDiv.querySelector('.btn-export').addEventListener('click', (e) => {
            e.stopPropagation();
            exportParser(p);
        });

        pDiv.querySelector('.btn-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`Delete parser "${p.name}"?`)) return;
            try {
                const res = await fetch(`/api/petri/parsers/${p.id}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': getCsrfToken() }
                });
                if (res.ok) {
                    if (document.getElementById('modalParserId').value == p.id) {
                        clearParserEditor();
                    }
                    renderParserList();
                    // Dispatch event so the import dropdown can update
                    document.dispatchEvent(new CustomEvent('parsersUpdated'));
                }
            } catch (err) { }
        });

        container.appendChild(pDiv);
    });
}

function clearParserEditor() {
    document.getElementById('modalParserId').value = '';
    document.getElementById('modalParserName').value = '';
    document.getElementById('modalParserDesc').value = '';
    document.getElementById('modalParserSample').value = '';
    document.getElementById('parserRulesContainer').innerHTML =
        '<div class="empty-state" style="padding: 20px; text-align: center; color: #666; font-style: italic;">No rules defined yet.</div>';
    document.getElementById('parserLivePreview').textContent = '{}';
    document.getElementById('parserStatusText').textContent = 'New Parser';
    document.getElementById('parserStatusText').style.color = '#888';
}

function loadParserIntoEditor(p) {
    document.getElementById('modalParserId').value = p.id || '';
    document.getElementById('modalParserName').value = p.name;
    document.getElementById('modalParserDesc').value = p.description || '';
    document.getElementById('modalParserSample').value = p.sample_input || '';

    document.getElementById('parserStatusText').textContent = p.id ? 'Editing existing parser' : 'Unsaved copy';
    document.getElementById('parserStatusText').style.color = p.id ? '#88ff88' : '#ffcc00';

    const container = document.getElementById('parserRulesContainer');
    container.innerHTML = '';

    if (!p.rules || p.rules.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #666; font-style: italic;">No rules defined yet.</div>';
    } else {
        p.rules.forEach(rule => addRuleRow(rule));
    }

    runLiveTest();
}

function addRuleRow(ruleData = null) {
    const container = document.getElementById('parserRulesContainer');
    const empty = container.querySelector('.empty-state');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'parser-rule-row';
    row.style.cssText = 'background: #252526; padding: 10px; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; gap: 8px; position: relative;';

    const targets = ['places', 'transitions', 'arcs', 'marking', 'metadata'];
    const methods = ['regex', 'lines'];
    const transforms = ['split_comma', 'split_newline', 'split_semicolon', 'arc_pairs', 'split_comma_int', 'split_space_int', 'join_newline'];

    const makeOptions = (arr, sel) => arr.map(a => `<option value="${a}" ${a === sel ? 'selected' : ''}>${a}</option>`).join('');

    row.innerHTML = `
        <button class="btn-delete-rule" style="position: absolute; top: 5px; right: 5px; background: none; border: none; color: #f66; cursor: pointer; padding: 2px;">✕</button>
        
        <div style="display: flex; gap: 10px; align-items: center;">
            <div style="flex: 1; display:flex; flex-direction: column; gap: 2px;">
                <label style="font-size: 10px; color: #888;">Target Field</label>
                <select class="r-target" style="padding: 4px; background: #111; border: 1px solid #444; color: #ddd;">
                    ${makeOptions(targets, ruleData?.target || 'places')}
                </select>
            </div>
            
            <div style="flex: 1; display:flex; flex-direction: column; gap: 2px;">
                <label style="font-size: 10px; color: #888;">Method</label>
                <select class="r-method" style="padding: 4px; background: #111; border: 1px solid #444; color: #ddd;">
                    ${makeOptions(methods, ruleData?.method || 'regex')}
                </select>
            </div>
            
             <div style="flex: 1; display:flex; flex-direction: column; gap: 2px;">
                <label style="font-size: 10px; color: #888;">Transform</label>
                <select class="r-transform" style="padding: 4px; background: #111; border: 1px solid #444; color: #ddd;">
                    <option value="">(None)</option>
                    ${makeOptions(transforms, ruleData?.transform || '')}
                </select>
            </div>
        </div>
        
        <div class="r-pattern-container" style="display: flex; gap: 10px; align-items: center;">
            <div style="flex: 3; display:flex; flex-direction: column; gap: 2px;">
                <label style="font-size: 10px; color: var(--accent);">Pattern (Regex or Line Range)</label>
                <input type="text" class="r-pattern" value="${ruleData?.pattern || ''}" placeholder="e.g. ^P:(.*) or 1-10" style="padding: 4px; background: #111; border: 1px solid #444; color: #ddd; font-family: monospace;">
            </div>
            <div class="r-flags-container" style="flex: 1; display:flex; flex-direction: column; gap: 2px;">
                <label style="font-size: 10px; color: #888;">Flags</label>
                <input type="text" class="r-flags" value="${ruleData?.flags || 'gm'}" placeholder="gm" style="padding: 4px; background: #111; border: 1px solid #444; color: #ddd; font-family: monospace;">
            </div>
        </div>
    `;

    // Logic to toggle between regex pattern and start/end lines based on Method
    const methodSel = row.querySelector('.r-method');
    const patInput = row.querySelector('.r-pattern');
    const patLabel = row.querySelector('.r-pattern-container label');
    const flagsCont = row.querySelector('.r-flags-container');

    const updateMethodUI = () => {
        if (methodSel.value === 'lines') {
            patLabel.textContent = 'Line Range (start-end)';
            patInput.placeholder = 'e.g. 5-15';
            if (ruleData?.startLine) patInput.value = `${ruleData.startLine}-${ruleData.endLine}`;
            flagsCont.style.display = 'none';
        } else {
            patLabel.textContent = 'Regex Pattern';
            patInput.placeholder = 'e.g. ^P:(.*)';
            if (ruleData?.pattern) patInput.value = ruleData.pattern;
            flagsCont.style.display = 'flex';
        }
    };

    methodSel.addEventListener('change', updateMethodUI);
    updateMethodUI();

    row.querySelector('.btn-delete-rule').addEventListener('click', () => {
        row.remove();
        if (container.children.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #666; font-style: italic;">No rules defined yet.</div>';
        }
        runLiveTest();
    });

    // Auto-test on changes
    row.addEventListener('change', runLiveTest);
    row.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runLiveTest, 500);
    });

    container.appendChild(row);
}

function collectRules() {
    const rules = [];
    const rows = document.querySelectorAll('.parser-rule-row');
    rows.forEach(row => {
        const method = row.querySelector('.r-method').value;
        const target = row.querySelector('.r-target').value;
        const transform = row.querySelector('.r-transform').value;
        const patternRaw = row.querySelector('.r-pattern').value;

        const rule = { method, target, transform };

        if (method === 'lines') {
            const parts = patternRaw.split('-');
            rule.startLine = parts[0] ? parseInt(parts[0].trim()) : 1;
            rule.endLine = parts[1] ? parseInt(parts[1].trim()) : 999999;
        } else {
            rule.pattern = patternRaw;
            rule.flags = row.querySelector('.r-flags').value;
        }
        rules.push(rule);
    });
    return rules;
}

async function runLiveTest() {
    const rules = collectRules();
    const sample_input = document.getElementById('modalParserSample').value;
    const pre = document.getElementById('parserLivePreview');
    const btnSave = document.getElementById('btnSaveParser');
    const statusText = document.getElementById('parserStatusText');

    // Disable save button during testing or if no rules exist
    if (btnSave) btnSave.disabled = true;

    if (!sample_input || rules.length === 0) {
        pre.textContent = '{}';
        pre.style.color = '#888';
        statusText.textContent = 'Awaiting rules and sample input...';
        statusText.style.color = '#888';
        return;
    }

    pre.textContent = 'Testing...';
    pre.style.color = '#888';
    statusText.textContent = 'Testing rules...';
    statusText.style.color = '#ffcc00';

    try {
        const res = await fetch('/api/petri/parsers/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify({ rules, sample_input })
        });

        const data = await res.json();

        if (res.ok) {
            pre.textContent = JSON.stringify(data, null, 2);

            // Validate internal schema structure
            const isValid = data
                && Array.isArray(data.places)
                && Array.isArray(data.transitions)
                && Array.isArray(data.arcs);

            if (isValid) {
                pre.style.color = '#a5d6ff';
                statusText.textContent = '✓ Parsing Output Valid';
                statusText.style.color = '#88ff88';
                if (btnSave) btnSave.disabled = false;
            } else {
                pre.style.color = '#ffaaaa';
                statusText.textContent = '✗ Invalid output structure (missing places/transitions/arcs arrays)';
                statusText.style.color = '#f66';
            }
        } else {
            pre.textContent = data.error || 'Test failed';
            pre.style.color = '#f66';
            statusText.textContent = '✗ Extraction Error';
            statusText.style.color = '#f66';
        }
    } catch (err) {
        pre.textContent = err.message;
        pre.style.color = '#f66';
        statusText.textContent = '✗ Connection Error';
        statusText.style.color = '#f66';
    }
}

async function saveParser() {
    const id = document.getElementById('modalParserId').value;
    const name = document.getElementById('modalParserName').value;
    const description = document.getElementById('modalParserDesc').value;
    const sample_input = document.getElementById('modalParserSample').value;
    const rules = collectRules();

    if (!name.trim()) return alert("Parser name is required.");

    const payload = { name, description, sample_input, rules };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/petri/parsers/${id}` : '/api/petri/parsers';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            document.getElementById('parserStatusText').textContent = 'Saved successfully!';
            document.getElementById('parserStatusText').style.color = '#88ff88';
            renderParserList();
            document.dispatchEvent(new CustomEvent('parsersUpdated'));

            if (!id) {
                // If it was a new creation, clear to allow rapid creation, or we can just leave it?
                // Let's reload the list and clear.
                clearParserEditor();
            }
        } else {
            const err = await res.json();
            alert("Error saving: " + err.error);
        }
    } catch (err) {
        alert("Error: " + err.message);
    }
}

function exportParser(p) {
    const exportData = {
        name: p.name,
        description: p.description,
        rules: p.rules,
        sample_input: p.sample_input
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parser_${p.name.replace(/\\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function importParserFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const parsersToImport = Array.isArray(data) ? data : [data];

            for (const p of parsersToImport) {
                if (!p.name || !p.rules) continue;
                await fetch('/api/petri/parsers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify(p)
                });
            }
            renderParserList();
            document.dispatchEvent(new CustomEvent('parsersUpdated'));
            alert("Parser(s) imported successfully!");
        } catch (err) {
            alert("Failed to import parser: " + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
