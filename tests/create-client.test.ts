// @vitest-environment happy-dom
/**
 * Screenshot capture flow tests (Section 7.20) — the create-client bridge:
 *   - captureViewport: web-tab guard, success, and background failure paths.
 *   - captureFullpage: single-capture short pages, multi-tile stitching, the
 *     too-tall honesty cap, and scroll restoration even when a tile fails.
 *
 * Canvas 2D and Image decoding are not implemented by happy-dom, so they are
 * stubbed — the tests exercise the orchestration (geometry, positions, scroll
 * calls, tile loop, composite) rather than pixels.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureFullpage,
  captureViewport,
  isWebTab,
} from '../ui/screens/sidepanel/create/create-client';
import { setUi, ui } from '../ui/stores/ui-store';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  sendTabMessage: vi.fn(),
}));

// The BUG-H-004 fix routes content-script sends (live edit, geometry, scroll)
// through sendTabMessage(ui.connection.tabId, …); captureFullpage therefore
// exercises BOTH paths. This mock mirrors the module's real exports.
vi.mock('../shared/messages', () => ({
  sendMessage: mocks.sendMessage,
  sendTabMessage: mocks.sendTabMessage,
}));

/** Delegate sendTabMessage(tabId, type, data) into the sendMessage mock so
 *  every assertion below stays on the `(type, data)` call shape. */
function mirrorSendTabToSendMessage(): void {
  mocks.sendTabMessage.mockImplementation((_tabId, type, data) => mocks.sendMessage(type, data));
}
// The only .tsx module in the import graph — Solid JSX isn't wired into
// vitest, so stub it (notify is not what these tests assert).
vi.mock('../ui/stores/toast', () => ({ notify: vi.fn() }));

const PNG = 'data:image/png;base64,AAAA';

/** A fake 2D context for the stitch canvas. */
const fakeCtx = {
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
};

/** A fake Image whose src setter schedules onload (happy-dom never decodes). */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 10;
  naturalHeight = 10;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function setWebTab(url = 'https://example.com/'): void {
  setUi('connection', {
    status: 'connected',
    tabId: 7,
    tabUrl: url,
    tabTitle: 'Example',
    contentOk: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mirrorSendTabToSendMessage();
  setWebTab();
  vi.stubGlobal('Image', FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeCtx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUJD');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('captureViewport', () => {
  it('returns the data URL from the background', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true, dataUrl: PNG });

    const result = await captureViewport();

    expect(result).toMatchObject({ ok: true, dataUrl: PNG });
    expect(mocks.sendMessage).toHaveBeenCalledWith('CAPTURE_VIEWPORT', undefined);
  });

  it('guards non-web tabs without messaging', async () => {
    setWebTab('chrome://extensions/');

    const result = await captureViewport();

    expect(result.ok).toBe(false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('reports an honest error when the background refuses', async () => {
    mocks.sendMessage.mockRejectedValue(new Error('worker gone'));

    const result = await captureViewport();

    expect(result).toMatchObject({ ok: false });
  });

  it('exposes isWebTab for the studio guards', () => {
    expect(isWebTab()).toBe(true);
    setWebTab('chrome-extension://abc/sidepanel.html');
    expect(isWebTab()).toBe(false);
  });
});

describe('captureFullpage', () => {
  it('single capture when the page fits the viewport — no stitching', async () => {
    mocks.sendMessage.mockImplementation(async (type) => {
      if (type === 'GET_PAGE_GEOMETRY') {
        return {
          scrollY: 0,
          scrollHeight: 800,
          viewportHeight: 1000,
          scrollWidth: 800,
          viewportWidth: 800,
          devicePixelRatio: 1,
        };
      }
      if (type === 'CAPTURE_VIEWPORT') return { ok: true, dataUrl: PNG };
      throw new Error(`unexpected ${type}`);
    });

    const result = await captureFullpage();

    expect(result.ok).toBe(true);
    // Geometry probe + the single capture — no stitching, no extra scrolls.
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage).toHaveBeenCalledWith('CAPTURE_VIEWPORT', undefined);
    expect(mocks.sendMessage.mock.calls.map(([t]) => t)).toEqual([
      'GET_PAGE_GEOMETRY',
      'CAPTURE_VIEWPORT',
    ]);
  });

  it('stitches tiles for a tall page and restores the original scroll', async () => {
    mocks.sendMessage.mockImplementation(async (type, data) => {
      if (type === 'GET_PAGE_GEOMETRY') {
        return {
          scrollY: 120,
          scrollHeight: 3000,
          viewportHeight: 1000,
          scrollWidth: 800,
          viewportWidth: 800,
          devicePixelRatio: 1,
        };
      }
      if (type === 'SCROLL_TO') return { y: data.y };
      if (type === 'CAPTURE_VIEWPORT') return { ok: true, dataUrl: PNG };
      throw new Error(`unexpected ${type}`);
    });

    const result = await captureFullpage();

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, width: 800, height: 3000 });
    // 3 tiles + 1 restore scroll; 3 captures.
    const scrolls = mocks.sendMessage.mock.calls.filter(([t]) => t === 'SCROLL_TO');
    const captures = mocks.sendMessage.mock.calls.filter(([t]) => t === 'CAPTURE_VIEWPORT');
    expect(captures).toHaveLength(3);
    expect(scrolls).toHaveLength(4);
    // The last scroll must put the page back where the user had it (law #4).
    expect(scrolls[3]?.[1]).toEqual({ y: 120 });
    expect(fakeCtx.drawImage).toHaveBeenCalledTimes(3);
  });

  it('fails honestly when the composite would exceed the canvas cap', async () => {
    mocks.sendMessage.mockImplementation(async (type) => {
      if (type === 'GET_PAGE_GEOMETRY') {
        return {
          scrollY: 0,
          scrollHeight: 1500,
          viewportHeight: 1000,
          scrollWidth: 40_000,
          viewportWidth: 1000,
          devicePixelRatio: 1,
        };
      }
      if (type === 'SCROLL_TO') return { y: 0 };
      if (type === 'CAPTURE_VIEWPORT') return { ok: true, dataUrl: PNG };
      throw new Error(`unexpected ${type}`);
    });

    const result = await captureFullpage();

    if (result.ok) throw new Error('expected the composite cap to fail');
    expect(result.error).toMatch(/too tall to composite/i);
  });

  it('restores the scroll position even when a tile capture fails', async () => {
    let captureCount = 0;
    mocks.sendMessage.mockImplementation(async (type, data) => {
      if (type === 'GET_PAGE_GEOMETRY') {
        return {
          scrollY: 900,
          scrollHeight: 3000,
          viewportHeight: 1000,
          scrollWidth: 800,
          viewportWidth: 800,
          devicePixelRatio: 1,
        };
      }
      if (type === 'SCROLL_TO') return { y: data.y };
      if (type === 'CAPTURE_VIEWPORT') {
        captureCount += 1;
        // The second tile refuses — the user's scroll must still be restored.
        return captureCount === 2 ? { ok: false, error: 'nope' } : { ok: true, dataUrl: PNG };
      }
      throw new Error(`unexpected ${type}`);
    });

    const result = await captureFullpage();

    expect(result.ok).toBe(false);
    const scrolls = mocks.sendMessage.mock.calls.filter(([t]) => t === 'SCROLL_TO');
    expect(scrolls.at(-1)?.[1]).toEqual({ y: 900 });
    // ui.connection must still be the web tab for the guard.
    expect(ui.connection.tabUrl).toContain('example.com');
  });
});
