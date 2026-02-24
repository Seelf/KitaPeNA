/**
 * database_explorer/index.js — Barrel file re-exporting the public API.
 *
 * The database explorer module has been decomposed into:
 *  - explorer_shared.js     — Shared state, DOM refs, CSRF helper
 *  - explorer_init.js       — Initialization, pagination, data loading
 *  - explorer_cards.js      — Card rendering for nets and graphs
 *  - explorer_actions.js    — CRUD, selection, bulk operations
 *  - explorer_import.js     — File import and drag-and-drop
 *  - explorer_converters.js — PNH/PNML parsers and converters
 */

export { initDatabaseExplorer, openDatabaseExplorer } from './explorer_init.js';
