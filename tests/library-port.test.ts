import { describe, expect, it } from 'vitest';
import { type LibraryDump, parseLibraryDump, serializeLibrary } from '../export/library-port';
import type { Collection, HistoryEntry, Inspection, Note, Screenshot } from '../shared/types';

function inspection(id = 'i1'): Inspection {
  return {
    id,
    page: { url: 'https://example.com', title: 'Example', scannedAt: 1 },
    createdAt: 1,
    tokens: { colors: [], fonts: [], spacing: [], radius: [], shadows: [] },
    assets: [],
    components: [],
    findings: [],
    variables: [],
    gradients: [],
    breakpoints: [],
    typeStyles: [],
    consistencyScore: 80,
    scanDurationMs: 10,
    technologies: [],
    containerQueries: [],
    viewportMeta: true,
    truncated: false,
    scannedElementCount: 1,
    metrics: {
      imageCount: 0,
      svgCount: 0,
      animationCount: 0,
      transitionCount: 0,
      breakpointCount: 0,
    },
    cached: false,
    stale: false,
  };
}

const collection: Collection = {
  id: 'c1',
  name: 'Inspo',
  createdAt: 1,
  updatedAt: 1,
  items: [],
};
const note: Note = {
  id: 'n1',
  targetType: 'inspection',
  targetId: 'i1',
  text: 'nice',
  createdAt: 1,
  updatedAt: 1,
};
const history: HistoryEntry = {
  id: 'h1',
  inspectionId: 'i1',
  page: { url: 'https://example.com', title: 'Example', scannedAt: 1 },
  scannedAt: 1,
  pinned: false,
};
const screenshot: Screenshot = {
  id: 's1',
  pageUrl: 'https://example.com',
  region: 'viewport',
  dataUrl: 'data:image/png;base64,AA==',
  width: 1,
  height: 1,
  createdAt: 1,
};

function dump(): Omit<LibraryDump, 'kind' | 'version' | 'exportedAt' | 'app'> {
  return {
    inspections: [inspection()],
    collections: [collection],
    notes: [note],
    history: [history],
    screenshots: [screenshot],
  };
}

describe('serializeLibrary / parseLibraryDump', () => {
  it('round-trips a full library', () => {
    const json = serializeLibrary(dump());
    const parsed = JSON.parse(json) as unknown;
    const result = parseLibraryDump(parsed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dump.inspections[0]?.id).toBe('i1');
      expect(result.dump.collections[0]?.name).toBe('Inspo');
      expect(result.dump.notes[0]?.text).toBe('nice');
      expect(result.dump.history[0]?.inspectionId).toBe('i1');
      expect(result.dump.screenshots[0]?.dataUrl).toBe('data:image/png;base64,AA==');
      expect(result.dump.version).toBe(1);
    }
  });

  it('rejects non-objects and non-library kinds', () => {
    expect(parseLibraryDump(null)).toEqual({
      ok: false,
      reason: expect.stringContaining('JSON object'),
    });
    expect(parseLibraryDump([1, 2, 3])).toEqual({
      ok: false,
      reason: expect.stringContaining('JSON object'),
    });
    expect(parseLibraryDump({ kind: 'something-else' })).toEqual({
      ok: false,
      reason: expect.stringContaining('Not a Vizquo library export'),
    });
  });

  it('rejects unknown/newer versions', () => {
    expect(parseLibraryDump({ kind: 'vizquo-library', version: 99 })).toEqual({
      ok: false,
      reason: expect.stringContaining('Unsupported export version'),
    });
  });

  it('rejects non-array sections and rows without ids', () => {
    expect(parseLibraryDump({ kind: 'vizquo-library', version: 1, inspections: 'nope' })).toEqual({
      ok: false,
      reason: expect.stringContaining('inspections section is not an array'),
    });
    expect(
      parseLibraryDump({ kind: 'vizquo-library', version: 1, notes: [{ text: 'no id' }] }),
    ).toEqual({ ok: false, reason: expect.stringContaining('notes has no valid id') });
  });

  it('deep-checks the required fields of each entity type', () => {
    // Inspections need page.url + createdAt + tokens.
    expect(
      parseLibraryDump({ kind: 'vizquo-library', version: 1, inspections: [{ id: 'x' }] }),
    ).toEqual({ ok: false, reason: expect.stringContaining('inspections has no valid page.url') });
    expect(
      parseLibraryDump({
        kind: 'vizquo-library',
        version: 1,
        inspections: [{ id: 'x', page: { url: 'https://a.com' }, createdAt: 1 }],
      }),
    ).toEqual({ ok: false, reason: expect.stringContaining('inspections has no tokens object') });
    // Collections need a name.
    expect(
      parseLibraryDump({
        kind: 'vizquo-library',
        version: 1,
        collections: [{ id: 'c1', createdAt: 1 }],
      }),
    ).toEqual({ ok: false, reason: expect.stringContaining('collections has no valid name') });
    // Notes need a targetType + targetId.
    expect(
      parseLibraryDump({
        kind: 'vizquo-library',
        version: 1,
        notes: [{ id: 'n1', targetType: 'inspection', text: 'x', createdAt: 1 }],
      }),
    ).toEqual({ ok: false, reason: expect.stringContaining('notes has no valid targetId') });
    // History needs a page with a url.
    expect(
      parseLibraryDump({
        kind: 'vizquo-library',
        version: 1,
        history: [{ id: 'h1', scannedAt: 1 }],
      }),
    ).toEqual({ ok: false, reason: expect.stringContaining('history has no valid page.url') });
    // Screenshots need a dataUrl.
    expect(
      parseLibraryDump({
        kind: 'vizquo-library',
        version: 1,
        screenshots: [{ id: 's1', pageUrl: 'https://a.com', createdAt: 1 }],
      }),
    ).toEqual({ ok: false, reason: expect.stringContaining('screenshots has no valid dataUrl') });
  });

  it('accepts rows with optional fields absent (pinned, elementRef, …)', () => {
    const result = parseLibraryDump({
      kind: 'vizquo-library',
      version: 1,
      history: [{ id: 'h1', inspectionId: 'i1', page: { url: 'https://a.com' }, scannedAt: 1 }],
      screenshots: [
        {
          id: 's1',
          pageUrl: 'https://a.com',
          region: 'viewport',
          dataUrl: 'data:image/png;base64,AA==',
          width: 1,
          height: 1,
          createdAt: 1,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts empty exports and tolerates missing sections', () => {
    const result = parseLibraryDump({ kind: 'vizquo-library', version: 1 });
    expect(result.ok).toBe(true);
  });

  it('is deterministic except for the exportedAt timestamp', () => {
    const a = JSON.parse(serializeLibrary(dump())) as LibraryDump;
    const b = JSON.parse(serializeLibrary(dump())) as LibraryDump;
    expect(a.inspections).toEqual(b.inspections);
    expect(a.collections).toEqual(b.collections);
  });
});
