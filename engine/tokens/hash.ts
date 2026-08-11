/**
 * FNV-1a hash — fast, deterministic, and good enough to key the L2 analysis
 * memo (Section 2.3). The worker recomputes a unit (e.g. color clustering)
 * only when the hash of its input projection changes.
 */

export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Hash an array of strings by folding each through the same FNV state. */
export function hashStrings(parts: string[]): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x1f; // separator
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Hash an array of samples for a given projection (e.g. their color values). */
export function hashProjection<T>(items: T[], pick: (item: T) => string): string {
  const parts = new Array<string>(items.length);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item != null) parts[i] = pick(item);
  }
  return hashStrings(parts);
}
