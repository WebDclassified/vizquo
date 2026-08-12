// @vitest-environment happy-dom
/**
 * Regression tests for the site-access grant flow (BUG: "Grant access" never
 * connected the inspector — an awaited GET_ACTIVE_TAB round-trip through the
 * service worker consumed the user gesture Chrome requires for
 * `permissions.request`, so the browser silently refused).
 *
 * Invariant under test: the grant path must NEVER await messaging before
 * calling permissions.request when the tab URL is already known.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  grantSiteAccess,
  runConnectionCheck,
  watchActiveTab,
} from '../ui/screens/sidepanel/connection';
import {
  store as inspectorStore,
  setStore as setInspectorStore,
} from '../ui/screens/sidepanel/inspector/inspector-store';
import { setUi, ui } from '../ui/stores/ui-store';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  request: vi.fn(),
  addHostAccessRequest: vi.fn(),
  onAddedAdd: vi.fn(),
  onAddedRemove: vi.fn(),
  reload: vi.fn(),
  query: vi.fn(),
  tabsGet: vi.fn(),
  onActivatedAdd: vi.fn(),
  onUpdatedAdd: vi.fn(),
}));

vi.mock('../shared/messages', () => ({ sendMessage: mocks.sendMessage }));

vi.mock('wxt/browser', () => ({
  browser: {
    permissions: {
      request: mocks.request,
      addHostAccessRequest: mocks.addHostAccessRequest,
      onAdded: { addListener: mocks.onAddedAdd, removeListener: mocks.onAddedRemove },
    },
    tabs: {
      reload: mocks.reload,
      query: mocks.query,
      get: mocks.tabsGet,
      onActivated: { addListener: mocks.onActivatedAdd },
      onUpdated: { addListener: mocks.onUpdatedAdd },
    },
  },
}));

/** Yield enough microtask turns for the async onAdded body to complete. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

function resetConnection(overrides: Partial<typeof ui.connection> = {}): void {
  setUi('connection', {
    status: 'connected',
    tabId: 7,
    tabUrl: 'https://example.com/',
    tabTitle: 'Example',
    contentOk: false,
    lastCheckedAt: Date.now(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetConnection();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('grantSiteAccess (user-gesture-safe permission request)', () => {
  it('requests the cached origin synchronously — no messaging round-trip before permissions.request', async () => {
    mocks.request.mockResolvedValue(true);
    mocks.reload.mockResolvedValue(undefined);

    const result = await grantSiteAccess();

    expect(result.status).toBe('granted');
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
    // The regression: the old code awaited GET_ACTIVE_TAB first, which made
    // Chrome refuse the request. No message may leave before the request.
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.reload).toHaveBeenCalledWith(7);
  });

  it('returns denied (and does not reload) when the browser refuses the request', async () => {
    mocks.request.mockResolvedValue(false);

    const result = await grantSiteAccess();

    expect(result.status).toBe('denied');
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('returns denied when permissions.request rejects', async () => {
    mocks.request.mockRejectedValue(new Error('no gesture'));

    const result = await grantSiteAccess();

    expect(result.status).toBe('denied');
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('refuses non-http(s) pages with a clear reason', async () => {
    resetConnection({ tabUrl: 'chrome://extensions/' });

    const result = await grantSiteAccess();

    expect(result.status).toBe('unavailable');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('falls back to addHostAccessRequest when the URL is unknown, and reloads once the user allows', async () => {
    resetConnection({ tabUrl: undefined });
    mocks.addHostAccessRequest.mockResolvedValue(undefined);
    mocks.reload.mockResolvedValue(undefined);
    mocks.tabsGet.mockResolvedValue({ id: 7, url: 'https://example.com/' });

    const result = await grantSiteAccess();

    expect(result.status).toBe('signaled');
    expect(mocks.addHostAccessRequest).toHaveBeenCalledWith({ tabId: 7 });
    expect(mocks.onAddedAdd).toHaveBeenCalledTimes(1);

    // The user clicks "Allow" on the toolbar chip → permissions.onAdded fires.
    const onAdded = mocks.onAddedAdd.mock.calls[0]![0];
    onAdded({ origins: ['https://example.com/*'] });

    await flushMicrotasks();
    expect(mocks.reload).toHaveBeenCalledWith(7);
    expect(mocks.onAddedRemove).toHaveBeenCalledTimes(1);
  });

  it('ignores an onAdded grant for an unrelated origin — no blind reload', async () => {
    resetConnection({ tabUrl: undefined });
    mocks.addHostAccessRequest.mockResolvedValue(undefined);
    mocks.tabsGet.mockResolvedValue({ id: 7, url: 'https://example.com/' });

    await grantSiteAccess();

    const onAdded = mocks.onAddedAdd.mock.calls[0]![0];
    // The user grants the AI provider's host access instead — not this tab.
    onAdded({ origins: ['https://openrouter.ai/*'] });

    await flushMicrotasks();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.onAddedRemove).not.toHaveBeenCalled(); // watch stays armed

    // Expire the watch so the module-level state doesn't leak into later tests.
    vi.advanceTimersByTime(121_000);
    expect(mocks.onAddedRemove).toHaveBeenCalledTimes(1);
  });

  it('a second grant click tears down the first host-access watch', async () => {
    resetConnection({ tabUrl: undefined });
    mocks.addHostAccessRequest.mockResolvedValue(undefined);
    mocks.tabsGet.mockResolvedValue({ id: 7, url: 'https://example.com/' });
    mocks.reload.mockResolvedValue(undefined);

    await grantSiteAccess();
    await grantSiteAccess();

    expect(mocks.addHostAccessRequest).toHaveBeenCalledTimes(2);
    expect(mocks.onAddedAdd).toHaveBeenCalledTimes(2);
    // The first watch was replaced, not stacked.
    expect(mocks.onAddedRemove).toHaveBeenCalledTimes(1);

    const secondWatch = mocks.onAddedAdd.mock.calls[1]![0];
    secondWatch({ origins: ['https://example.com/*'] });
    await flushMicrotasks();
    expect(mocks.reload).toHaveBeenCalledWith(7);
    expect(mocks.onAddedRemove).toHaveBeenCalledTimes(2);
  });

  it('the host-access watch expires after two minutes without a grant', async () => {
    resetConnection({ tabUrl: undefined });
    mocks.addHostAccessRequest.mockResolvedValue(undefined);

    await grantSiteAccess();
    expect(mocks.onAddedAdd).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(121_000);

    expect(mocks.onAddedRemove).toHaveBeenCalledTimes(1);
  });

  it('falls back to a direct tabs.query when the host-access API is unavailable or fails', async () => {
    resetConnection({ tabUrl: undefined });
    mocks.addHostAccessRequest.mockRejectedValue(new Error('restricted page'));
    mocks.query.mockResolvedValue([{ id: 9, url: 'https://newsite.dev/', title: 'New' }]);
    mocks.request.mockResolvedValue(true);
    mocks.reload.mockResolvedValue(undefined);

    const result = await grantSiteAccess();

    expect(result.status).toBe('granted');
    expect(mocks.request).toHaveBeenCalledWith({ origins: ['https://newsite.dev/*'] });
    expect(mocks.reload).toHaveBeenCalledWith(9);
  });

  it('reports unavailable when no origin can be determined at all', async () => {
    resetConnection({ tabUrl: undefined, tabId: undefined });
    mocks.addHostAccessRequest.mockRejectedValue(new Error('restricted'));
    mocks.query.mockResolvedValue([{ id: 9, url: undefined, title: 'Hidden' }]);

    const result = await grantSiteAccess();

    expect(result.status).toBe('unavailable');
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe('watchActiveTab + silent re-checks', () => {
  it('registers the tab listeners exactly once', () => {
    watchActiveTab();
    watchActiveTab();
    expect(mocks.onActivatedAdd).toHaveBeenCalledTimes(1);
    expect(mocks.onUpdatedAdd).toHaveBeenCalledTimes(1);
  });

  it('a silent re-check resolves the content connection without flashing connecting', async () => {
    mocks.sendMessage.mockResolvedValue({
      nonce: 1,
      backgroundOk: true,
      extensionVersion: '0.10.2',
      at: Date.now(),
      tab: { id: 7, url: 'https://example.com/', title: 'Example' },
      content: {
        ok: true,
        nonce: 1,
        url: 'https://example.com/',
        title: 'Example',
        inspectModeEnabled: false,
      },
    });

    await runConnectionCheck(true);

    expect(ui.connection.status).toBe('connected');
    expect(ui.connection.contentOk).toBe(true);
  });

  it('retries silently when the content script missed the injection race (real-site QA fix)', async () => {
    // First PING: the content script is still injecting (document_idle) — the
    // exact race that left the card on "Grant access" forever on real sites.
    mocks.sendMessage
      .mockResolvedValueOnce({
        nonce: 1,
        backgroundOk: true,
        extensionVersion: '0.10.5',
        at: Date.now(),
        tab: { id: 7, url: 'https://example.com/', title: 'Example' },
        content: { ok: false, error: 'Receiving end does not exist.' },
      })
      .mockResolvedValueOnce({
        nonce: 2,
        backgroundOk: true,
        extensionVersion: '0.10.5',
        at: Date.now(),
        tab: { id: 7, url: 'https://example.com/', title: 'Example' },
        content: {
          ok: true,
          nonce: 2,
          url: 'https://example.com/',
          title: 'Example',
          inspectModeEnabled: false,
        },
      });

    await runConnectionCheck();

    expect(ui.connection.contentOk).toBe(false);
    expect(ui.connection.status).toBe('connected');
    // The bounded silent retry chain picks the content script up ~1.5s later.
    await vi.advanceTimersByTimeAsync(1600);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(ui.connection.contentOk).toBe(true);
  });

  it('gives up retrying after the bounded attempts when no content script appears', async () => {
    mocks.sendMessage.mockResolvedValue({
      nonce: 1,
      backgroundOk: true,
      extensionVersion: '0.10.5',
      at: Date.now(),
      tab: { id: 7, url: 'https://example.com/', title: 'Example' },
      content: { ok: false, error: 'No content script.' },
    });

    await runConnectionCheck();
    // 4 retries × 1.5s, then the chain stops on its own.
    await vi.advanceTimersByTimeAsync(30_000);

    // 1 initial check + 4 silent retries — and no runaway loop beyond that.
    expect(mocks.sendMessage).toHaveBeenCalledTimes(5);
  });

  it('switching tabs syncs the inspector state and drops the old tab selection (real-site QA fix)', async () => {
    const oldRef = { selector: '.hero', xpath: '/html/body/div', domPath: [0, 1] };
    // Simulate a previous tab session: inspect ON with an element locked.
    setInspectorStore('enabled', true);
    setInspectorStore('lockedRef', oldRef);
    setInspectorStore('hoveredRef', oldRef);

    // Check A: the previous tab (id 9) reports inspect ON.
    mocks.sendMessage.mockResolvedValueOnce({
      nonce: 1,
      backgroundOk: true,
      extensionVersion: '0.10.5',
      at: Date.now(),
      tab: { id: 9, url: 'https://old.dev/', title: 'Old' },
      content: {
        ok: true,
        nonce: 1,
        url: 'https://old.dev/',
        title: 'Old',
        inspectModeEnabled: true,
      },
    });
    await runConnectionCheck();
    expect(inspectorStore.enabled).toBe(true);

    // Check B: the NEW tab (id 10) has a fresh content script — inspect OFF.
    mocks.sendMessage.mockResolvedValueOnce({
      nonce: 2,
      backgroundOk: true,
      extensionVersion: '0.10.5',
      at: Date.now(),
      tab: { id: 10, url: 'https://new.dev/', title: 'New' },
      content: {
        ok: true,
        nonce: 2,
        url: 'https://new.dev/',
        title: 'New',
        inspectModeEnabled: false,
      },
    });
    await runConnectionCheck();

    // The toolbar switch must reflect the new tab's real state…
    expect(inspectorStore.enabled).toBe(false);
    // …and the old tab's selection must not leak into the new tab.
    expect(inspectorStore.lockedRef).toBeNull();
    expect(inspectorStore.hoveredRef).toBeNull();

    // Check C: re-checking the SAME tab must keep the user's selection.
    const newRef = { selector: '.card', xpath: '/html/body/section', domPath: [1, 2] };
    setInspectorStore('lockedRef', newRef);
    mocks.sendMessage.mockResolvedValueOnce({
      nonce: 3,
      backgroundOk: true,
      extensionVersion: '0.10.5',
      at: Date.now(),
      tab: { id: 10, url: 'https://new.dev/', title: 'New' },
      content: {
        ok: true,
        nonce: 3,
        url: 'https://new.dev/',
        title: 'New',
        inspectModeEnabled: true,
      },
    });
    await runConnectionCheck();
    expect(inspectorStore.enabled).toBe(true);
    expect(inspectorStore.lockedRef).toEqual(newRef);
  });
});
