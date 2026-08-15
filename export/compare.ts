/**
 * Website comparison (Phase 8, Section 7.25) — diff two real inspections.
 *
 * Pure functions: given two Inspection entities, produce a structured,
 * human-readable comparison. Every row is one normalized value with its
 * membership in each side — "both", "only A", or "only B". Colors are
 * normalized by lowercase hex so `#635BFF` and `#635bff` are the same value;
 * fonts by family+weight; numeric scales by their value.
 */
import type {
  Breakpoint,
  ColorToken,
  FontToken,
  Inspection,
  Technology,
  Token,
} from '../shared/types';

/** The inspection fields a diff actually reads — satisfied by both a full
 * Inspection and the light InspectionMeta projection (timeline uses metas). */
type InspectionSummary = Pick<
  Inspection,
  'page' | 'tokens' | 'gradients' | 'breakpoints' | 'technologies' | 'consistencyScore'
>;

export interface ComparisonSectionMeta {
  key: string;
  label: string;
}

export interface ComparisonRow {
  /** Human-readable value, e.g. `#635bff` or `Inter 600`. */
  label: string;
  /** Normalized identity used for dedup across the two sides. */
  key: string;
  inA: boolean;
  inB: boolean;
  /** Present for color rows — the panel renders a swatch. */
  swatch?: string;
}

export interface ComparisonSection {
  key:
    | 'colors'
    | 'fonts'
    | 'spacing'
    | 'radius'
    | 'shadows'
    | 'gradients'
    | 'breakpoints'
    | 'technologies';
  label: string;
  rows: ComparisonRow[];
}

export interface InspectionComparison {
  a: { title: string; url: string; scannedAt: number };
  b: { title: string; url: string; scannedAt: number };
  consistency: { a: number; b: number };
  sections: ComparisonSection[];
  /** Rows present on exactly one side — the "real differences". */
  differingCount: number;
}

function hexKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function mergeRows(a: Map<string, ComparisonRow>, b: Map<string, ComparisonRow>): ComparisonRow[] {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys]
    .map((key) => ({
      key,
      label: a.get(key)?.label ?? b.get(key)?.label ?? key,
      inA: a.has(key),
      inB: b.has(key),
      swatch: a.get(key)?.swatch ?? b.get(key)?.swatch,
    }))
    .sort((x, y) => {
      // Differing rows first, then stable by key.
      if (x.inA !== y.inA && x.inB !== y.inB) return x.inA === y.inA ? 0 : -1;
      if (x.inA !== y.inA || x.inB !== y.inB) {
        const xDiff = x.inA !== y.inB;
        const yDiff = y.inA !== y.inB;
        return Number(yDiff) - Number(xDiff);
      }
      return x.key < y.key ? -1 : x.key > y.key ? 1 : 0;
    });
}

function section(
  key: ComparisonSection['key'],
  label: string,
  a: Map<string, ComparisonRow>,
  b: Map<string, ComparisonRow>,
): ComparisonSection {
  return { key, label, rows: mergeRows(a, b) };
}

function colorsMap(colors: ColorToken[]): Map<string, ComparisonRow> {
  const map = new Map<string, ComparisonRow>();
  for (const color of colors) {
    const key = hexKey(color.value.hex);
    map.set(key, {
      key,
      label: color.value.hex,
      inA: true,
      inB: true,
      swatch: color.value.hex,
    });
  }
  return map;
}

function fontsMap(fonts: FontToken[]): Map<string, ComparisonRow> {
  const map = new Map<string, ComparisonRow>();
  for (const font of fonts) {
    const key = `${font.value.family.trim().toLowerCase()}:${font.value.weight}`;
    map.set(key, {
      key,
      label: `${font.value.family} ${font.value.weight}`,
      inA: true,
      inB: true,
    });
  }
  return map;
}

function numericMap(tokens: Token<number>[]): Map<string, ComparisonRow> {
  const map = new Map<string, ComparisonRow>();
  for (const token of tokens) {
    const key = String(token.value);
    map.set(key, { key, label: `${token.value}px`, inA: true, inB: true });
  }
  return map;
}

function stringMap(tokens: Token<string>[]): Map<string, ComparisonRow> {
  const map = new Map<string, ComparisonRow>();
  for (const token of tokens) {
    const key = token.value.trim();
    map.set(key, { key, label: token.value, inA: true, inB: true });
  }
  return map;
}

function breakpointsMap(breakpoints: Breakpoint[]): Map<string, ComparisonRow> {
  const map = new Map<string, ComparisonRow>();
  for (const bp of breakpoints) {
    const key = bp.raw.trim();
    map.set(key, { key, label: bp.raw, inA: true, inB: true });
  }
  return map;
}

function technologiesMap(techs: Technology[]): Map<string, ComparisonRow> {
  const map = new Map<string, ComparisonRow>();
  for (const tech of techs) {
    const key = tech.name.trim().toLowerCase();
    map.set(key, {
      key,
      label: tech.name,
      inA: true,
      inB: true,
    });
  }
  return map;
}

function differing(sections: ComparisonSection[]): number {
  return sections.reduce(
    (sum, section) => sum + section.rows.filter((row) => row.inA !== row.inB).length,
    0,
  );
}

export interface ComparisonSummary {
  differingCount: number;
  /** Per-section human lines, e.g. `Colors +3 −1` — empty when unchanged. */
  lines: string[];
  /** True when any section differs. */
  changed: boolean;
}

/**
 * Condense a comparison into the short "what changed" summary used by the
 * version timeline. `inA` is the newer version, `inB` the older one, so a
 * row only in A is an addition (`+n`) and one only in B is a removal (`−n`).
 * Pure — unit-testable without a browser.
 */
export function summarizeComparison(comparison: InspectionComparison): ComparisonSummary {
  const lines: string[] = [];
  for (const section of comparison.sections) {
    const added = section.rows.filter((row) => row.inA && !row.inB).length;
    const removed = section.rows.filter((row) => !row.inA && row.inB).length;
    if (added > 0 || removed > 0) {
      lines.push(`${section.label} +${added} −${removed}`);
    }
  }
  return {
    differingCount: comparison.differingCount,
    lines,
    changed: comparison.differingCount > 0,
  };
}

/** Compare two inspections (full or light projections). Pure — unit-testable
 * without a browser. */
export function compareInspections(
  a: InspectionSummary,
  b: InspectionSummary,
): InspectionComparison {
  const sections: ComparisonSection[] = [
    section('colors', 'Colors', colorsMap(a.tokens.colors), colorsMap(b.tokens.colors)),
    section('fonts', 'Fonts', fontsMap(a.tokens.fonts), fontsMap(b.tokens.fonts)),
    section('spacing', 'Spacing', numericMap(a.tokens.spacing), numericMap(b.tokens.spacing)),
    section('radius', 'Radius', numericMap(a.tokens.radius), numericMap(b.tokens.radius)),
    section('shadows', 'Shadows', stringMap(a.tokens.shadows), stringMap(b.tokens.shadows)),
    section('gradients', 'Gradients', stringMap(a.gradients), stringMap(b.gradients)),
    section(
      'breakpoints',
      'Breakpoints',
      breakpointsMap(a.breakpoints),
      breakpointsMap(b.breakpoints),
    ),
    section(
      'technologies',
      'Technology',
      technologiesMap(a.technologies),
      technologiesMap(b.technologies),
    ),
  ];
  return {
    a: { title: a.page.title, url: a.page.url, scannedAt: a.page.scannedAt },
    b: { title: b.page.title, url: b.page.url, scannedAt: b.page.scannedAt },
    consistency: { a: a.consistencyScore, b: b.consistencyScore },
    sections,
    differingCount: differing(sections),
  };
}
