import { describe, expect, it } from 'vitest';
import { findVariableForValue } from '../engine/tokens/variables';
import type { CssVariableInfo } from '../shared/types';

const variables: CssVariableInfo[] = [
  { name: '--color-primary', value: '#6e7bff', usageCount: 12 },
  { name: '--color-text', value: '#f5f7fa', usageCount: 4 },
  { name: '--font-sans', value: 'Inter, system-ui, sans-serif', usageCount: 20 },
];

describe('findVariableForValue', () => {
  it('returns a usable var() reference for an exact match', () => {
    expect(findVariableForValue(variables, '#6e7bff')).toBe('--color-primary');
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(findVariableForValue(variables, '  #6E7BFF ')).toBe('--color-primary');
    expect(findVariableForValue(variables, '  inter, system-ui, sans-serif ')).toBe('--font-sans');
  });

  it('returns null when nothing matches or the value is empty', () => {
    expect(findVariableForValue(variables, '#000000')).toBeNull();
    expect(findVariableForValue(variables, '')).toBeNull();
    expect(findVariableForValue(variables, '   ')).toBeNull();
    expect(findVariableForValue([], '#6e7bff')).toBeNull();
  });

  it('normalizes a stored name that already carries the -- prefix', () => {
    expect(
      findVariableForValue([{ name: '--already', value: '#123456', usageCount: 1 }], '#123456'),
    ).toBe('--already');
  });

  it('matches declared rgb() shapes against normalized hex values', () => {
    expect(findVariableForValue(variables, 'rgb(110, 123, 255)')).toBe('--color-primary');
    expect(findVariableForValue(variables, 'rgba(110, 123, 255, 1)')).toBe('--color-primary');
  });

  it('strips !important and collapses whitespace on non-color values', () => {
    expect(findVariableForValue(variables, '  Inter ,   system-ui , sans-serif  !important ')).toBe(
      '--font-sans',
    );
  });

  it('keeps semi-transparent colors distinct from their opaque siblings', () => {
    expect(
      findVariableForValue(
        [{ name: '--overlay', value: 'rgba(0, 0, 0, 0.1)', usageCount: 1 }],
        '#000000',
      ),
    ).toBeNull();
    expect(
      findVariableForValue(
        [{ name: '--overlay', value: 'rgba(0, 0, 0, 0.1)', usageCount: 1 }],
        'rgba(0, 0, 0, 0.1)',
      ),
    ).toBe('--overlay');
  });
});
