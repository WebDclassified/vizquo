import { describe, expect, it } from 'vitest';
import { analyzeTypography, firstFamily, parsePx } from '../engine/tokens/typography';
import { sample } from './helpers/sample';

describe('parsePx / firstFamily', () => {
  it('parses px lengths and rejects non-px', () => {
    expect(parsePx('16px')).toBe(16);
    expect(parsePx('12.5px')).toBe(12.5);
    expect(parsePx('1rem')).toBeNull();
    expect(parsePx('')).toBeNull();
  });

  it('extracts the first concrete family from a stack', () => {
    expect(firstFamily('Inter, system-ui, sans-serif')).toBe('Inter');
    expect(firstFamily('"Source Serif 4", Georgia, serif')).toBe('Source Serif 4');
  });
});

describe('analyzeTypography (Sections 7.3/7.9)', () => {
  it('groups distinct styles and anchors the hierarchy to the most-used', () => {
    const samples = [
      // Dominant body style (16px, 400).
      sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      // Large heading → h1.
      sample({ fontFamily: 'Inter, sans-serif', fontSize: '32px', fontWeight: '700' }),
    ];
    const { typeStyles } = analyzeTypography(samples, []);
    const body = typeStyles.find((s) => s.role === 'body');
    const heading = typeStyles.find((s) => s.size === '32px');
    expect(body).toBeDefined();
    expect(body!.usageCount).toBe(4);
    expect(heading).toBeDefined();
    expect(heading!.role).toBe('h1');
    expect(heading!.confidence.level).toBe('inferred');
  });

  it('labels uppercase small text as label', () => {
    const samples = [
      sample({
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        textTransform: 'uppercase',
        fontWeight: '600',
      }),
      sample({
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        textTransform: 'uppercase',
        fontWeight: '600',
      }),
    ];
    const { typeStyles } = analyzeTypography(samples, []);
    const label = typeStyles.find((s) => s.role === 'label');
    expect(label).toBeDefined();
    expect(label!.confidence.basis).toMatch(/uppercase/);
  });

  it('detects font tokens with sources', () => {
    const samples = [
      sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '600' }),
      sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '600' }),
      sample({ fontFamily: 'Roboto, sans-serif', fontSize: '16px', fontWeight: '400' }),
    ];
    const { fonts } = analyzeTypography(samples, [
      { family: 'Inter', source: 'google', weight: 600 },
    ]);
    const inter = fonts.find((f) => f.value.family === 'Inter');
    expect(inter).toBeDefined();
    expect(inter!.value.source).toBe('google');
    expect(inter!.usageCount).toBe(2);
    expect(fonts).toHaveLength(2);
  });
});
