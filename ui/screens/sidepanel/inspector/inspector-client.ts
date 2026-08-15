/**
 * Inspector client — the side panel's bridge to the content-script inspector.
 *
 * Selection/hover/inspect-mode changes are pushed from the content script via
 * storage events (cheap, no round-trip per pixel); heavy payloads (full
 * inspection, DOM tree) are fetched on demand over the typed message bus.
 */
import { STORAGE_KEYS } from '../../../../shared/constants';
import { sendTabMessage } from '../../../../shared/messages';
import { isForTab } from '../../../../shared/tab-isolation';
import type { ElementRef, NavigateDirection, OverlayOptions } from '../../../../shared/types';
import { notify } from '../../../stores/toast';
import {
  sameOverlayOptions,
  sameRef,
  setStore,
  store,
  type toOverlayOptions,
} from './inspector-store';

let tabId: number | undefined;

export function setInspectorTabId(id: number | undefined): void {
  tabId = id;
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export async function setInspectMode(enabled: boolean): Promise<void> {
  setStore('enabled', enabled);
  if (tabId == null) return;
  try {
    const result = await sendTabMessage(tabId, 'SET_INSPECT_MODE', { enabled });
    setStore('enabled', result.enabled);
  } catch {
    setStore('enabled', false);
    notify({
      title: 'Inspector not connected',
      description: 'Grant site access on the Connection card, then try again.',
      tone: 'warning',
    });
  }
}

export async function fetchInspection(ref: ElementRef | null): Promise<void> {
  setStore('inspection', null);
  setStore('error', null);
  if (!ref || tabId == null) {
    setStore('loading', false);
    return;
  }
  setStore('loading', true);
  try {
    const result = await sendTabMessage(tabId, 'GET_ELEMENT_INSPECTION', { ref });
    if (result.ok) {
      setStore('inspection', result.inspection);
    } else {
      setStore('error', result.error);
    }
  } catch {
    setStore('error', 'The page did not answer the inspection request.');
  } finally {
    setStore('loading', false);
  }
}

export async function fetchDomTree(): Promise<void> {
  if (tabId == null) return;
  setStore('domLoading', true);
  setStore('domError', null);
  try {
    const result = await sendTabMessage(tabId, 'GET_DOM_TREE', { maxDepth: 14, maxNodes: 800 });
    if (result.ok) {
      setStore('domTree', result.nodes);
      setStore('domTruncated', result.truncated);
    } else {
      setStore('domError', result.error);
    }
  } catch {
    setStore('domError', 'The page did not answer the DOM tree request.');
  } finally {
    setStore('domLoading', false);
  }
}

export async function selectElement(ref: ElementRef, opts?: { flash?: boolean }): Promise<void> {
  if (tabId == null) return;
  try {
    await sendTabMessage(tabId, 'SELECT_ELEMENT', { ref, flash: opts?.flash });
    setStore('lockedRef', ref);
    setStore('hoveredRef', ref);
    setStore('activeTab', 'overview');
    void fetchInspection(ref);
  } catch {
    notify({ title: 'Could not select that element', tone: 'warning' });
  }
}

export async function navigateElement(direction: NavigateDirection): Promise<void> {
  if (tabId == null) return;
  try {
    const result = await sendTabMessage(tabId, 'NAVIGATE_ELEMENT', { direction });
    if (result.ref) {
      setStore('lockedRef', result.ref);
      setStore('hoveredRef', result.ref);
      void fetchInspection(result.ref);
    } else {
      notify({ title: 'No element in that direction', tone: 'neutral' });
    }
  } catch {
    notify({ title: 'Navigation failed', tone: 'warning' });
  }
}

export async function pushOverlayOptions(
  patch: Partial<ReturnType<typeof toOverlayOptions>>,
): Promise<void> {
  const merged: OverlayOptions = {
    measurements: patch.measurements ?? store.overlay.measurements,
    clickThrough: patch.clickThrough ?? store.overlay.clickThrough,
    boxModel: {
      margin: patch.boxModel?.margin ?? store.overlay.boxModel.margin,
      border: patch.boxModel?.border ?? store.overlay.boxModel.border,
      padding: patch.boxModel?.padding ?? store.overlay.boxModel.padding,
      content: patch.boxModel?.content ?? store.overlay.boxModel.content,
    },
    measureMode: patch.measureMode ?? store.overlay.measureMode,
  };
  // Ruler mode and click-through are mutually exclusive (both own the click):
  // enabling one clears the other, so the toolbar never shows both active.
  if (merged.measureMode) merged.clickThrough = false;
  if (merged.clickThrough) merged.measureMode = false;
  // Idempotent: only write + notify when a value actually changed. Writing a
  // fresh `merged` object on every call re-triggered the InspectPanel effect
  // that pushes the current overlay (it reads store.overlay), which called
  // pushOverlayOptions again — an infinite synchronous loop that blew the
  // call stack the moment the panel connected to a real page.
  if (!sameOverlayOptions(store.overlay, merged)) {
    setStore('overlay', merged);
    if (tabId != null) {
      try {
        await sendTabMessage(tabId, 'SET_OVERLAY_OPTIONS', merged);
      } catch {
        // Overlay options are best-effort when the page isn't connected.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Storage event sync (content → panel, zero round-trips for hover moves)
// ---------------------------------------------------------------------------

export function handleStorageChange(
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
): void {
  if ('command:mode-toggle' in changes || 'command:screenshot-viewport' in changes) {
    return; // handled by App.tsx
  }
  if (STORAGE_KEYS.selectionChanged in changes) {
    const raw = changes[STORAGE_KEYS.selectionChanged]?.newValue as
      | { ref: ElementRef | null; tabId?: number }
      | ElementRef
      | null
      | undefined;
    const ref = raw && 'ref' in raw ? raw.ref : (raw as ElementRef | null);
    const payloadTabId = raw && 'ref' in raw ? raw.tabId : undefined;
    if (!isForTab(payloadTabId, tabId)) return;
    if (!sameRef(ref, store.hoveredRef)) {
      setStore('hoveredRef', ref);
    }
    if (!sameRef(ref, store.lockedRef)) {
      setStore('lockedRef', ref);
      // A new lock (or unlock) means we re-analyze; hover-only moves skip the
      // expensive full inspection until the user locks.
      if (ref) {
        void fetchInspection(ref);
      } else {
        setStore('inspection', null);
        setStore('error', null);
      }
    }
  }
  if (STORAGE_KEYS.inspectModeChanged in changes) {
    const value = changes[STORAGE_KEYS.inspectModeChanged]?.newValue as
      | { enabled: boolean; tabId?: number }
      | boolean
      | undefined;
    const enabled = typeof value === 'object' && value !== null ? value.enabled : Boolean(value);
    const payloadTabId = typeof value === 'object' && value !== null ? value.tabId : undefined;
    if (!isForTab(payloadTabId, tabId)) return;
    setStore('enabled', enabled);
  }
}

// ---------------------------------------------------------------------------
// Clipboard helpers (all page values are copied as plain text)
// ---------------------------------------------------------------------------

export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify({ title: 'Copied to clipboard', description: label, tone: 'success' });
  } catch {
    notify({
      title: 'Could not copy',
      description: 'Clipboard access is unavailable in this context.',
      tone: 'error',
    });
  }
}
