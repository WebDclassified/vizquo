/**
 * Library client (Phase 8) — the panel's data-access layer for the Library
 * screen. Every call wraps the repository (Section 2.2) with honest empty
 * fallbacks: storage failures surface as empty lists, never as crashes.
 *
 * Collections, history, notes, and screenshots are all local-only (nothing
 * leaves the browser); inspections referenced by history are read back from
 * the inspections table.
 */
import type {
  Collection,
  CollectionItem,
  HistoryEntry,
  Inspection,
  InspectionMeta,
  Note,
  Screenshot,
} from '../../../../shared/types';
import { repository } from '../../../../storage';

/* ---- Collections ---- */

export async function listCollections(): Promise<Collection[]> {
  try {
    return await repository.listCollections();
  } catch {
    return [];
  }
}

export async function getCollection(id: string): Promise<Collection | null> {
  try {
    return await repository.getCollection(id);
  } catch {
    return null;
  }
}

export async function createCollection(name: string): Promise<Collection | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const collection: Collection = {
    id: `col-${Date.now()}`,
    name: trimmed,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [],
  };
  try {
    await repository.saveCollection(collection);
    return collection;
  } catch {
    return null;
  }
}

export async function deleteCollection(id: string): Promise<void> {
  try {
    await repository.deleteCollection(id);
  } catch {
    // Best-effort.
  }
}

/** Add items to a collection (one atomic save through the repository). */
export async function addCollectionItems(
  collection: Collection,
  items: CollectionItem[],
): Promise<Collection | null> {
  if (items.length === 0) return collection;
  const next: Collection = {
    ...collection,
    items: [...collection.items, ...items],
    updatedAt: Date.now(),
  };
  try {
    await repository.saveCollection(next);
    return next;
  } catch {
    return null;
  }
}

export async function removeCollectionItem(
  collection: Collection,
  index: number,
): Promise<Collection | null> {
  const next: Collection = {
    ...collection,
    items: collection.items.filter((_, i) => i !== index),
    updatedAt: Date.now(),
  };
  try {
    await repository.saveCollection(next);
    return next;
  } catch {
    return null;
  }
}

/* ---- Inspections (version timeline source) ---- */

/** Every stored inspection, newest first (Phase 10 version timeline). */
export async function listInspections(): Promise<Inspection[]> {
  try {
    return await repository.listInspections();
  } catch {
    return [];
  }
}

/** Light projections (no assets/findings) — the version timeline renders and
 * diffs from these and fetches the full payload only when a version is opened. */
export async function listInspectionMetas(): Promise<InspectionMeta[]> {
  try {
    return await repository.listInspectionMetas();
  } catch {
    return [];
  }
}

/* ---- History ---- */

export async function listHistory(): Promise<HistoryEntry[]> {
  try {
    return await repository.listHistory();
  } catch {
    return [];
  }
}

export async function setHistoryPinned(id: string, pinned: boolean): Promise<void> {
  try {
    const entry = await repository.getHistory(id);
    if (entry) await repository.saveHistory({ ...entry, pinned });
  } catch {
    // Best-effort.
  }
}

export async function deleteHistory(id: string): Promise<void> {
  try {
    await repository.deleteHistory(id);
  } catch {
    // Best-effort.
  }
}

/** Read a stored inspection back (history "open"). */
export async function getInspection(id: string): Promise<Inspection | null> {
  try {
    return await repository.getInspection(id);
  } catch {
    return null;
  }
}

/* ---- Notes ---- */

export async function listNotes(): Promise<Note[]> {
  try {
    return await repository.listNotes();
  } catch {
    return [];
  }
}

export async function saveNote(
  text: string,
  targetType: Note['targetType'],
  targetId: string,
): Promise<Note | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const now = Date.now();
  const note: Note = {
    id: `note-${now}`,
    targetType,
    targetId,
    text: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await repository.saveNote(note);
    return note;
  } catch {
    return null;
  }
}

export async function deleteNote(id: string): Promise<void> {
  try {
    await repository.deleteNote(id);
  } catch {
    // Best-effort.
  }
}

/** One inspection a compare/report tab can pick from (history-backed). */
export interface InspectionCandidate {
  id: string;
  label: string;
  inspection: Inspection;
}

/**
 * Load every past inspection referenced by history, newest first. The current
 * live inspection is added by the tabs themselves (it lives in the store).
 */
export async function loadInspectionCandidates(): Promise<InspectionCandidate[]> {
  const history = await listHistory();
  const loaded = await Promise.all(
    history.map(async (entry) => ({ entry, inspection: await getInspection(entry.inspectionId) })),
  );
  return loaded
    .filter((x): x is { entry: HistoryEntry; inspection: Inspection } => x.inspection != null)
    .sort((a, b) => b.entry.scannedAt - a.entry.scannedAt)
    .map(({ entry, inspection }) => ({
      id: `h-${entry.id}`,
      label: entry.page.title || entry.page.url,
      inspection,
    }));
}

/* ---- Screenshots (collection items reference them by id) ---- */

export async function listScreenshots(): Promise<Screenshot[]> {
  try {
    return await repository.listScreenshots();
  } catch {
    return [];
  }
}
