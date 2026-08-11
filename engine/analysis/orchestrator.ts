/**
 * Scan orchestrator — the content script's bridge between the DOM scan, the
 * Comlink analysis worker (L2 memo), and the side panel.
 *
 * Progressive reveal: each analysis unit streams into the panel via storage
 * events (colors → typography → scales → structure), so sections appear as
 * they complete instead of one blocking spinner.
 *
 * L2 / stale-while-revalidate (Section 2.3): units are memoized inside the
 * worker by content hash. An unchanged page (or unchanged color/type/spacing
 * sections) reuses cached results instantly; the assembled Inspection carries
 * `cached`/`stale` flags the panel surfaces honestly.
 */

import * as Comlink from 'comlink';
import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '../../shared/constants';
import type {
  ElementRef,
  ElementSample,
  FindInstancesKind,
  FindInstancesResult,
  Inspection,
  ScanPageResult,
  ScanProgressPayload,
  SimilarityResult,
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

export interface ScanHighlightSink {
  showHighlights(refs: ElementRef[], label: string): void;
  clearHighlights(): void;
}

/** A worker that never answers must fail the scan visibly — never hang it. */
const WORKER_RESPONSE_TIMEOUT_MS = 90_000;

async function withResponseTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out — the page may block web workers.`)),
          WORKER_RESPONSE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class ScanOrchestrator {
  private workerPromise: Promise<Comlink.Remote<AnalysisWorkerApi>> | null = null;
  private scanning = false;
  private cancelled = false;
  private lastSnapshotHash = '';
  private lastSnapshot: Awaited<ReturnType<typeof buildScanSnapshot>> | null = null;

  constructor(private readonly highlights: ScanHighlightSink) {}

  /**
   * The analysis worker is created lazily on the first scan — never eagerly
   * per tab (content scripts construct an orchestrator on every page they
   * run in, even when the user never scans).
   *
   * Chrome cannot construct a Worker from a chrome-extension:// URL inside a
   * content script — the Worker constructor enforces same-origin, and
   * web_accessible_resources only permits *fetching* the script, so the URL
   * is fetched here and the worker is built from a Blob URL instead (the
   * canonical workaround). The emitted bundle is a self-contained classic
   * script (no imports), so a classic worker is sufficient.
   */
  private getWorker(): Promise<Comlink.Remote<AnalysisWorkerApi>> {
    if (!this.workerPromise) {
      this.workerPromise = this.createWorker().catch((error) => {
        // A failed creation must not brick the page for its whole lifetime:
        // reset so the next scan retries (the failure is likely transient —
        // e.g. a momentary fetch/CSP hiccup), then re-throw for the caller.
        this.workerPromise = null;
        throw error;
      });
    }
    return this.workerPromise;
  }

  private async createWorker(): Promise<Comlink.Remote<AnalysisWorkerApi>> {
    // The asset path is a runtime string (Vite ?worker&url), not one of WXT's
    // statically-known entrypoint paths — getURL accepts any public path at
    // runtime, so the cast is type-only.
    const scriptUrl = browser.runtime.getURL(analysisWorkerUrl as unknown as '/sidepanel.html');
    const response = await fetch(scriptUrl);
    if (!response.ok) {
      throw new Error(
        `The analysis worker could not be loaded (HTTP ${response.status}). ` +
          'A strict Content-Security-Policy on this page may block web workers.',
      );
    }
    const source = await response.text();
    const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    // Surface worker load/runtime errors in the panel instead of letting
    // Comlink calls hang forever on a dead worker.
    worker.addEventListener('error', (event) => {
      // eslint-disable-next-line no-console
      console.error('[vizquo] analysis worker error:', event.message ?? event);
    });
    return Comlink.wrap<AnalysisWorkerApi>(worker);
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

      // First scan creates the worker (fetch + Blob URL). A page CSP that
      // forbids blob: workers surfaces here as a clean error instead of a
      // hung scan; the response timeout turns a dead-but-loaded worker into
      // a visible error rather than an infinite spinner.
      const worker = await this.getWorker();
      await withResponseTimeout(
        worker.setSnapshot(snapshot),
        'The analysis worker did not respond',
      );

      // Colors → Design DNA roles (fast; streams first).
      const colorAnalysis = await worker.analyzeColors();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'colors',
        inspection: partialInspection(snapshot, { tokens: { colors: colorAnalysis.colors } }),
      });

      // Typography → hierarchy + fonts.
      const typography = await worker.analyzeTypography();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'typography',
        inspection: partialInspection(snapshot, {
          tokens: { fonts: typography.fonts },
          typeStyles: typography.typeStyles,
        }),
      });

      // Scales → spacing / radius / shadows / gradients + outliers.
      const scales = await worker.analyzeScales();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'scales',
        inspection: partialInspection(snapshot, {
          tokens: { spacing: scales.spacing, radius: scales.radius, shadows: scales.shadows },
          gradients: scales.gradients,
        }),
      });

      // Structure → recurring components.
      const structure = await worker.analyzeStructure();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'structure',
        inspection: partialInspection(snapshot, { components: structure.components }),
      });

      // Assets → classified + issue-flagged (Phase 4).
      const assetAnalysis = await worker.analyzeAssets();
      if (this.cancelled) return finishCancelled();
      this.publishProgress({
        phase: 'assets',
        inspection: partialInspection(snapshot, { assets: assetAnalysis.assets }),
      });

      // Audits → accessibility + performance findings (Phase 5).
      const [a11yAudit, perfAudit] = await Promise.all([
        worker.analyzeAccessibility(),
        worker.analyzePerformance(),
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
      const hash = await worker.getSnapshotHash();
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
    const worker = await this.getWorker();
    const results = await worker.findSimilar(target);
    this.highlights.showHighlights(
      results.slice(0, 8).map((r) => r.ref),
      `${results.length} similar`,
    );
    return { results };
  }
}

export type { Inspection };
