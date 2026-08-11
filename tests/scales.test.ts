import { describe, expect, it } from 'vitest';
import {
  analyzeScales,
  detectScale,
  normalizeGradient,
  normalizeShadow,
} from '../engine/tokens/scales';
import type { Token } from '../shared/types';
import { sample } from './helpers/sample';

describe('detectScale (Section 7.3)', () => {
  it('finds a 4/8/12/16-style scale from recurring values', () => {
    const values = [4, 4, 4, 8, 8, 8, 8, 12, 12, 16, 16].map((value) => ({
      value,
      usageCount: 3,
      usedBy: [],
      confidence: { level: 'detected' as const },
    }));
    const { scale, offScale } = detectScale(values);
    expect(scale.map((s) => s.value)).toEqual([4, 8, 12, 16]);
    expect(offScale).toHaveLength(0);
  });

  it('clusters near values within 2px tolerance into one step', () => {
    const values = [8, 8, 8.5, 9].map((value) => ({
      value,
      usageCount: 2,
      usedBy: [],
      confidence: { level: 'detected' as const },
    }));
    const { scale } = detectScale(values);
    expect(scale).toHaveLength(1);
    expect(scale[0]!.value).toBe(8);
  });

  it('flags repeated off-scale values (not multiples of any step)', () => {
    // 8 is dominant (freq 10); 37 is used repeatedly but is neither frequent
    // enough nor a multiple of 8 → off-scale.
    const values = [
      ...Array.from({ length: 5 }, () => ({ value: 8, usageCount: 2 })),
      { value: 37, usageCount: 3 },
    ] as Token<number>[];
    const { offScale } = detectScale(values);
    expect(offScale.map((v) => v.value)).toContain(37);
  });

  it('keeps a rare but exact multiple (16 = 2×8) on scale', () => {
    const values = [
      ...Array.from({ length: 5 }, () => ({ value: 8, usageCount: 2 })),
      { value: 16, usageCount: 1 },
    ] as Token<number>[];
    const { scale, offScale } = detectScale(values);
    expect(scale.map((s) => s.value)).toContain(16);
    expect(offScale.map((v) => v.value)).not.toContain(16);
  });
});

describe('normalizeShadow', () => {
  it('normalizes colors, units, and ordering', () => {
    const a = normalizeShadow('0 1px 3px rgba(0, 0, 0, 0.1)');
    const b = normalizeShadow('0px 1px 3px rgba(0, 0, 0, 0.1)');
    const inset = normalizeShadow('inset 0 2px 4px rgb(0 0 0 / 0.2)');
    expect(a).toBe(b);
    expect(a).toBe('0 1px 3px #0000001a');
    expect(inset).toContain('inset');
    expect(inset).toContain('#');
  });
});

describe('normalizeGradient', () => {
  it('collapses whitespace and stop spacing', () => {
    expect(normalizeGradient('linear-gradient(  90deg, #fff , #000 )')).toBe(
      'linear-gradient(90deg,#fff,#000)',
    );
    expect(normalizeGradient('radial-gradient(circle, red 0%, blue 100%)')).toBe(
      normalizeGradient('radial-gradient(circle, red 0%, blue 100%)'),
    );
  });
});

describe('analyzeScales (Section 7.9)', () => {
  it('collects spacing, radius, shadows, gradients', () => {
    const samples = [
      sample({
        margin: '8px',
        padding: '16px',
        gap: '8px',
        borderRadius: '4px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        backgroundImage: 'linear-gradient(90deg, #ff0000, #0000ff)',
      }),
      sample({
        margin: '8px',
        padding: '16px',
        gap: '8px',
        borderRadius: '4px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        backgroundImage: 'linear-gradient(90deg, #ff0000, #0000ff)',
      }),
    ];
    const result = analyzeScales(samples);
    // Spacing is deduped per value: 8 (margin ×2 + gap ×2 = 4 usages), 16 (padding ×2).
    expect(result.spacing.map((t) => t.value).sort((a, b) => a - b)).toEqual([8, 16]);
    expect(result.spacing.find((t) => t.value === 8)!.usageCount).toBe(4);
    expect(result.radius[0]!.value).toBe(4);
    expect(result.shadows).toHaveLength(1);
    expect(result.gradients).toHaveLength(1);
    expect(result.spacingScale.some((s) => s.value === 8)).toBe(true);
  });

  it('emits outlier findings only for repeated off-scale values', () => {
    // 8 is the dominant scale step; 37 recurs but is neither frequent enough
    // (threshold = max(2, 8×0.5) = 4) nor a multiple of 8 → outlier.
    const samples = [
      ...Array.from({ length: 8 }, () => sample({ margin: '8px' })),
      sample({ margin: '37px' }),
      sample({ margin: '37px' }),
      sample({ margin: '37px' }),
    ];
    const { outliers } = analyzeScales(samples);
    expect(outliers.some((f) => f.message.includes('37'))).toBe(true);
    expect(outliers.some((f) => f.message.includes('8px'))).toBe(false);
  });
});
