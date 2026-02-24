/**
 * benchmarking.js — Barrel file re-exporting the public API.
 * 
 * The benchmarking module has been decomposed into:
 *  - benchmark_shared.js   — Shared mutable state
 *  - benchmark_helpers.js  — CSRF, DSPN args, search, console colorizer, logging
 *  - benchmark_state.js    — State persistence (collect/save/restore)
 *  - benchmark_init.js     — Main initialization & event wiring
 *  - benchmark_lists.js    — Algorithm/graph/petri/PNH list rendering
 *  - benchmark_regex.js    — Regex CRUD, export/import
 *  - benchmark_charts.js   — Chart.js init & update
 *  - benchmark_runner.js   — Benchmark execution orchestration
 *  - benchmark_export.js   — Results table, CSV & LaTeX export
 */

export { initBenchmarking } from './benchmark_init.js';
