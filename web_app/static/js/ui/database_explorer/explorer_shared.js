/**
 * explorer_shared.js — Shared mutable state for database explorer module.
 */

import { state } from '../../core/state.js';
import { updateStats, showCustomModal } from '../ui.js';
import { savePetriNetDb, loadPetriNetFromDb } from '../../core/storage.js';

// DOM Elements (set during init)
export let viewDatabaseExplorer, dbGrid, dbSearchInput, dbSortSelect, btnRefreshDb, dbViewSelect;
export let dbMinP, dbMinT, dbMinA, dbMinK, dbModelClass;
export let importNetInput, importFolderInput;
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

export function setDomRefs(refs) {
    viewDatabaseExplorer = refs.viewDatabaseExplorer;
    dbGrid = refs.dbGrid;
    dbSearchInput = refs.dbSearchInput;
    dbSortSelect = refs.dbSortSelect;
    btnRefreshDb = refs.btnRefreshDb;
    dbViewSelect = refs.dbViewSelect;
    dbMinP = refs.dbMinP;
    dbMinT = refs.dbMinT;
    dbMinA = refs.dbMinA;
    dbMinK = refs.dbMinK;
    dbModelClass = refs.dbModelClass;
    importNetInput = refs.importNetInput;
    importFolderInput = refs.importFolderInput;
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
