import { describe, expect, it } from 'vitest';
import { compareSpecificity, selectorSpecificity } from '../engine/css/specificity';

describe('selectorSpecificity', () => {
  it('counts the standard tuple (inline, id, class, type)', () => {
    expect(selectorSpecificity('div')).toEqual([0, 0, 0, 1]);
    expect(selectorSpecificity('.btn')).toEqual([0, 0, 1, 0]);
    expect(selectorSpecificity('#app')).toEqual([0, 1, 0, 0]);
    expect(selectorSpecificity('#a .b span')).toEqual([0, 1, 1, 1]);
    expect(selectorSpecificity('a:hover::before')).toEqual([0, 0, 1, 2]);
  });

  it('attributes and pseudo-classes count as classes', () => {
    expect(selectorSpecificity('[data-x="y"]')).toEqual([0, 0, 1, 0]);
    expect(selectorSpecificity('input:checked')).toEqual([0, 0, 1, 1]);
    expect(selectorSpecificity('li:nth-child(2)')).toEqual([0, 0, 1, 1]);
  });

  it(':where() contributes zero', () => {
    expect(selectorSpecificity(':where(#a, .b) div')).toEqual([0, 0, 0, 1]);
  });

  it(':is()/:not()/:has() contribute the maximum of their arguments', () => {
    expect(selectorSpecificity(':is(#a, .b) span')).toEqual([0, 1, 0, 1]);
    expect(selectorSpecificity(':not(.x)')).toEqual([0, 0, 1, 0]);
    expect(selectorSpecificity(':has(> #header) p')).toEqual([0, 1, 0, 1]);
  });

  it(':nth-child(of S) adds the maximum specificity of S plus its own class', () => {
    expect(selectorSpecificity('li:nth-child(2n of .item)')).toEqual([0, 0, 2, 1]);
  });

  it('handles selector lists by returning the maximum selector', () => {
    expect(selectorSpecificity('#a, .b')).toEqual([0, 1, 0, 0]);
  });

  it('never throws on garbage', () => {
    expect(selectorSpecificity(':::')).toEqual([0, 0, 0, 0]);
    expect(selectorSpecificity('')).toEqual([0, 0, 0, 0]);
  });
});

describe('compareSpecificity', () => {
  it('orders tuples lexicographically', () => {
    expect(compareSpecificity([0, 1, 0, 0], [0, 0, 5, 5])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 0, 2, 0], [0, 0, 1, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 0, 1, 1], [0, 0, 1, 1])).toBe(0);
    expect(compareSpecificity([0, 0, 0, 3], [0, 0, 0, 2])).toBeGreaterThan(0);
  });
});
