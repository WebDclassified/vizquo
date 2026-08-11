/**
 * Spacing / radius / shadow / gradient scale detection (Section 7.9) — pure,
 * worker-side. Recurring values are grouped into a scale; values that sit far
 * from any scale step and are used repeatedly become consistency findings.
 */
import type { ElementRef, ElementSample, Finding, ScalesAnalysis, Token } from '../../shared/types';
import { MAX_USAGE_REFS, normalizeColorValue } from './color';
import { parsePx } from './typography';

/** A value far from every scale step and used at least this many times. */
const OUTLIER_MIN_USAGE = 3;
/** Values within this many px of a scale step are considered on-scale. */
const SCALE_TOLERANCE_PX = 2;

function collectPxValues(
  samples: ElementSample[],
  pick: (s: ElementSample) => string,
): Token<number>[] {
  const byValue = new Map<number, { count: number; refs: ElementRef[] }>();
  for (const sample of samples) {
    const parts = pick(sample).trim();
    if (!parts) continue;
    for (const raw of parts.split(/\s+/)) {
      const n = parsePx(raw);
      // 0 and negatives are excluded: zero is the absence of spacing, and
      // negative margins are layout hacks, not scale values.
      if (n == null || n <= 0) continue;
      const rounded = Math.round(n * 10) / 10;
      const entry = byValue.get(rounded);
      if (entry) {
        entry.count += 1;
        if (entry.refs.length < MAX_USAGE_REFS) entry.refs.push(sample.ref);
      } else {
        byValue.set(rounded, { count: 1, refs: [sample.ref] });
      }
    }
  }
  return (
    [...byValue.entries()]
      // Single-use values are one-off layout tweaks, not a scale — the panel
      // and the consistency score should only see recurring values.
      .filter(([, entry]) => entry.count > 1)
      .map(([value, entry]) => ({
        value,
        confidence: { level: 'detected' as const },
        usageCount: entry.count,
        usedBy: entry.refs,
      }))
      .sort((a, b) => b.usageCount - a.usageCount)
  );
}

interface Cluster {
  value: number;
  frequency: number;
  token: Token<number>;
}

/**
 * Greedy scale detection: most-used values become steps, near values cluster.
 * A cluster joins the scale when it is used enough (half the dominant value's
 * frequency) or sits at an integer multiple of an existing step (16 = 2×8 even
 * when rarely used); everything else is off-scale and can be flagged.
 */
export function detectScale(values: Token<number>[]): {
  scale: { value: number; frequency: number; onScale: boolean }[];
  offScale: Token<number>[];
} {
  const sorted = [...values].sort((a, b) => b.usageCount - a.usageCount);
  const clusters: Cluster[] = [];
  for (const token of sorted) {
    const cluster = clusters.find((c) => Math.abs(c.value - token.value) <= SCALE_TOLERANCE_PX);
    if (cluster) {
      cluster.frequency += token.usageCount;
      // The representative is the most-used value in the cluster.
      if (token.usageCount > cluster.token.usageCount) {
        cluster.value = token.value;
        cluster.token = token;
      }
    } else {
      clusters.push({ value: token.value, frequency: token.usageCount, token });
    }
  }

  const maxFreq = Math.max(1, ...clusters.map((c) => c.frequency));
  const stepThreshold = Math.max(2, maxFreq * 0.5);

  const steps: Cluster[] = [];
  const byFrequency = [...clusters].sort((a, b) => b.frequency - a.frequency);
  for (const cluster of byFrequency) {
    if (steps.some((s) => Math.abs(s.value - cluster.value) <= SCALE_TOLERANCE_PX)) continue;
    const isMultiple = steps.some((s) => {
      if (s.value <= 0) return false;
      const k = Math.round(cluster.value / s.value);
      if (k < 1 || k > 16) return false;
      return Math.abs(cluster.value - s.value * k) <= SCALE_TOLERANCE_PX;
    });
    if (cluster.frequency >= stepThreshold || isMultiple) steps.push(cluster);
  }
  steps.sort((a, b) => a.value - b.value);

  const offScale = clusters
    .filter((c) => !steps.some((s) => Math.abs(s.value - c.value) <= SCALE_TOLERANCE_PX))
    .map((c) => ({ ...c.token, usageCount: c.frequency }));

  return {
    scale: steps.map((s) => ({ value: s.value, frequency: s.frequency, onScale: true })),
    offScale,
  };
}

/** Split a box-shadow list on top-level commas (paren-aware). */
export function splitShadows(shadows: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of shadows) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Split on whitespace while keeping paren groups (rgba(0, 0, 0, .1)) whole. */
function shadowTokens(raw: string): string[] {
  const out: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of raw) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (current) out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Canonical shadow string: x y blur spread color(hex) [inset], 0px → 0. */
export function normalizeShadow(raw: string): string {
  const parts = shadowTokens(raw.trim());
  const colorIndex = parts.findIndex((p) =>
    p === 'inset' ? false : /^(#|rgb|hsl|oklch|lab|currentcolor)/i.test(p) || /^[a-z]+$/i.test(p),
  );
  let color: string | null = null;
  let colorPart = '';
  if (colorIndex >= 0) {
    colorPart = parts[colorIndex] ?? '';
    const normalized = normalizeColorValue(colorPart);
    color = normalized ? normalized.hex : colorPart;
  }
  const numeric = parts
    .filter((p) => p !== 'inset' && p !== colorPart)
    .map((p) => (p === '0px' ? '0' : p));
  const inset = parts.includes('inset') ? ' inset' : '';
  return `${numeric.join(' ')}${color ? ` ${color}` : ''}${inset}`.trim();
}

/** Canonical gradient: collapse whitespace and paren/stop spacing. */
export function normalizeGradient(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ',')
    .trim();
}

export function analyzeScales(samples: ElementSample[]): ScalesAnalysis {
  const spacing = collectPxValues(samples, (s) => `${s.margin} ${s.padding} ${s.gap}`);
  const radius = collectPxValues(samples, (s) => s.borderRadius);

  const { scale: spacingScale, offScale } = detectScale(spacing);
  const { offScale: radiusOffScale } = detectScale(radius);

  const outliers: Finding[] = [];
  for (const v of [...offScale, ...radiusOffScale]) {
    if (v.usageCount >= OUTLIER_MIN_USAGE) {
      const isSpacing = offScale.includes(v);
      outliers.push({
        id: `outlier-${v.value}`,
        category: 'consistency',
        severity: 'info',
        message: `${isSpacing ? 'Spacing' : 'Border radius'} value ${v.value}px is off the detected scale (used ${v.usageCount}×).`,
      });
    }
  }

  // Shadows: normalize + dedupe, count usages.
  const shadowMap = new Map<string, { count: number; refs: ElementRef[] }>();
  for (const sample of samples) {
    if (!sample.boxShadow || sample.boxShadow === 'none') continue;
    for (const raw of splitShadows(sample.boxShadow)) {
      const canonical = normalizeShadow(raw);
      if (!canonical) continue;
      const entry = shadowMap.get(canonical);
      if (entry) {
        entry.count += 1;
        if (entry.refs.length < MAX_USAGE_REFS) entry.refs.push(sample.ref);
      } else {
        shadowMap.set(canonical, { count: 1, refs: [sample.ref] });
      }
    }
  }
  const shadows: Token<string>[] = [...shadowMap.entries()]
    .map(([value, entry]) => ({
      value,
      confidence: { level: 'detected' as const },
      usageCount: entry.count,
      usedBy: entry.refs,
    }))
    .sort((a, b) => b.usageCount - a.usageCount);

  // Gradients: dedupe by normalized string.
  const gradientMap = new Map<string, { count: number; refs: ElementRef[] }>();
  for (const sample of samples) {
    if (!sample.backgroundImage?.includes('gradient(')) continue;
    const canonical = normalizeGradient(sample.backgroundImage);
    const entry = gradientMap.get(canonical);
    if (entry) {
      entry.count += 1;
      if (entry.refs.length < MAX_USAGE_REFS) entry.refs.push(sample.ref);
    } else {
      gradientMap.set(canonical, { count: 1, refs: [sample.ref] });
    }
  }
  const gradients: Token<string>[] = [...gradientMap.entries()]
    .map(([value, entry]) => ({
      value,
      confidence: { level: 'detected' as const },
      usageCount: entry.count,
      usedBy: entry.refs,
    }))
    .sort((a, b) => b.usageCount - a.usageCount);

  return {
    spacing,
    radius,
    shadows,
    gradients,
    spacingScale,
    outliers,
    cached: false,
  };
}
