/**
 * benchmark_shared.js — Shared mutable state for the benchmarking module.
 * All modules import from here to avoid circular dependencies.
 */

export let perfCharts = {};
export let abortBenchmark = false;
export let isBenchmarking = false;
export let benchmarkResultsData = [];
export let rawBenchmarkChunks = [];
export let lastBenchmarkPayload = null;
export let regexCache = [];

export const benchmarkUrl = '/api/benchmark';

// Setters for mutable state (needed by modules that reassign)
export function setPerfCharts(val) { perfCharts = val; }
export function setAbortBenchmark(val) { abortBenchmark = val; }
export function setIsBenchmarking(val) { isBenchmarking = val; }
export function setBenchmarkResultsData(val) { benchmarkResultsData = val; }
export function setRawBenchmarkChunks(val) { rawBenchmarkChunks = val; }
export function setLastBenchmarkPayload(val) { lastBenchmarkPayload = val; }
export function setRegexCache(val) { regexCache = val; }
