import { describe, expect, it } from 'vitest';
import { clusterColors, collectColorUsages, normalizeColorValue } from '../engine/tokens/color';
import { sample } from './helpers/sample';

describe('normalizeColorValue', () => {
  it('parses hex into hex + oklch', () => {
    const n = normalizeColorValue('#635bff');
    expect(n).not.toBeNull();
    expect(n!.hex).toBe('#635bff');
    expect(n!.oklch).toMatch(/^oklch\(/);
  });

  it('normalizes rgb() and named colors to the same hex', () => {
    const a = normalizeColorValue('#ffffff');
    const b = normalizeColorValue('rgb(255, 255, 255)');
    const c = normalizeColorValue('white');
    expect(a!.hex).toBe('#ffffff');
    expect(b!.hex).toBe('#ffffff');
    expect(c!.hex).toBe('#ffffff');
  });

  it('rejects transparent / currentcolor / none / alpha-0', () => {
    expect(normalizeColorValue('transparent')).toBeNull();
    expect(normalizeColorValue('currentcolor')).toBeNull();
    expect(normalizeColorValue('none')).toBeNull();
    expect(normalizeColorValue('rgba(0, 0, 0, 0)')).toBeNull();
  });

  it('flags neutrals (grey) vs chromatic colors', () => {
    expect(normalizeColorValue('#808080')!.neutral).toBe(true);
    expect(normalizeColorValue('#635bff')!.neutral).toBe(false);
  });
});

describe('collectColorUsages', () => {
  it('collects text, background, and border usages with kind metadata', () => {
    const usages = collectColorUsages([sample({ color: '#111111', backgroundColor: '#ffffff' })]);
    const kinds = usages.map((u) => u.kind).sort();
    expect(kinds).toEqual(['background', 'text']);
  });

  it('drops transparent borders', () => {
    const usages = collectColorUsages([sample({ borderColor: 'rgba(0, 0, 0, 0)' })]);
    expect(usages).toHaveLength(0);
  });
});

describe('clusterColors (perceptual grouping, Section 7.9)', () => {
  it('collapses near-duplicate values into one token', () => {
    const tokens = clusterColors([
      sample({ backgroundColor: '#635bff' }),
      sample({ backgroundColor: '#625aff' }),
      sample({ backgroundColor: '#635bff' }),
    ]);
    const cluster = tokens.find((t) => t.value.hex === '#635bff');
    expect(cluster).toBeDefined();
    expect(cluster!.usageCount).toBe(3);
    // Merged from >1 distinct value → derived, never presented as detected.
    expect(cluster!.confidence.level).toBe('derived');
  });

  it('keeps clearly different colors separate', () => {
    const tokens = clusterColors([sample({ color: '#000000' }), sample({ color: '#ffffff' })]);
    expect(tokens).toHaveLength(2);
  });

  it('sorts by usage descending', () => {
    const tokens = clusterColors([
      sample({ color: '#ff0000' }),
      sample({ color: '#00ff00' }),
      sample({ color: '#00ff00' }),
      sample({ color: '#00ff00' }),
    ]);
    expect(tokens[0]!.value.hex).toBe('#00ff00');
  });
});
