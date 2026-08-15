/**
 * Scan orchestrator — the content script's bridge between the DOM scan, the
 * Comlink analysis worker (L2 memo), and the side panel.
 *
 * Progressive reveal: each analysis unit streams into the panel via storage
 * events (colors → typography → scales → structure), so sections appear as
 * they complete instead of one blocking spinner.
 *
 * L2 / stale-while-revalidate (Section 2.3): units are memoized by content
 * hash. An unchanged page (or unchanged color/type/spacing sections) reuses
 * cached results instantly; the assembled Inspection carries `cached`/`stale`
 * flags the panel surfaces honestly.
 *
 * The analysis runs in the Comlink worker when the page allows it, and on the
 * main thread when it does not: some sites (YouTube among them) ship a CSP
 * whose `script-src` has no `blob:`, so a blob-URL worker is created but
 * never loads and every Comlink call would hang. The worker is therefore
 * health-checked before use, and `engine/analysis/pipeline.ts` — the same
 * pure pipeline the worker wraps — runs synchronously as the fallback.
 */

import * as Comlink from 'comlink';
import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '../../shared/constants';
import type {
  AssetAnalysis,
  AuditAnalysis,
  ColorAnalysis,
  ElementRef,
  ElementSample,
  FindInstancesKind,
  FindInstancesResult,
  Inspection,
  ScalesAnalysis,
  ScanPageResult,
  ScanProgressPayload,
  ScanSnapshot,
  SimilarityResult,
  StructureAnalysis,
  TypographyAnalysis,
} from '../../shared/types';
import type { AnalysisWorkerApi } from '../../workers/analysis-worker';
// The emitted URL of the analysis worker asset (Vite ?url — a static string,
// NOT import.meta.url). WXT rewrites import.meta.url to self.location.href,
// which inside a content script is the *page's* origin — constructing the
// Worker with that base made the browser fetch the worker from the page (404),
// so every scan silently hung. browser.runtime.getURL() resolves the asset
// against the extension origin instead, and the asset is declared in
// web_accessible_resources so content scripts may load it.
import analysisWorkerUrl from '../../workers/analysis-worker?worker&url';
import { styleCache } from '../css/style-cache';
import { resolveRef } from '../dom/ref';
import { contentTabId } from '../dom/tab-id';
import { buildInspection, buildScanSnapshot, partialInspection, sampleElement } from '../scan/scan';
import { computeConsistency } from '../tokens/consistency';
import { matchInstances } from '../tokens/find';
import { createAnalysisPipeline } from './pipeline';

export interface ScanHighlightSink {
  showHighlights(refs: ElementRef[], label: string): void;
  clearHighlights(): void;
}

/** A runner that never answers must fail the scan visibly — never hang it. */
const WORKER_RESPONSE_TIMEOUT_MS = 90_000;

/** How long to wait for a freshly-built worker to prove it is alive before
 *  concluding it was silently blocked (CSP) and falling back to main thread. */
const WORKER_HEALTH_TIMEOUT_MS = 2_500;

async function withResponseTimeout<T>(promise: MaybePromise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out — the analysis did not complete in time.`)),
          WORKER_RESPONSE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type MaybePromise<T> = T | Promise<T>;

/**
 * What the orchestrator calls — satisfied by both the Comlink worker remote
 * (async) and the main-thread pipeline fallback (sync). `await` works on
 * both, so call sites are identical.
 */
interface AnalysisRunner {
  setSnapshot(snapshot: ScanSnapshot): MaybePromise<{ hash: string }>;
  getSnapshotHash(): MaybePromise<string>;
  analyzeColors(): MaybePromise<ColorAnalysis>;
  analyzeTypography(): MaybePromise<TypographyAnalysis>;
  analyzeScales(): MaybePromise<ScalesAnalysis>;
  analyzeStructure(): MaybePromise<StructureAnalysis>;
  analyzeAssets(): MaybePromise<AssetAnalysis>;
  analyzeAccessibility(): MaybePromise<AuditAnalysis>;
  analyzePerformance(): MaybePromise<AuditAnalysis>;
  findSimilar(target: ElementSample): MaybePromise<SimilarityResult[]>;
}

/**
 * Prove the worker actually loaded before trusting it. A page CSP without
 * `blob:` in `script-src` (YouTube is a known case) lets `new Worker(blobUrl)`
 * succeed but the worker never executes — no Comlink reply ever arrives, so
 * without this gate every scan would hang until the response timeout. The
 * worker's `error` event fires promptly on a blocked load; a healthy worker
 * answers `ping()` immediately; silence for the health window means the load
 * was neither blocked nor fast — assume healthy and let the scan's own
 * timeout guard the rest.
 */
function probeWorkerHealth(
  worker: Worker,
  api: Comlink.Remote<AnalysisWorkerApi>,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      worker.removeEventListener('error', onError);
      clearTimeout(timer);
      resolve(ok);
    };
    const onError = (): void => finish(false);
    worker.addEventListener('error', onError);
    const timer = setTimeout(() => finish(true), WORKER_HEALTH_TIMEOUT_MS);
    void api.ping().then(
      () => finish(true),
      () => finish(false),
    );
  });
}

export class ScanOrchestrator {
  private analysisPromise: Promise<AnalysisRunner> | null = null;
  private scanning = false;
  private cancelled = false;
  private lastSnapshotHash = '';
  private lastSnapshot: Awaited<ReturnType<typeof buildScanSnapshot>> | null = null;

  constructor(private readonly highlights: ScanHighlightSink) {}

  /**
   * The analysis runner (Comlink worker, or the main-thread pipeline when the
   * page's CSP blocks blob workers) is created lazily on the first scan —
   * never eagerly per tab (content scripts construct an orchestrator on every
   * page they run in, even when the user never scans).
   */
  private getAnalysis(): Promise<AnalysisRunner> {
    if (!this.analysisPromise) {
      // The worker is preferred; the main-thread pipeline is the fallback and
      // always works, so this never rejects — the scan can only fail on the
      // analysis itself, never on finding a way to run it.
      this.analysisPromise = this.createAnalysis().catch(() => createAnalysisPipeline());
    }
    return this.analysisPromise;
  }

  /**
   * Build the Comlink worker. Chrome cannot construct a Worker from a
   * chrome-extension:// URL inside a content script — the Worker constructor
   * enforces same-origin, and web_accessible_resources only permits
   * *fetching* the script, so the URL is fetched here and the worker is built
   * from a Blob URL instead (the canonical workaround). The emitted bundle is
   * a self-contained classic script (no imports), so a classic worker is
   * sufficient.
   *
   * Some pages (YouTube…) ship a CSP whose `script-src` lacks `blob:`. The
   * blob worker is then created but never loads, and Comlink calls hang
   * forever — the health probe below catches that and falls back to running
   * the identical pipeline synchronously on the main thread, so the scan
   * still completes on those pages.
   */
  private async createAnalysis(): Promise<AnalysisRunner> {
    // The asset path is a runtime string (Vite ?worker&url), not one of WXT's
    // statically-known entrypoint paths — getURL accepts any public path at
    // runtime, so the cast is type-only.
    const scriptUrl = browser.runtime.getURL(analysisWorkerUrl as unknown as '/sidepanel.html');
    try {
      const response = await fetch(scriptUrl);
      if (!response.ok) {
        throw new Error(`The analysis worker could not be loaded (HTTP ${response.status}).`);
      }
      const source = await response.text();
      const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const worker = new Worker(workerUrl);
      // Surface worker load/runtime errors in the console (the health gate
      // below turns the load-failure case into the main-thread fallback).
      worker.addEventListener('error', (event) => {
        // eslint-disable-next-line no-console
        console.error('[vizquo] analysis worker error:', event.message ?? event);
      });
      const api = Comlink.wrap<AnalysisWorkerApi>(worker);
      const healthy = await probeWorkerHealth(worker, api);
      if (!healthy) {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        return createAnalysisPipeline();
      }
      return api;
    } catch {
      // Worker unavailable (fetch/CSP hiccup) — the main-thread pipeline is
      // the identical logic, just synchronous.
      return createAnalysisPipeline();
    }
  }

  getLastSnapshot() {
    return this.lastSnapshot;
  }

  /** Cancel the running scan (if any). The walk + phases check the flag. */
  cancelScan(): { cancelled: boolean } {
    this.cancelled = true;
    return { cancelled: true };
  }

  private async publishProgress(payload: ScanProgressPayload): Promise<void> {
    // Tab-stamped so panels on other tabs/windows ignore it (Section 7.27).
    const tabId = await contentTabId();
    void browser.storage.local.set({ [STORAGE_KEYS.scanProgress]: { ...payload, tabId } });
  }

  /** Full scan with progressive partial results + L2 flags. */
  async scanPage(): Promise<ScanPageResult> {
    if (this.scanning) {
      return { ok: false, error: 'A scan is already running for this page.' };
    }
    this.scanning = true;
    this.cancelled = false;
    const start = performance.now();
    const cancelled = (): boolean => this.cancelled;
    const finishCancelled = (): ScanPageResult => {
      this.publishProgress({
        phase: 'error',
        error: 'Scan cancelled.',
      });
      return { ok: false, error: 'Scan cancelled.' };
    };
    try {
      this.publishProgress({ phase: 'scanning' });
      const snapshot = await buildScanSnapshot((sampled, total) => {
        this.publishProgress({
          phase: 'scanning',
          inspection: { scannedElementCount: sampled },
        });
        void total;
      }, cancelled);
      if (this.cancelled) return finishCancelled();
      this.lastSnapshot = snapshot;

      // First scan picks the analysis runner: the Comlink worker when the
      // page allows blob workers, otherwise the identical pipeline on the
      // main thread (a strict page CSP used to leave this hanging — the scan
      // now works everywhere; the response timeout remains as a last resort).
      const analysis = await this.getAnalysis();
      await withResponseTimeout(
        analysis.setSnapshot(snapshot),
        'The analysis pipeline did not respond',
      );

      // Colors → Design DNA roles (fast; streams first).
      const colorAnalysis = await analysis.analyzeColors();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'colors',
        inspection: partialInspection(snapshot, { tokens: { colors: colorAnalysis.colors } }),
      });

      // Typography → hierarchy + fonts.
      const typography = await analysis.analyzeTypography();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'typography',
        inspection: partialInspection(snapshot, {
          tokens: { fonts: typography.fonts },
          typeStyles: typography.typeStyles,
        }),
      });

      // Scales → spacing / radius / shadows / gradients + outliers.
      const scales = await analysis.analyzeScales();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'scales',
        inspection: partialInspection(snapshot, {
          tokens: { spacing: scales.spacing, radius: scales.radius, shadows: scales.shadows },
          gradients: scales.gradients,
        }),
      });

      // Structure → recurring components.
      const structure = await analysis.analyzeStructure();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'structure',
        inspection: partialInspection(snapshot, { components: structure.components }),
      });

      // Assets → classified + issue-flagged (Phase 4).
      const assetAnalysis = await analysis.analyzeAssets();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'assets',
        inspection: partialInspection(snapshot, { assets: assetAnalysis.assets }),
      });

      // Audits → accessibility + performance findings (Phase 5).
      const [a11yAudit, perfAudit] = await Promise.all([
        analysis.analyzeAccessibility(),
        analysis.analyzePerformance(),
      ]);
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'audits',
        inspection: partialInspection(snapshot, {
          findings: [...a11yAudit.findings, ...perfAudit.findings],
        }),
      });

      const consistency = computeConsistency({
        colors: colorAnalysis.colors,
        typeStyles: typography.typeStyles,
        fonts: typography.fonts,
        spacing: scales.spacing,
        radius: scales.radius,
        spacingScale: scales.spacingScale,
        scaleOutliers: scales.outliers,
      });

      const durationMs = performance.now() - start;
      const hash = await analysis.getSnapshotHash();
      const cached = hash === this.lastSnapshotHash;
      const stale = !cached && this.lastSnapshotHash !== '';
      this.lastSnapshotHash = hash;

      const inspection = buildInspection({
        snapshot,
        colors: colorAnalysis.colors,
        typography,
        scales,
        structure,
        assets: assetAnalysis.assets,
        consistency,
        a11yFindings: a11yAudit.findings,
        performanceFindings: perfAudit.findings,
        durationMs,
        cached,
        stale,
      });

      this.publishProgress({ phase: 'done', inspection });
      return { ok: true, inspection };
    } catch (error) {
      this.publishProgress({
        phase: 'error',
        error: error instanceof Error ? error.message : 'The scan failed unexpectedly.',
      });
      return {
        ok: false,
        error:
          error instanceof Error
            ? `Scan failed: ${error.message}`
            : 'Scan failed. The page may have navigated mid-scan — try again.',
      };
    } finally {
      this.scanning = false;
    }
  }

  /** Find every element matching a token value and highlight it (7.8). */
  findInstances(kind: FindInstancesKind, value: string): FindInstancesResult {
    const snapshot = this.lastSnapshot;
    if (!snapshot) return { count: 0, refs: [], truncated: false };
    const { refs, count } = matchInstances(snapshot.samples, kind, value);
    this.highlights.showHighlights(refs.slice(0, 500), `${count} matches`);
    return { count, refs: refs.slice(0, 300), truncated: count > 300 };
  }

  clearHighlights(): void {
    this.highlights.clearHighlights();
  }

  /** Structurally similar elements for a ref (worker, tree-edit heuristic). */
  async findSimilar(ref: ElementRef): Promise<{ results: SimilarityResult[] }> {
    const snapshot = this.lastSnapshot;
    if (!snapshot) return { results: [] };
    const el = resolveRef(ref);
    if (!el) return { results: [] };
    // Reuse the L1 cached style — one getComputedStyle per node per pass.
    const target: ElementSample = sampleElement(el, styleCache.computedFor(el));
    const analysis = await this.getAnalysis();
    const results = await analysis.findSimilar(target);
    this.highlights.showHighlights(
      results.slice(0, 8).map((r) => r.ref),
      `${results.length} similar`,
    );
    return { results };
  }
}

export type { Inspection };
