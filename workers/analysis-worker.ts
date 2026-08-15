/**
 * Analysis worker (Section 2: heavy compute never blocks the content-script or
 * panel thread) — Comlink-wrapped. The pipeline itself lives in
 * `engine/analysis/pipeline.ts` (pure, environment-agnostic), and the same
 * code runs synchronously on the main thread as the fallback for sites whose
 * CSP blocks `blob:` workers (e.g. YouTube). This file only bridges the
 * pipeline to Comlink.
 */
import * as Comlink from 'comlink';
import { type AnalysisPipeline, createAnalysisPipeline } from '../engine/analysis/pipeline';

/** The RPC surface the content script wraps with Comlink. */
export type AnalysisWorkerApi = AnalysisPipeline;

const api = createAnalysisPipeline();
Comlink.expose(api);
