/**
 * explorer_shared.js — Shared mutable state for database explorer module.
 */

import { state } from '../../core/state.js';
import { updateStats, showCustomModal } from '../ui.js';
import { savePetriNetDb, loadPetriNetFromDb } from '../../core/storage.js';

// DOM Elements (set during init)
export let viewDatabaseExplorer, dbGrid, dbSearchInput, dbSortSelect, btnRefreshDb, dbViewSelect;
export let dbAdvancedFiltersPanel, btnDbFilters, btnApplyDbFilters, btnResetDbFilters, btnAddDbPropFilter, dbPropFiltersContainer;
export let dbFilterModelClass, dbFilterMetaSearch, dbFilterMetaRegex;
export let dbActiveFiltersIndicator, dbActiveFiltersCount, btnDbClearFiltersToolbar;
export let importNetInput, importFolderInput, importFormatSelect;
export let dbStats;

// Pagination state
export let currentPage = 1;
export const itemsPerPage = 20;
export let isLoading = false;
export let hasMore = true;
export let observer = null;
export let sentinel = null;
export let selectedNetIds = new Set();
export let allLoadedNets = [];
export let currentNets = [];

// Extensions constants
export const PETRI_EXTENSIONS = ['.pnh', '.pnml', '.xml', '.json'];
export const GRAPH_EXTENSIONS = ['.json', '.gml', '.graphml', '.edgelist'];

export function setDomRefs(refs) {
    viewDatabaseExplorer = refs.viewDatabaseExplorer;
    dbGrid = refs.dbGrid;
    dbSearchInput = refs.dbSearchInput;
    dbSortSelect = refs.dbSortSelect;
    btnRefreshDb = refs.btnRefreshDb;
    dbViewSelect = refs.dbViewSelect;

    dbAdvancedFiltersPanel = refs.dbAdvancedFiltersPanel;
    btnDbFilters = refs.btnDbFilters;
    btnApplyDbFilters = refs.btnApplyDbFilters;
    btnResetDbFilters = refs.btnResetDbFilters;
    btnAddDbPropFilter = refs.btnAddDbPropFilter;
    dbPropFiltersContainer = refs.dbPropFiltersContainer;
    dbFilterModelClass = refs.dbFilterModelClass;
    dbFilterMetaSearch = refs.dbFilterMetaSearch;
    dbFilterMetaRegex = refs.dbFilterMetaRegex;
    dbActiveFiltersIndicator = refs.dbActiveFiltersIndicator;
    dbActiveFiltersCount = refs.dbActiveFiltersCount;
    btnDbClearFiltersToolbar = refs.btnDbClearFiltersToolbar;

    importNetInput = refs.importNetInput;
    importFolderInput = refs.importFolderInput;
    importFormatSelect = refs.importFormatSelect;
    dbStats = refs.dbStats;
}

export function setSentinel(el) { sentinel = el; }
export function setObserver(obs) { observer = obs; }
export function setCurrentPage(val) { currentPage = val; }
export function setIsLoading(val) { isLoading = val; }
export function setHasMore(val) { hasMore = val; }
export function setCurrentNets(val) { currentNets = val; }
export function setAllLoadedNets(val) { allLoadedNets = val; }

export function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
}

// Re-export dependencies
export { state, updateStats, showCustomModal, savePetriNetDb, loadPetriNetFromDb };
