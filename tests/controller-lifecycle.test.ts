// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectController } from '../engine/inspect/controller';

// The controller publishes selection changes to browser.storage; in the test
// environment the real shim has no extension runtime, so stub it.
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

beforeEach(() => {
  document.head.innerHTML = '';
  // Remove overlay hosts left behind by earlier tests (disable() swaps in a
  // fresh overlay, so a non-destroyed controller keeps one in the DOM).
  for (const el of Array.from(document.querySelectorAll('div'))) el.remove();
  document.body.innerHTML = '<div id="a">x</div>';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('inspect controller lifecycle (observer/listener hygiene)', () => {
  it('enable/disable cycles do not leak document or window listeners', () => {
    const addDoc = vi.spyOn(document, 'addEventListener');
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const addWin = vi.spyOn(window, 'addEventListener');
    const removeWin = vi.spyOn(window, 'removeEventListener');

    const controller = new InspectController();
    for (let i = 0; i < 3; i += 1) {
      controller.enable();
      controller.disable();
    }
    // enable registers 10 listeners (6 document + 4 window); disable removes
    // the same 10. Net zero after every cycle — no linear growth.
    const added = addDoc.mock.calls.length + addWin.mock.calls.length;
    const removed = removeDoc.mock.calls.length + removeWin.mock.calls.length;
    expect(added).toBe(removed);
    expect(added).toBe(30); // 3 cycles × 10
  });

  it('enable() twice is idempotent — no duplicate listeners or observers', () => {
    const addDoc = vi.spyOn(document, 'addEventListener');
    const controller = new InspectController();
    controller.enable();
    controller.enable();
    // The second enable returns early: only the first pass registered.
    expect(addDoc.mock.calls.length).toBe(6);
    controller.disable();
  });

  it('disable restores the page history functions (pushState/replaceState)', () => {
    const controller = new InspectController();
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    controller.enable();
    // While enabled, the history API is patched to invalidate caches on SPA nav.
    expect(window.history.pushState).not.toBe(originalPush);
    controller.disable();
    expect(window.history.pushState).toBe(originalPush);
    expect(window.history.replaceState).toBe(originalReplace);
  });

  it('destroy() leaves the overlay out of the DOM', () => {
    const controller = new InspectController();
    controller.enable();
    // The page's own div + the overlay host appended to <html>.
    expect(document.querySelectorAll('div').length).toBe(2);
    controller.destroy();
    expect(document.querySelectorAll('div').length).toBe(1);
  });
});
