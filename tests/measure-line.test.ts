import { describe, expect, it } from 'vitest';
import { measurePoints } from '../engine/inspect/measure-line';

describe('measurePoints (Phase 10, measure mode)', () => {
  it('measures a horizontal drag', () => {
    const m = measurePoints({ x: 10, y: 20 }, { x: 258, y: 20 });
    expect(m.distance).toBe(248);
    expect(m.dx).toBe(248);
    expect(m.dy).toBe(0);
    expect(m.axisAligned).toBe(true);
    expect(m.label).toBe('248px');
    expect(m.detail).toBeUndefined();
    expect(m.angleRad).toBe(0);
  });

  it('measures a vertical drag (any direction)', () => {
    const m = measurePoints({ x: 40, y: 120 }, { x: 40, y: 24 });
    expect(m.distance).toBe(96);
    expect(m.dy).toBe(96);
    expect(m.axisAligned).toBe(true);
    expect(m.label).toBe('96px');
    expect(Math.abs(m.angleRad)).toBe(Math.PI / 2);
  });

  it('measures a diagonal drag with deltas', () => {
    const m = measurePoints({ x: 0, y: 0 }, { x: 300, y: 400 });
    expect(m.distance).toBe(500);
    expect(m.axisAligned).toBe(false);
    expect(m.label).toBe('500px');
    expect(m.detail).toBe('↔ 300px ↕ 400px');
  });

  it('treats sub-pixel deltas as axis-aligned', () => {
    const m = measurePoints({ x: 5, y: 5 }, { x: 105.2, y: 5.1 });
    expect(m.axisAligned).toBe(true);
    expect(m.label).toBe('100px');
  });

  it('never reports 0px for a click without drag', () => {
    const m = measurePoints({ x: 50, y: 50 }, { x: 50, y: 50 });
    expect(m.distance).toBe(0);
    expect(m.label).toBe('1px'); // a 0px ruler would be invisible
  });
});
