/**
 * Typography analysis (Sections 7.3/7.9) — pure, worker-side.
 *
 * Observed text styles (family × size × weight × line-height × letter-spacing
 * × transform) are grouped into distinct styles; the automatic hierarchy
 * (display / H1–H3 / body / small / caption / label / button) is inferred from
 * size ranking and usage patterns and always carries the confidence model.
 */
import type {
  Confidence,
  ElementRef,
  ElementSample,
  FontSource,
  FontToken,
  TypeRole,
  TypeStyleUsage,
  TypographyAnalysis,
} from '../../shared/types';
import { MAX_USAGE_REFS } from './color';

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/** First concrete family in a computed font-family list. */
export function firstFamily(fontFamily: string): string {
  const parts = fontFamily.split(',').map((p) => p.trim().replace(/^['"]|['"]$/g, ''));
  for (const part of parts) {
    if (part && !GENERIC_FAMILIES.has(part.toLowerCase())) return part;
  }
  return parts[0] ?? '';
}

export function parsePx(value: string): number | null {
  if (!value) return null;
  const match = /^(-?[\d.]+)px$/.exec(value.trim());
  if (!match) return null;
  const n = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(n) ? n : null;
}

function styleKey(s: ElementSample): string {
  return [
    s.fontFamily,
    s.fontSize,
    s.fontWeight,
    s.lineHeight,
    s.letterSpacing,
    s.textTransform,
  ].join('|');
}

interface StyleGroup {
  sample: ElementSample;
  count: number;
  refs: ElementRef[];
  buttonShare: number;
}

function classifyRole(
  group: StyleGroup,
  bodySize: number,
  bodyUsage: number,
): { role: TypeRole; basis: string } {
  const size = parsePx(group.sample.fontSize) ?? bodySize;
  const ratio = size / Math.max(1, bodySize);

  if (group.buttonShare >= 0.5 && group.count >= 3) {
    return {
      role: 'button',
      basis: `used on ${Math.round(group.buttonShare * 100)}% button elements`,
    };
  }
  const upper = /uppercase/i.test(group.sample.textTransform);
  const tracked = (parsePx(group.sample.letterSpacing) ?? 0) >= 0.5;
  if ((upper || tracked) && group.count >= 2 && size <= bodySize * 1.1) {
    return {
      role: 'label',
      basis: upper
        ? 'uppercase text with tracking — label-like'
        : 'wide letter-spacing — label-like',
    };
  }
  if (ratio >= 1.6) {
    return {
      role: group.count / Math.max(1, bodyUsage) < 0.05 ? 'display' : 'h1',
      basis: `${Math.round(ratio * 100)}% of the body size`,
    };
  }
  if (ratio >= 1.3) {
    return { role: 'h2', basis: `${Math.round(ratio * 100)}% of the body size` };
  }
  if (ratio >= 1.1) {
    return { role: 'h3', basis: `${Math.round(ratio * 100)}% of the body size` };
  }
  if (ratio <= 0.8) {
    return { role: 'caption', basis: `${Math.round(ratio * 100)}% of the body size` };
  }
  if (ratio < 0.95) {
    return { role: 'small', basis: `${Math.round(ratio * 100)}% of the body size` };
  }
  return { role: 'body', basis: 'closest to the dominant body size' };
}

export function analyzeTypography(
  samples: ElementSample[],
  fontSources: { family: string; source: FontSource; weight: number }[],
): TypographyAnalysis {
  // 1. Group distinct styles.
  const groupsByKey = new Map<string, StyleGroup>();
  for (const sample of samples) {
    if (!sample.fontSize || !sample.fontFamily) continue;
    const key = styleKey(sample);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.refs.length < MAX_USAGE_REFS) existing.refs.push(sample.ref);
      if (sample.isButton) existing.buttonShare += 1;
    } else {
      groupsByKey.set(key, {
        sample,
        count: 1,
        refs: [sample.ref],
        buttonShare: sample.isButton ? 1 : 0,
      });
    }
  }
  const groups = [...groupsByKey.values()].sort((a, b) => b.count - a.count);
  const totalUsage = groups.reduce((acc, g) => acc + g.count, 0);
  if (groups.length === 0) {
    return { typeStyles: [], fonts: [], cached: false };
  }
  for (const g of groups) g.buttonShare = g.buttonShare / Math.max(1, g.count);

  // 2. Body anchor: the most-used style (fallback: closest to 16px).
  const body = groups[0];
  const bodySize = body ? (parsePx(body.sample.fontSize) ?? 16) : 16;

  const typeStyles: TypeStyleUsage[] = groups.map((group) => {
    const { role, basis } = classifyRole(group, bodySize, body?.count ?? 1);
    const confidence: Confidence = {
      level: 'inferred',
      score: Math.min(0.95, 0.55 + group.count / Math.max(10, totalUsage)),
      basis,
    };
    const s = group.sample;
    return {
      family: s.fontFamily,
      size: s.fontSize,
      weight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textTransform: s.textTransform,
      role,
      confidence,
      usageCount: group.count,
      usedBy: group.refs,
    };
  });

  // 3. Font tokens: per family, dominant weight, source from the snapshot.
  const families = new Map<
    string,
    { count: number; weights: Map<string, number>; refs: ElementRef[] }
  >();
  for (const sample of samples) {
    const family = firstFamily(sample.fontFamily);
    if (!family) continue;
    const entry = families.get(family);
    if (entry) {
      entry.count += 1;
      entry.weights.set(sample.fontWeight, (entry.weights.get(sample.fontWeight) ?? 0) + 1);
      if (entry.refs.length < MAX_USAGE_REFS) entry.refs.push(sample.ref);
    } else {
      families.set(family, {
        count: 1,
        weights: new Map([[sample.fontWeight, 1]]),
        refs: [sample.ref],
      });
    }
  }
  const sourceByFamily = new Map<string, FontSource>();
  for (const f of fontSources) {
    sourceByFamily.set(f.family, f.source);
  }
  const fonts: FontToken[] = [...families.entries()]
    .map(([family, entry]) => {
      const dominantWeight =
        [...entry.weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '400';
      const source = sourceByFamily.get(family) ?? 'unknown';
      return {
        value: { family, source, weight: Number.parseInt(dominantWeight, 10) || 400 },
        confidence: { level: 'detected' } as Confidence,
        usageCount: entry.count,
        usedBy: entry.refs,
      };
    })
    .sort((a, b) => b.usageCount - a.usageCount);

  return { typeStyles, fonts, cached: false };
}
