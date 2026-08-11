import { describe, expect, it } from 'vitest';
import { computeConsistency } from '../engine/tokens/consistency';
import type { ColorToken, FontToken, Token, TypeStyleUsage } from '../shared/types';

function token(value: number, usageCount: number): Token<number> {
  return { value, confidence: { level: 'detected' }, usageCount, usedBy: [] };
}

function color(hex: string): ColorToken {
  return {
    value: { hex, oklch: '' },
    confidence: { level: 'detected' },
    usageCount: 1,
    usedBy: [],
  };
}

function font(family: string): FontToken {
  return {
    value: { family, source: 'unknown', weight: 400 },
    confidence: { level: 'detected' },
    usageCount: 1,
    usedBy: [],
  };
}

function style(size: string): TypeStyleUsage {
  return {
    family: 'Inter',
    size,
    weight: '400',
    lineHeight: '',
    letterSpacing: '',
    textTransform: '',
    role: 'body',
    confidence: { level: 'detected' },
    usageCount: 1,
    usedBy: [],
  };
}

describe('computeConsistency (Sections 7.2/7.12)', () => {
  it('scores a coherent page near 100', () => {
    const result = computeConsistency({
      colors: [color('#111111'), color('#ffffff'), color('#635bff')],
      typeStyles: [style('16px'), style('24px'), style('12px')],
      fonts: [font('Inter')],
      spacing: [token(8, 6), token(16, 4)],
      radius: [token(4, 5), token(8, 3)],
      spacingScale: [
        { value: 8, frequency: 6, onScale: true },
        { value: 16, frequency: 4, onScale: true },
      ],
      scaleOutliers: [],
    });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.findings).toHaveLength(0);
  });

  it('penalizes many distinct fonts and styles with findings', () => {
    const result = computeConsistency({
      colors: [color('#111111')],
      typeStyles: Array.from({ length: 14 }, (_, i) => style(`${10 + i}px`)),
      fonts: ['A', 'B', 'C', 'D', 'E'].map(font),
      spacing: [token(8, 6)],
      radius: [token(4, 5)],
      spacingScale: [{ value: 8, frequency: 6, onScale: true }],
      scaleOutliers: [],
    });
    expect(result.score).toBeLessThan(80);
    expect(result.findings.some((f) => f.message.includes('font families'))).toBe(true);
    expect(result.findings.some((f) => f.message.includes('text styles'))).toBe(true);
  });

  it('surfaces scale outliers as findings and clamps the score', () => {
    const outlier = {
      id: 'outlier-37',
      category: 'consistency' as const,
      severity: 'info' as const,
      message: 'Spacing value 37px is off the detected scale (used 3×).',
    };
    const result = computeConsistency({
      colors: [],
      typeStyles: [style('16px')],
      fonts: [],
      spacing: [token(8, 1), token(37, 3)],
      radius: [token(4, 2)],
      spacingScale: [{ value: 8, frequency: 1, onScale: true }],
      scaleOutliers: [outlier],
    });
    // The outlier is kept, and the low on-scale ratio adds its own warning.
    expect(result.findings.some((f) => f.message.includes('37px'))).toBe(true);
    expect(result.findings.some((f) => f.message.includes('outside the detected scale'))).toBe(
      true,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
