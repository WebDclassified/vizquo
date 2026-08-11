/**
 * Color extraction and perceptual clustering (Section 7.9) — pure functions
 * that run inside the analysis worker (or under vitest). Colors are grouped
 * by perceptual distance in OKLCH, never by string equality, so near-duplicate
 * hexes from `#635bff` vs `rgb(99, 91, 255)` vs `oklch(...)` collapse into one
 * token.
 */

import { converter, differenceEuclidean, formatHex, formatHex8, parse } from 'culori';
import type { ColorToken, Confidence, ElementRef, ElementSample } from '../../shared/types';

const toOklch = converter('oklch');
const oklchDistance = differenceEuclidean('oklch');

/**
 * Cluster merge threshold in OKLCH ΔE. OKLCH L ranges 0–1 (not 0–100 like
 * CIELAB), so perceptual near-duplicates sit around 0.01–0.04 and black vs
 * white is ~1.0. A threshold of 4 would merge every color on the page.
 */
export const COLOR_CLUSTER_THRESHOLD = 0.04;

/** Cap on per-token element refs kept in the token (usage count stays exact). */
export const MAX_USAGE_REFS = 300;

/** A single color usage observed on one element. */
export interface ColorUsage {
  value: string;
  kind: 'text' | 'background' | 'border';
  ref: ElementRef;
  tag: string;
  classes: string[];
  id?: string;
  ariaRole?: string;
  isButton: boolean;
  isLink: boolean;
  isFormControl: boolean;
  textLength: number;
  opacity: number;
}

export interface NormalizedColor {
  hex: string;
  oklch: string;
  /** OKLCH components for distance math. */
  oklchTuple: [number, number, number];
  /** Chroma < 0.02 → a neutral (white/black/grey). */
  neutral: boolean;
}

export function normalizeColorValue(value: string): NormalizedColor | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'currentcolor' || trimmed === 'none') {
    return null;
  }
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed) return null;
  // Fully transparent (alpha 0) — visually not a color.
  if (parsed.alpha === 0) return null;
  // formatHex drops alpha (#000000 for rgba(0,0,0,.1)); use the 8-digit form
  // so semi-transparent colors stay distinct from opaque ones (law #5).
  const hex =
    parsed.alpha === undefined || parsed.alpha === 1 ? formatHex(parsed) : formatHex8(parsed);
  const oklch = toOklch(parsed);
  const l = Number.isFinite(oklch.l) ? oklch.l : 0;
  const c = Number.isFinite(oklch.c) ? oklch.c : 0;
  const h = Number.isFinite(oklch.h) ? oklch.h : 0;
  const tuple: [number, number, number] = [l, c, h];
  return {
    hex,
    oklch: `oklch(${l.toFixed(3)} ${c.toFixed(3)}${h >= 0 ? ` ${h.toFixed(1)}` : ''})`,
    oklchTuple: tuple,
    neutral: c < 0.02,
  };
}

export function oklchDistanceBetween(a: NormalizedColor, b: NormalizedColor): number {
  return oklchDistance(
    { mode: 'oklch', l: a.oklchTuple[0], c: a.oklchTuple[1], h: a.oklchTuple[2] },
    { mode: 'oklch', l: b.oklchTuple[0], c: b.oklchTuple[1], h: b.oklchTuple[2] },
  );
}

/** Collect every color usage from the scan samples (text/bg/border). */
export function collectColorUsages(samples: ElementSample[]): ColorUsage[] {
  const usages: ColorUsage[] = [];
  for (const s of samples) {
    const opacity = Number.parseFloat(s.opacity);
    const base = {
      ref: s.ref,
      tag: s.tag,
      classes: s.classes,
      id: s.id,
      ariaRole: s.role,
      isButton: s.isButton,
      isLink: s.isLink,
      isFormControl: s.isFormControl,
      textLength: s.textLength,
      opacity: Number.isFinite(opacity) ? opacity : 1,
    };
    if (s.color) usages.push({ ...base, value: s.color, kind: 'text' });
    if (s.backgroundColor) usages.push({ ...base, value: s.backgroundColor, kind: 'background' });
    if (s.borderColor && s.borderColor !== 'rgba(0, 0, 0, 0)') {
      usages.push({ ...base, value: s.borderColor, kind: 'border' });
    }
  }
  return usages;
}

interface Cluster {
  hex: string;
  normalized: NormalizedColor;
  usages: ColorUsage[];
}

function capRefs(refs: ElementRef[]): ElementRef[] {
  return refs.slice(0, MAX_USAGE_REFS);
}

/** Greedy OKLCH clustering: group by exact value first, then merge near-dupes. */
export function clusterColorUsages(usages: ColorUsage[]): ColorToken[] {
  // 1. Group by exact normalized hex.
  const byValue = new Map<string, { normalized: NormalizedColor; usages: ColorUsage[] }>();
  for (const usage of usages) {
    const normalized = normalizeColorValue(usage.value);
    if (!normalized) continue;
    const group = byValue.get(normalized.hex);
    if (group) {
      group.usages.push(usage);
    } else {
      byValue.set(normalized.hex, { normalized, usages: [usage] });
    }
  }

  // 2. Merge clusters within the perceptual threshold (most-used wins the key).
  const clusters: Cluster[] = [];
  const sorted = [...byValue.entries()].sort((a, b) => b[1].usages.length - a[1].usages.length);
  for (const [, group] of sorted) {
    let mergedInto: Cluster | null = null;
    for (const cluster of clusters) {
      if (oklchDistanceBetween(group.normalized, cluster.normalized) <= COLOR_CLUSTER_THRESHOLD) {
        mergedInto = cluster;
        break;
      }
    }
    if (mergedInto) {
      mergedInto.usages.push(...group.usages);
    } else {
      clusters.push({
        hex: group.normalized.hex,
        normalized: group.normalized,
        usages: [...group.usages],
      });
    }
  }

  // 3. Build tokens. Exact-value groups are 'detected'; merged clusters are
  //    'derived' (calculated from observed data, law #2).
  return clusters.map((cluster) => {
    const { hex, normalized } = cluster;
    const distinctValues = new Set(cluster.usages.map((u) => normalizeColorValue(u.value)?.hex))
      .size;
    const merged = distinctValues > 1;
    const usageCount = cluster.usages.length;
    const confidence: Confidence = merged
      ? {
          level: 'derived',
          score: Math.min(0.99, 0.5 + usageCount / 200),
          basis: `${usageCount} observed usages grouped by perceptual distance (OKLCH ΔE ≤ ${COLOR_CLUSTER_THRESHOLD})`,
        }
      : { level: 'detected' };
    return {
      value: { hex, oklch: normalized.oklch },
      confidence,
      usageCount,
      usedBy: capRefs(cluster.usages.map((u) => u.ref)),
    };
  });
}

/** Cluster colors for a full sample set, sorted by usage (descending). */
export function clusterColors(samples: ElementSample[]): ColorToken[] {
  return clusterColorUsages(collectColorUsages(samples)).sort(
    (a, b) => b.usageCount - a.usageCount,
  );
}
