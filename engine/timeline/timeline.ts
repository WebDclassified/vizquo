/**
 * Version timeline (Phase 10) — every stored scan of a URL as an ordered
 * history of versions. The history table keeps one entry per URL (newest
 * wins), but the inspections table retains every scan, so the timeline is
 * built by grouping inspections by their normalized URL — the same
 * normalization history upserts use, so grouping never disagrees with the
 * History tab.
 *
 * Works on the light `InspectionMeta` projection (no assets/findings) — the
 * list view only renders + diffs those fields; "Open" fetches the full
 * payload. Storage is capped at `MAX_VERSIONS_PER_PAGE` per URL by the
 * repository's GC, matching what this module renders.
 *
 * Pure — unit-testable without a browser.
 */

import { MAX_VERSIONS_PER_PAGE } from '../../shared/constants';
import type { InspectionMeta } from '../../shared/types';
import { normalizeCacheUrl } from '../../shared/url';

export { MAX_VERSIONS_PER_PAGE };

/** One page and its scan history, newest scan first. */
export interface TimelineGroup {
  /** Normalized URL (stable identity — strips fragment / trailing slash). */
  url: string;
  /** Display title from the newest version. */
  title: string;
  /** Versions, newest first. */
  versions: InspectionMeta[];
}

/** Group inspections by normalized URL, newest version first per page. */
export function groupInspectionsByUrl(inspections: InspectionMeta[]): TimelineGroup[] {
  const byUrl = new Map<string, InspectionMeta[]>();
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
