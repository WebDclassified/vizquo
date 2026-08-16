import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ColorToken } from '../shared/types';
import { repository } from '../storage';
import {
  FAVORITES_ID,
  listFavoriteKeys,
  toggleFavorite,
} from '../ui/screens/sidepanel/library/favorites-client';
import { getCollection } from '../ui/screens/sidepanel/library/library-client';

describe('favorites flow (diag)', () => {
  beforeAll(async () => {
    await repository.clearAll();
  });

  it('toggles a color favorite and persists it', async () => {
    const token: ColorToken = {
      value: { hex: '#123456', oklch: 'oklch(0.4 0.1 250)', role: 'primary' },
      usageCount: 3,
      confidence: { level: 'detected', score: 1 },
      usedBy: [],
    };
    const now = await toggleFavorite({ kind: 'color', token });
    expect(now).toBe(true);

    const col = await getCollection(FAVORITES_ID);
    expect(col).not.toBeNull();
    expect(col?.items.length).toBe(1);
    expect(col?.items[0]?.kind).toBe('color');

    const keys = await listFavoriteKeys();
    expect(keys.has('color:#123456')).toBe(true);

    const removed = await toggleFavorite({ kind: 'color', token });
    expect(removed).toBe(false);
    const col2 = await getCollection(FAVORITES_ID);
    expect(col2?.items.length).toBe(0);
  });

  it('toggles an element favorite', async () => {
    const item = {
      kind: 'element' as const,
      element: {
        selector: 'div.hero',
        xpath: '/html/body/div[1]',
        domPath: [0, 0, 1],
      },
      label: 'Hero',
    };
    expect(await toggleFavorite(item)).toBe(true);
    const keys = await listFavoriteKeys();
    expect(keys.has('element:div.hero')).toBe(true);
    expect(await toggleFavorite(item)).toBe(false);
  });
});
