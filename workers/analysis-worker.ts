/**
 * Analysis worker (Section 2: heavy compute never blocks the content-script or
 * panel thread) — Comlink-wrapped. Runs the Design DNA pipeline: color
 * clustering + role classification, typography hierarchy, scale detection, and
 * structural analysis. Each unit is L2-memoized (Section 2.3) by the content
 * hash of its input projection, so re-scanning an unchanged page (or unchanged
 * sections) serves cached results without recomputation.
 */
import * as Comlink from 'comlink';
import { auditAccessibility } from '../engine/accessibility/audit';
import { analyzeAssets } from '../engine/assets/classify';
import { auditPerformance } from '../engine/performance/audit';
import { clusterColors } from '../engine/tokens/color';
import { hashProjection, hashStrings } from '../engine/tokens/hash';
import { AnalysisMemo } from '../engine/tokens/memo';
import { classifyColorRoles } from '../engine/tokens/roles';
import { analyzeScales } from '../engine/tokens/scales';
import { detectRecurringComponents, findSimilarSamples } from '../engine/tokens/structure';
import { analyzeTypography } from '../engine/tokens/typography';
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
} from '../shared/types';

/** The RPC surface the content script wraps with Comlink. */
export interface AnalysisWorkerApi {
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
}

let snapshot: ScanSnapshot | null = null;

const colorMemo = new AnalysisMemo<ColorToken[]>();
const roleMemo = new AnalysisMemo<ColorToken[]>();
const typeMemo = new AnalysisMemo<TypographyAnalysis>();
const scalesMemo = new AnalysisMemo<ScalesAnalysis>();
const structureMemo = new AnalysisMemo<Component[]>();
const assetsMemo = new AnalysisMemo<Asset[]>();
const a11yMemo = new AnalysisMemo<Finding[]>();
const perfMemo = new AnalysisMemo<Finding[]>();

function samples(): ElementSample[] {
  return snapshot?.samples ?? [];
}

/** Structural hash of the full sample set (role hints, button distribution). */
function samplesKey(): string {
  return hashProjection(samples(), (s) => {
    const classes = s.classes.join('|');
    return `${s.ref.domPath.join(',')} ${s.tag} ${s.role ?? ''} ${s.isButton ? 1 : 0} ${s.isLink ? 1 : 0} ${s.classes.length} ${classes}`;
  });
}

const api: AnalysisWorkerApi = {
  setSnapshot(next: ScanSnapshot): { hash: string } {
    snapshot = next;
    return { hash: samplesKey() };
  },
  getSnapshotHash(): string {
    return samplesKey();
  },

  analyzeColors(): ColorAnalysis {
    const list = samples();
    if (list.length === 0) return { colors: [], cached: false };
    const colorKey = hashProjection(list, (s) =>
      [s.color, s.backgroundColor, s.borderColor, s.opacity].join(' '),
    );
    const clustered = colorMemo.compute(colorKey, () => clusterColors(list));
    // Roles depend on element semantics (hints/buttons) too — full sample hash.
    const roleKey = samplesKey();
    const roles = roleMemo.compute(roleKey, () => classifyColorRoles(clustered.value, list));
    return { colors: roles.value, cached: clustered.cached && roles.cached };
  },

  analyzeTypography(): TypographyAnalysis {
    const list = samples();
    const fontSources = snapshot?.fontSources ?? [];
    const typeKey = hashProjection(list, (s) =>
      [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing, s.textTransform].join(
        '|',
      ),
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
};

Comlink.expose(api);
