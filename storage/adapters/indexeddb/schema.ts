/**
 * Dexie schema for the default repository adapter (Section 2.2).
 *
 * Feature code must NEVER touch these tables directly — everything goes
 * through VizquoRepository.
 */
import Dexie, { type EntityTable } from 'dexie';
import type {
  CacheEntry,
  Collection,
  HistoryEntry,
  Inspection,
  Note,
  Screenshot,
} from '../../../shared/types';

export interface SettingsRow {
  key: string;
  value: unknown;
  updatedAt: number;
}

export const DB_NAME = 'vizquo';
export const DB_VERSION = 1;

export class VizquoDatabase extends Dexie {
  inspections!: EntityTable<Inspection, 'id'>;
  collections!: EntityTable<Collection, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  notes!: EntityTable<Note, 'id'>;
  history!: EntityTable<HistoryEntry, 'id'>;
  screenshots!: EntityTable<Screenshot, 'id'>;
  cache!: EntityTable<CacheEntry, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(DB_VERSION).stores({
      inspections: 'id, page.url, createdAt',
      collections: 'id, name, updatedAt',
      settings: 'key, updatedAt',
      notes: 'id, targetType, targetId, createdAt',
      history: 'id, page.url, scannedAt, pinned',
      screenshots: 'id, createdAt',
      cache: 'key, kind, url, lastAccessedAt, sizeBytes',
    });
  }
}
