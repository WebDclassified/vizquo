/**
 * URL helpers shared across layers (engine, storage, UI).
 *
 * `normalizeCacheUrl` was originally defined inside the IndexedDB cache
 * adapter, which forced `engine/timeline` to import from storage internals
 * just to group scans by URL. It lives here now — pure, dependency-free —
 * and the cache adapter re-exports it so existing imports keep working.
 */

/** Canonical URL identity — strips fragment, default ports, trailing slash.
 * History upserts, the timeline grouping, and cache keys must all agree on
 * what counts as "the same page", so this is the single source of that rule. */
export function normalizeCacheUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.protocol === 'http:' && u.port === '80') u.port = '';
    if (u.protocol === 'https:' && u.port === '443') u.port = '';
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}
