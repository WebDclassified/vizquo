/**
 * Version timeline (Phase 10) — every stored scan of a URL as an ordered
 * history of versions. The history table keeps one entry per URL (newest
 * wins), but the inspections table retains every scan, so the timeline is
 * built by grouping inspections by their normalized URL — the same
 * normalization history upserts use, so grouping never disagrees with the
 * History tab.
 *
 * Pure — unit-testable without a browser.
 */

import type { Inspection } from '../../shared/types';
import { normalizeCacheUrl } from '../../storage/adapters/indexeddb/cache';

/** One page and its scan history, newest scan first. */
export interface TimelineGroup {
  /** Normalized URL (stable identity — strips fragment / trailing slash). */
  url: string;
  /** Display title from the newest version. */
  title: string;
  /** Versions, newest first. */
  versions: Inspection[];
}

/** Cap per URL — the panel shows the most recent N versions. */
export const MAX_VERSIONS_PER_PAGE = 25;

/** Group inspections by normalized URL, newest version first per page. */
export function groupInspectionsByUrl(inspections: Inspection[]): TimelineGroup[] {
  const byUrl = new Map<string, Inspection[]>();
  for (const inspection of inspections) {
    const key = normalizeCacheUrl(inspection.page.url);
    const list = byUrl.get(key);
    if (list) list.push(inspection);
    else byUrl.set(key, [inspection]);
  }
  return [...byUrl.entries()]
    .map(([url, versions]) => ({
      url,
      title: versions[0]?.page.title || url,
      versions: versions.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_VERSIONS_PER_PAGE),
    }))
    .sort((a, b) => (b.versions[0]?.createdAt ?? 0) - (a.versions[0]?.createdAt ?? 0));
}
