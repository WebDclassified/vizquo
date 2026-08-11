/**
 * Inspection overlay (Section 7.4/7.6) — rendered inside a shadow root so no
 * page CSS can leak in and Vizquo's styles can't leak out. The container is
 * pointer-events:none by construction: all interaction happens through
 * document-level listeners in the controller, which is what makes
 * "click-through" free (the page stays fully interactive under the overlay).
 *
 * Everything the overlay shows comes from page data — it is set via
 * textContent only, never innerHTML (Section 4: treat page content as
 * untrusted).
 */
import type { BoxModel, OverlayOptions, Rect } from '../../shared/types';

const Z_INDEX = 2147483646; // just under the max, above everything on the page

const OVERLAY_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.vq-wrap { position: fixed; inset: 0; pointer-events: none; z-index: ${Z_INDEX}; }
/* Hover = detected/inferred region → DASHED frame (brand system §14.4). */
.vq-highlight {
  position: fixed; pointer-events: none;
  background: rgba(110, 123, 255, 0.08);
  border: 1px dashed rgba(110, 123, 255, 0.55);
  border-radius: 2px;
  transition: none;
}
/* Locked = active selection → SOLID frame with corner markers. */
.vq-highlight.vq-locked {
  background: rgba(110, 123, 255, 0.05);
  border: 1.5px solid #6e7bff;
  box-shadow: 0 0 0 1px rgba(110, 123, 255, 0.35);
}
.vq-highlight .vq-corners { display: none; }
.vq-highlight.vq-locked .vq-corners { display: block; }
.vq-corner {
  position: absolute;
  width: 10px; height: 10px;
  border: 0 solid #6e7bff;
}
.vq-corner-tl { top: -2px; left: -2px; border-top-width: 2px; border-left-width: 2px; }
.vq-corner-tr { top: -2px; right: -2px; border-top-width: 2px; border-right-width: 2px; }
.vq-corner-bl { bottom: -2px; left: -2px; border-bottom-width: 2px; border-left-width: 2px; }
.vq-corner-br { bottom: -2px; right: -2px; border-bottom-width: 2px; border-right-width: 2px; }
.vq-tooltip {
  position: fixed; pointer-events: none;
  background: #101217; color: #f5f7fa;
  font: 11px/1.5 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  padding: 6px 8px; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 12px 32px rgba(0,0,0,0.35);
  max-width: 260px; white-space: nowrap;
  z-index: 1;
}
.vq-tooltip b { font-weight: 700; color: #ffffff; }
.vq-tooltip .vq-swatch {
  display: inline-block; width: 8px; height: 8px; border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.35); margin-right: 4px; vertical-align: -1px;
}
.vq-measure {
  position: fixed; pointer-events: none;
  font: 10px/1.4 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: #6e7bff; color: #0b0c10;
  padding: 1px 5px; border-radius: 3px;
  white-space: nowrap;
}
.vq-measure.vq-m-align { background: #2e9e63; color: #ffffff; }
.vq-measure.vq-m-viewport { background: #37414f; color: #e7e9ee; }
.vq-box { position: fixed; pointer-events: none; }
.vq-box-margin { border: 1px dashed #e7b75b; background: rgba(231,183,91,0.12); }
.vq-box-border { border: 1px solid #e7b75b; background: transparent; }
.vq-box-padding { border: 1px dashed #45d483; background: rgba(69,212,131,0.12); }
.vq-box-content { border: 1px dashed #5aa9ff; background: rgba(90,169,255,0.14); }
.vq-box-label {
  position: fixed; font: 9px/1 'JetBrains Mono', ui-monospace, monospace;
  color: #fff; background: rgba(0,0,0,0.55);
  padding: 1px 3px; border-radius: 2px;
  transform: translate(-50%, -50%);
}
.vq-dim {
  position: fixed; pointer-events: none;
  font: 10px/1.4 'JetBrains Mono', ui-monospace, monospace;
  color: #6e7bff; background: rgba(110,123,255,0.10);
  border: 1px solid rgba(110,123,255,0.5);
  padding: 1px 4px; border-radius: 3px;
}
.vq-hl {
  position: fixed; pointer-events: none;
  border: 1px dashed rgba(110, 123, 255, 0.7);
  background: rgba(110, 123, 255, 0.08);
  animation: vq-pulse 1.6s ease-in-out infinite;
  z-index: 2;
}
@keyframes vq-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(110,123,255,0.25); }
  50% { box-shadow: 0 0 0 3px rgba(110,123,255,0.5); }
}
/* Shadow-root styles can't be reached by the panel's reduced-motion CSS. */
@media (prefers-reduced-motion: reduce) {
  .vq-hl { animation: none; }
}
.vq-hl-chip {
  position: fixed; pointer-events: none;
  font: 600 10px/1.4 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #6e7bff; color: #0b0c10;
  padding: 2px 7px; border-radius: 3px;
  z-index: 3;
}
/* Measure-mode ruler (Phase 10, brand system §14.2) — the click-drag tape. */
.vq-ruler-rect {
  position: fixed; pointer-events: none;
  border: 1px dashed rgba(110, 123, 255, 0.45);
  z-index: 1;
}
.vq-ruler-line {
  position: fixed; pointer-events: none;
  height: 0; border-top: 1px solid #6e7bff;
  transform-origin: 0 0;
  z-index: 2;
}
.vq-ruler-dot {
  position: fixed; pointer-events: none;
  width: 8px; height: 8px; border-radius: 50%;
  background: #6e7bff;
  border: 1.5px solid #0b0c10;
  transform: translate(-50%, -50%);
  z-index: 2;
}
.vq-ruler-label {
  position: fixed; pointer-events: none;
  font: 600 11px/1.5 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #6e7bff; color: #0b0c10;
  padding: 2px 7px; border-radius: 3px;
  white-space: nowrap; z-index: 3;
}
.vq-ruler-detail {
  position: fixed; pointer-events: none;
  font: 10px/1.4 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #101217; color: #b4bac5;
  border: 1px solid rgba(255,255,255,0.12);
  padding: 1px 6px; border-radius: 3px;
  white-space: nowrap; z-index: 3;
}
`;

export class InspectorOverlay {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly wrap: HTMLElement;
  private readonly highlight: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly measures: HTMLElement[] = [];
  private readonly boxLayer: HTMLElement;
  private readonly dimLabel: HTMLElement;
  private readonly highlightsLayer: HTMLElement;
  private readonly highlightChip: HTMLElement;
  private readonly highlightBoxes: HTMLElement[] = [];
  private readonly rulerLayer: HTMLElement;
  private readonly rulerChildren: HTMLElement[] = [];
  private options: OverlayOptions = {};

  constructor() {
    this.host = document.createElement('div');
    this.host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${Z_INDEX};`;
    this.root = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    this.root.appendChild(style);

    this.wrap = document.createElement('div');
    this.wrap.className = 'vq-wrap';
    this.root.appendChild(this.wrap);

    this.highlight = document.createElement('div');
    this.highlight.className = 'vq-highlight';
    // Signature corner markers on the locked frame (brand system §14.1).
    const corners = document.createElement('div');
    corners.className = 'vq-corners';
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      const span = document.createElement('span');
      span.className = `vq-corner vq-corner-${corner}`;
      corners.appendChild(span);
    }
    this.highlight.appendChild(corners);
    this.wrap.appendChild(this.highlight);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'vq-tooltip';
    this.tooltip.hidden = true;
    this.wrap.appendChild(this.tooltip);

    this.boxLayer = document.createElement('div');
    this.boxLayer.className = 'vq-box-layer';
    this.boxLayer.hidden = true;
    this.wrap.appendChild(this.boxLayer);

    this.dimLabel = document.createElement('div');
    this.dimLabel.className = 'vq-dim';
    this.dimLabel.hidden = true;
    this.wrap.appendChild(this.dimLabel);

    this.highlightsLayer = document.createElement('div');
    this.highlightsLayer.className = 'vq-highlights';
    this.wrap.appendChild(this.highlightsLayer);

    this.highlightChip = document.createElement('div');
    this.highlightChip.className = 'vq-hl-chip';
    this.highlightChip.hidden = true;
    this.wrap.appendChild(this.highlightChip);

    this.rulerLayer = document.createElement('div');
    this.rulerLayer.className = 'vq-ruler';
    this.wrap.appendChild(this.rulerLayer);

    (document.documentElement || document.body).appendChild(this.host);
  }

  setOptions(options: OverlayOptions): void {
    this.options = options;
  }

  destroy(): void {
    this.host.remove();
  }

  private position(el: HTMLElement, rect: Rect): void {
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  showHover(rect: Rect): void {
    this.highlight.hidden = false;
    this.highlight.classList.remove('vq-locked');
    this.position(this.highlight, rect);
    this.boxLayer.hidden = true;
    this.dimLabel.hidden = true;
  }

  /** Show/hide the box-model visualization layer. */
  hideBoxLayer(): void {
    this.boxLayer.hidden = true;
    this.dimLabel.hidden = true;
  }

  /** Public accessor for the measurement labels (controller repaints). */
  clearMeasurements(): void {
    this.clearMeasures();
  }

  showLocked(rect: Rect, boxModel?: BoxModel): void {
    this.highlight.hidden = false;
    this.highlight.classList.add('vq-locked');
    this.position(this.highlight, rect);
    this.boxLayer.hidden = boxModel == null;
    this.dimLabel.hidden = false;
    this.dimLabel.style.left = `${rect.left + rect.width / 2}px`;
    this.dimLabel.style.top = `${rect.bottom + 14}px`;
    this.dimLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    if (boxModel) this.renderBoxModel(rect, boxModel);
  }

  hide(): void {
    this.highlight.hidden = true;
    this.tooltip.hidden = true;
    this.boxLayer.hidden = true;
    this.dimLabel.hidden = true;
    this.clearMeasures();
    // Note: find-instances / similar highlights are intentionally NOT cleared
    // here — they persist across hovers until the controller clears them.
  }

  /** Highlight many elements at once (find instances / similar, Section 7.8). */
  showHighlights(rects: Rect[], label: string): void {
    this.clearHighlights();
    for (const rect of rects) {
      const box = document.createElement('div');
      box.className = 'vq-hl';
      this.position(box, rect);
      this.highlightsLayer.appendChild(box);
      this.highlightBoxes.push(box);
    }
    const first = rects[0];
    if (first) {
      this.highlightChip.textContent = label;
      this.highlightChip.hidden = false;
      this.highlightChip.style.left = `${Math.max(4, first.left)}px`;
      this.highlightChip.style.top = `${Math.max(4, first.top - 22)}px`;
    }
  }

  clearHighlights(): void {
    for (const box of this.highlightBoxes) box.remove();
    this.highlightBoxes.length = 0;
    this.highlightChip.hidden = true;
  }

  hideTooltip(): void {
    this.tooltip.hidden = true;
  }

  // --- Phase 10: measure-mode ruler ---------------------------------------

  /** Remove the ruler (Esc, scroll, or leaving measure mode). */
  clearMeasureLine(): void {
    for (const child of this.rulerChildren) child.remove();
    this.rulerChildren.length = 0;
  }

  /**
   * Draw the click-drag ruler between two viewport points: a dashed bounding
   * rect (diagonal drags), the accent line, end dots, and JetBrains Mono
   * labels (brand system §14.2). All values are set via textContent.
   */
  showMeasureLine(
    a: { x: number; y: number },
    b: { x: number; y: number },
    m: {
      distance: number;
      dx: number;
      dy: number;
      angleRad: number;
      label: string;
      detail?: string;
    },
  ): void {
    this.clearMeasureLine();
    const mk = (className: string): HTMLElement => {
      const el = document.createElement('div');
      el.className = className;
      this.rulerLayer.appendChild(el);
      this.rulerChildren.push(el);
      return el;
    };

    // Diagonal drags get the dashed bounding box — the visual answer to
    // "which two edges am I measuring?"
    if (m.dx > 0.5 && m.dy > 0.5) {
      const rect = mk('vq-ruler-rect');
      const left = Math.min(a.x, b.x);
      const top = Math.min(a.y, b.y);
      rect.style.left = `${left}px`;
      rect.style.top = `${top}px`;
      rect.style.width = `${m.dx}px`;
      rect.style.height = `${m.dy}px`;
    }

    const line = mk('vq-ruler-line');
    line.style.left = `${a.x}px`;
    line.style.top = `${a.y}px`;
    line.style.width = `${Math.max(1, m.distance)}px`;
    line.style.transform = `rotate(${m.angleRad}rad)`;

    for (const point of [a, b]) {
      const dot = mk('vq-ruler-dot');
      dot.style.left = `${point.x}px`;
      dot.style.top = `${point.y}px`;
    }

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    const label = mk('vq-ruler-label');
    label.textContent = m.label;
    const labelW = label.offsetWidth;
    let labelX = midX + 10;
    if (labelX + labelW > window.innerWidth - 4) labelX = midX - labelW - 10;
    labelX = Math.max(4, labelX);
    const labelAbove = midY - 16;
    label.style.left = `${labelX}px`;
    label.style.top = labelAbove > 4 ? `${labelAbove}px` : `${midY + 12}px`;

    if (m.detail) {
      const detail = mk('vq-ruler-detail');
      detail.textContent = m.detail;
      detail.style.left = `${labelX}px`;
      detail.style.top = `${labelAbove > 4 ? labelAbove + 18 : midY + 30}px`;
    }
  }

  /**
   * Show the compact hover tooltip. Content is passed as pre-formatted
   * segments; values are always set via textContent.
   */
  showTooltip(
    rect: Rect,
    lines: { label?: string; value: string; swatch?: string; strong?: boolean }[][],
  ): void {
    this.tooltip.replaceChildren();
    let shown = 0;
    for (const group of lines) {
      if (group.length === 0) continue;
      if (shown > 0) this.tooltip.appendChild(document.createElement('br'));
      for (const part of group) {
        const span = document.createElement('span');
        if (part.swatch) {
          const sw = document.createElement('span');
          sw.className = 'vq-swatch';
          sw.style.background = part.swatch;
          span.appendChild(sw);
        }
        if (part.label) {
          const lab = document.createElement('span');
          lab.style.opacity = '0.65';
          lab.textContent = part.label;
          span.appendChild(lab);
          span.appendChild(document.createTextNode(' '));
        }
        if (part.strong) {
          const b = document.createElement('b');
          b.textContent = part.value;
          span.appendChild(b);
        } else {
          span.appendChild(document.createTextNode(part.value));
        }
        this.tooltip.appendChild(span);
      }
      shown += 1;
    }
    this.tooltip.hidden = false;

    // Position above the rect, flipping below when near the top of the page.
    const width = this.tooltip.offsetWidth;
    const height = this.tooltip.offsetHeight;
    let left = rect.left;
    if (left + width > window.innerWidth - 4) left = window.innerWidth - width - 4;
    left = Math.max(4, left);
    const above = rect.top - height - 6;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = above > 4 ? `${above}px` : `${rect.bottom + 6}px`;
  }

  /** Render Figma/DevTools-style measurement labels along the element edges. */
  showMeasurements(
    rect: Rect,
    items: {
      id: string;
      label: string;
      value: number;
      edge: 'top' | 'right' | 'bottom' | 'left';
      kind: string;
    }[],
  ): void {
    this.clearMeasures();
    for (const item of items) {
      const pill = document.createElement('div');
      pill.className = `vq-measure ${item.kind === 'alignment' ? 'vq-m-align' : item.kind === 'viewport' ? 'vq-m-viewport' : ''}`;
      pill.textContent = `${Math.round(item.value)}px`;
      pill.dataset.id = item.id;
      const half = pill.offsetWidth / 2;
      switch (item.edge) {
        case 'top':
          pill.style.left = `${rect.left + rect.width / 2 - half}px`;
          pill.style.top = `${rect.top - 14}px`;
          break;
        case 'bottom':
          pill.style.left = `${rect.left + rect.width / 2 - half}px`;
          pill.style.top = `${rect.bottom + 6}px`;
          break;
        case 'left':
          pill.style.left = `${Math.max(2, rect.left - pill.offsetWidth - 6)}px`;
          pill.style.top = `${rect.top + rect.height / 2 - 8}px`;
          break;
        case 'right':
          pill.style.left = `${rect.right + 6}px`;
          pill.style.top = `${rect.top + rect.height / 2 - 8}px`;
          break;
      }
      this.wrap.appendChild(pill);
      this.measures.push(pill);
    }
  }

  private clearMeasures(): void {
    for (const m of this.measures) m.remove();
    this.measures.length = 0;
  }

  /** Render (or re-render) the box-model visualization for the locked element. */
  renderBoxModel(rect: Rect, boxModel: BoxModel): void {
    this.boxLayer.hidden = false;
    this.renderBoxModelInner(rect, boxModel);
  }

  private renderBoxModelInner(rect: Rect, boxModel: BoxModel): void {
    this.boxLayer.replaceChildren();
    const { margin, borderWidth, padding } = boxModel;
    const px = (v: string): number => {
      const m = /^(-?[\d.]+)px$/.exec(v);
      if (!m) return 0;
      const n = Number.parseFloat(m[1] ?? '0');
      return Number.isFinite(n) ? n : 0;
    };

    const mk = (cls: string): HTMLElement => {
      const div = document.createElement('div');
      div.className = `vq-box ${cls}`;
      this.boxLayer.appendChild(div);
      return div;
    };

    const mTop = px(margin.top),
      mRight = px(margin.right),
      mBottom = px(margin.bottom),
      mLeft = px(margin.left);
    const bTop = px(borderWidth.top),
      bRight = px(borderWidth.right),
      bBottom = px(borderWidth.bottom),
      bLeft = px(borderWidth.left);
    const pTop = px(padding.top),
      pRight = px(padding.right),
      pBottom = px(padding.bottom),
      pLeft = px(padding.left);

    if (this.options.boxModel?.margin) {
      const marginBox = mk('vq-box-margin');
      this.position(marginBox, {
        ...rect,
        top: rect.top - mTop,
        left: rect.left - mLeft,
        right: rect.right + mRight,
        bottom: rect.bottom + mBottom,
        width: rect.width + mLeft + mRight,
        height: rect.height + mTop + mBottom,
      });
    }
    if (this.options.boxModel?.border) {
      const borderBox = mk('vq-box-border');
      this.position(borderBox, rect);
    }
    if (this.options.boxModel?.padding) {
      const padBox = mk('vq-box-padding');
      this.position(padBox, {
        ...rect,
        top: rect.top + bTop,
        left: rect.left + bLeft,
        right: rect.right - bRight,
        bottom: rect.bottom - bBottom,
        width: rect.width - bLeft - bRight,
        height: rect.height - bTop - bBottom,
      });
    }
    if (this.options.boxModel?.content) {
      const contentBox = mk('vq-box-content');
      this.position(contentBox, {
        ...rect,
        top: rect.top + bTop + pTop,
        left: rect.left + bLeft + pLeft,
        right: rect.right - bRight - pRight,
        bottom: rect.bottom - bBottom - pBottom,
        width: rect.width - bLeft - bRight - pLeft - pRight,
        height: rect.height - bTop - bBottom - pTop - pBottom,
      });
    }
  }
}
