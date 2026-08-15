/**
 * Create client — the side panel's bridge for Phase 6 actions (Sections
 * 7.18–7.21, 7.24). Live edits and page geometry run in the content script;
 * viewport capture runs in the background (tab + host access); exports are
 * pure and generated here, downloaded through a Blob.
 */
import { sendMessage, sendTabMessage } from '../../../../shared/messages';
import type {
  CaptureResult,
  ElementRef,
  LiveEdit,
  LiveEditResult,
  PageGeometry,
} from '../../../../shared/types';
import { repository } from '../../../../storage';
import { notify } from '../../../stores/toast';
import { ui } from '../../../stores/ui-store';

/** Whether the connection points at a real web page. */
export function isWebTab(): boolean {
  try {
    return /^https?:$/.test(new URL(ui.connection.tabUrl ?? '').protocol);
  } catch {
    return false;
  }
}

function webTabGuard(): boolean {
  if (isWebTab()) return true;
  notify({
    title: 'Open a website first',
    description: 'Live editing and screenshots need a real page.',
    tone: 'warning',
  });
  return false;
}

/* ------------------------------------------------------------------------ */
/* Live editing (7.21)                                                       */
/* ------------------------------------------------------------------------ */

export async function applyEdit(
  ref: ElementRef,
  property: string,
  value: string,
): Promise<LiveEditResult> {
  if (!webTabGuard() || ui.connection.tabId == null)
    return { ok: false, error: 'Not connected to a page.' };
  try {
    return await sendTabMessage(ui.connection.tabId, 'APPLY_LIVE_EDIT', {
      ref,
      property,
      value,
    });
  } catch {
    return { ok: false, error: 'The page did not answer the edit request.' };
  }
}

export async function undoEdit(id: string): Promise<LiveEditResult> {
  if (!webTabGuard() || ui.connection.tabId == null)
    return { ok: false, error: 'Not connected to a page.' };
  try {
    return await sendTabMessage(ui.connection.tabId, 'UNDO_LIVE_EDIT', { id });
  } catch {
    return { ok: false, error: 'The page did not answer the undo request.' };
  }
}

export async function clearEdits(): Promise<{ count: number }> {
  if (!webTabGuard() || ui.connection.tabId == null) return { count: 0 };
  try {
    return await sendTabMessage(ui.connection.tabId, 'CLEAR_LIVE_EDITS', undefined);
  } catch {
    return { count: 0 };
  }
}

export async function getEdits(): Promise<LiveEdit[]> {
  if (!webTabGuard() || ui.connection.tabId == null) return [];
  try {
    const result = await sendTabMessage(ui.connection.tabId, 'GET_LIVE_EDITS', undefined);
    return result.edits;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------------ */
/* Live-edit persistence (Phase 9)                                           */
/* ------------------------------------------------------------------------ */

/** Repository key for one page's saved edit session. */
function liveEditsKey(url: string): string {
  return `live-edits:${url}`;
}

/** Persist the current session so it can be restored after a reload. */
export async function persistLiveEdits(edits: LiveEdit[]): Promise<void> {
  const url = ui.connection.tabUrl;
  if (!url) return;
  try {
    await repository.setSetting(liveEditsKey(url), edits);
  } catch {
    // Best-effort — the in-memory session still works.
  }
}

/** Saved edits for the current page (empty when none). */
export async function loadSavedLiveEdits(): Promise<LiveEdit[]> {
  const url = ui.connection.tabUrl;
  if (!url) return [];
  try {
    const saved = await repository.getSetting<LiveEdit[]>(liveEditsKey(url));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/** Drop the saved session for the current page. */
export async function clearSavedLiveEdits(): Promise<void> {
  const url = ui.connection.tabUrl;
  if (!url) return;
  try {
    await repository.setSetting(liveEditsKey(url), null);
  } catch {
    // Best-effort.
  }
}

/**
 * Re-apply a saved session to the live page. Each edit goes through the
 * normal APPLY_LIVE_EDIT path (so undo still works); edits whose element no
 * longer exists are skipped honestly. Returns the applied count.
 */
export async function restoreSavedLiveEdits(
  edits: LiveEdit[],
): Promise<{ ok: boolean; applied: number; failed: number }> {
  const target = ui.connection.tabId;
  if (!webTabGuard() || target == null) {
    return { ok: false, applied: 0, failed: edits.length };
  }
  let applied = 0;
  let failed = 0;
  for (const edit of edits) {
    try {
      const result = await sendTabMessage(target, 'APPLY_LIVE_EDIT', {
        ref: edit.ref,
        property: edit.property,
        value: edit.value,
      });
      if (result.ok) applied += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  await clearSavedLiveEdits();
  return { ok: true, applied, failed };
}

/* ------------------------------------------------------------------------ */
/* Screenshot studio (7.20)                                                  */
/* ------------------------------------------------------------------------ */

/** Capture the visible viewport via the background worker. */
export async function captureViewport(): Promise<CaptureResult> {
  if (!webTabGuard()) return { ok: false, error: 'Not connected to a page.' };
  try {
    return await sendMessage('CAPTURE_VIEWPORT', undefined);
  } catch {
    return { ok: false, error: 'The background worker did not answer the capture request.' };
  }
}

/**
 * Union bounding box of the shift-click multi-selection, in viewport
 * coordinates — the crop rect for the "selection" screenshot region.
 */
export async function getMultiSelectionBounds(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  // Silent guard — the studio already explains the web-tab requirement.
  if (!isWebTab()) return null;
  if (!isWebTab() || ui.connection.tabId == null) return null;
  try {
    const result = await sendTabMessage(
      ui.connection.tabId,
      'GET_MULTI_SELECTION_BOUNDS',
      undefined,
    );
    return result.rect;
  } catch {
    return null;
  }
}

/** Page geometry for fullpage stitching. */
export async function getPageGeometry(): Promise<PageGeometry | null> {
  if (!webTabGuard() || ui.connection.tabId == null) return null;
  try {
    return await sendTabMessage(ui.connection.tabId, 'GET_PAGE_GEOMETRY', undefined);
  } catch {
    return null;
  }
}

/** Scroll the page; returns the applied scrollY. */
export async function scrollTo(y: number): Promise<number> {
  if (!webTabGuard() || ui.connection.tabId == null) return 0;
  try {
    const result = await sendTabMessage(ui.connection.tabId, 'SCROLL_TO', { y });
    return result.y;
  } catch {
    return 0;
  }
}

/**
 * Fullpage capture: capture the visible viewport, scroll, repeat, and stitch
 * the tiles onto a canvas. Restores the original scroll position afterwards
 * (law #4 — reversible). Returns a data URL.
 */
export async function captureFullpage(): Promise<CaptureResult> {
  const geometry = await getPageGeometry();
  if (!geometry) return { ok: false, error: 'Could not read the page geometry.' };
  const { scrollHeight, viewportHeight, scrollWidth, viewportWidth, scrollY } = geometry;
  if (scrollHeight <= viewportHeight) return captureViewport();

  const step = viewportHeight;
  const positions: number[] = [];
  for (let y = 0; y < scrollHeight; y += step) {
    positions.push(Math.min(y, scrollHeight - viewportHeight));
  }
  // Last tile may partially overlap — dedupe and ensure we cover the end.
  if (positions.length === 0 || positions.at(-1) !== scrollHeight - viewportHeight) {
    positions.push(scrollHeight - viewportHeight);
  }

  const tiles: string[] = [];
  try {
    for (const y of positions) {
      await scrollTo(y);
      // Wait a frame so the browser paints the new scroll position.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const capture = await captureViewport();
      if (!capture.ok || !capture.dataUrl) {
        return { ok: false, error: 'A viewport tile could not be captured.' };
      }
      tiles.push(capture.dataUrl);
    }
  } finally {
    // Always restore — the user's page position is not ours to keep.
    await scrollTo(scrollY);
  }
  if (tiles.length === 0) return { ok: false, error: 'Nothing was captured.' };

  return stitchTiles(
    tiles,
    { scrollWidth, scrollHeight, viewportWidth, viewportHeight },
    geometry.devicePixelRatio || 1,
  );
}

/**
 * Draw the tiles onto a canvas and return the composite data URL.
 *
 * `captureVisibleTab` returns device-pixel images (viewport × dpr), so the
 * canvas is sized at device pixels and tiles are drawn 1:1. A 4px overlap
 * between consecutive tiles prevents 1px seams at fractional scroll
 * boundaries (a scrollbar can shift layout by a pixel).
 */
async function stitchTiles(
  tiles: string[],
  dims: {
    scrollWidth: number;
    scrollHeight: number;
    viewportWidth: number;
    viewportHeight: number;
  },
  dpr: number,
): Promise<CaptureResult> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(dims.scrollWidth, dims.viewportWidth) * dpr;
  canvas.height = dims.scrollHeight * dpr;
  // Browsers silently blank a canvas past ~32,767px or ~268M pixels — fail
  // honestly instead of returning a corrupt composite (quality bar).
  if (
    canvas.width > 32_767 ||
    canvas.height > 32_767 ||
    canvas.width * canvas.height > 268_435_456
  ) {
    return {
      ok: false,
      error:
        'This page is too tall to composite as one image — try the viewport or element capture instead.',
    };
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, error: 'Canvas is unavailable for stitching.' };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const load = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Tile failed to decode.'));
      img.src = src;
    });

  try {
    const tileH = Math.round(dims.viewportHeight * dpr);
    const overlap = Math.round(4 * dpr);
    let y = 0;
    for (let i = 0; i < tiles.length; i += 1) {
      const img = await load(tiles[i] as string);
      ctx.drawImage(img, 0, y, img.naturalWidth, img.naturalHeight);
      // Advance by the tile height minus the overlap — the last tile sits at
      // its exact final position so the composite isn't taller than the page.
      y += i < tiles.length - 1 ? tileH - overlap : tileH;
    }
    const dataUrl = canvas.toDataURL('image/png');
    return { ok: true, dataUrl, width: canvas.width, height: canvas.height };
  } catch {
    return { ok: false, error: 'A tile could not be decoded — the capture is incomplete.' };
  }
}

/* ------------------------------------------------------------------------ */
/* Downloads & clipboard                                                     */
/* ------------------------------------------------------------------------ */

/** Download text as a file. */
export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Download a data URL (screenshots). */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Copy text with a toast. */
export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify({ title: `${label} copied`, tone: 'success' });
  } catch {
    notify({ title: `Could not copy ${label.toLowerCase()}`, tone: 'error' });
  }
}
