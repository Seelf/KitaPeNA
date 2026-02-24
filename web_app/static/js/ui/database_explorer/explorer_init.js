/**
 * explorer_init.js — Initialization and data loading for the database explorer.
 */

import {
    viewDatabaseExplorer, dbGrid, dbSearchInput, dbSortSelect, btnRefreshDb, dbViewSelect,
    dbAdvancedFiltersPanel, btnDbFilters, btnApplyDbFilters, btnResetDbFilters, btnAddDbPropFilter, dbPropFiltersContainer,
    dbFilterModelClass, dbFilterMetaSearch, dbFilterMetaRegex,
    dbActiveFiltersIndicator, dbActiveFiltersCount, btnDbClearFiltersToolbar,
    importNetInput, importFolderInput, importFormatSelect, dbStats,
    currentPage, itemsPerPage, isLoading, hasMore, observer, sentinel,
    selectedNetIds, allLoadedNets, currentNets,
    PETRI_EXTENSIONS, GRAPH_EXTENSIONS,
    setDomRefs, setSentinel, setObserver, setCurrentPage, setIsLoading,
    setHasMore, setCurrentNets, setAllLoadedNets, getCsrfToken
} from './explorer_shared.js';
import { updateBulkDeleteButton, toggleSelectAll, clearSelection, selectDuplicates, deleteSelectedNets, bulkExport } from './explorer_actions.js';
import { handleImport, handleDrop } from './explorer_import.js';
import { renderNewItems } from './explorer_cards.js';

export function initDatabaseExplorer() {
    const refs = {
        viewDatabaseExplorer: document.getElementById('viewDatabaseExplorer'),
        dbGrid: document.getElementById('dbGrid'),
        dbSearchInput: document.getElementById('dbSearchInput'),
        dbSortSelect: document.getElementById('dbSortSelect'),
        btnRefreshDb: document.getElementById('btnRefreshDb'),
        importNetInput: document.getElementById('importNetInput'),
        importFolderInput: document.getElementById('importFolderInput'),
        dbStats: document.getElementById('dbStats'),
        dbViewSelect: document.getElementById('dbViewSelect'),
        importFormatSelect: document.getElementById('importFormatSelect'),

        // Advanced Filters Panel
        dbAdvancedFiltersPanel: document.getElementById('dbAdvancedFiltersPanel'),
        btnDbFilters: document.getElementById('btnDbFilters'),
        btnApplyDbFilters: document.getElementById('btnApplyDbFilters'),
        btnResetDbFilters: document.getElementById('btnResetDbFilters'),
        btnAddDbPropFilter: document.getElementById('btnAddDbPropFilter'),
        dbPropFiltersContainer: document.getElementById('dbPropFiltersContainer'),
        dbFilterModelClass: document.getElementById('dbFilterModelClass'),
        dbFilterMetaSearch: document.getElementById('dbFilterMetaSearch'),
        dbFilterMetaRegex: document.getElementById('dbFilterMetaRegex'),
        dbActiveFiltersIndicator: document.getElementById('dbActiveFiltersIndicator'),
        dbActiveFiltersCount: document.getElementById('dbActiveFiltersCount'),
        btnDbClearFiltersToolbar: document.getElementById('btnDbClearFiltersToolbar')
    };
    setDomRefs(refs);

    if (!refs.viewDatabaseExplorer || !refs.dbGrid) return;

    // Create sentinel element for infinite scroll trigger
    const sent = document.createElement('div');
    sent.className = 'db-sentinel';
    sent.innerHTML = '<span style="color:#888; font-size:12px;">Loading more...</span>';
    sent.style.cssText = 'text-align:center; padding:20px; width:100%; grid-column:1/-1;';
    setSentinel(sent);

    // Event Listeners
    if (refs.btnRefreshDb) refs.btnRefreshDb.addEventListener('click', () => loadDatabaseItems(true));

    if (refs.dbSearchInput) {
        let debounceTimer;
        refs.dbSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                saveExplorerState();
                loadDatabaseItems(true);
            }, 400);
        });
    }

    // Sort listener removed (handled by Filter Modal Apply)
    // if (refs.dbSortSelect) {
    //     refs.dbSortSelect.addEventListener('change', () => loadDatabaseItems(true));
    // }

    const dbViewTabs = document.querySelectorAll('.db-view-tab');
    if (dbViewTabs.length > 0 && refs.dbViewSelect) {
        dbViewTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                dbViewTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                refs.dbViewSelect.value = e.target.dataset.view;
                refs.dbViewSelect.dispatchEvent(new Event('change'));
            });
        });
    }

    if (refs.dbViewSelect) {
        refs.dbViewSelect.addEventListener('change', () => {
            updateImportAcceptFilters(true);
            saveExplorerState();
            loadDatabaseItems(true);
        });
    }

    if (refs.importFormatSelect) {
        refs.importFormatSelect.addEventListener('change', () => updateImportAcceptFilters(false));
    }

    // Filter Panel (Toggle functionality restored)
    if (refs.btnDbFilters && refs.dbAdvancedFiltersPanel) {
        refs.btnDbFilters.addEventListener('click', () => {
            const isVisible = refs.dbAdvancedFiltersPanel.style.display === 'block';
            const nextVisible = !isVisible;
            refs.dbAdvancedFiltersPanel.style.display = nextVisible ? 'block' : 'none';
            refs.btnDbFilters.style.background = nextVisible ? 'var(--accent)' : '';
            refs.btnDbFilters.style.color = nextVisible ? 'white' : '';
            saveExplorerState();
        });
    }

    if (refs.btnApplyDbFilters) {
        refs.btnApplyDbFilters.addEventListener('click', () => {
            updateFilterBadge();
            saveExplorerState();
            loadDatabaseItems(true);
        });
    }

    if (refs.btnResetDbFilters) {
        refs.btnResetDbFilters.addEventListener('click', () => {
            clearDatabaseFilters();
            saveExplorerState();
        });
    }

    if (refs.btnDbClearFiltersToolbar) {
        refs.btnDbClearFiltersToolbar.addEventListener('click', () => {
            clearDatabaseFilters();
            saveExplorerState();
        });
    }

    if (refs.dbFilterModelClass) {
        refs.dbFilterModelClass.addEventListener('input', () => saveExplorerState());
    }
    if (refs.dbFilterMetaSearch) {
        refs.dbFilterMetaSearch.addEventListener('input', () => saveExplorerState());
    }
    if (refs.dbFilterMetaRegex) {
        refs.dbFilterMetaRegex.addEventListener('input', () => saveExplorerState());
    }
    if (refs.dbSortSelect) {
        refs.dbSortSelect.addEventListener('change', () => {
            saveExplorerState();
            loadDatabaseItems(true);
        });
    }

    if (refs.btnAddDbPropFilter && refs.dbPropFiltersContainer) {
        refs.btnAddDbPropFilter.addEventListener('click', () => {
            const emptyMsg = document.getElementById('dbPropFiltersEmpty');
            if (emptyMsg) emptyMsg.style.display = 'none';

            const row = document.createElement('div');
            row.className = 'petri-prop-filter-row';
            row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 5px;';
            row.innerHTML = `
                <select class="prop-sel" style="flex: 2; padding: 6px; background: #000; border: 1px solid #333; color: #fff; border-radius: 4px; font-size: 12px;">
                    <option value="places">Places (P)</option>
                    <option value="transitions">Transitions (T)</option>
                    <option value="arcs">Arcs (A)</option>
                    <option value="tokens">Tokens (K)</option>
                </select>
                <select class="op-sel" style="flex: 1; padding: 6px; background: #000; border: 1px solid #333; color: #fff; border-radius: 4px; font-size: 12px;">
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                    <option value="==">=</option>
                </select>
                <input type="number" class="val-input" min="0" placeholder="0" style="flex: 2; padding: 6px; background: #000; border: 1px solid #333; color: #fff; border-radius: 4px; font-size: 12px;">
                <button class="btn-delete-row" style="background: none; border: none; color: #f66; cursor: pointer; padding: 4px; font-size: 16px;">✕</button>
            `;

            row.querySelector('.btn-delete-row').addEventListener('click', () => {
                row.remove();
                if (refs.dbPropFiltersContainer.querySelectorAll('.petri-prop-filter-row').length === 0) {
                    if (emptyMsg) emptyMsg.style.display = 'block';
                }
                saveExplorerState();
            });

            // Auto-save on row changes
            row.querySelectorAll('select, input').forEach(el => {
                el.addEventListener('change', () => saveExplorerState());
                if (el.tagName === 'INPUT') {
                    el.addEventListener('input', () => saveExplorerState());
                }
            });

            refs.dbPropFiltersContainer.appendChild(row);
        });
    }

    if (refs.importNetInput) {
        refs.importNetInput.addEventListener('change', handleImport);
    }
    if (refs.importFolderInput) {
        refs.importFolderInput.addEventListener('change', handleImport);
    }

    // Close dropdown when clicking outside
    window.addEventListener('click', function (e) {
        const btn = document.getElementById('btnImportDropdown');
        const menu = document.getElementById('importDropdownMenu');
        if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
            menu.style.display = 'none';
        }
    });

    // Drag and Drop support
    if (refs.viewDatabaseExplorer) {
        refs.viewDatabaseExplorer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            refs.viewDatabaseExplorer.classList.add('drag-active');
            if (refs.dbStats) refs.dbStats.textContent = "Drop files or folders to import...";
        });
        refs.viewDatabaseExplorer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            refs.viewDatabaseExplorer.classList.remove('drag-active');
            if (refs.dbStats) refs.dbStats.textContent = "";
        });
        refs.viewDatabaseExplorer.addEventListener('drop', handleDrop);
    }

    // IntersectionObserver for infinite scroll
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoading && hasMore) {
                loadDatabaseItems(false);
            }
        });
    }, {
        root: refs.dbGrid,
        rootMargin: '200px',
        threshold: 0
    });
    setObserver(obs);

    // Bulk action listeners
    const btnBulkMenu = document.getElementById('btnDbBulkMenu');
    const menuBulk = document.getElementById('dbBulkMenu');

    if (btnBulkMenu && menuBulk) {
        btnBulkMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            menuBulk.style.display = menuBulk.style.display === 'none' ? 'block' : 'none';
        });
    }

    const btnSelectAll = document.getElementById('btnDbSelectAll');
    const btnSelectDupes = document.getElementById('btnDbSelectDuplicates');
    const btnDeleteSelected = document.getElementById('btnDbDeleteSelected');
    const btnClearSelection = document.getElementById('btnDbClearSelection');

    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            toggleSelectAll();
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnClearSelection) {
        btnClearSelection.addEventListener('click', () => {
            clearSelection();
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnSelectDupes) {
        btnSelectDupes.addEventListener('click', () => {
            selectDuplicates();
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnDeleteSelected) {
        btnDeleteSelected.addEventListener('click', () => {
            deleteSelectedNets();
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }

    const btnExportPnh = document.getElementById('btnDbExportPnh');
    const btnExportPnml = document.getElementById('btnDbExportPnml');
    const btnExportJson = document.getElementById('btnDbExportJson');

    if (btnExportPnh) {
        btnExportPnh.addEventListener('click', () => {
            bulkExport('pnh');
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnExportPnml) {
        btnExportPnml.addEventListener('click', () => {
            bulkExport('pnml');
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }
    if (btnExportJson) {
        btnExportJson.addEventListener('click', () => {
            bulkExport('json');
            if (menuBulk) menuBulk.style.display = 'none';
        });
    }

    // Global click listener for dropdowns
    window.addEventListener('click', (e) => {
        if (menuBulk && !btnBulkMenu.contains(e.target) && !menuBulk.contains(e.target)) {
            menuBulk.style.display = 'none';
        }
    });

    document.addEventListener('parsersUpdated', updateImportFormatDropdown);

    updateImportAcceptFilters(true);
}

export async function updateImportFormatDropdown() {
    const formatSelect = document.getElementById('importFormatSelect');
    if (!formatSelect) return;

    // Keep the core/built-in options
    Array.from(formatSelect.options).forEach(opt => {
        if (opt.value.startsWith('custom_')) {
            opt.remove();
        }
    });

    try {
        const { getParserCache } = await import('./parser_builder.js');
        const parsers = await getParserCache();
        parsers.forEach(p => {
            const opt = document.createElement('option');
            opt.value = `custom_${p.id}`;
            opt.textContent = `Custom: ${p.name}`;
            formatSelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to update parsers list for dropdown", err);
    }
}

export function openDatabaseExplorer() {
    if (!viewDatabaseExplorer) return;
    viewDatabaseExplorer.style.display = 'flex';
    updateImportAcceptFilters(true);
    updateImportFormatDropdown();
    // loadDatabaseItems is called by restoreExplorerState or manually if needed
    restoreExplorerState();
}

export function closeExplorer() {
    if (!viewDatabaseExplorer) return;
    viewDatabaseExplorer.style.display = 'none';
    const tabEditor = document.getElementById('tabEditor');
    if (tabEditor) tabEditor.click();
}

export function updateImportAcceptFilters(modeChanged = false) {
    if (!importNetInput || !dbViewSelect || !importFormatSelect) return;
    const isPetri = dbViewSelect.value === 'petri';

    if (modeChanged) {
        importFormatSelect.innerHTML = '';
        importFormatSelect.appendChild(new Option('All Supported', 'all'));

        if (isPetri) {
            importFormatSelect.appendChild(new Option('Only .pnh (Built-in)', '.pnh'));
            importFormatSelect.appendChild(new Option('Only .pnml / .xml (Built-in)', '.pnml'));
            importFormatSelect.appendChild(new Option('Only .json (Built-in)', '.json'));
        } else {
            importFormatSelect.appendChild(new Option('Only .json', '.json'));
            importFormatSelect.appendChild(new Option('Only .gml', '.gml'));
            importFormatSelect.appendChild(new Option('Only .graphml', '.graphml'));
            importFormatSelect.appendChild(new Option('Only .edgelist', '.edgelist'));
        }
        updateImportFormatDropdown();
    }

    const selectedFormat = importFormatSelect.value;
    let acceptStr = '';

    if (selectedFormat === 'all') {
        acceptStr = isPetri ? PETRI_EXTENSIONS.join(',') : GRAPH_EXTENSIONS.join(',');
    } else if (selectedFormat === '.pnml') {
        acceptStr = '.pnml,.xml';
    } else if (selectedFormat.startsWith('custom_')) {
        acceptStr = ''; // Allow any file type for custom parsers
    } else {
        acceptStr = selectedFormat;
    }

    importNetInput.accept = acceptStr;
}

export async function loadDatabaseItems(reset = false) {
    if (isLoading || (reset ? false : !hasMore)) return;
    setIsLoading(true);

    if (reset) {
        setCurrentPage(1);
        setCurrentNets([]);
        setAllLoadedNets([]);
        selectedNetIds.clear();
        updateBulkDeleteButton();
        setHasMore(true);
        if (observer && sentinel) observer.unobserve(sentinel);
        if (sentinel && sentinel.parentNode) sentinel.remove();
        if (dbGrid) dbGrid.innerHTML = '';
        if (dbStats) dbStats.textContent = 'Loading...';
    }

    const query = dbSearchInput ? dbSearchInput.value : '';
    const sort = dbSortSelect ? dbSortSelect.value : 'date_desc';
    const viewMode = dbViewSelect ? dbViewSelect.value : 'petri';

    try {
        let newNets = [];
        let total = 0;
        let totalDb = 0;

        if (viewMode === 'petri') {
            const params = new URLSearchParams({
                page: currentPage,
                per_page: itemsPerPage,
                q: query,
                sort: sort
            });

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

            if (dbFilterModelClass && dbFilterModelClass.value) params.set('class', dbFilterModelClass.value);
            if (dbFilterMetaSearch && dbFilterMetaSearch.value) params.set('meta_search', dbFilterMetaSearch.value);
            if (dbFilterMetaRegex && dbFilterMetaRegex.value) params.set('meta_regex', dbFilterMetaRegex.value);

            const response = await fetch(`/api/petri/saved?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch nets');

            const data = await response.json();
            newNets = data.nets || [];
            total = data.total || 0;
            totalDb = data.total_db || total; // Set totalDb for Petri view

            document.querySelectorAll('.filter-unit').forEach(el => el.style.opacity = '1');
            document.querySelectorAll('.class-input-group').forEach(el => el.style.display = 'flex');
        } else {
            document.querySelectorAll('.filter-unit').forEach(el => el.style.opacity = '0.3');
            document.querySelectorAll('.class-input-group').forEach(el => el.style.display = 'none');

            const response = await fetch('/api/graphs');
            if (!response.ok) throw new Error('Failed to fetch graphs');

            const data = await response.json();
            totalDb = data.length; // Set totalDb for Graphs view (total items in DB)
            let filtered = data;
            if (query) {
                filtered = filtered.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));
            }
            if (sort === 'date_desc') filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            else if (sort === 'date_asc') filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            else if (sort === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));

            total = filtered.length;

            const startIndex = (currentPage - 1) * itemsPerPage;
            newNets = filtered.slice(startIndex, startIndex + itemsPerPage);
        }

        if (reset && dbGrid) dbGrid.innerHTML = '';

        if (sentinel && sentinel.parentNode) sentinel.remove();
        if (observer && sentinel) observer.unobserve(sentinel);

        const updatedNets = reset ? newNets : [...currentNets, ...newNets];
        setCurrentNets(updatedNets);
        setAllLoadedNets(updatedNets);
        renderNewItems(newNets, viewMode);

        if (dbStats) {
            dbStats.innerHTML = `${updatedNets.length} / ${total} <span style="font-size: 0.9em; opacity: 0.6; margin-left: 5px;">(${totalDb} total)</span>`;
        }

        if (updatedNets.length >= total || newNets.length < itemsPerPage) {
            setHasMore(false);
        } else {
            setCurrentPage(currentPage + 1);
            if (dbGrid && sentinel && observer) {
                dbGrid.appendChild(sentinel);
                observer.observe(sentinel);
            }
        }

        if (updatedNets.length === 0 && dbGrid) {
            dbGrid.innerHTML = '<div class="empty-state">No matching nets found.</div>';
        }

    } catch (err) {
        console.error("[DB] Error fetching nets:", err);
        if (reset && dbGrid) {
            dbGrid.innerHTML = `<div class="empty-state error">Error: ${err.message}</div>`;
        }
    } finally {
        setIsLoading(false);
    }
}

function clearDatabaseFilters() {
    if (dbPropFiltersContainer) {
        dbPropFiltersContainer.querySelectorAll('.petri-prop-filter-row').forEach(r => r.remove());
        const emptyMsg = document.getElementById('dbPropFiltersEmpty');
        if (emptyMsg) emptyMsg.style.display = 'block';
    }
    if (dbFilterModelClass) dbFilterModelClass.value = '';
    if (dbFilterMetaSearch) dbFilterMetaSearch.value = '';
    if (dbFilterMetaRegex) dbFilterMetaRegex.value = '';

    updateFilterBadge();
    loadDatabaseItems(true);
}

function updateFilterBadge() {
    if (!dbActiveFiltersIndicator || !dbActiveFiltersCount || !btnDbClearFiltersToolbar) return;

    let count = 0;
    const filterRows = document.querySelectorAll('.petri-prop-filter-row');
    filterRows.forEach(row => {
        if (row.querySelector('.val-input').value !== '') count++;
    });

    if (dbFilterModelClass && dbFilterModelClass.value) count++;
    if (dbFilterMetaSearch && dbFilterMetaSearch.value) count++;
    if (dbFilterMetaRegex && dbFilterMetaRegex.value) count++;

    if (count > 0) {
        dbActiveFiltersIndicator.style.display = 'block';
        dbActiveFiltersCount.textContent = count;
        btnDbClearFiltersToolbar.style.display = 'inline-block';
    } else {
        dbActiveFiltersIndicator.style.display = 'none';
        btnDbClearFiltersToolbar.style.display = 'none';
    }
}

function collectExplorerState() {
    const propFilters = [];
    document.querySelectorAll('.petri-prop-filter-row').forEach(row => {
        const prop = row.querySelector('.prop-sel').value;
        const op = row.querySelector('.op-sel').value;
        const val = row.querySelector('.val-input').value;
        if (val !== '') {
            propFilters.push({ prop, op, val: parseInt(val, 10) });
        }
    });

    return {
        query: dbSearchInput ? dbSearchInput.value : '',
        sort: dbSortSelect ? dbSortSelect.value : 'date_desc',
        viewMode: dbViewSelect ? dbViewSelect.value : 'petri',
        modelClass: dbFilterModelClass ? dbFilterModelClass.value : '',
        metaSearch: dbFilterMetaSearch ? dbFilterMetaSearch.value : '',
        metaRegex: dbFilterMetaRegex ? dbFilterMetaRegex.value : '',
        propFilters: propFilters,
        filtersVisible: dbAdvancedFiltersPanel ? dbAdvancedFiltersPanel.style.display === 'block' : false
    };
}

async function saveExplorerState() {
    const state = collectExplorerState();
    try {
        await fetch('/api/explorer/state', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify(state)
        });
    } catch (err) {
        console.error("[Explorer] Failed to save state:", err);
    }
}

async function restoreExplorerState() {
    try {
        const response = await fetch('/api/explorer/state');
        let state = {};
        if (response.ok) {
            state = await response.json();
        }

        if (!state || Object.keys(state).length === 0) {
            loadDatabaseItems(true);
            return;
        }

        // Apply state
        if (dbSearchInput) dbSearchInput.value = state.query || '';
        if (dbSortSelect) dbSortSelect.value = state.sort || 'date_desc';
        if (dbViewSelect && state.viewMode) {
            dbViewSelect.value = state.viewMode;
            // Update tabs UI
            const tabs = document.querySelectorAll('.db-view-tab');
            tabs.forEach(t => {
                if (t.dataset.view === state.viewMode) t.classList.add('active');
                else t.classList.remove('active');
            });
        }
        if (dbFilterModelClass) dbFilterModelClass.value = state.modelClass || '';
        if (dbFilterMetaSearch) dbFilterMetaSearch.value = state.metaSearch || '';
        if (dbFilterMetaRegex) dbFilterMetaRegex.value = state.metaRegex || '';

        if (dbAdvancedFiltersPanel && typeof state.filtersVisible === 'boolean') {
            dbAdvancedFiltersPanel.style.display = state.filtersVisible ? 'block' : 'none';
            if (btnDbFilters) {
                btnDbFilters.style.background = state.filtersVisible ? 'var(--accent)' : '';
                btnDbFilters.style.color = state.filtersVisible ? 'white' : '';
            }
        }

        // Rebuild property filters
        if (dbPropFiltersContainer && state.propFilters) {
            dbPropFiltersContainer.querySelectorAll('.petri-prop-filter-row').forEach(r => r.remove());
            const emptyMsg = document.getElementById('dbPropFiltersEmpty');
            if (emptyMsg) emptyMsg.style.display = state.propFilters.length > 0 ? 'none' : 'block';

            state.propFilters.forEach(f => {
                const row = document.createElement('div');
                row.className = 'petri-prop-filter-row';
                row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 5px;';
                row.innerHTML = `
                    <select class="prop-sel" style="flex: 2; padding: 6px; background: #000; border: 1px solid #333; color: #fff; border-radius: 4px; font-size: 12px;">
                        <option value="places" ${f.prop === 'places' ? 'selected' : ''}>Places (P)</option>
                        <option value="transitions" ${f.prop === 'transitions' ? 'selected' : ''}>Transitions (T)</option>
                        <option value="arcs" ${f.prop === 'arcs' ? 'selected' : ''}>Arcs (A)</option>
                        <option value="tokens" ${f.prop === 'tokens' ? 'selected' : ''}>Tokens (K)</option>
                    </select>
                    <select class="op-sel" style="flex: 1; padding: 6px; background: #000; border: 1px solid #333; color: #fff; border-radius: 4px; font-size: 12px;">
                        <option value=">=" ${f.op === '>=' ? 'selected' : ''}>≥</option>
                        <option value="<=" ${f.op === '<=' ? 'selected' : ''}>≤</option>
                        <option value="==" ${f.op === '==' ? 'selected' : ''}>=</option>
                    </select>
                    <input type="number" class="val-input" min="0" value="${f.val}" style="flex: 2; padding: 6px; background: #000; border: 1px solid #333; color: #fff; border-radius: 4px; font-size: 12px;">
                    <button class="btn-delete-row" style="background: none; border: none; color: #f66; cursor: pointer; padding: 4px; font-size: 16px;">✕</button>
                `;
                row.querySelector('.btn-delete-row').addEventListener('click', () => {
                    row.remove();
                    if (dbPropFiltersContainer.querySelectorAll('.petri-prop-filter-row').length === 0) {
                        if (emptyMsg) emptyMsg.style.display = 'block';
                    }
                    saveExplorerState();
                });

                // Auto-save on row changes
                row.querySelectorAll('select, input').forEach(el => {
                    el.addEventListener('change', () => saveExplorerState());
                    if (el.tagName === 'INPUT') {
                        el.addEventListener('input', () => saveExplorerState());
                    }
                });

                dbPropFiltersContainer.appendChild(row);
            });
        }

        updateFilterBadge();
        loadDatabaseItems(true);
    } catch (err) {
        console.error("[Explorer] Failed to restore state:", err);
        loadDatabaseItems(true);
    }
}
