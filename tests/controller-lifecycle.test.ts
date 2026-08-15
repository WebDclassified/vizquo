// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRef } from '../engine/dom/ref';
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
    // The contextmenu listener is registered ONCE in the constructor (so the
    // "Inspect with Vizquo" right-click handoff works with inspect mode OFF)
    // and is never removed — it lives as long as the content script. enable
    // registers the other 9 (5 document + 4 window) and disable removes
    // exactly those 9: exactly one listener remains after every cycle.
    const added = addDoc.mock.calls.length + addWin.mock.calls.length;
    const removed = removeDoc.mock.calls.length + removeWin.mock.calls.length;
    expect(added - removed).toBe(1); // the constructor's contextmenu listener
    expect(added).toBe(28); // 1 (constructor) + 3 cycles × 9
  });

  it('enable() twice is idempotent — no duplicate listeners or observers', () => {
    const addDoc = vi.spyOn(document, 'addEventListener');
    const controller = new InspectController();
    controller.enable();
    controller.enable();
    // The second enable returns early: the constructor registered contextmenu
    // once, the first enable registered the other 5 document listeners.
    expect(addDoc.mock.calls.length).toBe(6);
    controller.disable();
  });

  it('context-menu target is tracked even with inspect mode OFF (right-click handoff)', () => {
    const controller = new InspectController();
    // Never enabled — the "Inspect with Vizquo" entry point runs before any
    // inspect-mode toggle, so the right-click target must be recorded anyway.
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(controller.getContextTarget()).not.toBeNull();
    expect(controller.isEnabled()).toBe(false);
    controller.destroy();
  });

  it('context-menu target survives enable/disable cycles', () => {
    const controller = new InspectController();
    const div = document.createElement('div');
    document.body.appendChild(div);
    controller.enable();
    controller.disable();
    // The listener is constructor-owned; disable must not unregister it.
    div.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(controller.getContextTarget()).not.toBeNull();
    controller.destroy();
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

  it('selectRef with flash scrolls the element into view and pulses the overlay (handoff UX)', () => {
    vi.useFakeTimers();
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const controller = new InspectController();
    const div = document.createElement('div');
    div.id = 'flash-me';
    document.body.appendChild(div);

    const result = controller.selectRef(makeRef(div), { flash: true });

    expect(result.ok).toBe(true);
    // Locked AND scrolled into view — the flash must be visible to the user.
    expect(controller.getLockedRef()?.selector).toContain('flash-me');
    expect(scroll).toHaveBeenCalledTimes(1);

    // After the smooth scroll settles, the flash box shows with the chip.
    vi.advanceTimersByTime(400);
    const host = Array.from(document.querySelectorAll('div')).find((d) => d.shadowRoot);
    expect(host).toBeDefined();
    const flash = host?.shadowRoot?.querySelector('.vq-flash') as HTMLElement | null;
    expect(flash?.hidden).toBe(false);
    expect(host?.shadowRoot?.querySelector('.vq-flash-chip')?.textContent).toBe(
      'Inspect with Vizquo',
    );

    // The pulse auto-clears — it must not linger on the page.
    vi.advanceTimersByTime(1900);
    expect(flash?.hidden).toBe(true);

    // No flash when the flag is absent (DOM-tree clicks stay quiet).
    const quiet = new InspectController();
    expect(quiet.selectRef(makeRef(div)).ok).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);

    controller.destroy();
    quiet.destroy();
    vi.useRealTimers();
  });

  it('a lock on a REMOVED element is surfaced honestly (never a ghost ref)', () => {
    const controller = new InspectController();
    controller.enable();
    const div = document.createElement('div');
    div.id = 'gone';
    document.body.appendChild(div);
    expect(controller.selectRef(makeRef(div)).ok).toBe(true);
    expect(controller.getLockedRef()).not.toBeNull();
    // SPA-style removal: the element leaves the document.
    div.remove();
    // The state must NOT claim a valid-looking lock on a detached element.
    expect(controller.getLockedRef()).toBeNull();
    // getState is what the panel renders — it must read REMOVED, not VALID.
    const state = controller.getState();
    expect(state.enabled).toBe(true);
    expect(state.locked).toBeNull();
    controller.disable();
    controller.destroy();
  });

  it('disable() mid-flash cancels the pulse — no flash ghost on the fresh overlay', () => {
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const controller = new InspectController();
    const div = document.createElement('div');
    div.id = 'flash-ghost';
    document.body.appendChild(div);

    controller.enable();
    expect(controller.selectRef(makeRef(div), { flash: true }).ok).toBe(true);
    // disable() while the smooth-scroll settle timer is pending — the pulse
    // must never be drawn on the overlay that replace()s the old one.
    controller.disable();
    vi.advanceTimersByTime(400);
    const host = Array.from(document.querySelectorAll('div')).find((d) => d.shadowRoot);
    const flash = host?.shadowRoot?.querySelector('.vq-flash') as HTMLElement | null;
    expect(flash?.hidden).toBe(true); // no ghost

    // And no late auto-clear throws against the replaced overlay.
    vi.advanceTimersByTime(2000);
    expect(flash?.hidden).toBe(true);

    controller.destroy();
    vi.useRealTimers();
  });
});
