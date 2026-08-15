/**
 * Design DNA analysis pipeline (Section 2) — the pure, environment-agnostic
 * heart of the scan. Runs the full pipeline: color clustering + role
 * classification, typography hierarchy, scale detection, structural analysis,
 * asset classification, and accessibility/performance audits. Each unit is
 * L2-memoized by the content hash of its input projection, so re-scanning an
 * unchanged page (or unchanged sections) serves cached results.
 *
 * Two execution environments use this same code:
 *  1. The Comlink analysis worker (`workers/analysis-worker.ts`) — heavy
 *     compute stays off the content-script thread.
 *  2. The main-thread fallback (`engine/analysis/orchestrator.ts`) — some
 *     sites ship a Content-Security-Policy that blocks `blob:` workers (e.g.
 *     YouTube's `script-src` allowlist), so the worker can never load there.
 *     Running the identical pipeline synchronously on the main thread keeps
 *     the scan working on those pages — slightly less smooth, but correct.
 */

import type {
  Asset,
  AssetAnalysis,
  AuditAnalysis,
  ColorAnalysis,
  ColorToken,
  Component,
  ElementSample,
  Finding,
  ScalesAnalysis,
  ScanSnapshot,
  SimilarityResult,
  StructureAnalysis,
  TypographyAnalysis,
} from '../../shared/types';
import { auditAccessibility } from '../accessibility/audit';
import { analyzeAssets } from '../assets/classify';
import { auditPerformance } from '../performance/audit';
import { clusterColors } from '../tokens/color';
import { hashProjection, hashStrings } from '../tokens/hash';
import { AnalysisMemo } from '../tokens/memo';
import { classifyColorRoles } from '../tokens/roles';
import { analyzeScales } from '../tokens/scales';
import { detectRecurringComponents, findSimilarSamples } from '../tokens/structure';
import { analyzeTypography } from '../tokens/typography';

/** The analysis surface both the worker and the fallback implement. */
export interface AnalysisPipeline {
  setSnapshot(snapshot: ScanSnapshot): { hash: string };
  getSnapshotHash(): string;
  analyzeColors(): ColorAnalysis;
  analyzeTypography(): TypographyAnalysis;
  analyzeScales(): ScalesAnalysis;
  analyzeStructure(): StructureAnalysis;
  analyzeAssets(): AssetAnalysis;
  analyzeAccessibility(): AuditAnalysis;
  analyzePerformance(): AuditAnalysis;
  findSimilar(target: ElementSample): SimilarityResult[];
  cacheStats(): Record<string, { hits: number; misses: number; size: number }>;
  /** Cheap health probe — resolves immediately on a live pipeline. */
  ping(): string;
}

/** Build a fresh pipeline (own memo state) for the current snapshot. */
export function createAnalysisPipeline(): AnalysisPipeline {
  let snapshot: ScanSnapshot | null = null;

  const colorMemo = new AnalysisMemo<ColorToken[]>();
  const roleMemo = new AnalysisMemo<ColorToken[]>();
  const typeMemo = new AnalysisMemo<TypographyAnalysis>();
  const scalesMemo = new AnalysisMemo<ScalesAnalysis>();
  const structureMemo = new AnalysisMemo<Component[]>();
  const assetsMemo = new AnalysisMemo<Asset[]>();
  const a11yMemo = new AnalysisMemo<Finding[]>();
  const perfMemo = new AnalysisMemo<Finding[]>();

  const samples = (): ElementSample[] => snapshot?.samples ?? [];

  /** Structural hash of the full sample set (role hints, button distribution). */
  const samplesKey = (): string =>
    hashProjection(samples(), (s) => {
      const classes = s.classes.join('|');
      return `${s.ref.domPath.join(',')} ${s.tag} ${s.role ?? ''} ${s.isButton ? 1 : 0} ${s.isLink ? 1 : 0} ${s.classes.length} ${classes}`;
    });

  /**
   * Hash of EVERY field any analysis unit reads — the orchestrator's
   * `cached`/`stale` flags must mean "identical analysis inputs", never just
   * "same structure". A same-structure SPA re-render with new colors, fonts,
   * assets, or a11y facts must be a cache MISS, not a silent reuse.
   */
  const fullSnapshotKey = (): string => {
    const list = samples();
    const assetList = snapshot?.assets ?? [];
    const a11yList = snapshot?.a11y ?? [];
    return hashStrings([
      samplesKey(),
      hashProjection(list, (s) =>
        [
          s.color,
          s.backgroundColor,
          s.borderColor,
          s.opacity,
          s.fontFamily,
          s.fontSize,
          s.fontWeight,
          s.lineHeight,
          s.letterSpacing,
          s.textTransform,
          s.margin,
          s.padding,
          s.gap,
          s.borderRadius,
          s.boxShadow,
          s.backgroundImage,
        ].join('|'),
      ),
      hashProjection(assetList, (a) =>
        [a.url, a.type, a.source, a.alt ?? '', a.loading ?? '', (a.naturalDims ?? []).join('x')].join('|'),
      ),
      hashProjection(a11yList, (s) =>
        `${s.ref.domPath.join(',')} ${s.text} ${s.alt ?? ''} ${s.ariaLabel ?? ''} ${s.color} ${s.backgroundColor}`,
      ),
      hashProjection(snapshot?.variables ?? [], (v) => `${v.name}=${v.value}`),
      hashProjection(snapshot?.breakpoints ?? [], (b) => b.raw),
      hashProjection(snapshot?.containerQueries ?? [], (c) => c.raw),
      `${snapshot?.elementCount ?? 0} ${snapshot?.animationCount ?? 0} ${snapshot?.transitionCount ?? 0}`,
    ]);
  };

  return {
    setSnapshot(next: ScanSnapshot): { hash: string } {
      snapshot = next;
      return { hash: fullSnapshotKey() };
    },
    getSnapshotHash(): string {
      return fullSnapshotKey();
    },

    analyzeColors(): ColorAnalysis {
      const list = samples();
      if (list.length === 0) return { colors: [], cached: false };
      const colorKey = hashProjection(list, (s) =>
        [s.color, s.backgroundColor, s.borderColor, s.opacity].join(' '),
      );
      const clustered = colorMemo.compute(colorKey, () => clusterColors(list));
      // Roles depend on BOTH the clustered color values AND the element
      // semantics (hints/buttons). Key on colorKey + structure: a same-
      // structure re-render with different colors (SPA navigation) must
      // recompute roles, never serve the previous page's colors as this
      // page's (law: never silently reuse stale cache).
      const roleKey = hashStrings([colorKey, samplesKey()]);
      const roles = roleMemo.compute(roleKey, () => classifyColorRoles(clustered.value, list));
      return { colors: roles.value, cached: clustered.cached && roles.cached };
    },

    analyzeTypography(): TypographyAnalysis {
      const list = samples();
      const fontSources = snapshot?.fontSources ?? [];
      const typeKey = hashProjection(list, (s) =>
        [
          s.fontFamily,
          s.fontSize,
          s.fontWeight,
          s.lineHeight,
          s.letterSpacing,
          s.textTransform,
        ].join('|'),
      );
      const fontsKey = hashStrings([
        typeKey,
        fontSources.map((f) => `${f.family}:${f.source}`).join(','),
      ]);
      const analyzed = typeMemo.compute(`${typeKey}::${fontsKey}`, () =>
        analyzeTypography(list, fontSources),
      );
      return analyzed.value;
    },

    analyzeScales(): ScalesAnalysis {
      const list = samples();
      const key = hashProjection(list, (s) =>
        [s.margin, s.padding, s.gap, s.borderRadius, s.boxShadow, s.backgroundImage].join('|'),
      );
      const analyzed = scalesMemo.compute(key, () => analyzeScales(list));
      return analyzed.value;
    },

    analyzeStructure(): StructureAnalysis {
      const list = samples();
      const key = hashProjection(
        list,
        (s) =>
          `${s.tag}|${s.childTags.join(',')}|${s.classes.length}|${s.role ?? ''}|${s.isButton ? 1 : 0}`,
      );
      const components = structureMemo.compute(key, () => detectRecurringComponents(list));
      return { components: components.value, cached: components.cached };
    },

    analyzeAssets(): AssetAnalysis {
      const list = snapshot?.assets ?? [];
      if (list.length === 0) return { assets: [], cached: false };
      const key = hashProjection(list, (a) =>
        [
          a.url,
          a.type,
          a.source,
          a.alt ?? '',
          a.loading ?? '',
          (a.naturalDims ?? []).join('x'),
          (a.renderedDims ?? []).join('x'),
        ].join('|'),
      );
      const analyzed = assetsMemo.compute(key, () => analyzeAssets(list));
      return { assets: analyzed.value, cached: analyzed.cached };
    },

    analyzeAccessibility(): AuditAnalysis {
      const list = snapshot?.a11y ?? [];
      if (list.length === 0) return { findings: [], cached: false };
      const key = hashProjection(list, (s) =>
        [
          s.ref.domPath.join(','),
          s.tag,
          s.text,
          s.alt ?? '',
          s.ariaLabel ?? '',
          s.ariaLabelledby ?? '',
          s.ariaHidden ?? '',
          s.role ?? '',
          s.tabIndex,
          s.headingLevel,
          s.isLink ? 1 : 0,
          s.isButton ? 1 : 0,
          s.isFormControl ? 1 : 0,
          s.hasLabel ? 1 : 0,
          s.placeholder ?? '',
          s.color,
          s.backgroundColor,
          s.fontSize,
          s.fontWeight,
        ].join('|'),
      );
      const audited = a11yMemo.compute(key, () => auditAccessibility(list));
      return { findings: audited.value, cached: audited.cached };
    },

    analyzePerformance(): AuditAnalysis {
      if (!snapshot) return { findings: [], cached: false };
      const key = hashStrings([
        hashProjection(
          snapshot.a11y,
          (s) => `${s.ref.domPath.join(',')} ${s.tag} ${s.hasDimsAttrs ? 1 : 0} ${s.loading}`,
        ),
        hashProjection(
          snapshot.assets,
          (a) => `${a.url} ${a.naturalDims ?? ''} ${a.renderedDims ?? ''} ${a.fileSize ?? ''}`,
        ),
        `${snapshot.elementCount} ${snapshot.animationCount} ${snapshot.transitionCount}`,
      ]);
      const audited = perfMemo.compute(key, () =>
        auditPerformance({
          a11y: snapshot?.a11y ?? [],
          assets: snapshot?.assets ?? [],
          elementCount: snapshot?.elementCount ?? 0,
          animationCount: snapshot?.animationCount ?? 0,
          transitionCount: snapshot?.transitionCount ?? 0,
        }),
      );
      return { findings: audited.value, cached: audited.cached };
    },

    findSimilar(target: ElementSample): SimilarityResult[] {
      return findSimilarSamples(target, samples());
    },

    cacheStats() {
      return {
        colors: colorMemo.stats(),
        roles: roleMemo.stats(),
        typography: typeMemo.stats(),
        scales: scalesMemo.stats(),
        structure: structureMemo.stats(),
        assets: assetsMemo.stats(),
        accessibility: a11yMemo.stats(),
        performance: perfMemo.stats(),
      };
    },

    ping(): string {
      return 'pong';
    },
  };
}
