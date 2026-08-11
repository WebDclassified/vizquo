import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INSPECTION_SCHEMA_VERSION } from '../shared/constants';
import type {
  CacheEntry,
  Collection,
  HistoryEntry,
  Inspection,
  Note,
  Screenshot,
} from '../shared/types';
import { IndexedDbRepository } from '../storage/adapters/indexeddb/indexeddb-repository';
import { VizquoDatabase } from '../storage/adapters/indexeddb/schema';

let db: VizquoDatabase;
let repo: IndexedDbRepository;

function makeInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: 'ins-1',
    page: { url: 'https://example.com/', title: 'Example', scannedAt: 1000 },
    createdAt: 1000,
    tokens: { colors: [], fonts: [], spacing: [], radius: [], shadows: [] },
    assets: [],
    components: [],
    findings: [],
    // Phase 3 fields (schema v2).
    variables: [],
    gradients: [],
    breakpoints: [],
    typeStyles: [],
    consistencyScore: 100,
    scanDurationMs: 0,
    truncated: false,
    scannedElementCount: 0,
    metrics: {
      imageCount: 0,
      svgCount: 0,
      animationCount: 0,
      transitionCount: 0,
      breakpointCount: 0,
    },
    cached: false,
    stale: false,
    // Phase 5 fields (schema v4).
    technologies: [],
    containerQueries: [],
    viewportMeta: true,
    ...overrides,
  };
}

function makeCacheEntry(key: string, overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    key,
    kind: 'inspection',
    url: 'https://example.com/',
    fingerprint: 'abc123',
    schemaVersion: INSPECTION_SCHEMA_VERSION,
    createdAt: 1000,
    lastAccessedAt: 1000,
    sizeBytes: 64,
    data: { any: true },
    ...overrides,
  };
}

beforeEach(async () => {
  db = new VizquoDatabase(`vizquo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  repo = new IndexedDbRepository(db);
});

afterEach(async () => {
  await db.delete();
});

describe('inspections', () => {
  it('round-trips an inspection and lists newest-first', async () => {
    await repo.saveInspection(makeInspection({ id: 'a', createdAt: 100 }));
    await repo.saveInspection(makeInspection({ id: 'b', createdAt: 200 }));

    expect((await repo.getInspection('a'))?.id).toBe('a');
    expect(await repo.getInspection('missing')).toBeNull();

    const list = await repo.listInspections();
    expect(list.map((i) => i.id)).toEqual(['b', 'a']);

    await repo.deleteInspection('a');
    expect(await repo.getInspection('a')).toBeNull();
  });
});

describe('settings', () => {
  it('returns null for unknown keys and persists typed values', async () => {
    expect(await repo.getSetting('nope')).toBeNull();
    await repo.setSetting('settings.theme', 'dark');
    expect(await repo.getSetting('settings.theme')).toBe('dark');
    await repo.setSetting('settings.fontScale', 1.15);
    expect(await repo.getSetting<number>('settings.fontScale')).toBe(1.15);
  });
});

describe('collections, notes, history, screenshots', () => {
  it('persists a collection with items', async () => {
    const collection: Collection = {
      id: 'col-1',
      name: 'Buttons',
      createdAt: 1,
      updatedAt: 2,
      items: [{ kind: 'screenshot', id: 'shot-1' }],
    };
    await repo.saveCollection(collection);
    expect((await repo.getCollection('col-1'))?.name).toBe('Buttons');
    expect((await repo.listCollections())[0]?.id).toBe('col-1');
    await repo.deleteCollection('col-1');
    expect(await repo.getCollection('col-1')).toBeNull();
  });

  it('stores and filters notes by target', async () => {
    const note: Note = {
      id: 'n1',
      targetType: 'element',
      targetId: 'el-1',
      text: 'hero button',
      createdAt: 1,
      updatedAt: 1,
    };
    await repo.saveNote(note);
    const all = await repo.listNotes();
    expect(all).toHaveLength(1);
    const scoped = await repo.listNotes('element', 'el-1');
    expect(scoped.map((n) => n.id)).toEqual(['n1']);
    const other = await repo.listNotes('element', 'other');
    expect(other).toHaveLength(0);
    await repo.deleteNote('n1');
    expect(await repo.listNotes()).toHaveLength(0);
  });

  it('round-trips history entries', async () => {
    const entry: HistoryEntry = {
      id: 'h1',
      inspectionId: 'ins-1',
      page: { url: 'https://example.com/', title: 'Example', scannedAt: 5 },
      scannedAt: 5,
      pinned: true,
    };
    await repo.saveHistory(entry);
    expect((await repo.getHistory('h1'))?.pinned).toBe(true);
    expect((await repo.listHistory())[0]?.id).toBe('h1');
  });

  it('round-trips screenshots', async () => {
    const shot: Screenshot = {
      id: 's1',
      pageUrl: 'https://example.com/',
      region: 'viewport',
      dataUrl: 'data:image/png;base64,AAAA',
      width: 100,
      height: 80,
      createdAt: 1,
    };
    await repo.saveScreenshot(shot);
    expect((await repo.getScreenshot('s1'))?.width).toBe(100);
    await repo.deleteScreenshot('s1');
    expect(await repo.getScreenshot('s1')).toBeNull();
  });
});

describe('L3 cache', () => {
  it('stamps schema version and touches lastAccessedAt on read', async () => {
    await repo.putCacheEntry(makeCacheEntry('k1'));
    const before = await repo.getCacheEntry('k1');
    const beforeAt = before?.lastAccessedAt ?? 0;
    expect(before?.schemaVersion).toBe(INSPECTION_SCHEMA_VERSION);
    await new Promise((r) => setTimeout(r, 5));
    const after = await repo.getCacheEntry('k1');
    expect(after?.lastAccessedAt).toBeGreaterThanOrEqual(beforeAt);
  });

  it('invalidates entries whose schema version mismatches', async () => {
    await repo.putCacheEntry(makeCacheEntry('k1'));
    await db.cache.put({ ...makeCacheEntry('k2'), schemaVersion: 999 });
    expect(await repo.getCacheEntry('k2')).toBeNull();
    expect(await repo.getCacheEntry('k2')).toBeNull();
    const left = await repo.listCacheEntries();
    expect(left.map((e) => e.key)).toEqual(['k1']);
  });

  it('evicts blobs before inspection data when over budget', async () => {
    await repo.setSetting('cache.maxBytes', 120);
    // blob: 80 bytes, inspection: 80 bytes → total 160 > 120 → blob must go.
    await repo.putCacheEntry(
      makeCacheEntry('blob-1', { kind: 'blob', sizeBytes: 80, lastAccessedAt: 1 }),
    );
    await repo.putCacheEntry(
      makeCacheEntry('ins-1', { kind: 'inspection', sizeBytes: 80, lastAccessedAt: 2 }),
    );
    const keys = (await repo.listCacheEntries()).map((e) => e.key);
    expect(keys).toEqual(['ins-1']);
  });

  it('evicts least-recently-accessed within the same kind', async () => {
    await repo.setSetting('cache.maxBytes', 100);
    await repo.putCacheEntry(
      makeCacheEntry('old', { kind: 'inspection', sizeBytes: 60, lastAccessedAt: 1 }),
    );
    await repo.putCacheEntry(
      makeCacheEntry('new', { kind: 'inspection', sizeBytes: 60, lastAccessedAt: 2 }),
    );
    const keys = (await repo.listCacheEntries()).map((e) => e.key);
    expect(keys).toEqual(['new']);
  });

  it('clearAll wipes every table including settings', async () => {
    await repo.setSetting('settings.theme', 'dark');
    await repo.saveInspection(makeInspection());
    await repo.saveCollection({
      id: 'c1',
      name: 'C',
      createdAt: 1,
      updatedAt: 1,
      items: [],
    });
    await repo.saveNote({
      id: 'n1',
      targetType: 'inspection',
      targetId: 'i1',
      text: 'x',
      createdAt: 1,
      updatedAt: 1,
    });
    await repo.saveHistory({
      id: 'h1',
      inspectionId: 'ins-1',
      page: { url: 'https://example.com/', title: 'Example', scannedAt: 1 },
      scannedAt: 1,
      pinned: false,
    });
    await repo.saveScreenshot({
      id: 's1',
      pageUrl: 'https://example.com/',
      region: 'viewport',
      dataUrl: 'data:image/png;base64,AA==',
      width: 1,
      height: 1,
      createdAt: 1,
    });
    await repo.putCacheEntry(makeCacheEntry('k1'));

    await repo.clearAll();

    expect(await repo.listInspections()).toHaveLength(0);
    expect(await repo.listCollections()).toHaveLength(0);
    expect(await repo.listNotes()).toHaveLength(0);
    expect(await repo.listHistory()).toHaveLength(0);
    expect(await repo.listScreenshots()).toHaveLength(0);
    expect(await repo.listCacheEntries()).toHaveLength(0);
    expect(await repo.getSetting('settings.theme')).toBeNull();
  });

  it('reports cache stats and clears', async () => {
    await repo.setSetting('cache.maxBytes', 1024 * 1024);
    await repo.putCacheEntry(makeCacheEntry('a', { kind: 'inspection', sizeBytes: 100 }));
    await repo.putCacheEntry(makeCacheEntry('b', { kind: 'screenshot', sizeBytes: 300 }));
    const stats = await repo.getCacheStats();
    expect(stats.count).toBe(2);
    expect(stats.sizeBytes).toBe(400);
    expect(stats.byKind.inspection).toBe(100);
    expect(stats.byKind.screenshot).toBe(300);

    await repo.clearCache();
    expect((await repo.getCacheStats()).count).toBe(0);
  });
});
