import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INSPECTION_SCHEMA_VERSION, MAX_VERSIONS_PER_PAGE } from '../shared/constants';
import type { CacheEntry, Collection, HistoryEntry, Note, Screenshot } from '../shared/types';
import { IndexedDbRepository } from '../storage/adapters/indexeddb/indexeddb-repository';
import { VizquoDatabase } from '../storage/adapters/indexeddb/schema';
import { makeInspection } from './helpers/inspection';

let db: VizquoDatabase;
let repo: IndexedDbRepository;

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

  it('listInspectionMetas projects light rows (no assets/findings)', async () => {
    await repo.saveInspection(
      makeInspection({
        id: 'full',
        assets: [{ id: 'a1', type: 'image', url: 'https://x.test/a.png', source: 'img' }],
        components: [{ id: 'c1', name: 'Button', count: 1 } as never],
      }),
    );
    const metas = await repo.listInspectionMetas();
    expect(metas).toHaveLength(1);
    const meta = metas[0]!;
    expect(meta.id).toBe('full');
    expect(meta.consistencyScore).toBe(88); // fixture default survives the projection
    expect('assets' in meta).toBe(false);
    expect('components' in meta).toBe(false);
    // The full row is untouched.
    expect((await repo.getInspection('full'))?.assets).toHaveLength(1);
  });

  it('GC keeps the newest MAX_VERSIONS_PER_PAGE per URL and prunes the rest', async () => {
    const make = (id: string, url: string, createdAt: number) =>
      makeInspection({ id, createdAt, page: { url, title: 'X', scannedAt: createdAt } });
    // 5 beyond the cap for one URL + 1 for another URL.
    for (let i = 0; i < MAX_VERSIONS_PER_PAGE + 5; i += 1) {
      await repo.saveInspection(make(`same-${i}`, 'https://x.test/', i));
    }
    await repo.saveInspection(make('other-0', 'https://y.test/', 0));
    // Saving any history entry triggers GC (each scan lands here).
    await repo.saveHistory({
      id: 'h1',
      inspectionId: `same-${MAX_VERSIONS_PER_PAGE + 4}`, // newest scan
      page: { url: 'https://x.test/', title: 'X', scannedAt: MAX_VERSIONS_PER_PAGE + 4 },
      scannedAt: MAX_VERSIONS_PER_PAGE + 4,
      pinned: false,
    });

    const left = (await repo.listInspections()).map((i) => i.id).sort();
    // Per URL: newest 25 kept (same-5..same-29), oldest 5 pruned; other URL untouched.
    expect(left).toHaveLength(MAX_VERSIONS_PER_PAGE + 1);
    for (let i = 0; i < MAX_VERSIONS_PER_PAGE; i += 1) {
      expect(left).toContain(`same-${i + 5}`);
    }
    for (let i = 0; i < 5; i += 1) {
      expect(left).not.toContain(`same-${i}`);
    }
    expect(left).toContain('other-0');
  });

  it('GC keeps history-referenced inspections even past the per-URL cap', async () => {
    const make = (id: string, createdAt: number) =>
      makeInspection({
        id,
        createdAt,
        page: { url: 'https://x.test/', title: 'X', scannedAt: createdAt },
      });
    for (let i = 0; i < MAX_VERSIONS_PER_PAGE + 5; i += 1) {
      await repo.saveInspection(make(`v-${i}`, i));
    }
    // Reference an OLD version directly (simulates a pinned older entry).
    await repo.saveHistory({
      id: 'h-old',
      inspectionId: 'v-0',
      page: { url: 'https://x.test/', title: 'X', scannedAt: 0 },
      scannedAt: 0,
      pinned: true,
    });
    const left = (await repo.listInspections()).map((i) => i.id);
    expect(left).toContain('v-0');
    // Newest 25 still kept alongside it.
    expect(left.filter((id) => id.startsWith('v-'))).toHaveLength(MAX_VERSIONS_PER_PAGE + 1);
  });

  it('deleteHistory also prunes the inspection rows it orphaned', async () => {
    const make = (id: string, createdAt: number) =>
      makeInspection({
        id,
        createdAt,
        page: { url: 'https://x.test/', title: 'X', scannedAt: createdAt },
      });
    for (let i = 0; i < MAX_VERSIONS_PER_PAGE + 5; i += 1) {
      await repo.saveInspection(make(`v-${i}`, i));
    }
    await repo.saveHistory({
      id: 'h1',
      inspectionId: `v-${MAX_VERSIONS_PER_PAGE + 4}`,
      page: { url: 'https://x.test/', title: 'X', scannedAt: MAX_VERSIONS_PER_PAGE + 4 },
      scannedAt: MAX_VERSIONS_PER_PAGE + 4,
      pinned: false,
    });
    // Deleting the only history entry re-runs GC: the referenced newest scan
    // is kept (still within the cap), the older ones stay pruned.
    await repo.deleteHistory('h1');
    expect(await repo.listHistory()).toHaveLength(0);
    const left = (await repo.listInspections()).map((i) => i.id);
    expect(left).toHaveLength(MAX_VERSIONS_PER_PAGE);
    expect(left).toContain(`v-${MAX_VERSIONS_PER_PAGE + 4}`);
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
