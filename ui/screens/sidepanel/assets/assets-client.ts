/**
 * Assets client — the side panel's bridge for Phase 4 actions (Section 7.10).
 *
 * Bulk ZIP export runs in the background worker (it holds `downloads` +
 * on-demand host permissions; CORS failures are returned, never bypassed).
 * SVG source fetching and element highlighting run in the content script.
 */

import { filenameForUrl } from '../../../../export/assets-zip';
import { sendMessage, sendTabMessage } from '../../../../shared/messages';
import type {
  Asset,
  ExportAssetRequest,
  ExportAssetsResult,
  FetchAssetSvgResult,
} from '../../../../shared/types';
import { notify } from '../../../stores/toast';
import { ui } from '../../../stores/ui-store';

/** Build the ZIP request list for the given assets. */
export function toExportRequests(assets: Asset[]): ExportAssetRequest[] {
  return assets.map((asset) => ({
    url: asset.url,
    type: asset.type,
    filename: filenameForUrl(asset.url, asset.type, 'bin'),
  }));
}

/** Bulk-export assets as a vizquo-assets ZIP via the background worker. */
export async function exportAssets(assets: Asset[]): Promise<ExportAssetsResult | null> {
  if (assets.length === 0) return null;
  try {
    const result = await sendMessage('EXPORT_ASSETS', { requests: toExportRequests(assets) });
    return result;
  } catch {
    return { ok: false, error: 'The background worker did not answer the export request.' };
  }
}

/**
 * Open any asset in a new tab — playable for video/audio, viewable for
 * images/fonts. Plain http(s) URLs open directly (the browser plays them
 * natively). Page-scoped blob:/data: URLs are meaningless in the panel's
 * extension context, so they are re-fetched through the worker (full host
 * access) and opened as a fresh data URL. Failures surface as a toast —
 * never silently dropped.
 */
export async function openAssetInNewTab(asset: Asset): Promise<void> {
  const direct = (url: string) => {
    window.open(url, '_blank', 'noopener');
    notify({
      title: `Opening ${asset.type} in a new tab`,
      description: asset.type === 'video' || asset.type === 'audio' ? 'Media plays in the new tab.' : undefined,
      tone: 'neutral',
    });
  };
  try {
    const parsed = new URL(asset.url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      direct(asset.url);
      return;
    }
  } catch {
    notify({ title: 'Could not open asset', description: 'The asset URL is invalid.', tone: 'warning' });
    return;
  }
  try {
    const result = await sendMessage('FETCH_ASSET_BLOB', { url: asset.url });
    if (result.ok) {
      direct(result.dataUrl);
    } else {
      notify({ title: 'Could not open asset', description: result.error, tone: 'warning' });
    }
  } catch {
    notify({
      title: 'Could not open asset',
      description: 'The background worker did not answer the fetch request.',
      tone: 'warning',
    });
  }
}

/** Fetch an SVG's source from the page (copy / download / convert actions). */
export async function fetchAssetSvg(url: string): Promise<FetchAssetSvgResult> {
  if (ui.connection.tabId == null) {
    return { ok: false, error: 'The page did not answer. Grant site access and try again.' };
  }
  try {
    return await sendTabMessage(ui.connection.tabId, 'FETCH_ASSET_SVG', { url });
  } catch {
    return {
      ok: false,
      error: 'The page did not answer. Grant site access and try again.',
    };
  }
}

/** Highlight an asset's element on the page. */
export async function highlightAssetRefs(asset: Asset): Promise<void> {
  if (!asset.ref || ui.connection.tabId == null) return;
  try {
    await sendTabMessage(ui.connection.tabId, 'HIGHLIGHT_REFS', {
      refs: [asset.ref],
      label: asset.type,
    });
    notify({
      title: 'Asset located on the page',
      description: 'Highlighted its element — press Esc to clear.',
      tone: 'success',
    });
  } catch {
    // Content script not connected — the toast stays silent.
  }
}

/** Copy arbitrary text with a success/failure toast. */
export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify({ title: `${label} copied`, tone: 'success' });
  } catch {
    notify({ title: `Could not copy ${label.toLowerCase()}`, tone: 'error' });
  }
}

/** Trigger a browser download of a Blob (SVG copy/download actions). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
