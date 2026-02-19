function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
}

export function initAlgoManager() {
    const btnManage = document.getElementById('btnManageAlgos');
    const modal = document.getElementById('algoModal');
    const btnClose = document.getElementById('closeAlgoModal');
    const btnNew = document.getElementById('btnNewAlgo');
    const btnSave = document.getElementById('btnSaveCompile');
    const btnDelete = document.getElementById('btnDeleteAlgo');

    const nameInput = document.getElementById('editAlgoName');
    const langSelect = document.getElementById('algoLanguageSelect');
    const listContainer = document.getElementById('customAlgoList');
    const compileStatus = document.getElementById('compileStatus');
    const searchInput = document.getElementById('filterAlgoManager');

    let allAlgos = [];
    let selectedAlgoName = null;
    let editor = null;

    if (!btnManage || !modal) return;

    // Monaco Editor Initialization
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        editor = monaco.editor.create(document.getElementById('monacoEditorContainer'), {
            value: getTemplateCode(),
            language: 'cpp',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 13,
            lineHeight: 1.5,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 10 }
        });

        // Sync language select with editor
        langSelect.addEventListener('change', () => {
            const lang = langSelect.value;
            monaco.editor.setModelLanguage(editor.getModel(), lang === 'plain' ? 'plaintext' : lang);
        });

        // Auto-detect language from name
        nameInput.addEventListener('input', () => {
            const val = nameInput.value.toLowerCase();
            if (val.endsWith('.py')) langSelect.value = 'python';
            else if (val.endsWith('.php')) langSelect.value = 'php';
            else if (val.endsWith('.js')) langSelect.value = 'javascript';
            else if (val.endsWith('.cpp') || val.endsWith('.h') || val.endsWith('.hpp')) langSelect.value = 'cpp';

            langSelect.dispatchEvent(new Event('change'));
        });
    });

    // Open Modal
    btnManage.addEventListener('click', () => {
        modal.style.display = 'flex';
        loadAlgoList();
        if (editor) editor.layout();
    });

    // External Open Request
    window.addEventListener('openAlgoEditor', (e) => {
        const name = e.detail.name;
        modal.style.display = 'flex';
        loadAlgoList().then(() => {
            loadAlgoDetails(name);
        });
    });

    // Close Modal
    btnClose.addEventListener('click', () => {
        modal.style.display = 'none';
        window.dispatchEvent(new Event('algosUpdated'));
    });

    // Search Input
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderList();
        });
    }

    // New Algo
    if (btnNew) {
        btnNew.addEventListener('click', () => {
            selectedAlgoName = null;
            nameInput.value = '';
            if (editor) editor.setValue(getTemplateCode());
            compileStatus.textContent = "New Draft";
            compileStatus.style.color = "#aaa";
            renderList();
        });
    }

    async function loadAlgoList() {
        listContainer.innerHTML = '<div style="padding:10px; color:#aaa;">Loading...</div>';
        try {
            const res = await fetch('/api/algorithms');
            allAlgos = await res.json();
            renderList();
            if (selectedAlgoName) {
                if (!allAlgos.find(a => a.name === selectedAlgoName)) selectedAlgoName = null;
            }
        } catch (e) {
            console.error(e);
            listContainer.innerHTML = '<div style="color:red; padding:10px;">Error loading list</div>';
        }
    }

    function renderList() {
        listContainer.innerHTML = '';
        const filter = searchInput ? searchInput.value.toLowerCase() : '';

        allAlgos.forEach(a => {
            if (filter && !a.name.toLowerCase().includes(filter)) return;

            const isSelected = (a.name === selectedAlgoName);
            const el = document.createElement('div');
            el.className = `saved-item ${isSelected ? 'selected' : ''}`;
            el.dataset.name = a.name;

            const statusClass = a.compiled ? 'badge-success' : 'badge-warn';
            const statusText = a.compiled ? 'READY' : 'SRC';

            el.innerHTML = `
                <span class="name">${a.name}</span>
                <span class="badges" style="display: flex; gap: 5px; align-items: center; margin-right: 8px;">
                    <span class="badge ${statusClass}">${statusText}</span>
                </span>
                <span class="actions" style="display: flex; gap: 8px;">
                    <button class="btn-delete btn-icon-duplicate" title="Duplicate">📄</button>
                    <button class="btn-delete btn-icon-delete" title="Delete" style="color: #f66;">🗑️</button>
                </span>
            `;

            el.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                loadAlgoDetails(a.name);
            });

            const btnDup = el.querySelector('.btn-icon-duplicate');
            btnDup.addEventListener('click', (e) => {
                e.stopPropagation();
                duplicateAlgo(a.name);
            });

            const btnDel = el.querySelector('.btn-icon-delete');
            btnDel.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteAlgo(a.name);
            });

            listContainer.appendChild(el);
        });
    }

    async function loadAlgoDetails(name) {
        selectedAlgoName = name;
        renderList();
        compileStatus.textContent = "Loading...";
        try {
            const res = await fetch(`/api/algorithms/${name}`);
            const data = await res.json();

            nameInput.value = data.name;
            if (editor) editor.setValue(data.code);

            const algoInfo = allAlgos.find(a => a.name === name);
            if (algoInfo && algoInfo.compiled) {
                compileStatus.textContent = "Loaded (Compiled)";
                compileStatus.style.color = "#4f4";
            } else {
                compileStatus.textContent = "Loaded (Source only)";
                compileStatus.style.color = "#ddd";
            }
        } catch (e) {
            console.error(e);
            compileStatus.textContent = "Error loading details";
            compileStatus.style.color = "red";
        }
    }

    async function duplicateAlgo(sourceName) {
        try {
            const res = await fetch(`/api/algorithms/${sourceName}`);
            const data = await res.json();
            if (!data.code) { alert("Failed to fetch source for duplication"); return; }

            let newName = `${sourceName}_copy`;
            let counter = 1;
            while (allAlgos.find(a => a.name === newName)) {
                counter++;
                newName = `${sourceName}_copy${counter}`;
            }

            const saveRes = await fetch('/api/algorithms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                body: JSON.stringify({ name: newName, code: data.code })
            });
            const saveResult = await saveRes.json();
            if (saveResult.success) await loadAlgoList();
            else alert("Failed to duplicate: " + (saveResult.message || saveResult.stderr));
        } catch (e) {
            console.error(e);
            alert("Error duplicating: " + e.message);
        }
    }

    async function deleteAlgo(name) {
        if (!confirm(`Delete algorithm "${name}"? This cannot be undone.`)) return;
        try {
            await fetch(`/api/algorithms/${name}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrfToken() } });
            if (selectedAlgoName === name) {
                selectedAlgoName = null;
                nameInput.value = '';
                if (editor) editor.setValue('');
                compileStatus.textContent = "Deleted";
            }
            loadAlgoList();
        } catch (e) { alert("Error deleting: " + e.message); }
    }

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const code = editor ? editor.getValue() : '';

            if (!name) { alert("Name required"); return; }

            compileStatus.textContent = "Compiling...";
            compileStatus.style.color = "#ff9";

            try {
                const res = await fetch('/api/algorithms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({ name, code })
                });

                const result = await res.json();
                if (result.success) {
                    compileStatus.textContent = "Success! Saved & Compiled.";
                    compileStatus.style.color = "#4f4";
                    selectedAlgoName = name;
                    loadAlgoList();
                } else {
                    compileStatus.textContent = "Compilation Failed";
                    compileStatus.style.color = "#f44";
                    alert("Compilation Error:\n" + (result.stderr || result.message));
                }
            } catch (e) { compileStatus.textContent = "Error: " + e.message; }
        });
    }

    if (btnDelete) {
        btnDelete.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) return;
            deleteAlgo(name);
        });
    }

    function getTemplateCode() {
        return `// C++ Graph Coloring Algorithm Interface
// extern "C" void solve(int n, int m, int* u, int* v, int* colors)

#include <vector>
#include <algorithm>

extern "C" {

void solve(int n, int m, int* u, int* v, int* colors) {
    std::vector<std::vector<int>> adj(n);
    for(int i=0; i<m; ++i) {
        adj[u[i]].push_back(v[i]);
        adj[v[i]].push_back(u[i]);
    }

    for(int i=0; i<n; ++i) {
        std::vector<bool> used(n + 1, false);
        for(int neighbor : adj[i]) {
            if(colors[neighbor] != 0) used[colors[neighbor]] = true;
        }
        
        int c = 1; 
        while(used[c]) c++;
        colors[i] = c;
    }
}

}`;
    }
}
