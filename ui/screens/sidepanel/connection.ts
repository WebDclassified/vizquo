/**
 * Connection layer between the side panel and the page (Phase 1 DoD: a message
 * round-trips content → background → sidepanel).
 */
import { browser } from 'wxt/browser';
import { sendMessage } from '../../../shared/messages';
import { setUi, ui } from '../../stores/ui-store';
import { setStore } from './inspector/inspector-store';

export async function runConnectionCheck(): Promise<void> {
  setUi('connection', 'status', 'connecting');
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
    const result = await sendMessage('SET_INSPECT_MODE', { enabled }, tabId);
    setUi('connection', 'inspectModeEnabled', result.enabled);
    setStore('enabled', result.enabled);
  } catch {
    // Content script not present yet — connection card surfaces the state.
  }
}

/**
 * Grant on-demand site access (Section 8: activeTab + optional_host_permissions,
 * never a blanket grant) and reload so the content script activates.
 */
export async function grantSiteAccess(): Promise<boolean> {
  try {
    const tab = await sendMessage('GET_ACTIVE_TAB');
    const url = tab.url;
    if (!url || tab.id == null) return false;
    const origin = new URL(url).origin;
    const granted = await browser.permissions.request({ origins: [`${origin}/*`] });
    if (granted) {
      setUi('connection', 'status', 'connecting');
      await browser.tabs.reload(tab.id);
      // Content script injects on the reload; re-check once it has had time.
      setTimeout(() => void runConnectionCheck(), 1200);
    }
    return granted;
  } catch {
    return false;
  }
}
