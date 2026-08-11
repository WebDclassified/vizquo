import { describe, expect, it } from 'vitest';
import type { CacheEntry } from '../shared/types';
import {
  computeFingerprint,
  evictToBudget,
  fnv1a,
  makeCacheKey,
  normalizeCacheUrl,
  totalCacheBytes,
} from '../storage/adapters/indexeddb/cache';

function entry(
  key: string,
  kind: CacheEntry['kind'],
  sizeBytes: number,
  lastAccessedAt: number,
): CacheEntry {
  return {
    key,
    kind,
    url: 'https://example.com/',
    fingerprint: 'x',
    schemaVersion: 1,
    createdAt: 1,
    lastAccessedAt,
    sizeBytes,
    data: {},
  };
}

describe('normalizeCacheUrl', () => {
  it('strips fragments, default ports, and trailing slashes but keeps query', () => {
    // Root path '/' is meaningful and preserved; trailing slashes on real paths are dropped.
    expect(normalizeCacheUrl('https://example.com/#section')).toBe('https://example.com/');
    expect(normalizeCacheUrl('https://example.com:443/path/')).toBe('https://example.com/path');
    expect(normalizeCacheUrl('http://example.com:80/?q=1')).toBe('http://example.com/?q=1');
  });

  it('keeps meaningful ports', () => {
    expect(normalizeCacheUrl('http://localhost:5173/app/')).toBe('http://localhost:5173/app');
  });
});

describe('fingerprints', () => {
  it('is deterministic and input-sensitive', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
    expect(fnv1a('hello')).not.toBe(fnv1a('world'));
    expect(computeFingerprint('a', 'b')).toBe(computeFingerprint('a', 'b'));
    expect(computeFingerprint('a', 'b')).not.toBe(computeFingerprint('a', 'c'));
  });

  it('composes cache keys from url + fingerprint', () => {
    const key = makeCacheKey('https://example.com/', 'abc');
    // Root path '/' is preserved (it is meaningful in a URL).
    expect(key).toBe('https://example.com/::abc');
    expect(makeCacheKey('https://example.com/faq', 'abc')).toBe('https://example.com/faq::abc');
  });
});

describe('evictToBudget', () => {
  it('keeps everything within budget', () => {
    const entries = [entry('a', 'inspection', 50, 1), entry('b', 'inspection', 50, 2)];
    expect(evictToBudget(entries, 100)).toHaveLength(2);
  });

  it('evicts blobs before inspections regardless of recency', () => {
    const entries = [entry('blob-new', 'blob', 80, 999), entry('ins-old', 'inspection', 80, 1)];
    const survivors = evictToBudget(entries, 100);
    expect(survivors.map((e) => e.key)).toEqual(['ins-old']);
  });

  it('evicts least-recently-accessed within the same kind', () => {
    const entries = [entry('older', 'inspection', 60, 1), entry('newer', 'inspection', 60, 2)];
    expect(evictToBudget(entries, 100).map((e) => e.key)).toEqual(['newer']);
  });

  it('handles empty input and zero-size entries', () => {
    expect(evictToBudget([], 100)).toEqual([]);
    const zero = [entry('z1', 'blob', 0, 1)];
    expect(evictToBudget(zero, 0)).toHaveLength(1);
    expect(totalCacheBytes([])).toBe(0);
  });
});
