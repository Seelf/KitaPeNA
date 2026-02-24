/**
 * explorer_init.js — Initialization and data loading for the database explorer.
 */

import {
    viewDatabaseExplorer, dbGrid, dbSearchInput, dbSortSelect, btnRefreshDb, dbViewSelect,
    dbMinP, dbMinT, dbMinA, dbMinK, dbModelClass,
    importNetInput, importFolderInput, importFormatSelect, dbStats,
    currentPage, itemsPerPage, isLoading, hasMore, observer, sentinel,
    selectedNetIds, allLoadedNets, currentNets,
    PETRI_EXTENSIONS, GRAPH_EXTENSIONS,
    setDomRefs, setSentinel, setObserver, setCurrentPage, setIsLoading,
    setHasMore, setCurrentNets, setAllLoadedNets
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
        dbMinP: document.getElementById('dbMinP'),
        dbMinT: document.getElementById('dbMinT'),
        dbMinA: document.getElementById('dbMinA'),
        dbMinK: document.getElementById('dbMinK'),
        dbModelClass: document.getElementById('dbModelClass'),
        dbViewSelect: document.getElementById('dbViewSelect'),
        importFormatSelect: document.getElementById('importFormatSelect')
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
            debounceTimer = setTimeout(() => loadDatabaseItems(true), 400);
        });
    }

    if (refs.dbSortSelect) {
        refs.dbSortSelect.addEventListener('change', () => loadDatabaseItems(true));
    }

    if (refs.dbViewSelect) {
        refs.dbViewSelect.addEventListener('change', () => {
            updateImportAcceptFilters(true);
            loadDatabaseItems(true);
        });
    }

    if (refs.importFormatSelect) {
        refs.importFormatSelect.addEventListener('change', () => updateImportAcceptFilters(false));
    }

    [refs.dbMinP, refs.dbMinT, refs.dbMinA, refs.dbMinK, refs.dbModelClass].forEach(el => {
        if (el) el.addEventListener('change', () => loadDatabaseItems(true));
    });

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

    updateImportAcceptFilters(true);
}

export function openDatabaseExplorer() {
    if (!viewDatabaseExplorer) return;
    viewDatabaseExplorer.style.display = 'flex';
    loadDatabaseItems(true);
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
        importFormatSelect.appendChild(new Option('Wszystkie dozwolone', 'all'));

        if (isPetri) {
            importFormatSelect.appendChild(new Option('Tylko .pnh', '.pnh'));
            importFormatSelect.appendChild(new Option('Tylko .pnml / .xml', '.pnml'));
            importFormatSelect.appendChild(new Option('Tylko .json', '.json'));
        } else {
            importFormatSelect.appendChild(new Option('Tylko .json', '.json'));
            importFormatSelect.appendChild(new Option('Tylko .gml', '.gml'));
            importFormatSelect.appendChild(new Option('Tylko .graphml', '.graphml'));
            importFormatSelect.appendChild(new Option('Tylko .edgelist', '.edgelist'));
        }
    }

    const selectedFormat = importFormatSelect.value;
    let acceptStr = '';

    if (selectedFormat === 'all') {
        acceptStr = isPetri ? PETRI_EXTENSIONS.join(',') : GRAPH_EXTENSIONS.join(',');
    } else if (selectedFormat === '.pnml') {
        acceptStr = '.pnml,.xml';
    } else {
        acceptStr = selectedFormat;
    }

    importNetInput.accept = acceptStr;
}

export async function loadDatabaseItems(reset = false) {
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

    if (isLoading || !hasMore) return;
    setIsLoading(true);

    const query = dbSearchInput ? dbSearchInput.value : '';
    const sort = dbSortSelect ? dbSortSelect.value : 'date_desc';
    const viewMode = dbViewSelect ? dbViewSelect.value : 'petri';

    try {
        let newNets = [];
        let total = 0;

        if (viewMode === 'petri') {
            const params = new URLSearchParams({
                page: currentPage,
                per_page: itemsPerPage,
                q: query,
                sort: sort
            });

            if (dbMinP && dbMinP.value) params.append('min_p', dbMinP.value);
            if (dbMinT && dbMinT.value) params.append('min_t', dbMinT.value);
            if (dbMinA && dbMinA.value) params.append('min_a', dbMinA.value);
            if (dbMinK && dbMinK.value) params.append('min_k', dbMinK.value);
            if (dbModelClass && dbModelClass.value) params.append('class', dbModelClass.value);

            const response = await fetch(`/api/petri/saved?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch nets');

            const data = await response.json();
            newNets = data.nets || [];
            total = data.total || 0;

            document.querySelectorAll('.filter-unit').forEach(el => el.style.opacity = '1');
            document.querySelectorAll('.class-input-group').forEach(el => el.style.display = 'flex');
        } else {
            document.querySelectorAll('.filter-unit').forEach(el => el.style.opacity = '0.3');
            document.querySelectorAll('.class-input-group').forEach(el => el.style.display = 'none');

            const response = await fetch('/api/graphs');
            if (!response.ok) throw new Error('Failed to fetch graphs');

            const data = await response.json();
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
            dbStats.textContent = `${updatedNets.length} / ${total} nets`;
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
