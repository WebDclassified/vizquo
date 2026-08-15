/**
 * Connection layer between the side panel and the page (Phase 1 DoD: a message
 * round-trips content → background → sidepanel).
 *
 * Granting site access is the one flow that must obey Chrome's user-gesture
 * rule: `permissions.request` has to be dispatched inside the click handler —
 * any `await` before it (the old GET_ACTIVE_TAB round-trip through the service
 * worker) makes Chrome silently refuse the request. The grant path therefore
 * never awaits messaging first: it uses the tab URL already cached by the last
 * PING, falls back to Chrome 133+'s `addHostAccessRequest` (needs no URL at
 * all), and only as a last resort does a single direct `tabs.query`.
 */
import { browser } from 'wxt/browser';
import { sendMessage, sendTabMessage } from '../../../shared/messages';
import { setUi, ui } from '../../stores/ui-store';
import { setStore } from './inspector/inspector-store';

/** Chrome 133+ API — not yet in the webextension-polyfill types. */
type HostAccessPermissions = typeof browser.permissions & {
  addHostAccessRequest?: (request: { tabId: number }) => Promise<void>;
};

export type GrantSiteAccessResult =
  | { status: 'granted' }
  | { status: 'signaled' }
  | { status: 'denied'; reason?: string }
  | { status: 'unavailable'; reason: string };

/** Re-check the connection until the content script answers (or give up). */
function scheduleRecheck(attempts = 6): void {
  setTimeout(() => {
    void runConnectionCheck(true).then(() => {
      const ok = ui.connection.status === 'connected' && ui.connection.contentOk === true;
      if (!ok && attempts > 0) scheduleRecheck(attempts - 1);
    });
  }, 1200);
}

/**
 * The content script injects at document_idle — a check that fires right
 * after tab activation can miss it by a fraction of a second, and nothing
 * else would ever re-check (the card then sits on "Not connected" forever
 * even though the page is fully connected — found by real-site QA). On heavy
 * pages (YouTube, Awwwards) document_idle can arrive many seconds after
 * activation, so the retries back off to cover the slow case; a genuinely
 * unreachable tab (chrome://, extension gone) stops the chain because its
 * PING throws and runConnectionCheck's catch never re-arms it. One chain at
 * a time; stops on success or when the schedule is exhausted (~66s).
 */
const CONTENT_RETRY_SCHEDULE_MS = [1500, 2000, 3000, 5000, 8000, 12000, 15000, 20000];
let contentRetryTimer: ReturnType<typeof setTimeout> | undefined;
let contentRetryInFlight = false;

function retryUntilContentScript(step = 0): void {
  if (step >= CONTENT_RETRY_SCHEDULE_MS.length) {
    contentRetryTimer = undefined;
    return;
  }
  contentRetryTimer = setTimeout(() => {
    // The timer is ours to clear the moment it fires, and the check it runs
    // is marked in-flight so it cannot start a sibling chain (each link is
    // armed exactly once, by the previous link's .then).
    contentRetryTimer = undefined;
    contentRetryInFlight = true;
    void runConnectionCheck(true).then(() => {
      contentRetryInFlight = false;
      const ok = ui.connection.status === 'connected' && ui.connection.contentOk === true;
      if (!ok) retryUntilContentScript(step + 1);
    });
  }, CONTENT_RETRY_SCHEDULE_MS[step] ?? 1500);
}

let lastConnectedTabId: number | undefined;

export async function runConnectionCheck(silent = false): Promise<void> {
  if (!silent) setUi('connection', 'status', 'connecting');
  const nonce = Math.floor(Math.random() * 1_000_000);
  const start = performance.now();
  try {
    const result = await sendMessage('PING', { nonce });
    setUi('connection', {
      status: 'connected',
      latencyMs: Math.round(performance.now() - start),
      tabId: result.tab?.id,
      tabUrl: result.tab?.url,
      tabTitle: result.tab?.title,
      contentOk: result.content.ok,
      inspectModeEnabled: result.content.inspectModeEnabled,
      extensionVersion: result.extensionVersion,
      error: result.content.ok ? undefined : result.content.error,
      lastCheckedAt: Date.now(),
    });
    // Keep the inspector's own state in sync with the content script's report
    // (real-site QA: switching tabs left the toolbar's Inspect switch visually
    // ON — and the previous tab's selection/DOM — while the new page's content
    // script had inspect mode OFF). The connection card already reads
    // ui.connection.inspectModeEnabled; this mirrors it into inspector-store
    // and drops the previous tab's tab-scoped state when the target changes.
    if (result.content.ok) {
      setStore('enabled', result.content.inspectModeEnabled === true);
      if (result.tab?.id != null && result.tab.id !== lastConnectedTabId) {
        lastConnectedTabId = result.tab.id;
        setStore('lockedRef', null);
        setStore('hoveredRef', null);
        setStore('inspection', null);
        setStore('error', null);
        setStore('domTree', null);
        setStore('domError', null);
      }
    }
    // A page that is reachable but whose content script is still injecting
    // (or was missed by the activation race) gets a bounded silent retry.
    if (
      result.tab?.id != null &&
      !result.content.ok &&
      !contentRetryTimer &&
      !contentRetryInFlight
    ) {
      retryUntilContentScript();
    }
  } catch {
    setUi('connection', {
      status: 'error',
      error:
        'The background service worker did not respond. Try reloading the extension or the browser.',
      lastCheckedAt: Date.now(),
    });
  }
}

/** Set hover-inspection mode inside the content script (Phase 2+). */
export async function setInspectModeFromCard(enabled: boolean): Promise<void> {
  const tabId = ui.connection.tabId;
  if (tabId == null) return;
  try {
    const result = await sendTabMessage(tabId, 'SET_INSPECT_MODE', { enabled });
    setUi('connection', 'inspectModeEnabled', result.enabled);
    setStore('enabled', result.enabled);
  } catch {
    // Content script not present yet — connection card surfaces the state.
  }
}

/**
 * Request per-site access for the current tab. Order of preference:
 *
 * 1. Origin already cached from the last connection check → call
 *    `permissions.request` synchronously inside the click gesture.
 * 2. Chrome 133+ `addHostAccessRequest` — signals the modern toolbar
 *    "allow access on this site" chip; needs no URL and is not
 *    gesture-sensitive. Acceptance is async — `permissions.onAdded` triggers
 *    the reload.
 * 3. A single direct `tabs.query` (same-frame, no service-worker hop) to
 *    learn the origin, then request it.
 *
 * `granted`/`denied` are terminal; `unavailable` falls through to the next
 * mechanism so the user always gets the most specific outcome we can offer.
 */
export async function grantSiteAccess(): Promise<GrantSiteAccessResult> {
  const cachedUrl = ui.connection.tabUrl;
  if (cachedUrl) {
    const result = await requestOriginAccess(cachedUrl, ui.connection.tabId);
    if (result) return result;
  }

  const permissionsApi = browser.permissions as HostAccessPermissions;
  if (permissionsApi.addHostAccessRequest && ui.connection.tabId != null) {
    try {
      await permissionsApi.addHostAccessRequest({ tabId: ui.connection.tabId });
      watchHostAccessGrant(ui.connection.tabId);
      return { status: 'signaled' };
    } catch {
      // The tab type can't host the request (chrome://, Web Store…) — fall through.
    }
  }

  try {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id != null && tab.url) {
      const result = await requestOriginAccess(tab.url, tab.id);
      if (result) return result;
    }
  } catch {
    // Ignore — the unavailable result below explains itself.
  }

  return {
    status: 'unavailable',
    reason:
      "Vizquo couldn't request access to this page. Only regular websites (http/https) can be inspected. If a prompt was shown and declined before, open your browser's extension settings (chrome://extensions or about:addons) → Vizquo → Site access to reset it, then try again.",
  };
}

async function requestOriginAccess(
  url: string,
  tabId: number | undefined,
): Promise<GrantSiteAccessResult | null> {
  if (tabId == null) return null;
  let origin: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        status: 'unavailable',
        reason:
          "This page type can't be inspected — only regular websites (http/https) are supported.",
      };
    }
    origin = parsed.origin;
  } catch {
    return null;
  }

  let granted = false;
  try {
    granted = await browser.permissions.request({ origins: [`${origin}/*`] });
  } catch {
    granted = false;
  }

  if (!granted) {
    return {
      status: 'denied',
      reason:
        "The browser didn't grant access. If no prompt appeared, access was probably declined earlier — open chrome://extensions → Vizquo → Site access (or the equivalent in your browser), then try again.",
    };
  }

  setUi('connection', 'status', 'connecting');
  await browser.tabs.reload(tabId);
  scheduleRecheck();
  return { status: 'granted' };
}

let hostWatchCleanup: (() => void) | null = null;

/**
 * `addHostAccessRequest` only *signals* the toolbar chip — the user's Allow is
 * async. Watch `permissions.onAdded` so the tab reloads (activating the
 * content script) the moment access lands. Self-cleaning: the listener is
 * removed on grant or after two minutes.
 */
function watchHostAccessGrant(tabId: number): void {
  if (hostWatchCleanup) hostWatchCleanup();
  const onAdded = (permissions: { origins?: string[] }): void => {
    const origins = permissions.origins ?? [];
    if (origins.length === 0) return;
    // onAdded carries no tab id, and it fires for ANY grant (e.g. the user
    // enabling AI host access in Settings). Only reload if this grant is for
    // the tab we signaled — the grant just unlocked host access, so the tab's
    // URL is now readable for the first time.
    try {
      void (async () => {
        const tab = await browser.tabs.get(tabId);
        if (!tab.url) return;
        const origin = new URL(tab.url).origin;
        if (!origins.includes(`${origin}/*`)) return;
        hostWatchCleanup?.();
        hostWatchCleanup = null;
        setUi('connection', 'status', 'connecting');
        await browser.tabs.reload(tabId);
        scheduleRecheck();
      })();
    } catch {
      // Tab closed or URL still hidden — never reload blindly.
    }
  };
  const timeout = setTimeout(() => {
    hostWatchCleanup?.();
    hostWatchCleanup = null;
  }, 120_000);
  browser.permissions.onAdded.addListener(onAdded);
  hostWatchCleanup = () => {
    browser.permissions.onAdded.removeListener(onAdded);
    clearTimeout(timeout);
  };
}

let tabWatchInstalled = false;

/**
 * Keep the cached tab info fresh so "Grant access" always targets the tab the
 * user is looking at. Registered once per panel lifetime; silent re-checks so
 * switching tabs doesn't flash the connecting skeleton.
 */
export function watchActiveTab(): void {
  if (tabWatchInstalled) return;
  tabWatchInstalled = true;
  browser.tabs.onActivated.addListener(() => {
    void runConnectionCheck(true);
  });
  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url) void runConnectionCheck(true);
  });
}
