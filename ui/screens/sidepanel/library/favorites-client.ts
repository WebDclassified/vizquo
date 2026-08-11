/**
 * Favorites (Phase 9 power-up) — a one-click star for page artifacts. All
 * favorites live in a single stable "Favorites" collection, so the Library's
 * Collections tab renders them with zero new UI. Dedupe is by a per-kind
 * identity key, which is also the star's state lookup.
 */
import type { Collection, CollectionItem } from '../../../../shared/types';
import { repository } from '../../../../storage';
import { addCollectionItems, getCollection, removeCollectionItem } from './library-client';

export const FAVORITES_ID = 'col-favorites';
export const FAVORITES_NAME = 'Favorites';

/** Stable identity key per item kind — dedupe + star state. */
export function favoriteKey(item: CollectionItem): string {
  switch (item.kind) {
    case 'color':
      return `color:${item.token.value.hex}`;
    case 'font':
      return `font:${item.token.value.family}:${item.token.value.weight}`;
    case 'element':
      return `element:${item.element.selector}`;
    case 'component':
      return `component:${item.component.type}`;
    case 'asset':
      return `asset:${item.asset.url}`;
    case 'screenshot':
      return `screenshot:${item.id}`;
  }
}

/** Create the Favorites collection once; reuse it forever after. */
async function ensureFavorites(): Promise<Collection | null> {
  const existing = await getCollection(FAVORITES_ID);
  if (existing) return existing;
  const collection: Collection = {
    id: FAVORITES_ID,
    name: FAVORITES_NAME,
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

/** The set of favorite keys currently stored (for star state). */
export async function listFavoriteKeys(): Promise<Set<string>> {
  const favorites = await getCollection(FAVORITES_ID);
  return new Set((favorites?.items ?? []).map(favoriteKey));
}

/**
 * Add or remove one item; returns the new state (true = now a favorite).
 *
 * Toggles are serialized through a module-level promise chain: the underlying
 * read-modify-write on the collection is not atomic, so two rapid clicks on
 * the same star could otherwise re-add after a remove (or vice versa) and
 * desync the star state from storage.
 */
let toggleQueue: Promise<unknown> = Promise.resolve();

export function toggleFavorite(item: CollectionItem): Promise<boolean> {
  const run = toggleQueue.then(() => doToggle(item));
  toggleQueue = run.catch(() => undefined);
  return run;
}

async function doToggle(item: CollectionItem): Promise<boolean> {
  const favorites = await ensureFavorites();
  if (!favorites) return false;
  const key = favoriteKey(item);
  const index = favorites.items.findIndex((existing) => favoriteKey(existing) === key);
  if (index >= 0) {
    await removeCollectionItem(favorites, index);
    return false;
  }
  const updated = await addCollectionItems(favorites, [item]);
  return updated != null;
}
