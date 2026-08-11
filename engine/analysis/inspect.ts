/**
 * Element inspection assembly (Sections 7.4/7.5) — one pass over the L1
 * caches turns a live element into the full ElementInspection the inspector
 * renders. No direct getComputedStyle calls here: everything goes through
 * the style cache so the "once per node per pass" rule holds by construction.
 */
import type {
  AdvancedInfo,
  AppearanceInfo,
  BoxModel,
  ElementInspection,
  ElementInspectionResult,
  ElementRef,
  LayoutInfo,
  Rect,
  Sides,
  TypographyInfo,
} from '../../shared/types';
import { computeCascade } from '../css/cascade';
import { styleCache } from '../css/style-cache';
import { extractElementHtml } from '../dom/html';
import { makeRef, resolveRef } from '../dom/ref';

const MAX_TRACE_PROPS = 80;

/** Read the four side values of a longhand family (e.g. margin-*). */
function readSides(style: CSSStyleDeclaration, prefix: string): Sides {
  return {
    top: style.getPropertyValue(`${prefix}-top`),
    right: style.getPropertyValue(`${prefix}-right`),
    bottom: style.getPropertyValue(`${prefix}-bottom`),
    left: style.getPropertyValue(`${prefix}-left`),
  };
}

function px(value: string): number {
  const match = /^(-?[\d.]+)px$/.exec(value);
  if (!match) return 0;
  const n = Number.parseFloat(match[1] ?? '0');
  return Number.isFinite(n) ? n : 0;
}

function computeBoxModel(rect: Rect, style: CSSStyleDeclaration): BoxModel {
  const margin = readSides(style, 'margin');
  const padding = readSides(style, 'padding');
  const borderWidth = readSides(style, 'border-width');
  const borderStyle = readSides(style, 'border-style');
  const borderColor = readSides(style, 'border-color');

  const left = px(borderWidth.left) + px(padding.left);
  const top = px(borderWidth.top) + px(padding.top);
  const right = px(borderWidth.right) + px(padding.right);
  const bottom = px(borderWidth.bottom) + px(padding.bottom);

  return {
    margin,
    padding,
    borderWidth,
    borderStyle,
    borderColor,
    contentRect: {
      x: rect.x + left,
      y: rect.y + top,
      width: Math.max(0, rect.width - left - right),
      height: Math.max(0, rect.height - top - bottom),
      top: rect.top + top,
      left: rect.left + left,
      right: rect.right - right,
      bottom: rect.bottom - bottom,
    },
  };
}

export async function inspectElement(el: Element): Promise<ElementInspection> {
  const cache = styleCache;
  const style = cache.computedFor(el);
  const rect = el.getBoundingClientRect();
  const ref: ElementRef = makeRef(el);

  const layout: LayoutInfo = {
    display: style.display,
    position: style.position,
    width: style.width,
    height: style.height,
    minWidth: style.minWidth,
    maxWidth: style.maxWidth,
    minHeight: style.minHeight,
    maxHeight: style.maxHeight,
    boxSizing: style.boxSizing,
    margin: readSides(style, 'margin'),
    padding: readSides(style, 'padding'),
    gap: style.gap,
    rowGap: style.rowGap,
    columnGap: style.columnGap,
    flexDirection: style.flexDirection,
    flexWrap: style.flexWrap,
    justifyContent: style.justifyContent,
    alignItems: style.alignItems,
    alignContent: style.alignContent,
    flexBasis: style.flexBasis,
    flexGrow: style.flexGrow,
    flexShrink: style.flexShrink,
    order: style.order,
    gridTemplateColumns: style.gridTemplateColumns,
    gridTemplateRows: style.gridTemplateRows,
    gridTemplateAreas: style.gridTemplateAreas,
    gridAutoFlow: style.gridAutoFlow,
    justifyItems: style.justifyItems,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    zIndex: style.zIndex,
    float: style.float,
    clear: style.clear,
  };

  const appearance: AppearanceInfo = {
    color: style.color,
    backgroundColor: style.backgroundColor,
    borderWidth: style.borderTopWidth,
    borderStyle: style.borderTopStyle,
    borderColor: style.borderTopColor,
    borderRadius: style.borderRadius,
    boxShadow: style.boxShadow,
    opacity: style.opacity,
    filter: style.filter,
    backdropFilter: style.backdropFilter,
    mixBlendMode: style.mixBlendMode,
    clipPath: style.clipPath,
    maskImage: style.maskImage,
    isolation: style.isolation,
  };

  const typography: TypographyInfo = {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    wordSpacing: style.wordSpacing,
    textTransform: style.textTransform,
    textDecoration: style.textDecorationLine,
    textAlign: style.textAlign,
    whiteSpace: style.whiteSpace,
    textOverflow: style.textOverflow,
    fontVariantNumeric: style.fontVariantNumeric,
  };

  const advanced: AdvancedInfo = {
    transform: style.transform,
    transformOrigin: style.transformOrigin,
    transition: style.transition,
    animation: style.animationName === 'none' ? style.animation : style.animation,
    perspective: style.perspective,
    backfaceVisibility: style.backfaceVisibility,
    contain: style.contain,
    contentVisibility: style.contentVisibility,
    containerType: style.containerType,
    containerName: style.containerName,
    aspectRatio: style.aspectRatio,
    willChange: style.willChange,
    cursor: style.cursor,
    userSelect: style.userSelect,
  };

  const boxModel = computeBoxModel(rect, style);
  const html = extractElementHtml(el, ref);

  const cascade = await computeCascade(el, cache, { ref });

  return {
    ref,
    tagName: el.tagName.toLowerCase(),
    visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0,
    rect: rectToModel(rect),
    text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
    layout,
    appearance,
    typography,
    advanced,
    boxModel,
    html,
    traces: cascade.traces.slice(0, MAX_TRACE_PROPS),
    variables: cascade.variables,
    variablesTruncated: cascade.variablesTruncated,
    inherited: cascade.inherited,
    matchedRules: cascade.matchedRules,
    matchedRulesTruncated: cascade.matchedRulesTruncated,
    blockedStylesheets: cascade.blockedStylesheets,
    declarationCount: cascade.declarationCount,
  } satisfies ElementInspection;
}

/** Rect in the shared model's shape (rect is Rect; model wants Rect). */
function rectToModel(rect: DOMRect): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
  };
}

/** Resolve a ref and inspect it, returning the wire-shaped result. */
export async function inspectRef(ref: ElementRef): Promise<ElementInspectionResult> {
  const el = resolveRef(ref);
  if (!el) {
    return {
      ok: false,
      error: 'Could not find this element anymore. It may have been removed from the page.',
    };
  }
  try {
    return { ok: true, inspection: await inspectElement(el) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not inspect this element.',
    };
  }
}
