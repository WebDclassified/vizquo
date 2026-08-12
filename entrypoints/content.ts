/**
 * Content script — Phase 3.
 *
 * Runs in the page's isolated world on http/https once the user grants site
 * access. Phase 2: the interactive inspect controller (hover/click/keyboard),
 * per-element analysis, DOM tree, context-menu target. Phase 3 adds the
 * full-page scan pipeline (scan → Comlink worker → progressive results), find
 * instances / similar highlighting, and shift-click multi-selection. State
 * sync to the side panel flows through storage events.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import { inspectRef } from '../engine/analysis/inspect';
import { ScanOrchestrator } from '../engine/analysis/orchestrator';
import { resolveRef } from '../engine/dom/ref';
import { buildDomTree } from '../engine/dom/tree';
import { InspectController } from '../engine/inspect/controller';
import {
  applyLiveEdit,
  clearLiveEdits,
  getLiveEdits,
  resetLiveEdits,
  undoLiveEdit,
} from '../engine/live-edit/session';
import { disposeTimeMachine, runTimeMachine } from '../engine/responsive/time-machine';
import { computePageFingerprint } from '../engine/scan/fingerprint';
import { onMessage, sendMessage } from '../shared/messages';
import type { PageGeometry, Rect } from '../shared/types';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    const controller = new InspectController();
    const orchestrator = new ScanOrchestrator({
      showHighlights: (refs, label) => controller.showHighlights(refs, label),
      clearHighlights: () => controller.clearHighlights(),
    });

    const enabled = (): boolean => controller.isEnabled();

    onMessage('PING_TAB', ({ data }) => ({
      nonce: data.nonce,
      url: window.location.href,
      title: document.title,
      inspectModeEnabled: enabled(),
    }));

    onMessage('SET_INSPECT_MODE', ({ data }) => {
      if (data.enabled && !enabled()) {
        controller.enable();
        void sendMessage('INSPECT_STATE_CHANGED', { enabled: true });
      } else if (!data.enabled && enabled()) {
        controller.disable();
        void sendMessage('INSPECT_STATE_CHANGED', { enabled: false });
      }
      return { enabled: enabled() };
    });

    onMessage('GET_INSPECT_STATE', () => controller.getState());

    onMessage('GET_ELEMENT_INSPECTION', ({ data }) => inspectRef(data.ref));

    onMessage('GET_DOM_TREE', ({ data }) => {
      try {
        const { nodes, truncated } = buildDomTree(document, data);
        return { ok: true, nodes, truncated };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not build the DOM tree.',
        };
      }
    });

    onMessage('SELECT_ELEMENT', ({ data }) => {
      if (!enabled()) controller.enable();
      return controller.selectRef(data.ref, { flash: data.flash });
    });

    onMessage('NAVIGATE_ELEMENT', ({ data }) => ({
      ref: controller.navigate(data.direction),
    }));

    onMessage('SET_OVERLAY_OPTIONS', ({ data }) => {
      controller.setOptions(data);
    });

    onMessage('GET_CONTEXT_TARGET', () => ({
      ref: controller.getContextTarget(),
    }));

    // --- Phase 3: full-page scan + find instances/similar -----------------
    onMessage('SCAN_PAGE', () => orchestrator.scanPage());

    // Cancel the running scan: the walk + each analysis phase check the flag,
    // so a cancel lands as a clean { ok: false } result, never partial data.
    onMessage('CANCEL_SCAN', () => orchestrator.cancelScan());

    // Cheap L3 fingerprint — lets the panel decide "same page as before?"
    // without running the full engine (Section 2.3).
    onMessage('GET_PAGE_FINGERPRINT', () => ({
      fingerprint: computePageFingerprint(document),
    }));

    onMessage('FIND_INSTANCES', ({ data }) => orchestrator.findInstances(data.kind, data.value));

    onMessage('CLEAR_HIGHLIGHTS', () => {
      orchestrator.clearHighlights();
    });

    onMessage('FIND_SIMILAR', ({ data }) => orchestrator.findSimilar(data.ref));

    // --- Phase 3: multi-element selection (Section 7.7) -------------------
    onMessage('GET_MULTI_SELECTION', () => controller.getMultiSelection());

    onMessage('CLEAR_MULTI_SELECTION', () => {
      controller.clearMultiSelection();
    });

    onMessage('GET_MULTI_SUMMARY', () => controller.getMultiSummary());

    // Union bounding box of the shift-click multi-selection — the crop rect
    // for the "selection" screenshot region (Phase 9 power-up).
    onMessage('GET_MULTI_SELECTION_BOUNDS', () => {
      const refs = controller.getMultiSelection().refs;
      let box: Rect | null = null;
      for (const ref of refs) {
        const el = resolveRef(ref);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        box = box
          ? {
              x: Math.min(box.x, r.x),
              y: Math.min(box.y, r.y),
              width: Math.max(box.x + box.width, r.x + r.width) - Math.min(box.x, r.x),
              height: Math.max(box.y + box.height, r.y + r.height) - Math.min(box.y, r.y),
              top: Math.min(box.top, r.top),
              left: Math.min(box.left, r.left),
              right: Math.max(box.right, r.right),
              bottom: Math.max(box.bottom, r.bottom),
            }
          : { ...r };
      }
      return { rect: box };
    });

    // --- Phase 4: assets (Section 7.10) -----------------------------------
    onMessage('FETCH_ASSET_SVG', async ({ data }) => {
      try {
        const response = await fetch(data.url);
        if (!response.ok) {
          return { ok: false, error: `The asset returned HTTP ${response.status}.` };
        }
        const content = await response.text();
        if (!content.trim().startsWith('<svg')) {
          return { ok: false, error: 'The fetched asset is not an SVG document.' };
        }
        return { ok: true, content };
      } catch {
        return {
          ok: false,
          error:
            'The SVG could not be fetched (CORS or network). The source is not accessible to the extension — it is never bypassed.',
        };
      }
    });

    onMessage('HIGHLIGHT_REFS', ({ data }) => {
      controller.showHighlights(data.refs, data.label);
    });

    // --- Phase 5: responsive Time Machine (Section 7.15) -----------------
    onMessage('RUN_TIME_MACHINE', async ({ data }) => {
      const snapshot = orchestrator.getLastSnapshot();
      return runTimeMachine(data.width, snapshot?.breakpoints ?? []);
    });

    // --- Phase 6: live editing (Section 7.21) ---------------------------
    onMessage('APPLY_LIVE_EDIT', ({ data }) => applyLiveEdit(data.ref, data.property, data.value));

    onMessage('UNDO_LIVE_EDIT', ({ data }) => undoLiveEdit(data.id));

    onMessage('CLEAR_LIVE_EDITS', () => clearLiveEdits());

    onMessage('GET_LIVE_EDITS', () => getLiveEdits());

    // --- Phase 6: screenshot studio geometry (Section 7.20) --------------
    onMessage(
      'GET_PAGE_GEOMETRY',
      (): PageGeometry => ({
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio,
      }),
    );

    onMessage('SCROLL_TO', ({ data }) => {
      window.scrollTo(0, Math.max(0, data.y));
      return { y: window.scrollY };
    });

    // Clean up listeners, the overlay, the live-edit session, and the Time
    // Machine iframe on real unload — edits are page-scoped and must never
    // outlive the page, and a hidden second copy of the page must not keep
    // running scripts/timers/network after the user leaves.
    window.addEventListener(
      'pagehide',
      () => {
        controller.destroy();
        resetLiveEdits();
        disposeTimeMachine();
      },
      { once: true },
    );
  },
});
