/**
 * Session client — the Stop/Resume lifecycle (user-reported: closing the side
 * panel leaves the content script running, so the page keeps showing Vizquo's
 * overlay). "Stop" is the honest shutdown: it disables inspect mode, clears
 * find-instances highlights, reverts live edits, clears the multi-selection
 * (the page is restored exactly), empties the panel stores, and shows the
 * paused screen. Chrome side panels cannot be closed programmatically, so the
 * paused screen is the reliable fallback; `window.close()` is still attempted
 * for contexts that allow it (detached inspector window, Firefox sidebar).
 */
import type { ProtocolMap } from '../../../shared/messages';
import { sendTabMessage } from '../../../shared/messages';
import { setAnalysis } from '../../stores/analysis-store';
import { notify } from '../../stores/toast';
import { setStopped, ui } from '../../stores/ui-store';
import { setStore } from './inspector/inspector-store';

/** One best-effort page cleanup message — never fails the stop flow. */
async function cleanupPage<Type extends keyof ProtocolMap>(
  type: Type,
  data: Parameters<ProtocolMap[Type]>[0],
): Promise<void> {
  const tabId = ui.connection.tabId;
  if (tabId == null) return;
  try {
    await sendTabMessage(tabId, type, data);
  } catch {
    // Content script gone (navigation/closed tab) — nothing left to clean.
  }
}

/** Restore the page and end the session. Safe to call from anywhere. */
export async function stopSession(): Promise<void> {
  // Restore the inspected page first — inspect mode off, all overlays gone.
  await Promise.allSettled([
    cleanupPage('SET_INSPECT_MODE', { enabled: false }),
    cleanupPage('CLEAR_HIGHLIGHTS', undefined),
    cleanupPage('CLEAR_LIVE_EDITS', undefined),
    cleanupPage('CLEAR_MULTI_SELECTION', undefined),
  ]);
  // Drop panel state so nothing stale survives the pause.
  setAnalysis('inspection', null);
  setAnalysis('scanning', false);
  setAnalysis('scanError', null);
  setAnalysis('multiRefs', []);
  setAnalysis('progress', {
    colors: 'pending',
    typography: 'pending',
    spacing: 'pending',
    components: 'pending',
    assets: 'pending',
    audits: 'pending',
    responsive: 'pending',
    technology: 'pending',
  });
  setStore('enabled', false);
  setStore('lockedRef', null);
  setStore('hoveredRef', null);
  setStore('inspection', null);
  setStore('domTree', null);

  setStopped(true);
  notify({
    title: 'Vizquo stopped',
    description: 'The page was restored — highlights and edits cleared.',
    tone: 'neutral',
  });

  // Best effort: detachable window / sidebar contexts can close themselves.
  // Chrome's side panel cannot — the paused screen below covers that case.
  try {
    window.close();
  } catch {
    // Ignored — the panel stays open in its paused state.
  }
}

/** Clear the paused state and reconnect. */
export async function resumeSession(): Promise<void> {
  setStopped(false);
  const { runConnectionCheck } = await import('./connection');
  void runConnectionCheck();
}
