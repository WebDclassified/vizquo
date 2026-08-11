/**
 * Inspector state — selection, analysis result, DOM tree, overlay options,
 * and the presentation switch (Designer "Show CSS" / raw values).
 */
import { createStore } from 'solid-js/store';
import type {
  DomNode,
  ElementInspection,
  ElementRef,
  NavigateDirection,
  OverlayOptions,
} from '../../../../shared/types';

export type InspectTabId =
  | 'overview'
  | 'layout'
  | 'appearance'
  | 'typography'
  | 'advanced'
  | 'source';

export interface NormalizedOverlayOptions {
  measurements: boolean;
  clickThrough: boolean;
  boxModel: { margin: boolean; border: boolean; padding: boolean; content: boolean };
  /** Phase 10: click-drag ruler mode (overrides click-to-lock while on). */
  measureMode: boolean;
}

export const DEFAULT_OVERLAY: NormalizedOverlayOptions = {
  measurements: true,
  clickThrough: false,
  boxModel: { margin: true, border: true, padding: true, content: true },
  measureMode: false,
};

export function toOverlayOptions(overlay: NormalizedOverlayOptions): OverlayOptions {
  return { ...overlay, boxModel: { ...overlay.boxModel } };
}

/** True when both overlay shapes hold identical values (boxModel compared
 * field-by-field — the objects themselves are always fresh literals). Used to
 * make overlay writes idempotent: writing a fresh object every call re-triggers
 * effects that read the overlay, so an unchanged push must not notify. */
export function sameOverlayOptions(
  a: NormalizedOverlayOptions | OverlayOptions,
  b: NormalizedOverlayOptions | OverlayOptions,
): boolean {
  // boxModel is optional on the wire shape (OverlayOptions); missing means
  // "leave unchanged", which compares equal to the current defaults.
  const boxA = a.boxModel ?? DEFAULT_OVERLAY.boxModel;
  const boxB = b.boxModel ?? DEFAULT_OVERLAY.boxModel;
  return (
    a.measurements === b.measurements &&
    a.clickThrough === b.clickThrough &&
    a.measureMode === b.measureMode &&
    boxA.margin === boxB.margin &&
    boxA.border === boxB.border &&
    boxA.padding === boxB.padding &&
    boxA.content === boxB.content
  );
}

interface InspectorState {
  enabled: boolean;
  lockedRef: ElementRef | null;
  hoveredRef: ElementRef | null;
  /** Ref of the element currently being analyzed (may differ from locked). */
  inspection: ElementInspection | null;
  loading: boolean;
  error: string | null;
  domTree: DomNode[] | null;
  domTruncated: boolean;
  domLoading: boolean;
  domError: string | null;
  domFilter: string;
  activeTab: InspectTabId;
  overlay: NormalizedOverlayOptions;
  /** Designer mode: reveal raw CSS values under the plain-language summary. */
  showRawCss: boolean;
}

const [inspector, setInspector] = createStore<InspectorState>({
  enabled: false,
  lockedRef: null,
  hoveredRef: null,
  inspection: null,
  loading: false,
  error: null,
  domTree: null,
  domTruncated: false,
  domLoading: false,
  domError: null,
  domFilter: '',
  activeTab: 'overview',
  overlay: DEFAULT_OVERLAY,
  showRawCss: false,
});

export { inspector as store, setInspector as setStore };

export const setInspectorTab = (tab: InspectTabId) => setInspector('activeTab', tab);
export const setShowRawCss = (show: boolean) => setInspector('showRawCss', show);

/** Refs are compared structurally (fresh objects each publish). */
export function sameRef(
  a: ElementRef | null | undefined,
  b: ElementRef | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.selector === b.selector && a.xpath === b.xpath && a.domPath.join(',') === b.domPath.join(',')
  );
}

export type { NavigateDirection };
