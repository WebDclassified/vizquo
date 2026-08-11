/**
 * Measure-mode geometry (Phase 10, brand system §14.2) — the pure math behind
 * the click-drag ruler: distance, angle, and the JetBrains Mono labels the
 * overlay renders. Axis-aligned drags (horizontal/vertical) get a single
 * clean label; diagonal drags add the ↕/↔ deltas so the ruler stays precise
 * without cluttering the page.
 *
 * Pure — unit-testable without a browser.
 */

/** A point in viewport coordinates. */
export interface Point {
  x: number;
  y: number;
}

export interface Measurement {
  /** Euclidean distance in CSS px. */
  distance: number;
  /** Absolute horizontal delta. */
  dx: number;
  /** Absolute vertical delta. */
  dy: number;
  /** Line angle in radians, from +x axis (for CSS rotate). */
  angleRad: number;
  /** True when the drag is (near-)horizontal or (near-)vertical. */
  axisAligned: boolean;
  /** Primary label — e.g. `248px`. */
  label: string;
  /** Secondary deltas for diagonal drags — e.g. `↔ 248px ↕ 96px`. */
  detail?: string;
}

/** Measure the distance between two viewport points. */
export function measurePoints(a: Point, b: Point): Measurement {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const distance = Math.hypot(dx, dy);
  const axisAligned = dx < 0.5 || dy < 0.5;
  const label = `${Math.max(1, Math.round(distance))}px`;
  const detail = axisAligned ? undefined : `↔ ${Math.round(dx)}px ↕ ${Math.round(dy)}px`;
  return {
    distance,
    dx,
    dy,
    angleRad: Math.atan2(b.y - a.y, b.x - a.x),
    axisAligned,
    label,
    detail,
  };
}
