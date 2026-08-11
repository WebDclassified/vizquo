/**
 * Library portability (Phase 9) — export/import the local library as a single
 * JSON file (backup, migration, shareable collections).
 *
 * Pure functions, unit-tested: `serializeLibrary` produces a deterministic,
 * versioned document; `parseLibraryDump` validates it before anything is
 * written back, so a malformed or malicious file can never corrupt the local
 * database (untrusted input — Section 4 discipline). The import side runs in
 * the panel, which applies the dump through the repository.
 */
import type { Collection, HistoryEntry, Inspection, Note, Screenshot } from '../shared/types';

/** Schema tag for library dumps. Bump when the shape changes. */
export const LIBRARY_PORT_VERSION = 1;

/**
 * Maximum accepted import file size. Screenshots make exports heavy, but a
 * file beyond this is either corrupt or hostile — parsing it would risk
 * blowing the storage quota (never mind that it can't be a real export).
 */
export const LIBRARY_IMPORT_MAX_BYTES = 50 * 1024 * 1024;

export interface LibraryDump {
  kind: 'vizquo-library';
  version: number;
  exportedAt: number;
  app: string;
  inspections: Inspection[];
  collections: Collection[];
  notes: Note[];
  history: HistoryEntry[];
  screenshots: Screenshot[];
}

/** Serialize the library to a deterministic JSON document. */
export function serializeLibrary(
  data: Omit<LibraryDump, 'kind' | 'version' | 'exportedAt' | 'app'>,
): string {
  const dump: LibraryDump = {
    kind: 'vizquo-library',
    version: LIBRARY_PORT_VERSION,
    exportedAt: Date.now(),
    app: 'Vizquo',
    ...data,
  };
  return JSON.stringify(dump, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The five entity collections carried in a library dump. */
type LibrarySection = 'inspections' | 'collections' | 'notes' | 'history' | 'screenshots';

/**
 * Required-field checks per entity type — a row that passes parse must not
 * break the repository write or the UI that reads it back. Returns a
 * human-readable problem, or null when the row is acceptable.
 */
function rowProblem(key: LibrarySection, row: Record<string, unknown>): string | null {
  if (typeof row.id !== 'string' || row.id === '') return 'has no valid id';
  switch (key) {
    case 'inspections': {
      if (!isRecord(row.page) || typeof row.page.url !== 'string') {
        return 'has no valid page.url';
      }
      if (typeof row.createdAt !== 'number') return 'has no valid createdAt';
      if (!isRecord(row.tokens)) return 'has no tokens object';
      // The panels read these collections directly and unguarded
      // (DesignOverview, ColorSystem, CollectionsTab, …) — a row that passes
      // parse must not crash the UI that renders it. `tokens: {}` passes
      // `isRecord`, so the token collections are REQUIRED, not optional.
      for (const field of ['colors', 'fonts', 'spacing', 'radius', 'shadows']) {
        if (!Array.isArray(row.tokens[field])) {
          return `has no valid tokens.${field}`;
        }
      }
      // Later-added collections may be absent in older v1 exports — reject
      // only when present and wrong-typed.
      for (const field of ['typeStyles', 'findings', 'components', 'technologies']) {
        const value = row[field];
        if (value !== undefined && !Array.isArray(value)) {
          return `has a non-array ${field}`;
        }
      }
      return null;
    }
    case 'collections':
      if (typeof row.name !== 'string' || row.name === '') return 'has no valid name';
      if (typeof row.createdAt !== 'number') return 'has no valid createdAt';
      // `updatedAt` is the listing index key — a row missing it would import
      // successfully and then never appear in the collections list.
      if (typeof row.updatedAt !== 'number') return 'has no valid updatedAt';
      return null;
    case 'notes':
      if (typeof row.targetType !== 'string' || row.targetType === '') {
        return 'has no valid targetType';
      }
      if (typeof row.targetId !== 'string' || row.targetId === '') {
        return 'has no valid targetId';
      }
      if (typeof row.text !== 'string') return 'has no valid text';
      // `createdAt` is the listing index key — a note missing it would be
      // written but silently invisible in the notes list.
      if (typeof row.createdAt !== 'number') return 'has no valid createdAt';
      return null;
    case 'history': {
      if (!isRecord(row.page) || typeof row.page.url !== 'string') {
        return 'has no valid page.url';
      }
      if (typeof row.scannedAt !== 'number') return 'has no valid scannedAt';
      return null;
    }
    case 'screenshots':
      if (typeof row.pageUrl !== 'string' || row.pageUrl === '') {
        return 'has no valid pageUrl';
      }
      if (typeof row.dataUrl !== 'string' || row.dataUrl === '') {
        return 'has no valid dataUrl';
      }
      if (typeof row.createdAt !== 'number') return 'has no valid createdAt';
      return null;
  }
}

/**
 * Validate a parsed JSON value as a LibraryDump. Returns the typed dump when
 * valid, or a human-readable reason when not. Every field is shape-checked —
 * extra fields are ignored, missing/mistyped fields fail loudly.
 */
export function parseLibraryDump(
  value: unknown,
): { ok: true; dump: LibraryDump } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: 'The file is not a JSON object.' };
  if (value.kind !== 'vizquo-library') {
    return { ok: false, reason: 'Not a Vizquo library export (missing the kind marker).' };
  }
  const version = value.version;
  if (typeof version !== 'number' || version < 1 || version > LIBRARY_PORT_VERSION) {
    return {
      ok: false,
      reason: `Unsupported export version ${String(version)} — update Vizquo and retry.`,
    };
  }

  // Structural checks on each collection (fail fast on the outermost shape).
  const arrays: { key: LibrarySection; label: string }[] = [
    { key: 'inspections', label: 'inspections' },
    { key: 'collections', label: 'collections' },
    { key: 'notes', label: 'notes' },
    { key: 'history', label: 'history' },
    { key: 'screenshots', label: 'screenshots' },
  ];
  for (const { key, label } of arrays) {
    const arr = value[key];
    if (arr === undefined) continue; // older exports may omit empty sections
    if (!Array.isArray(arr)) {
      return { ok: false, reason: `The ${label} section is not an array.` };
    }
    // Per-row shape checks: id plus the required fields of that entity type.
    for (const [i, row] of arr.entries()) {
      if (!isRecord(row)) {
        return { ok: false, reason: `Row ${i + 1} of ${label} is not an object.` };
      }
      const problem = rowProblem(key, row);
      if (problem) {
        return { ok: false, reason: `Row ${i + 1} of ${label} ${problem}.` };
      }
    }
  }

  return {
    ok: true,
    dump: value as unknown as LibraryDump,
  };
}
