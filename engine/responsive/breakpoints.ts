/**
 * Responsive intelligence (Section 7.15) — pure, worker-side.
 *
 * Turns the raw `@media (min|max-width)` and `@container` rules the scan
 * collected into an actionable picture: which breakpoints are real, which are
 * active at a given viewport width (deterministic from the page's own rules),
 * and whether the page sets a viewport meta tag (mobile reflow baseline).
 */
import type { ActiveBreakpoint, Breakpoint, ContainerQuery } from '../../shared/types';

/** A breakpoint is meaningful when it gates ≥1 rule — here: has any width bound. */
export function isRealBreakpoint(bp: Breakpoint): boolean {
  return bp.minWidth !== null || bp.maxWidth !== null;
}

/**
 * Sort for the timeline. Key = the width the rule activates at: minWidth for
 * ascending rules, maxWidth for descending (max-width-only) rules.
 */
export function sortBreakpoints(list: Breakpoint[]): Breakpoint[] {
  return [...list].sort((a, b) => {
    const akey = a.minWidth ?? a.maxWidth ?? Number.POSITIVE_INFINITY;
    const bkey = b.minWidth ?? b.maxWidth ?? Number.POSITIVE_INFINITY;
    if (akey !== bkey) return akey - bkey;
    return (a.maxWidth ?? 0) - (b.maxWidth ?? 0);
  });
}

/**
 * Deterministic active mapping: a parsed `(min-width: X)` / `(max-width: Y)`
 * rule matches at width W iff X ≤ W ≤ Y (nulls are unbounded). This is what
 * the browser itself evaluates for these queries — no guesswork.
 */
export function activeAtWidth(breakpoints: Breakpoint[], width: number): ActiveBreakpoint[] {
  return sortBreakpoints(breakpoints).map((bp) => {
    const passesMin = bp.minWidth === null || width >= bp.minWidth;
    const passesMax = bp.maxWidth === null || width <= bp.maxWidth;
    return { ...bp, active: passesMin && passesMax };
  });
}

/** Parse an `@container` condition text into name + width bounds. */
export function parseContainerQuery(raw: string): ContainerQuery {
  const nameMatch = /^(?:(\w[\w-]*)\s+)?\((.+)\)$/i.exec(raw.trim());
  const condition = nameMatch?.[2] ?? raw;
  const name = nameMatch?.[1] ?? '';
  const minWidth = /min-width\s*:\s*([\d.]+)px/i.exec(condition)?.[1];
  const maxWidth = /max-width\s*:\s*([\d.]+)px/i.exec(condition)?.[1];
  return {
    raw,
    name,
    minWidth: minWidth != null ? Number.parseFloat(minWidth) : null,
    maxWidth: maxWidth != null ? Number.parseFloat(maxWidth) : null,
  };
}

/** True when the page declares a mobile viewport meta tag. */
export function hasViewportMeta(doc: Document = document): boolean {
  return doc.querySelector('meta[name="viewport"]') !== null;
}

/**
 * The distinct layout widths a page actually lays out around. A max-width
 * that is the exact complement of a min-width (e.g. 767 vs 768) is the same
 * boundary, not a separate layout width — so it is folded away.
 */
export function breakpointScale(breakpoints: Breakpoint[]): number[] {
  const minWidths = new Set<number>();
  for (const bp of breakpoints) {
    if (bp.minWidth != null) minWidths.add(bp.minWidth);
  }
  const widths = new Set<number>(minWidths);
  for (const bp of breakpoints) {
    if (bp.maxWidth != null && !minWidths.has(bp.maxWidth + 1)) {
      widths.add(bp.maxWidth);
    }
  }
  return [...widths].sort((a, b) => a - b);
}
