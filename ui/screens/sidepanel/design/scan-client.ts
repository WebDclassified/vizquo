/**
 * Scan client — the side panel's bridge to the content-script scan pipeline.
 *
 * The scan itself runs in the content script + analysis worker; progress is
 * streamed here via storage events (progressive section reveal) and the final
 * Inspection arrives over the typed bus. Find-instances/similar highlighting
 * and multi-selection also flow through this module.
 */
import { INSPECTION_SCHEMA_VERSION, STORAGE_KEYS } from '../../../../shared/constants';
import { sendMessage } from '../../../../shared/messages';
import { isForTab } from '../../../../shared/tab-isolation';
import type {
  ElementRef,
  FindInstancesKind,
  HistoryEntry,
  Inspection,
  PartialInspection,
  ScanPhase,
  SimilarityResult,
} from '../../../../shared/types';
import { normalizeCacheUrl } from '../../../../shared/url';
import { repository } from '../../../../storage';
import { makeCacheKey } from '../../../../storage/adapters/indexeddb/cache';
import {
  analysis,
  mergePartialInspection,
  type SectionStatus,
  setAnalysis,
} from '../../../stores/analysis-store';
import { notify } from '../../../stores/toast';
import { ui } from '../../../stores/ui-store';

let tabId: number | undefined;

export function setScanTabId(id: number | undefined): void {
  tabId = id;
}

const PHASE_TO_SECTION: Partial<
  Record<ScanPhase, { key: keyof typeof analysis.progress; status: SectionStatus }>
> = {
  scanning: { key: 'colors', status: 'scanning' },
  colors: { key: 'colors', status: 'done' },
  typography: { key: 'typography', status: 'done' },
  scales: { key: 'spacing', status: 'done' },
  structure: { key: 'components', status: 'done' },
  assets: { key: 'assets', status: 'done' },
  audits: { key: 'audits', status: 'done' },
  responsive: { key: 'responsive', status: 'done' },
  technology: { key: 'technology', status: 'done' },
  done: { key: 'technology', status: 'done' },
};

/** Handle scan-progress + multi-selection storage events from the page. */
export function handleScanStorageChange(
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
): void {
  if (STORAGE_KEYS.scanProgress in changes) {
    const raw = changes[STORAGE_KEYS.scanProgress]?.newValue as
      | {
          phase: ScanPhase;
          inspection?: PartialInspection;
          error?: string;
          tabId?: number;
        }
      | undefined;
    if (!raw) return;
    // Progress is stamped with its producing tab — ignore other tabs' scans.
    if (!isForTab(raw.tabId, tabId)) return;
    if (raw.inspection) mergePartialInspection(raw.inspection);
    applyPhase(raw.phase, raw.error);
  }
  if (STORAGE_KEYS.multiSelectionChanged in changes) {
    const raw = changes[STORAGE_KEYS.multiSelectionChanged]?.newValue as
      | { refs?: ElementRef[]; tabId?: number }
      | ElementRef[]
      | undefined;
    const refs = Array.isArray(raw) ? raw : raw?.refs;
    if (!isForTab(Array.isArray(raw) ? undefined : raw?.tabId, tabId)) return;
    setAnalysis('multiRefs', Array.isArray(refs) ? refs : []);
    setAnalysis('multiSummary', null);
    if (Array.isArray(refs) && refs.length >= 2) void fetchMultiSummary();
  }
}

function applyPhase(phase: ScanPhase, error?: string): void {
  if (phase === 'error') {
    setAnalysis('scanning', false);
    setAnalysis('scanError', error ?? 'The scan failed.');
    return;
  }
  if (phase === 'done') {
    setAnalysis('scanning', false);
    setAnalysis('scanError', null);
    setAnalysis('lastScanAt', Date.now());
    setAnalysis('progress', {
      colors: 'done',
      typography: 'done',
      spacing: 'done',
      components: 'done',
      assets: 'done',
      audits: 'done',
      responsive: 'done',
      technology: 'done',
    });
    return;
  }
  const mapping = PHASE_TO_SECTION[phase];
  if (mapping) {
    setAnalysis('progress', mapping.key, mapping.status);
  }
}

/** A real web page whose content script can host a scan. */
function isScannableUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Rough size of a serialized inspection — used for the L3 cache budget. */
function estimateSizeBytes(inspection: Inspection): number {
  try {
    return new Blob([JSON.stringify(inspection)]).size;
  } catch {
    return 0;
  }
}

/**
 * L3 cache probe (Section 2.3): is this the same page we scanned before?
 * Returns the newest cached inspection for the URL with its fingerprint.
 * Runs entirely in the panel (extension origin) — the page never sees it.
 */
async function probeL3Cache(url: string): Promise<{
  entry: { data: Inspection; fingerprint: string } | null;
  fingerprint: string;
}> {
  try {
    const result = await sendMessage('GET_PAGE_FINGERPRINT', undefined, tabId);
    const fingerprint = result.fingerprint;
    let entry: { data: Inspection; fingerprint: string } | null = null;
    try {
      const rows = await repository.listCacheEntries();
      const candidates = rows
        .filter(
          (row) =>
            row.kind === 'inspection' &&
            row.url &&
            normalizeCacheUrl(row.url) === normalizeCacheUrl(url),
        )
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
      const newest = candidates[0];
      if (newest) {
        entry = { data: newest.data as Inspection, fingerprint: newest.fingerprint };
      }
    } catch {
      entry = null;
    }
    return { entry, fingerprint };
  } catch {
    // Content script unreachable — a full scan would fail anyway; let the
    // normal scan path surface the honest error.
    return { entry: null, fingerprint: '' };
  }
}

/** Persist a finished scan to the L3 cache + history (best-effort). */
async function persistScan(
  inspection: Inspection,
  url: string,
  fingerprint: string,
): Promise<void> {
  try {
    await repository.putCacheEntry({
      key: makeCacheKey(url, fingerprint),
      kind: 'inspection',
      url,
      fingerprint,
      schemaVersion: INSPECTION_SCHEMA_VERSION,
      createdAt: inspection.createdAt,
      lastAccessedAt: Date.now(),
      sizeBytes: estimateSizeBytes(inspection),
      data: inspection,
    });
    await repository.saveInspection(inspection);
    await upsertHistory(inspection);
  } catch {
    // Storage failures never break the scan itself — the panel still shows
    // the fresh inspection, just without persistence.
  }
}

/**
 * History upsert: one entry per URL (the newest scan replaces the previous
 * entry for that page, keeping its pinned flag), capped at 50 entries.
 */
async function upsertHistory(inspection: Inspection): Promise<void> {
  const normalized = normalizeCacheUrl(inspection.page.url);
  const existing = (await repository.listHistory())
    .filter((entry) => normalizeCacheUrl(entry.page.url) === normalized)
    .sort((a, b) => b.scannedAt - a.scannedAt)[0];
  const entry: HistoryEntry = existing
    ? { ...existing, inspectionId: inspection.id, page: inspection.page, scannedAt: Date.now() }
    : {
        id: `${inspection.page.url}|${Date.now()}`,
        inspectionId: inspection.id,
        page: inspection.page,
        scannedAt: Date.now(),
        pinned: false,
      };
  await repository.saveHistory(entry);

  // Cap: keep the 50 most recent, never deleting pinned entries.
  const all = await repository.listHistory();
  const pinned = all.filter((h) => h.pinned);
  const unpinned = all.filter((h) => !h.pinned).sort((a, b) => b.scannedAt - a.scannedAt);
  const toDelete = unpinned.slice(50);
  for (const doomed of toDelete) {
    if (!pinned.some((p) => p.id === doomed.id)) {
      await repository.deleteHistory(doomed.id);
    }
  }
}

export async function scanPage(forceRescan = false): Promise<void> {
  if (tabId == null) return;
  // Extension pages (options, this panel) host no content script — say so
  // instead of letting the message round-trip fail opaquely.
  if (!isScannableUrl(ui.connection.tabUrl)) {
    setAnalysis('scanning', false);
    setAnalysis('scanError', 'Nothing to scan — open a website to inspect it.');
    return;
  }
  setAnalysis('scanning', true);
  setAnalysis('scanError', null);

  // L3 fast path: an unchanged page loads from the persistent cache without
  // re-running the engine (DoD: near-instant reopen). The "Cached — rescan?"
  // affordance calls scanPage(true) to force a fresh scan.
  const tabUrl = ui.connection.tabUrl;
  if (!tabUrl) {
    setAnalysis('scanning', false);
    setAnalysis('scanError', 'The page URL is unavailable — reopen the panel and try again.');
    return;
  }
  const { entry, fingerprint } = await probeL3Cache(tabUrl);
  let servedStale = false;
  if (entry && !forceRescan) {
    const served = entry.data;
    if (entry.fingerprint === fingerprint) {
      setAnalysis('inspection', { ...served, cached: true, stale: false });
      setAnalysis('scanning', false);
      setAnalysis('scanError', null);
      setAnalysis('lastScanAt', Date.now());
      return;
    }
    // Page changed since the last scan: serve the cached result immediately
    // (stale-while-revalidate) and let the fresh scan replace it in place.
    setAnalysis('inspection', { ...served, cached: true, stale: true });
    servedStale = true;
  }

  // A genuinely fresh scan (no cache entry) clears the old inspection so the
  // skeleton reveals progressively; a stale-serve keeps the visible result
  // until the fresh one lands.
  if (!servedStale && !forceRescan) setAnalysis('inspection', null);
  setAnalysis('progress', {
    colors: 'scanning',
    typography: 'pending',
    spacing: 'pending',
    components: 'pending',
    assets: 'pending',
    audits: 'pending',
    responsive: 'pending',
    technology: 'pending',
  });
  try {
    const result = await sendMessage('SCAN_PAGE', undefined, tabId);
    if (result.ok) {
      setAnalysis('inspection', result.inspection);
      setAnalysis('scanning', false);
      setAnalysis('scanError', null);
      setAnalysis('lastScanAt', Date.now());
      setAnalysis('cached', result.inspection.cached);
      setAnalysis('stale', result.inspection.stale);
      if (fingerprint) void persistScan(result.inspection, tabUrl, fingerprint);
    } else {
      setAnalysis('scanning', false);
      setAnalysis('scanError', result.error);
    }
  } catch {
    setAnalysis('scanning', false);
    setAnalysis(
      'scanError',
      'The page did not answer the scan request. Grant access and try again.',
    );
  }
}

export async function findInstances(kind: FindInstancesKind, value: string): Promise<number> {
  if (tabId == null || !isScannableUrl(ui.connection.tabUrl)) return 0;
  try {
    const result = await sendMessage('FIND_INSTANCES', { kind, value }, tabId);
    notify({
      title: `${result.count} instance${result.count === 1 ? '' : 's'} found`,
      description: result.truncated
        ? 'Highlighted the first 300 on the page.'
        : 'Press Esc to clear.',
      tone: result.count > 0 ? 'success' : 'neutral',
    });
    return result.count;
  } catch {
    notify({ title: 'Find instances failed', tone: 'warning' });
    return 0;
  }
}

/** Highlight the given refs on the page (component instances, collection items). */
export async function highlightRefs(refs: ElementRef[], label: string): Promise<void> {
  if (tabId == null || !isScannableUrl(ui.connection.tabUrl) || refs.length === 0) return;
  try {
    await sendMessage('HIGHLIGHT_REFS', { refs, label }, tabId);
  } catch {
    // Best-effort.
  }
}

export async function clearHighlights(): Promise<void> {
  if (tabId == null || !isScannableUrl(ui.connection.tabUrl)) return;
  try {
    await sendMessage('CLEAR_HIGHLIGHTS', undefined, tabId);
  } catch {
    // Best-effort.
  }
}

export async function findSimilar(ref: ElementRef): Promise<SimilarityResult[]> {
  if (tabId == null || !isScannableUrl(ui.connection.tabUrl)) return [];
  try {
    const result = await sendMessage('FIND_SIMILAR', { ref }, tabId);
    notify({
      title: `${result.results.length} similar elements highlighted`,
      description: 'Structurally similar candidates, best first.',
      tone: result.results.length > 0 ? 'success' : 'neutral',
    });
    return result.results;
  } catch {
    notify({ title: 'Find similar failed', tone: 'warning' });
    return [];
  }
}

export async function fetchMultiSummary(): Promise<void> {
  if (tabId == null || !isScannableUrl(ui.connection.tabUrl)) return;
  try {
    const summary = await sendMessage('GET_MULTI_SUMMARY', undefined, tabId);
    setAnalysis('multiSummary', summary);
  } catch {
    setAnalysis('multiSummary', null);
  }
}

export async function clearMultiSelection(): Promise<void> {
  if (tabId == null || !isScannableUrl(ui.connection.tabUrl)) return;
  try {
    await sendMessage('CLEAR_MULTI_SELECTION', undefined, tabId);
  } catch {
    // Best-effort.
  }
  setAnalysis('multiRefs', []);
  setAnalysis('multiSummary', null);
}

/** Cancel the running scan. Best-effort; the panel state resets regardless. */
export async function cancelScan(): Promise<void> {
  setAnalysis('scanning', false);
  setAnalysis('scanError', 'Scan cancelled.');
  if (tabId == null) return;
  try {
    await sendMessage('CANCEL_SCAN', undefined, tabId);
  } catch {
    // Content script unreachable — the local state reset above already holds.
  }
}

/** Whether the scan is available (connected page). */
export function scanAvailable(): boolean {
  return tabId != null;
}

export { analysis };
