/**
 * Assets client — the side panel's bridge for Phase 4 actions (Section 7.10).
 *
 * Bulk ZIP export runs in the background worker (it holds `downloads` +
 * on-demand host permissions; CORS failures are returned, never bypassed).
 * SVG source fetching and element highlighting run in the content script.
 */

import { filenameForUrl } from '../../../../export/assets-zip';
import { sendMessage } from '../../../../shared/messages';
import type {
  Asset,
  ExportAssetRequest,
  ExportAssetsResult,
  FetchAssetSvgResult,
} from '../../../../shared/types';
import { notify } from '../../../stores/toast';

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

/** Fetch an SVG's source from the page (copy / download / convert actions). */
export async function fetchAssetSvg(url: string): Promise<FetchAssetSvgResult> {
  try {
    return await sendMessage('FETCH_ASSET_SVG', { url });
  } catch {
    return {
      ok: false,
      error: 'The page did not answer. Grant site access and try again.',
    };
  }
}

/** Highlight an asset's element on the page. */
export async function highlightAssetRefs(asset: Asset): Promise<void> {
  if (!asset.ref) return;
  try {
    await sendMessage('HIGHLIGHT_REFS', { refs: [asset.ref], label: asset.type });
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
