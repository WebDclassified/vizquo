import { describe, expect, it } from 'vitest';
import { hashProjection, hashString, hashStrings } from '../engine/tokens/hash';
import { AnalysisMemo } from '../engine/tokens/memo';
import { sample } from './helpers/sample';

describe('FNV-1a hashing (L2 cache keys)', () => {
  it('is deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashStrings(['a', 'b'])).toBe(hashStrings(['a', 'b']));
  });

  it('is order-sensitive for arrays', () => {
    expect(hashStrings(['a', 'b'])).not.toBe(hashStrings(['b', 'a']));
  });

  it('hashProjection keys on the picked projection only', () => {
    const a = [sample({ color: '#fff' }), sample({ color: '#000' })];
    const b = [sample({ color: '#fff' }), sample({ color: '#000' })];
    expect(hashProjection(a, (s) => s.color)).toBe(hashProjection(b, (s) => s.color));
    const c = [sample({ color: '#fff' }), sample({ color: '#123456' })];
    expect(hashProjection(a, (s) => s.color)).not.toBe(hashProjection(c, (s) => s.color));
  });
});

describe('AnalysisMemo (Section 2.3 L2)', () => {
  it('serves a cached result on the second identical key', () => {
    const memo = new AnalysisMemo<number>();
    let computed = 0;
    const first = memo.compute('k', () => {
      computed += 1;
      return 42;
    });
    const second = memo.compute('k', () => {
      computed += 1;
      return 42;
    });
    expect(first).toEqual({ value: 42, cached: false });
    expect(second).toEqual({ value: 42, cached: true });
    expect(computed).toBe(1);
    expect(memo.stats()).toMatchObject({ hits: 1, misses: 1, size: 1 });
  });

  it('recomputes per key', () => {
    const memo = new AnalysisMemo<string>();
    const a = memo.compute('a', () => 'A');
    const b = memo.compute('b', () => 'B');
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(false);
  });

  it('invalidate clears entries', () => {
    const memo = new AnalysisMemo<number>();
    memo.compute('k', () => 1);
    memo.invalidate('k');
    const again = memo.compute('k', () => 2);
    expect(again).toEqual({ value: 2, cached: false });
  });
});
