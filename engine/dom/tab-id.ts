/**
 * Content-script tab identity (multi-tab isolation, Section 7.27).
 *
 * Content scripts cannot read `chrome.tabs`, but the background can resolve
 * the sender's tab id. Every storage payload a content script publishes
 * (`vizquo:selection`, `vizquo:multi-selection`, `vizquo:scan-progress`) is
 * stamped with this tab id so a panel in another window/tab can ignore
 * events that belong to a different page.
 */
import { sendMessage } from '../../shared/messages';

let cached: number | null | undefined;

/** Resolve this content script's tab id once (cached; null when unknown). */
export async function contentTabId(): Promise<number | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await sendMessage('GET_CONTENT_TAB_ID', undefined);
    cached = res.tabId;
  } catch {
    cached = null;
  }
  return cached;
}

/** Forget the cached id (navigation may have re-parented the script). */
export function resetContentTabId(): void {
  cached = undefined;
}
