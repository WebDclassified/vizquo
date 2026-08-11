/**
 * L2 worker-level memoization (Section 2.3) — lives inside the analysis worker.
 *
 * Each expensive analysis unit (color clustering, typography hierarchy, scale
 * detection, structure) is keyed by the content hash of its input projection.
 * Re-scanning an unchanged section of the page therefore skips recomputation
 * entirely (`cached: true`); a changed section recomputes only its own unit.
 */
import { hashString } from './hash';

export interface MemoizedResult<T> {
  value: T;
  /** True when the value was served from the memo without recomputation. */
  cached: boolean;
}

export class AnalysisMemo<T> {
  private readonly entries = new Map<string, { key: string; value: T }>();
  private hits = 0;
  private misses = 0;

  /** Cache stats for the diagnostics surface (Section 7.27). */
  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.entries.size };
  }

  /** Derive a stable key from the unit's raw inputs (must be deterministic). */
  keyOf(parts: string[]): string {
    return hashString(parts.join('\u0000'));
  }

  /**
   * Run `compute` unless an entry already exists for `key`. Deterministic
   * inputs + pure compute are required: the memo trusts the key fully.
   */
  compute(key: string, compute: () => T): MemoizedResult<T> {
    const existing = this.entries.get(key);
    if (existing) {
      this.hits += 1;
      return { value: existing.value, cached: true };
    }
    this.misses += 1;
    const value = compute();
    this.entries.set(key, { key, value });
    return { value, cached: false };
  }

  /** Forget a specific key (or everything when no key given). */
  invalidate(key?: string): void {
    if (key != null) this.entries.delete(key);
    else this.entries.clear();
  }
}
