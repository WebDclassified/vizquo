/**
 * Default repository adapter: Dexie over IndexedDB (Section 2.2). 100% local,
 * zero configuration, works offline. Swappable via storage/index.ts.
 */
import {
  DEFAULT_CACHE_MAX_BYTES,
  INSPECTION_SCHEMA_VERSION,
  MAX_VERSIONS_PER_PAGE,
  SETTING_KEYS,
} from '../../../shared/constants';
import type {
  CacheEntry,
  CacheStats,
  Collection,
  HistoryEntry,
  Inspection,
  InspectionMeta,
  Note,
  Screenshot,
} from '../../../shared/types';
import { normalizeCacheUrl } from '../../../shared/url';
import type { VizquoRepository } from '../../repository';
import { evictToBudget, totalCacheBytes } from './cache';
import type { VizquoDatabase } from './schema';

export class IndexedDbRepository implements VizquoRepository {
  constructor(private readonly db: VizquoDatabase) {}

  /* ---- Inspections ---- */
  async getInspection(id: string): Promise<Inspection | null> {
    return (await this.db.inspections.get(id)) ?? null;
  }
  async saveInspection(inspection: Inspection): Promise<void> {
    await this.db.inspections.put(inspection);
  }
  async listInspections(): Promise<Inspection[]> {
    return this.db.inspections.orderBy('createdAt').reverse().toArray();
  }
  async listInspectionMetas(): Promise<InspectionMeta[]> {
    const rows = await this.db.inspections.orderBy('createdAt').reverse().toArray();
    // Project to the timeline's needs so list views never hold asset/finding
    // payloads (SVG markup, element refs) in memory at once.
    return rows.map(
      ({
        id,
        page,
        createdAt,
        tokens,
        gradients,
        breakpoints,
        technologies,
        consistencyScore,
        scannedElementCount,
      }) => ({
        id,
        page,
        createdAt,
        tokens,
        gradients,
        breakpoints,
        technologies,
        consistencyScore,
        scannedElementCount,
      }),
    );
  }
  async deleteInspection(id: string): Promise<void> {
    await this.db.inspections.delete(id);
  }

  /* ---- Collections ---- */
  async getCollection(id: string): Promise<Collection | null> {
    return (await this.db.collections.get(id)) ?? null;
  }
  async saveCollection(collection: Collection): Promise<void> {
    await this.db.collections.put(collection);
  }
  async listCollections(): Promise<Collection[]> {
    return this.db.collections.orderBy('updatedAt').reverse().toArray();
  }
  async deleteCollection(id: string): Promise<void> {
    await this.db.collections.delete(id);
  }

  /* ---- Settings ---- */
  async getSetting<T>(key: string): Promise<T | null> {
    const row = await this.db.settings.get(key);
    return row ? (row.value as T) : null;
  }
  async setSetting<T>(key: string, value: T): Promise<void> {
    await this.db.settings.put({ key, value, updatedAt: Date.now() });
  }

  /* ---- Notes ---- */
  async saveNote(note: Note): Promise<void> {
    await this.db.notes.put(note);
  }
  async listNotes(targetType?: string, targetId?: string): Promise<Note[]> {
    let notes = await this.db.notes.orderBy('createdAt').reverse().toArray();
    if (targetType) notes = notes.filter((n) => n.targetType === targetType);
    if (targetId) notes = notes.filter((n) => n.targetId === targetId);
    return notes;
  }
  async deleteNote(id: string): Promise<void> {
    await this.db.notes.delete(id);
  }

  /* ---- History ---- */
  async getHistory(id: string): Promise<HistoryEntry | null> {
    return (await this.db.history.get(id)) ?? null;
  }
  async saveHistory(entry: HistoryEntry): Promise<void> {
    await this.db.history.put(entry);
    // Every scan lands here — enforce the per-URL version cap continuously.
    await this.gcInspections();
  }
  async listHistory(): Promise<HistoryEntry[]> {
    return this.db.history.orderBy('scannedAt').reverse().toArray();
  }
  async deleteHistory(id: string): Promise<void> {
    await this.db.history.delete(id);
    // Deleting history no longer leaves inspection rows behind forever.
    await this.gcInspections();
  }

  /* ---- Screenshots ---- */
  async getScreenshot(id: string): Promise<Screenshot | null> {
    return (await this.db.screenshots.get(id)) ?? null;
  }
  async saveScreenshot(screenshot: Screenshot): Promise<void> {
    await this.db.screenshots.put(screenshot);
  }
  async listScreenshots(): Promise<Screenshot[]> {
    return this.db.screenshots.orderBy('createdAt').reverse().toArray();
  }
  async deleteScreenshot(id: string): Promise<void> {
    await this.db.screenshots.delete(id);
  }

  /* ---- L3 persistent cache (Section 2.3) ---- */
  async getCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
    const row = await this.db.cache.get(key);
    if (!row) return null;
    // A schema-version bump invalidates rather than risking a malformed read.
    if (row.schemaVersion !== INSPECTION_SCHEMA_VERSION) {
      await this.db.cache.delete(key);
      return null;
    }
    // Touch LRU timestamp on read.
    if (row.lastAccessedAt !== Date.now()) {
      await this.db.cache.update(key, { lastAccessedAt: Date.now() });
    }
    return row as CacheEntry<T>;
  }

  async putCacheEntry(entry: CacheEntry): Promise<void> {
    const now = Date.now();
    // Monotonic recency: a wall clock can step backward (NTP sync), which
    // would make a just-written entry look older and break LRU eviction.
    const newest = await this.db.cache.orderBy('lastAccessedAt').last();
    const stamped: CacheEntry = {
      ...entry,
      schemaVersion: INSPECTION_SCHEMA_VERSION,
      createdAt: entry.createdAt || now,
      lastAccessedAt: Math.max(now, (newest?.lastAccessedAt ?? 0) + 1),
    };
    await this.db.cache.put(stamped);
    await this.evictToBudget();
  }

  async listCacheEntries(): Promise<CacheEntry[]> {
    return this.db.cache.toArray();
  }

  async clearCache(): Promise<void> {
    await this.db.cache.clear();
  }

  async getCacheStats(): Promise<CacheStats> {
    const entries = await this.db.cache.toArray();
    const byKind = { inspection: 0, screenshot: 0, blob: 0 };
    for (const entry of entries) {
      byKind[entry.kind] += entry.sizeBytes || 0;
    }
    const lastScannedAt = entries.map((e) => e.createdAt).sort((a, b) => b - a)[0];
    return {
      count: entries.length,
      sizeBytes: totalCacheBytes(entries),
      byKind,
      lastScannedAt,
    };
  }
  /* ---- Everything (Phase 9 power-up: Settings → Reset) ---- */
  async clearAll(): Promise<void> {
    await Promise.all([
      this.db.inspections.clear(),
      this.db.collections.clear(),
      this.db.notes.clear(),
      this.db.history.clear(),
      this.db.screenshots.clear(),
      this.db.cache.clear(),
      this.db.settings.clear(),
    ]);
  }

  /**
   * Bound the inspections table: keep every version history still references
   * (pinned or not) plus the newest MAX_VERSIONS_PER_PAGE per URL — exactly
   * what the version timeline renders. Older versions were never displayed,
   * so removing them is invisible; this stops storage growing unboundedly
   * when a page is rescanned hundreds of times. Runs on history writes.
   */
  private async gcInspections(): Promise<void> {
    const [history, inspections] = await Promise.all([
      this.db.history.toArray(),
      this.db.inspections.toArray(),
    ]);
    if (inspections.length === 0) return;
    const keep = new Set(history.map((h) => h.inspectionId));
    const byUrl = new Map<string, Inspection[]>();
    for (const inspection of inspections) {
      const key = normalizeCacheUrl(inspection.page.url);
      const list = byUrl.get(key);
      if (list) list.push(inspection);
      else byUrl.set(key, [inspection]);
    }
    for (const list of byUrl.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt);
      for (const inspection of list.slice(0, MAX_VERSIONS_PER_PAGE)) keep.add(inspection.id);
    }
    const doomed = inspections.filter((i) => !keep.has(i.id));
    if (doomed.length > 0) {
      await this.db.inspections.bulkDelete(doomed.map((i) => i.id));
    }
  }

  private async evictToBudget(): Promise<void> {
    const maxBytes =
      (await this.getSetting<number>(SETTING_KEYS.cacheMaxBytes)) ?? DEFAULT_CACHE_MAX_BYTES;
    const entries = await this.db.cache.toArray();
    if (totalCacheBytes(entries) <= maxBytes) return;
    const survivors = evictToBudget(entries, maxBytes);
    const survivorKeys = new Set(survivors.map((e) => e.key));
    const doomed = entries.filter((e) => !survivorKeys.has(e.key));
    if (doomed.length > 0) {
      await this.db.cache.bulkDelete(doomed.map((e) => e.key));
    }
  }
}
