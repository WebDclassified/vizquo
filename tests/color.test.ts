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
    const usages = collectColorUsages([
      sample({ textLength: 6, color: '#111111', backgroundColor: '#ffffff' }),
    ]);
    const kinds = usages.map((u) => u.kind).sort();
    expect(kinds).toEqual(['background', 'text']);
  });

  it('drops transparent borders', () => {
    const usages = collectColorUsages([sample({ borderColor: 'rgba(0, 0, 0, 0)' })]);
    expect(usages).toHaveLength(0);
  });

  it('counts text color only on text-bearing elements (inherited colors on containers)', () => {
    const usages = collectColorUsages([
      // Empty container inherits the page's text color but renders nothing.
      sample({ color: '#111111', textLength: 0 }),
      // The leaf text node carries the same computed color — counted here.
      sample({ color: '#111111', textLength: 8 }),
      // Buttons and form controls are text-bearing even with nested markup.
      sample({ color: '#111111', textLength: 0, isButton: true }),
    ]);
    const textUsages = usages.filter((u) => u.kind === 'text');
    expect(textUsages).toHaveLength(2);
  });

  it('requires a real border (border-color computes to currentcolor when borderless)', () => {
    const usages = collectColorUsages([
      sample({ borderColor: '#ffffff', borderTopWidth: '0px' }),
      sample({ borderColor: '#ffffff', borderTopWidth: '1px' }),
    ]);
    expect(usages).toHaveLength(1);
    expect(usages[0]!.kind).toBe('border');
  });

  it('counts bottom-border-only elements (dividers, table rows) as border usages', () => {
    const usages = collectColorUsages([
      sample({ borderColor: '#e5e7eb', borderTopWidth: '0px', borderBottomWidth: '1px' }),
      sample({ borderColor: '#e5e7eb', borderTopWidth: '0px', borderBottomWidth: '0px' }),
      sample({ borderColor: '#e5e7eb', borderTopWidth: '', borderBottomWidth: '' }),
    ]);
    expect(usages).toHaveLength(1);
    expect(usages[0]!.kind).toBe('border');
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
    const tokens = clusterColors([
      sample({ color: '#000000', textLength: 4 }),
      sample({ color: '#ffffff', textLength: 4 }),
    ]);
    expect(tokens).toHaveLength(2);
  });

  it('sorts by usage descending', () => {
    const tokens = clusterColors([
      sample({ color: '#ff0000', textLength: 4 }),
      sample({ color: '#00ff00', textLength: 4 }),
      sample({ color: '#00ff00', textLength: 4 }),
      sample({ color: '#00ff00', textLength: 4 }),
    ]);
    expect(tokens[0]!.value.hex).toBe('#00ff00');
  });
});
