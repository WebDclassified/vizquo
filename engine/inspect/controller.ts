/**
 * Inspect controller (Sections 7.4/7.6/7.17) — the interactive brain of the
 * content script. Owns the overlay, document-level listeners, selection
 * state, keyboard DOM navigation, and L1 cache invalidation (SPA navigation,
 * debounced stylesheet mutations).
 *
 * Click-through is structural: the overlay is pointer-events:none and all
 * interaction is document-level, so the page stays fully interactive.
 * Hover/lock state is published to storage so the side panel reacts without
 * a message round-trip per pixel of movement (see shared/constants.ts).
 */
import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '../../shared/constants';
import type {
  ElementRef,
  MultiSelectSummary,
  NavigateDirection,
  OverlayOptions,
  Rect,
} from '../../shared/types';
import { inspectElement } from '../analysis/inspect';
import { styleCache } from '../css/style-cache';
import { makeRef, resolveRef } from '../dom/ref';
import { contentTabId } from '../dom/tab-id';
import { measureElement } from '../measure/measure';
import { measurePoints, type Point } from './measure-line';
import { InspectorOverlay } from './overlay';

const STYLESHEET_OBSERVER_DEBOUNCE_MS = 800;

export interface HoverTooltipData {
  tag: string;
  id?: string;
  classes: string[];
  rect: Rect;
  fontSize: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  borderRadius: string;
}

export class InspectController {
  private overlay = new InspectorOverlay();
  private enabled = false;
  private cursorEl: HTMLStyleElement | null = null;
  private hoveredEl: Element | null = null;
  private lockedEl: Element | null = null;
  private lastContextTarget: Element | null = null;
  private options: OverlayOptions = {};
  private rafPending = false;
  private lastPublished = '';
  private observer: MutationObserver | null = null;
  private observerTimer: number | undefined;
  private multiEls: Element[] = [];
  private highlightRefs: ElementRef[] = [];
  private highlightLabel = '';
  /* --- Phase 10: measure mode (click-drag ruler) --- */
  private measureOn = false;
  private measureStart: Point | null = null;
  private measureEnd: Point | null = null;
  /** True while a ruler line is on screen (finalized or mid-drag). */
  private measureActive = false;

  // --- lifecycle ----------------------------------------------------------

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    document.addEventListener('mousemove', this.onMouseMove, true);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('mousedown', this.onMouseDown, true);
    document.addEventListener('mouseup', this.onMouseUp, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('contextmenu', this.onContextMenu, true);
    window.addEventListener('scroll', this.onViewportChange, true);
    window.addEventListener('resize', this.onViewportChange);
    this.patchHistory();
    window.addEventListener('popstate', this.onHistoryChange);
    window.addEventListener('hashchange', this.onHistoryChange);
    this.startStylesheetObserver();
    this.setCursor(true);
    this.overlay.setOptions(this.options);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    document.removeEventListener('mousemove', this.onMouseMove, true);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('mousedown', this.onMouseDown, true);
    document.removeEventListener('mouseup', this.onMouseUp, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('contextmenu', this.onContextMenu, true);
    window.removeEventListener('scroll', this.onViewportChange, true);
    window.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener('popstate', this.onHistoryChange);
    window.removeEventListener('hashchange', this.onHistoryChange);
    this.stopStylesheetObserver();
    this.unpatchHistory();
    this.setCursor(false);
    this.hoveredEl = null;
    this.lockedEl = null;
    this.clearMeasure();
    this.overlay.hide();
    this.overlay.destroy();
    this.overlay = new InspectorOverlay();
    this.overlay.setOptions(this.options);
    void this.publishSelection(null);
  }

  destroy(): void {
    if (this.enabled) this.disable();
    this.overlay.destroy();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Lens/crosshair cursor while inspect mode is on (brand system §14.3).
   * theme.css cannot style the host page (shadow-root overlay only), so a
   * tiny rule is injected for the duration of the session and removed after.
   */
  private setCursor(on: boolean): void {
    const html = document.documentElement;
    if (on) {
      html.classList.add('vq-inspect-mode');
      if (!this.cursorEl) {
        this.cursorEl = document.createElement('style');
        this.cursorEl.textContent =
          'html.vq-inspect-mode, html.vq-inspect-mode * { cursor: crosshair !important; }';
        (document.head ?? document.documentElement).appendChild(this.cursorEl);
      }
    } else {
      html.classList.remove('vq-inspect-mode');
      this.cursorEl?.remove();
      this.cursorEl = null;
    }
  }

  getLockedRef(): ElementRef | null {
    return this.lockedEl ? makeRef(this.lockedEl) : null;
  }

  getHoveredRef(): ElementRef | null {
    return this.hoveredEl ? makeRef(this.hoveredEl) : null;
  }

  getContextTarget(): ElementRef | null {
    return this.lastContextTarget ? makeRef(this.lastContextTarget) : null;
  }

  getState() {
    return {
      enabled: this.enabled,
      locked: this.getLockedRef(),
      hovered: this.getHoveredRef(),
    };
  }

  setOptions(options: OverlayOptions): void {
    this.options = options;
    this.overlay.setOptions(options);
    const measureOn = options.measureMode ?? false;
    if (measureOn !== this.measureOn) {
      this.measureOn = measureOn;
      if (!measureOn) this.clearMeasure();
    }
    if (this.enabled) this.scheduleRepaint();
  }

  /** True while measure mode is on (panel reads it through overlay options). */
  isMeasuring(): boolean {
    return this.measureOn;
  }

  /** Remove the ruler and reset the gesture (Esc / scroll / mode off). */
  private clearMeasure(): void {
    this.measureStart = null;
    this.measureEnd = null;
    this.measureActive = false;
    this.overlay.clearMeasureLine();
  }

  private drawMeasure(): void {
    const start = this.measureStart;
    const end = this.measureEnd;
    if (!start || !end) return;
    this.overlay.showMeasureLine(start, end, measurePoints(start, end));
  }

  selectRef(ref: ElementRef): { ok: boolean } {
    const el = resolveRef(ref);
    if (!el) return { ok: false };
    this.setLocked(el);
    return { ok: true };
  }

  // --- find instances / similar highlights (Section 7.8) -------------------

  showHighlights(refs: ElementRef[], label: string): void {
    this.highlightRefs = refs;
    this.highlightLabel = label;
    this.paintHighlights();
  }

  clearHighlights(): void {
    this.highlightRefs = [];
    this.highlightLabel = '';
    this.overlay.clearHighlights();
  }

  private paintHighlights(): void {
    const rects: Rect[] = [];
    for (const ref of this.highlightRefs) {
      const el = resolveRef(ref);
      if (el) rects.push(rectOf(el));
    }
    this.overlay.showHighlights(rects, this.highlightLabel);
  }

  // --- multi-element selection (Section 7.7) -------------------------------

  getMultiSelection(): { refs: ElementRef[] } {
    return { refs: this.multiEls.map((el) => makeRef(el)) };
  }

  clearMultiSelection(): void {
    if (this.multiEls.length === 0) return;
    this.multiEls = [];
    void this.publishMulti();
    this.clearHighlights();
  }

  /** Common vs differing properties across the current multi-selection. */
  getMultiSummary(): MultiSelectSummary {
    const els = this.multiEls.filter((el) => el.isConnected);
    if (els.length < 2) return { count: 0, common: {}, differing: [] };
    const fieldOf = (el: Element, field: string): string => {
      const style = getComputedStyle(el);
      switch (field) {
        case 'fontFamily':
          return style.fontFamily;
        case 'fontSize':
          return style.fontSize;
        case 'fontWeight':
          return style.fontWeight;
        case 'borderRadius':
          return style.borderRadius;
        case 'backgroundColor':
          return style.backgroundColor;
        case 'color':
          return style.color;
        case 'padding':
          return style.padding;
        case 'height':
          return `${Math.round(el.getBoundingClientRect().height)}px`;
        default:
          return '';
      }
    };
    const FIELDS = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'borderRadius',
      'backgroundColor',
      'color',
      'padding',
      'height',
    ] as const;
    const common: Record<string, string> = {};
    const differing: string[] = [];
    for (const field of FIELDS) {
      const values = new Set(els.map((el) => fieldOf(el, field)));
      if (values.size === 1) {
        const value = [...values][0] ?? '';
        if (value) common[field] = value;
      } else {
        differing.push(field);
      }
    }
    return { count: els.length, common, differing };
  }

  navigate(direction: NavigateDirection): ElementRef | null {
    if (!this.lockedEl) return null;
    let target: Element | null = null;
    const el = this.lockedEl;
    switch (direction) {
      case 'parent':
        target = el.parentElement;
        break;
      case 'first-child':
        for (const child of Array.from(el.children)) {
          if (isInspectable(child)) {
            target = child;
            break;
          }
        }
        break;
      case 'prev-sibling':
        target = previousElementSibling(el);
        break;
      case 'next-sibling':
        target = nextElementSibling(el);
        break;
    }
    if (!target) return null;
    this.setLocked(target);
    return makeRef(target);
  }

  invalidateCaches(): void {
    styleCache.invalidate();
    // Selection refs may be stale after navigation — clear them.
    this.hoveredEl = null;
    if (this.lockedEl && !this.lockedEl.isConnected) this.lockedEl = null;
    void this.publishSelection(this.lockedEl ? makeRef(this.lockedEl) : null);
  }

  // --- selection ----------------------------------------------------------

  private setLocked(el: Element): void {
    this.lockedEl = el;
    this.hoveredEl = el;
    this.paintLocked();
    void this.publishSelection(makeRef(el));
  }

  private setHovered(el: Element | null): void {
    if (this.hoveredEl === el) return;
    this.hoveredEl = el;
    if (el) {
      // Coalesce the paint — getComputedStyle + getBoundingClientRect per
      // mousemove are not cheap on huge pages; one rAF per frame keeps the
      // hover at 60 fps without the cost (BUG-010).
      this.scheduleRepaint();
      void this.publishSelection(makeRef(el));
    } else {
      this.overlay.hideTooltip();
      this.overlay.hide();
    }
  }

  private clearLock(): void {
    this.lockedEl = null;
    this.overlay.hideBoxLayer();
    this.scheduleRepaint();
    void this.publishSelection(this.hoveredEl ? makeRef(this.hoveredEl) : null);
  }

  // --- painting -----------------------------------------------------------

  private paintHover(el: Element): void {
    const rect = rectOf(el);
    this.overlay.showHover(rect);
    if (this.options.measurements) {
      this.overlay.showMeasurements(rect, measureElement(el, rect));
    } else {
      this.overlay.clearMeasurements();
    }
    this.overlay.showTooltip(rect, tooltipLines(el));
  }

  private paintLocked(): void {
    if (!this.lockedEl) return;
    const el = this.lockedEl;
    const rect = rectOf(el);
    const showBox =
      this.options.boxModel?.margin ||
      this.options.boxModel?.border ||
      this.options.boxModel?.padding ||
      this.options.boxModel?.content;
    this.overlay.showLocked(rect);
    if (showBox) {
      // Full inspection runs only when a box-model layer is visible; it goes
      // through the L1 cache, so the panel's fetch reuses the same work.
      void (async () => {
        try {
          const inspection = await inspectElement(el);
          if (this.lockedEl !== el) return;
          this.overlay.renderBoxModel(rect, inspection.boxModel);
        } catch {
          // Box model unavailable — the outline still shows.
        }
      })();
    }
    if (this.options.measurements) {
      this.overlay.showMeasurements(rect, measureElement(el, rect));
    } else {
      this.overlay.clearMeasurements();
    }
    this.overlay.showTooltip(rect, tooltipLines(el));
  }

  /**
   * One coalesced repaint for everything that follows a viewport or state
   * change (scroll, resize, hover, lock, style mutation): at most one rAF per
   * frame, so a 60 Hz mousemove stream never repaints at full cost.
   */
  private scheduleRepaint(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (this.lockedEl) this.paintLocked();
      else if (this.hoveredEl) this.paintHover(this.hoveredEl);
      else this.overlay.hide();
      if (this.highlightRefs.length > 0) this.paintHighlights();
    });
  }

  // --- storage sync -------------------------------------------------------

  private async publishSelection(ref: ElementRef | null): Promise<void> {
    const key = STORAGE_KEYS.selectionChanged;
    const payload = JSON.stringify(ref);
    if (payload === this.lastPublished && ref) return;
    this.lastPublished = payload;
    // Tab-stamped so panels on other tabs/windows ignore it (Section 7.27).
    const tabId = await contentTabId();
    await browser.storage.local.set({ [key]: { ref, tabId } });
  }

  private async publishMulti(): Promise<void> {
    const tabId = await contentTabId();
    await browser.storage.local.set({
      [STORAGE_KEYS.multiSelectionChanged]: {
        refs: this.multiEls.map((el) => makeRef(el)),
        tabId,
      },
    });
  }

  // --- document listeners -------------------------------------------------

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.enabled) return;
    // Measure drag: live-update the ruler end while the button is down.
    if (this.measureOn && this.measureStart) {
      this.measureEnd = { x: event.clientX, y: event.clientY };
      this.drawMeasure();
      return;
    }
    const target = event.target as Element | null;
    if (!target || !isInspectable(target)) return;
    if (this.lockedEl) return; // hover follows the locked element
    this.setHovered(target);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.enabled || !this.measureOn || event.button !== 0) return;
    // The ruler owns the gesture: suppress native drag/selection so the line
    // is drawn exactly where the user intends (explicit mode, easy to leave).
    event.preventDefault();
    const point: Point = { x: event.clientX, y: event.clientY };
    this.measureStart = point;
    this.measureEnd = point;
    this.measureActive = true;
    this.drawMeasure();
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (!this.enabled || !this.measureOn || !this.measureStart || event.button !== 0) return;
    this.measureEnd = { x: event.clientX, y: event.clientY };
    // A click without a drag is not a measurement — clear the anchor dot so
    // accidental clicks never leave a 1px artifact on the page.
    if (measurePoints(this.measureStart, this.measureEnd).distance < 2) {
      this.clearMeasure();
      return;
    }
    this.drawMeasure();
    // Finalize the line (it stays on screen); a new drag replaces it.
    this.measureStart = null;
  };

  private readonly onClick = (event: MouseEvent): void => {
    // Measure mode consumes clicks — locking would fight the ruler gesture.
    if (!this.enabled || this.options.clickThrough || this.measureOn) return;
    const target = event.target as Element | null;
    if (!target || !isInspectable(target)) return;

    // Shift-click toggles membership in the multi-selection (Section 7.7).
    if (event.shiftKey) {
      const index = this.multiEls.indexOf(target);
      if (index >= 0) {
        this.multiEls.splice(index, 1);
      } else {
        this.multiEls.push(target);
      }
      if (this.multiEls.length >= 2) {
        this.setLocked(target);
        this.showHighlights(
          this.multiEls.map((el) => makeRef(el)),
          `${this.multiEls.length} selected`,
        );
        void this.publishMulti();
      } else {
        this.multiEls = [];
        this.clearHighlights();
        void this.publishMulti();
        if (this.lockedEl === target) this.clearLock();
        else this.setLocked(target);
      }
      return;
    }

    // Plain click resets the multi-selection, then behaves as single select.
    if (this.multiEls.length > 0) {
      this.multiEls = [];
      this.clearHighlights();
      void this.publishMulti();
    }
    if (this.lockedEl === target) {
      this.clearLock();
    } else {
      this.setLocked(target);
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    // First Esc clears the ruler before touching the locked selection. It
    // also cancels an in-progress drag (mouseup would otherwise finalize it).
    if (event.key === 'Escape' && this.measureOn && this.measureActive) {
      event.preventDefault();
      this.clearMeasure();
      return;
    }
    if (!this.lockedEl) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        this.navigate('parent');
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.navigate('first-child');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.navigate('prev-sibling');
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.navigate('next-sibling');
        break;
      case 'Escape':
        event.preventDefault();
        this.clearLock();
        if (this.multiEls.length > 0) this.clearMultiSelection();
        this.clearHighlights();
        break;
      default:
        break;
    }
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (target && isInspectable(target)) this.lastContextTarget = target;
  };

  private readonly onViewportChange = (): void => {
    if (!this.enabled) return;
    // Viewport coordinates: scrolling/resizing invalidates the ruler, so the
    // tape resets (like a real measuring tape being lifted off the page).
    if (this.measureOn) this.clearMeasure();
    this.scheduleRepaint();
  };

  private readonly onHistoryChange = (): void => {
    this.invalidateCaches();
  };

  private patchedPushState = false;
  private originalPushState: History['pushState'] | null = null;
  private originalReplaceState: History['replaceState'] | null = null;

  private patchHistory(): void {
    if (this.patchedPushState) return;
    this.patchedPushState = true;
    const history = window.history;
    const originalPush = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
    const invalidate = (): void => {
      // Only invalidate when the URL actually changes.
      const url = window.location.href;
      setTimeout(() => {
        if (window.location.href !== url) this.invalidateCaches();
      }, 0);
    };
    history.pushState = ((...args: Parameters<History['pushState']>) => {
      const result = originalPush(...args);
      invalidate();
      return result;
    }) as typeof history.pushState;
    history.replaceState = ((...args: Parameters<History['replaceState']>) => {
      const result = originalReplace(...args);
      invalidate();
      return result;
    }) as typeof history.replaceState;
  }

  /** Restore the page's own history functions when inspect mode ends. */
  private unpatchHistory(): void {
    if (!this.patchedPushState) return;
    if (this.originalPushState) window.history.pushState = this.originalPushState;
    if (this.originalReplaceState) window.history.replaceState = this.originalReplaceState;
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.patchedPushState = false;
  }

  private startStylesheetObserver(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => {
      window.clearTimeout(this.observerTimer);
      this.observerTimer = window.setTimeout(() => {
        styleCache.invalidate();
        this.scheduleRepaint();
      }, STYLESHEET_OBSERVER_DEBOUNCE_MS);
    });
    this.observer.observe(document.head, {
      childList: true,
      subtree: false,
      attributes: false,
    });
  }

  private stopStylesheetObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    window.clearTimeout(this.observerTimer);
  }
}

function isInspectable(el: Element): boolean {
  if (el.tagName === 'HTML' || el.tagName === 'BODY') return false;
  return true;
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
  };
}

function previousElementSibling(el: Element): Element | null {
  let node = el.previousElementSibling;
  while (node && !isInspectable(node)) node = node.previousElementSibling;
  return node;
}

function nextElementSibling(el: Element): Element | null {
  let node = el.nextElementSibling;
  while (node && !isInspectable(node)) node = node.nextElementSibling;
  return node;
}

/** Build the compact hover tooltip lines (name, size, type, color). */
export function tooltipLines(
  el: Element,
): { label?: string; value: string; swatch?: string; strong?: boolean }[][] {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const id = el.id ? `#${el.id}` : '';
  const klass = Array.from(el.classList).slice(0, 2).join('.');
  const name = `${el.tagName.toLowerCase()}${id}${klass ? `.${klass}` : ''}`;

  const lines: { label?: string; value: string; swatch?: string; strong?: boolean }[][] = [];
  lines.push([
    { value: name, strong: true },
    { label: '', value: ` ${Math.round(rect.width)}×${Math.round(rect.height)}` },
  ]);

  const typeParts: { value: string }[] = [];
  if (style.fontSize && style.fontSize !== '0px') {
    typeParts.push({ value: style.fontSize });
    typeParts.push({ value: style.fontWeight });
  }
  if (typeParts.length > 0) lines.push(typeParts);

  const colorLine: { value: string; swatch?: string }[] = [];
  const color = normalizeColor(style.color);
  if (color) colorLine.push({ value: color, swatch: color });
  const bg = normalizeColor(style.backgroundColor);
  if (bg) colorLine.push({ value: bg, swatch: bg });
  if (style.borderRadius && style.borderRadius !== '0px') {
    colorLine.push({ value: style.borderRadius });
  }
  if (colorLine.length > 0) lines.push(colorLine);

  return lines;
}

function normalizeColor(value: string): string | null {
  if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return null;
  return value;
}
