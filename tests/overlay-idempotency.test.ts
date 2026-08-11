import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERLAY,
  sameOverlayOptions,
  toOverlayOptions,
} from '../ui/screens/sidepanel/inspector/inspector-store';

describe('overlay idempotency (BUG: infinite recursion fix)', () => {
  it('treats a re-push of the same values as equal even with fresh boxModel objects', () => {
    // This is the exact recursion trigger: pushOverlayOptions builds a fresh
    // `merged` object every call (boxModel is always a new literal). The store
    // write re-triggered the InspectPanel effect that reads store.overlay,
    // which pushed again — infinite synchronous loop → stack overflow.
    const push = toOverlayOptions({
      ...DEFAULT_OVERLAY,
      boxModel: { ...DEFAULT_OVERLAY.boxModel },
    });
    const merged = toOverlayOptions({
      ...DEFAULT_OVERLAY,
      boxModel: { ...DEFAULT_OVERLAY.boxModel },
    });
    expect(merged.boxModel).not.toBe(push.boxModel);
    expect(sameOverlayOptions(push, merged)).toBe(true);
  });

  it('detects real changes in every field', () => {
    const base = toOverlayOptions(DEFAULT_OVERLAY);
    expect(
      sameOverlayOptions(base, toOverlayOptions({ ...DEFAULT_OVERLAY, measurements: false })),
    ).toBe(false);
    expect(
      sameOverlayOptions(base, toOverlayOptions({ ...DEFAULT_OVERLAY, clickThrough: true })),
    ).toBe(false);
    expect(
      sameOverlayOptions(base, toOverlayOptions({ ...DEFAULT_OVERLAY, measureMode: true })),
    ).toBe(false);
    expect(
      sameOverlayOptions(
        base,
        toOverlayOptions({
          ...DEFAULT_OVERLAY,
          boxModel: { ...DEFAULT_OVERLAY.boxModel, margin: false },
        }),
      ),
    ).toBe(false);
    expect(
      sameOverlayOptions(
        base,
        toOverlayOptions({
          ...DEFAULT_OVERLAY,
          boxModel: { ...DEFAULT_OVERLAY.boxModel, content: false },
        }),
      ),
    ).toBe(false);
  });

  it('compares every boxModel quadrant independently', () => {
    const base = toOverlayOptions(DEFAULT_OVERLAY);
    for (const key of ['margin', 'border', 'padding', 'content'] as const) {
      const other = toOverlayOptions({
        ...DEFAULT_OVERLAY,
        boxModel: { ...DEFAULT_OVERLAY.boxModel, [key]: false },
      });
      expect(sameOverlayOptions(base, other)).toBe(false);
    }
  });
});
