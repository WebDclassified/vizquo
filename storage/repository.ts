import type {
  CacheEntry,
  CacheStats,
  Collection,
  HistoryEntry,
  Inspection,
  Note,
  Screenshot,
} from '../shared/types';

/**
 * The single contract every feature depends on (Section 2.2). Nothing in
 * engine/ or ui/ talks to Dexie, IndexedDB, or chrome.storage directly.
 *
 * Swap the adapter in `storage/index.ts` (IndexedDB today → sql.js, a REST
 * API, Supabase, …) to move data elsewhere without touching a feature file.
 */
export interface VizquoRepository {
  /* ---- Inspections ---- */
  getInspection(id: string): Promise<Inspection | null>;
  saveInspection(inspection: Inspection): Promise<void>;
  listInspections(): Promise<Inspection[]>;
  deleteInspection(id: string): Promise<void>;

  /* ---- Collections ---- */
  getCollection(id: string): Promise<Collection | null>;
  saveCollection(collection: Collection): Promise<void>;
  listCollections(): Promise<Collection[]>;
  deleteCollection(id: string): Promise<void>;

  /* ---- Settings ---- */
  getSetting<T>(key: string): Promise<T | null>;
  setSetting<T>(key: string, value: T): Promise<void>;

  /* ---- Notes ---- */
  saveNote(note: Note): Promise<void>;
  listNotes(targetType?: string, targetId?: string): Promise<Note[]>;
  deleteNote(id: string): Promise<void>;

  /* ---- History ---- */
  getHistory(id: string): Promise<HistoryEntry | null>;
  saveHistory(entry: HistoryEntry): Promise<void>;
  listHistory(): Promise<HistoryEntry[]>;
  deleteHistory(id: string): Promise<void>;

  /* ---- Screenshots ---- */
  getScreenshot(id: string): Promise<Screenshot | null>;
  saveScreenshot(screenshot: Screenshot): Promise<void>;
  listScreenshots(): Promise<Screenshot[]>;
  deleteScreenshot(id: string): Promise<void>;

  /* ---- L3 persistent cache (Section 2.3) ---- */
  getCacheEntry<T>(key: string): Promise<CacheEntry<T> | null>;
  putCacheEntry(entry: CacheEntry): Promise<void>;
  listCacheEntries(): Promise<CacheEntry[]>;
  clearCache(): Promise<void>;
  getCacheStats(): Promise<CacheStats>;

  /* ---- Everything (Phase 9 power-up: Settings → Reset) ---- */
  /** Wipe every table — inspections, collections, notes, history, screenshots, cache, settings. */
  clearAll(): Promise<void>;
}
