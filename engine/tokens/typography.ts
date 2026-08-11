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
  // Group by the VISUAL family (firstFamily), not the raw computed stack —
  // the same font with a different fallback list is the same style. Line
  // height is contextual (container-driven), not a style identity, so it's
  // collapsed into the representative variant instead of splitting rows.
  return [
    firstFamily(s.fontFamily),
    s.fontSize,
    s.fontWeight,
    s.letterSpacing,
    s.textTransform,
  ].join('|');
}

interface StyleGroup {
  sample: ElementSample;
  count: number;
  refs: ElementRef[];
  buttonShare: number;
  /** Usages on prose-like tags (p/li/td/…) — body-anchor evidence. */
  proseCount: number;
  /** lineHeight → variant — the dominant one becomes the representative. */
  variants: Map<string, { sample: ElementSample; count: number }>;
}

/** Tags whose text is almost always running prose, not labels/controls. */
const PROSE_TAGS = new Set([
  'p',
  'li',
  'td',
  'dd',
  'dt',
  'article',
  'section',
  'main',
  'blockquote',
  'pre',
  'figcaption',
]);

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
  // Typography counts only elements that actually render text (or are
  // text-bearing controls) — invisible containers inflate usage and skew
  // the body anchor. textLength is 0 for wrappers whose text lives in
  // child elements; the leaf text node carries the same inherited style.
  const textSamples = samples.filter((s) => s.textLength > 0 || s.isButton || s.isFormControl);
  // 1. Group distinct styles (visual family × size × weight × tracking × transform).
  const groupsByKey = new Map<string, StyleGroup>();
  for (const sample of textSamples) {
    if (!sample.fontSize || !sample.fontFamily) continue;
    const key = styleKey(sample);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.count += 1;
      const variant = existing.variants.get(sample.lineHeight) ?? {
        sample,
        count: 0,
      };
      variant.count += 1;
      existing.variants.set(sample.lineHeight, variant);
      if (existing.refs.length < MAX_USAGE_REFS) existing.refs.push(sample.ref);
      if (sample.isButton) existing.buttonShare += 1;
      if (PROSE_TAGS.has(sample.tag)) existing.proseCount += 1;
    } else {
      groupsByKey.set(key, {
        sample,
        count: 1,
        refs: [sample.ref],
        buttonShare: sample.isButton ? 1 : 0,
        proseCount: PROSE_TAGS.has(sample.tag) ? 1 : 0,
        variants: new Map([[sample.lineHeight, { sample, count: 1 }]]),
      });
    }
  }
  const groups = [...groupsByKey.values()].sort((a, b) => b.count - a.count);
  const totalUsage = groups.reduce((acc, g) => acc + g.count, 0);
  if (groups.length === 0) {
    return { typeStyles: [], fonts: [], cached: false };
  }
  for (const g of groups) {
    g.buttonShare = g.buttonShare / Math.max(1, g.count);
    // Representative sample = the dominant line-height variant.
    const dominant = [...g.variants.values()].sort((a, b) => b.count - a.count)[0];
    if (dominant) g.sample = dominant.sample;
  }

  // 2. Body anchor — layered so extreme pages still classify sanely:
  //    a) restrict to the typical body size band (12–20px) so small-text-heavy
  //       pages (dashboards, HN's 9.3px subtext) don't anchor the hierarchy on
  //       labels and promote the real body to a heading;
  //    b) within the band, prefer a style with real prose evidence (p/li/td/…)
  //       when it is within a third of the band's most-used count — a 14px
  //       paragraph beat by a wall of 12px nav labels is still the body;
  //    c) when nothing is in the band (all-text is tiny or huge), fall back to
  //       the size closest to the median of all text sizes — the statistical
  //       center of the page's typography, not an arbitrary 16px.
  const inBand = groups.filter((g) => {
    const size = parsePx(g.sample.fontSize) ?? 0;
    return size >= 12 && size <= 20;
  });
  const bandMostUsed = inBand[0];
  const proseCandidate = inBand.find(
    (g) =>
      g.proseCount / Math.max(1, g.count) >= 0.5 && g.count >= (bandMostUsed?.count ?? 0) * (1 / 3),
  );
  let body = proseCandidate ?? bandMostUsed;
  if (!body) {
    const sizes = groups
      .map((g) => parsePx(g.sample.fontSize) ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
    body = [...groups].sort(
      (a, b) =>
        Math.abs((parsePx(a.sample.fontSize) ?? 0) - median) -
        Math.abs((parsePx(b.sample.fontSize) ?? 0) - median),
    )[0];
  }
  const bodySize = body ? (parsePx(body.sample.fontSize) ?? 16) : 16;

  // 3. Keep the hierarchy clean: drop single-use non-heading rows (one-off
  //    spans/inline tweaks are noise), but always keep the body anchor and
  //    any genuinely large display/heading text even when rare.
  const visible = groups.filter(
    (g) => g.count > 1 || g === body || (parsePx(g.sample.fontSize) ?? bodySize) >= bodySize * 1.1,
  );

  const typeStyles: TypeStyleUsage[] = visible.map((group) => {
    const { role, basis } = classifyRole(group, bodySize, body?.count ?? 1);
    const confidence: Confidence = {
      level: 'inferred',
      score: Math.min(0.95, 0.55 + group.count / Math.max(10, totalUsage)),
      basis,
    };
    const s = group.sample;
    return {
      // Short visual family — the raw computed stack is noise in the panel.
      family: firstFamily(s.fontFamily),
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

  // 4. Font tokens: one token per (family × weight) — a family that renders
  //    at 450/500/600 shows all three specimens, not just the dominant one.
  const byFamilyWeight = new Map<string, { count: number; refs: ElementRef[] }>();
  for (const sample of textSamples) {
    const family = firstFamily(sample.fontFamily);
    if (!family) continue;
    const weight = Number.parseInt(sample.fontWeight, 10) || 400;
    const key = `${family}::${weight}`;
    const entry = byFamilyWeight.get(key);
    if (entry) {
      entry.count += 1;
      if (entry.refs.length < MAX_USAGE_REFS) entry.refs.push(sample.ref);
    } else {
      byFamilyWeight.set(key, { count: 1, refs: [sample.ref] });
    }
  }
  const sourceByFamily = new Map<string, FontSource>();
  for (const f of fontSources) {
    sourceByFamily.set(f.family, f.source);
  }
  const fonts: FontToken[] = [...byFamilyWeight.entries()]
    .map(([key, entry]) => {
      const sep = key.lastIndexOf('::');
      const family = key.slice(0, sep);
      const weight = key.slice(sep + 2);
      const source = sourceByFamily.get(family) ?? 'unknown';
      return {
        value: { family, source, weight: Number.parseInt(weight, 10) || 400 },
        confidence: { level: 'detected' } as Confidence,
        usageCount: entry.count,
        usedBy: entry.refs,
      };
    })
    .sort((a, b) => b.usageCount - a.usageCount);

  return { typeStyles, fonts, cached: false };
}
