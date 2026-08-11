/**
 * Smart measurement (Section 7.6) — Figma-style distance labels.
 *
 * Given the inspected element's rect, produce labeled measurements to:
 *   - the containing block (parent element edges),
 *   - the nearest sibling in each direction,
 *   - the viewport edges,
 *   - common alignment edges (left/center/right) of the parent.
 *
 * All distances are in CSS pixels against the current viewport rect. The
 * overlay renders these as small inline labels; values of 0 (touching) are
 * included so tight alignments are visible, but off-page distances are not.
 */
import type { Rect } from '../../shared/types';

export interface Measurement {
  id: string;
  label: string;
  /** Distance in CSS px (always >= 0). */
  value: number;
  /** Which edge of the inspected element the label attaches to. */
  edge: 'top' | 'right' | 'bottom' | 'left';
  kind: 'parent' | 'sibling' | 'viewport' | 'alignment';
}

function gap(a: number, b: number): number {
  return Math.max(0, Math.abs(a - b));
}

function nearestRect(
  rect: Rect,
  others: Rect[],
  axis: 'x' | 'y',
  direction: 'before' | 'after',
): number | null {
  let best: number | null = null;
  for (const other of others) {
    if (axis === 'x') {
      if (direction === 'before' && other.right > rect.left) continue;
      if (direction === 'after' && other.left < rect.right) continue;
      const d = direction === 'before' ? rect.left - other.right : other.left - rect.right;
      if (d >= 0 && (best === null || d < best)) best = d;
    } else {
      if (direction === 'before' && other.bottom > rect.top) continue;
      if (direction === 'after' && other.top < rect.bottom) continue;
      const d = direction === 'before' ? rect.top - other.bottom : other.top - rect.bottom;
      if (d >= 0 && (best === null || d < best)) best = d;
    }
  }
  return best;
}

/**
 * Measure an element against its surroundings. `rect` is the live rect (the
 * caller already computed it); parent/siblings are queried here.
 */
export function measureElement(el: Element, rect: Rect, viewport?: Rect): Measurement[] {
  const measurements: Measurement[] = [];
  const vp = viewport ?? {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };

  // --- Parent gaps -------------------------------------------------------
  const parent = el.parentElement;
  if (parent) {
    const pr = parent.getBoundingClientRect();
    measurements.push({
      id: 'parent-top',
      label: 'To parent',
      value: gap(rect.top, pr.top),
      edge: 'top',
      kind: 'parent',
    });
    measurements.push({
      id: 'parent-bottom',
      label: 'To parent',
      value: gap(pr.bottom, rect.bottom),
      edge: 'bottom',
      kind: 'parent',
    });
    measurements.push({
      id: 'parent-left',
      label: 'To parent',
      value: gap(rect.left, pr.left),
      edge: 'left',
      kind: 'parent',
    });
    measurements.push({
      id: 'parent-right',
      label: 'To parent',
      value: gap(pr.right, rect.right),
      edge: 'right',
      kind: 'parent',
    });
  }

  // --- Nearest siblings (up to 4) ----------------------------------------
  const siblings: Rect[] = [];
  if (parent) {
    for (const child of Array.from(parent.children)) {
      if (child === el) continue;
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      siblings.push(r);
    }
  }
  const leftGap = nearestRect(rect, siblings, 'x', 'before');
  const rightGap = nearestRect(rect, siblings, 'x', 'after');
  const topGap = nearestRect(rect, siblings, 'y', 'before');
  const bottomGap = nearestRect(rect, siblings, 'y', 'after');
  if (leftGap !== null)
    measurements.push({
      id: 'sib-left',
      label: 'Nearest sibling',
      value: leftGap,
      edge: 'left',
      kind: 'sibling',
    });
  if (rightGap !== null)
    measurements.push({
      id: 'sib-right',
      label: 'Nearest sibling',
      value: rightGap,
      edge: 'right',
      kind: 'sibling',
    });
  if (topGap !== null)
    measurements.push({
      id: 'sib-top',
      label: 'Nearest sibling',
      value: topGap,
      edge: 'top',
      kind: 'sibling',
    });
  if (bottomGap !== null)
    measurements.push({
      id: 'sib-bottom',
      label: 'Nearest sibling',
      value: bottomGap,
      edge: 'bottom',
      kind: 'sibling',
    });

  // --- Viewport gaps -----------------------------------------------------
  measurements.push({
    id: 'vp-top',
    label: 'To viewport',
    value: gap(rect.top, vp.top),
    edge: 'top',
    kind: 'viewport',
  });
  measurements.push({
    id: 'vp-bottom',
    label: 'To viewport',
    value: gap(vp.bottom, rect.bottom),
    edge: 'bottom',
    kind: 'viewport',
  });
  measurements.push({
    id: 'vp-left',
    label: 'To viewport',
    value: gap(rect.left, vp.left),
    edge: 'left',
    kind: 'viewport',
  });
  measurements.push({
    id: 'vp-right',
    label: 'To viewport',
    value: gap(vp.right, rect.right),
    edge: 'right',
    kind: 'viewport',
  });

  // --- Alignment edges (parent center / edges shared with the element) ---
  if (parent) {
    const pr = parent.getBoundingClientRect();
    const parentCenterX = pr.left + pr.width / 2;
    const parentCenterY = pr.top + pr.height / 2;
    const elementCenterX = rect.left + rect.width / 2;
    const elementCenterY = rect.top + rect.height / 2;

    if (Math.abs(rect.left - pr.left) < 1) {
      measurements.push({
        id: 'align-left',
        label: 'Aligns with parent left',
        value: 0,
        edge: 'left',
        kind: 'alignment',
      });
    }
    if (Math.abs(rect.right - pr.right) < 1) {
      measurements.push({
        id: 'align-right',
        label: 'Aligns with parent right',
        value: 0,
        edge: 'right',
        kind: 'alignment',
      });
    }
    if (Math.abs(parentCenterX - elementCenterX) < 1) {
      measurements.push({
        id: 'align-center-x',
        label: 'Centered horizontally',
        value: 0,
        edge: 'left',
        kind: 'alignment',
      });
    }
    if (Math.abs(parentCenterY - elementCenterY) < 1) {
      measurements.push({
        id: 'align-center-y',
        label: 'Centered vertically',
        value: 0,
        edge: 'top',
        kind: 'alignment',
      });
    }
  }

  // Cap at the most useful 12 labels.
  return measurements.slice(0, 12);
}
