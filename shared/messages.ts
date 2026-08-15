/**
 * The one typed message bus shared by content script, background worker, and
 * side panel (Section 2). Built on @webext-core/messaging so every call is
 * type-checked end-to-end — no stringly-typed postMessage.
 *
 * Phase 1: PING round-trip. Phase 2 adds the element-inspection surface:
 * inspect mode, per-element analysis, DOM tree, selection/navigation, and the
 * context-menu target. Panel-local state sync (selection changes, inspect
 * mode) flows through storage events (STORAGE_KEYS in shared/constants.ts).
 */
import { defineExtensionMessaging } from '@webext-core/messaging';
import { browser } from 'wxt/browser';
import type {
  AIExplainRequest,
  AIExplainResult,
  CaptureResult,
  DomTreeRequest,
  DomTreeResult,
  ElementInspectionResult,
  ElementRef,
  ExportAssetRequest,
  ExportAssetsResult,
  FetchAssetSvgResult,
  FindInstancesKind,
  FindInstancesResult,
  InspectState,
  LiveEdit,
  LiveEditResult,
  MultiSelectSummary,
  NavigateDirection,
  OverlayOptions,
  PageGeometry,
  Rect,
  ScanPageResult,
  SimilarityResult,
  TimeMachineResult,
} from './types';

export interface TabInfo {
  id?: number;
  url?: string;
  title?: string;
}

export interface ContentPingReply {
  nonce: number;
  url: string;
  title: string;
  inspectModeEnabled: boolean;
}

export interface PingResult {
  nonce: number;
  backgroundOk: boolean;
  extensionVersion: string;
  at: number;
  tab: TabInfo | null;
  content: { ok: boolean; error?: string } & Partial<ContentPingReply>;
}

export interface ProtocolMap {
  /** Full round-trip: sidepanel → background → content → background → sidepanel. */
  PING: (data: { nonce: number }) => PingResult;
  /** Content-script health check, sent by the background to a specific tab. */
  PING_TAB: (data: { nonce: number }) => ContentPingReply;
  /** A content script's own tab id (background resolves it from the sender). */
  GET_CONTENT_TAB_ID: () => { tabId: number | null };
  /** Cancel the running scan in the content script (if any). */
  CANCEL_SCAN: () => { cancelled: boolean };

  /* ---- Phase 2: inspection (handled by the content script) ---- */
  /** Explicitly enable/disable inspect mode on the page. */
  SET_INSPECT_MODE: (data: { enabled: boolean }) => { enabled: boolean };
  /** Current inspect state (enabled + locked/hovered refs). */
  GET_INSPECT_STATE: () => InspectState;
  /** Full analysis of one element (Sections 7.4/7.5). */
  GET_ELEMENT_INSPECTION: (data: { ref: ElementRef }) => ElementInspectionResult;
  /** Simplified DOM tree (7.17). */
  GET_DOM_TREE: (data: DomTreeRequest) => DomTreeResult;
  /** Lock an element by ref (DOM tree click / context menu). `flash` shows
   *  a brief attention pulse on the page (right-click handoff). */
  SELECT_ELEMENT: (data: { ref: ElementRef; flash?: boolean }) => { ok: boolean };
  /** Move the locked selection relative to itself (keyboard nav in the panel). */
  NAVIGATE_ELEMENT: (data: { direction: NavigateDirection }) => { ref: ElementRef | null };
  /** Update overlay presentation options (measurements / click-through / box model). */
  SET_OVERLAY_OPTIONS: (data: OverlayOptions) => void;
  /** The element under the most recent context-menu click (context menu flow). */
  GET_CONTEXT_TARGET: () => { ref: ElementRef | null };

  /* ---- Phase 3: full-page scan (Sections 7.1–7.3) ---- */
  /** Run a full design scan; returns the assembled Inspection. Progress is
   *  streamed via STORAGE_KEYS.scanProgress (progressive section reveal). */
  SCAN_PAGE: () => ScanPageResult;
  /** Cheap page fingerprint (L3 cache key, Section 2.3) — computed before
   *  any scan so an unchanged page loads from the cache instead of re-running
   *  the full engine. */
  GET_PAGE_FINGERPRINT: () => { fingerprint: string };
  /** Highlight every element whose computed style matches a token value. */
  FIND_INSTANCES: (data: { kind: FindInstancesKind; value: string }) => FindInstancesResult;
  /** Remove instance/similar highlights from the page. */
  CLEAR_HIGHLIGHTS: () => void;
  /** Structurally similar elements for a given ref (worker, tree-edit heuristic). */
  FIND_SIMILAR: (data: { ref: ElementRef }) => { results: SimilarityResult[] };

  /* ---- Phase 3: multi-element selection (Section 7.7) ---- */
  /** Current shift-click multi-selection. */
  GET_MULTI_SELECTION: () => { refs: ElementRef[] };
  /** Union bounding box of the current multi-selection (selection screenshot). */
  GET_MULTI_SELECTION_BOUNDS: () => { rect: Rect | null };
  /** Clear the multi-selection. */
  CLEAR_MULTI_SELECTION: () => void;
  /** Common vs differing properties across the current selection. */
  GET_MULTI_SUMMARY: () => MultiSelectSummary;

  /* ---- Phase 4: asset export (Section 7.10) ---- */
  /** Fetch the listed assets, bundle them into a vizquo-assets ZIP with
   *  metadata.json, and start a browser download. Handled by the background
   *  worker (has downloads + on-demand host permissions). CORS-blocked assets
   *  are reported in the result — never silently dropped. */
  EXPORT_ASSETS: (data: { requests: ExportAssetRequest[] }) => ExportAssetsResult;
  /** Fetch an SVG's source text from the page (copy / download actions). */
  FETCH_ASSET_SVG: (data: { url: string }) => FetchAssetSvgResult;
  /** Highlight the given element refs on the page (click an asset → locate it). */
  HIGHLIGHT_REFS: (data: { refs: ElementRef[]; label: string }) => void;

  /* ---- Phase 5: responsive Time Machine (Section 7.15) ---- */
  /** Probe one viewport width: deterministic breakpoint mapping, verified
   *  against real layout in a same-origin emulation iframe when possible. */
  RUN_TIME_MACHINE: (data: { width: number }) => TimeMachineResult;

  /* ---- Phase 6: live editing (Section 7.21) ---- */
  /** Apply one CSS edit to an element. In-memory only — a reload reverts it. */
  APPLY_LIVE_EDIT: (data: { ref: ElementRef; property: string; value: string }) => LiveEditResult;
  /** Revert one live edit to its original computed value. */
  UNDO_LIVE_EDIT: (data: { id: string }) => LiveEditResult;
  /** Revert every live edit on the page. */
  CLEAR_LIVE_EDITS: () => { count: number };
  /** Current live edits (for the panel's before/after list). */
  GET_LIVE_EDITS: () => { edits: LiveEdit[] };

  /* ---- Phase 7: contextual AI (Sections 7.22–7.23) ---- */
  /** Explain an element / page / asset via the configured provider. The API
   *  key lives only in the background worker — never in the content script or
   *  the page. The payload was pre-built and pre-summarized by the side panel
   *  (the privacy gate showed exactly this before first send). */
  AI_EXPLAIN: (data: AIExplainRequest) => AIExplainResult;

  /* ---- Phase 6: screenshot studio (Section 7.20) ---- */
  /** Page geometry for fullpage stitching (content script). */
  GET_PAGE_GEOMETRY: () => PageGeometry;
  /** Scroll the page (content script); returns the applied scrollY. */
  SCROLL_TO: (data: { y: number }) => { y: number };
  /** Capture the visible tab (background worker — has tab + host access). */
  CAPTURE_VIEWPORT: () => CaptureResult;

  /* ---- Content → background: inspect-mode state (toolbar badge) ---- */
  INSPECT_STATE_CHANGED: (data: { enabled: boolean }) => void;

  /* ---- Phase 8: detachable inspector window ---- */
  /** Open the side-panel UI in a popup window (background owns windows.create). */
  OPEN_INSPECTOR_WINDOW: () => { opened: boolean };
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();

/**
 * Send a message to a specific TAB through the promise-based polyfill path.
 *
 * @webext-core's tab-targeted sender uses the raw `chrome.tabs.sendMessage`
 * CALLBACK form and never reads `chrome.runtime.lastError`, so any message
 * racing a tab navigation/reload (e.g. the panel auto-loading an element's
 * inspection while the user navigates a heavy page) leaves an *unchecked*
 * lastError — Chrome then logs "listener indicated an asynchronous response…
 * channel closed" into the sender's console. The polyfill consumes the error
 * and rejects the promise instead, which the callers already handle. Same
 * response contract as the library: `{ res | err }` from the content script
 * is unwrapped, handler errors are rethrown.
 */
export async function sendTabMessage<Type extends keyof ProtocolMap>(
  tabId: number,
  type: Type,
  data: Parameters<ProtocolMap[Type]>[0],
): Promise<ReturnType<ProtocolMap[Type]>> {
  const message = {
    id: Math.floor(Math.random() * 1_000_000),
    type,
    data,
    timestamp: Date.now(),
  };
  // The promise form rejects on runtime.lastError (tab gone, content script
  // unloaded mid-navigation) instead of leaving it unchecked.
  const response = (await browser.tabs.sendMessage(tabId, message)) as
    | { res?: unknown; err?: unknown }
    | undefined;
  if (response?.err) {
    const detail =
      typeof response.err === 'string'
        ? response.err
        : ((response.err as { message?: string } | null)?.message ?? 'Message handler error.');
    throw new Error(detail);
  }
  return response?.res as ReturnType<ProtocolMap[Type]>;
}
