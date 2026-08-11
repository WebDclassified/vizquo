/**
 * Analysis state — scan results, tokens, assets, components. Populated by the
 * engine layer (Phase 3) and read by every feature panel. The scan streams
 * partial inspections (progressive section reveal, Section 7.27); sections
 * render as their data lands instead of waiting for the full scan.
 */
import { createStore } from 'solid-js/store';
import type {
  ElementRef,
  Inspection,
  MultiSelectSummary,
  PartialInspection,
} from '../../shared/types';

export type SectionStatus = 'pending' | 'scanning' | 'done';

export interface ScanProgress {
  /** Sections reveal progressively (colors → typography → spacing → components). */
  colors: SectionStatus;
  typography: SectionStatus;
  spacing: SectionStatus;
  components: SectionStatus;
  assets: SectionStatus;
  audits: SectionStatus;
  responsive: SectionStatus;
  technology: SectionStatus;
}

interface AnalysisState {
  inspection: Inspection | null;
  scanning: boolean;
  scanError: string | null;
  lastScanAt: number | null;
  /** L2 flags from the last scan (served from memo / stale-while-revalidate). */
  cached: boolean;
  stale: boolean;
  progress: ScanProgress;
  /** Shift-click multi-selection (Section 7.7). */
  multiRefs: ElementRef[];
  multiSummary: MultiSelectSummary | null;
}

const [analysis, setAnalysis] = createStore<AnalysisState>({
  inspection: null,
  scanning: false,
  scanError: null,
  lastScanAt: null,
  cached: false,
  stale: false,
  progress: {
    colors: 'pending',
    typography: 'pending',
    spacing: 'pending',
    components: 'pending',
    assets: 'pending',
    audits: 'pending',
    responsive: 'pending',
    technology: 'pending',
  },
  multiRefs: [],
  multiSummary: null,
});

export { analysis, setAnalysis };

/** Merge a streamed partial inspection into the store (progressive reveal). */
export function mergePartialInspection(patch: PartialInspection): void {
  const current = analysis.inspection;
  const next: PartialInspection = {
    page: patch.page ?? current?.page,
    scannedElementCount: patch.scannedElementCount ?? current?.scannedElementCount,
    truncated: patch.truncated ?? current?.truncated,
    metrics: patch.metrics ?? current?.metrics,
    tokens: {
      colors: patch.tokens?.colors ?? current?.tokens.colors,
      fonts: patch.tokens?.fonts ?? current?.tokens.fonts,
      spacing: patch.tokens?.spacing ?? current?.tokens.spacing,
      radius: patch.tokens?.radius ?? current?.tokens.radius,
      shadows: patch.tokens?.shadows ?? current?.tokens.shadows,
    },
    variables: patch.variables ?? current?.variables,
    gradients: patch.gradients ?? current?.gradients,
    breakpoints: patch.breakpoints ?? current?.breakpoints,
    typeStyles: patch.typeStyles ?? current?.typeStyles,
    components: patch.components ?? current?.components,
    assets: patch.assets ?? current?.assets,
    findings: patch.findings ?? current?.findings,
    technologies: patch.technologies ?? current?.technologies,
    containerQueries: patch.containerQueries ?? current?.containerQueries,
    viewportMeta: patch.viewportMeta ?? current?.viewportMeta,
    consistencyScore: patch.consistencyScore ?? current?.consistencyScore,
    scanDurationMs: patch.scanDurationMs ?? current?.scanDurationMs,
    cached: patch.cached ?? current?.cached,
    stale: patch.stale ?? current?.stale,
  };
  // The full Inspection arrives with the final SCAN_PAGE reply; partial
  // merges only fill in sections until then.
  if (patch.id || (current == null && patch.page)) {
    setAnalysis('inspection', {
      id: current?.id ?? patch.id ?? '',
      page: next.page ?? current?.page ?? { url: '', title: '', scannedAt: 0 },
      createdAt: current?.createdAt ?? Date.now(),
      tokens: {
        colors: next.tokens?.colors ?? [],
        fonts: next.tokens?.fonts ?? [],
        spacing: next.tokens?.spacing ?? [],
        radius: next.tokens?.radius ?? [],
        shadows: next.tokens?.shadows ?? [],
      },
      variables: next.variables ?? [],
      gradients: next.gradients ?? [],
      breakpoints: next.breakpoints ?? [],
      typeStyles: next.typeStyles ?? [],
      consistencyScore: next.consistencyScore ?? 0,
      scanDurationMs: next.scanDurationMs ?? 0,
      truncated: next.truncated ?? false,
      scannedElementCount: next.scannedElementCount ?? 0,
      metrics: next.metrics ?? {
        imageCount: 0,
        svgCount: 0,
        animationCount: 0,
        transitionCount: 0,
        breakpointCount: 0,
      },
      cached: next.cached ?? false,
      stale: next.stale ?? false,
      assets: next.assets ?? [],
      components: next.components ?? [],
      findings: next.findings ?? [],
      technologies: next.technologies ?? [],
      containerQueries: next.containerQueries ?? [],
      viewportMeta: next.viewportMeta ?? true,
    } as Inspection);
    return;
  }
  // Merge into an existing inspection object (fields only, tokens merged).
  if (current) {
    setAnalysis('inspection', {
      ...current,
      tokens: { ...current.tokens, ...(patch.tokens ?? {}) },
      variables: patch.variables ?? current.variables,
      gradients: patch.gradients ?? current.gradients,
      breakpoints: patch.breakpoints ?? current.breakpoints,
      typeStyles: patch.typeStyles ?? current.typeStyles,
      components: patch.components ?? current.components,
      assets: patch.assets ?? current.assets,
      findings: patch.findings ?? current.findings,
      technologies: patch.technologies ?? current.technologies,
      containerQueries: patch.containerQueries ?? current.containerQueries,
      viewportMeta: patch.viewportMeta ?? current.viewportMeta,
      metrics: patch.metrics ?? current.metrics,
      scannedElementCount: patch.scannedElementCount ?? current.scannedElementCount,
      truncated: patch.truncated ?? current.truncated,
      consistencyScore: patch.consistencyScore ?? current.consistencyScore,
      scanDurationMs: patch.scanDurationMs ?? current.scanDurationMs,
      cached: patch.cached ?? current.cached,
      stale: patch.stale ?? current.stale,
    });
  }
}
