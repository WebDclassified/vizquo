/**
 * L3 persistent cache primitives (Section 2.3): stable key derivation,
 * content fingerprints, and kind-aware LRU eviction.
 *
 * Pure functions only — unit-testable without a browser.
 */
import type { CacheEntry } from '../../../shared/types';
import { normalizeCacheUrl } from '../../../shared/url';

export { normalizeCacheUrl };

/** FNV-1a 32-bit — deterministic, dependency-free, identical in every context. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Fingerprint of the page content a cache entry was derived from. Hash the
 * relevant CSS/DOM subtree, not the whole page, so an unrelated change in the
 * footer doesn't invalidate the hero's cached analysis (Section 2.3, L2/L3).
 */
export function computeFingerprint(...parts: Array<string | undefined>): string {
  return fnv1a(parts.filter((p): p is string => p != null && p !== '').join('\u0000'));
}

export function makeCacheKey(url: string, fingerprint: string): string {
  return `${normalizeCacheUrl(url)}::${fingerprint}`;
}

export function totalCacheBytes(entries: CacheEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.sizeBytes || 0), 0);
}

/**
 * Kind-aware LRU eviction (Section 2.3): blobs/screenshots are evicted before
 * inspection token data (they dominate size); within a kind, least-recently-
 * accessed entries go first. Returns the surviving entries.
 */
export function evictToBudget(entries: CacheEntry[], budgetBytes: number): CacheEntry[] {
  if (entries.length === 0) return entries;

  const evictionOrder = [...entries].sort((a, b) => {
    const kindA = a.kind === 'inspection' ? 1 : 0;
    const kindB = b.kind === 'inspection' ? 1 : 0;
    if (kindA !== kindB) return kindA - kindB;
    return a.lastAccessedAt - b.lastAccessedAt;
  });

  let total = totalCacheBytes(entries);
  const doomed = new Set<string>();
  for (const entry of evictionOrder) {
    if (total <= budgetBytes) break;
    if (doomed.has(entry.key)) continue;
    doomed.add(entry.key);
    total -= entry.sizeBytes || 0;
  }

  return entries.filter((entry) => !doomed.has(entry.key));
}
