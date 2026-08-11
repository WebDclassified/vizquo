/**
 * Presentation formatting (Section 1 — Designer/Engineer presentation switch).
 * Both modes read the same ElementInspection; these helpers produce the
 * plain-language summaries and the raw CSS views. No page data is ever
 * interpolated into HTML — values render through Solid text nodes.
 */
import type {
  AdvancedInfo,
  AppearanceInfo,
  ElementInspection,
  LayoutInfo,
  TypographyInfo,
} from '../../../../shared/types';

/** Curated friendly labels for the properties the inspector surfaces. */
export const PROPERTY_LABELS: Record<string, string> = {
  // Layout
  display: 'Display',
  position: 'Position',
  width: 'Width',
  height: 'Height',
  'min-width': 'Min width',
  'max-width': 'Max width',
  'min-height': 'Min height',
  'max-height': 'Max height',
  'box-sizing': 'Box sizing',
  'margin-top': 'Margin top',
  'margin-right': 'Margin right',
  'margin-bottom': 'Margin bottom',
  'margin-left': 'Margin left',
  'padding-top': 'Padding top',
  'padding-right': 'Padding right',
  'padding-bottom': 'Padding bottom',
  'padding-left': 'Padding left',
  gap: 'Gap',
  'row-gap': 'Row gap',
  'column-gap': 'Column gap',
  'flex-direction': 'Direction',
  'flex-wrap': 'Wrap',
  'justify-content': 'Main axis alignment',
  'align-items': 'Cross axis alignment',
  'align-content': 'Content alignment',
  'flex-grow': 'Flex grow',
  'flex-shrink': 'Flex shrink',
  'flex-basis': 'Flex basis',
  order: 'Order',
  'grid-template-columns': 'Grid columns',
  'grid-template-rows': 'Grid rows',
  'grid-auto-flow': 'Grid flow',
  overflow: 'Overflow',
  'overflow-x': 'Overflow X',
  'overflow-y': 'Overflow Y',
  'z-index': 'Z-index',
  float: 'Float',
  clear: 'Clear',
  // Appearance
  color: 'Color',
  'background-color': 'Background',
  'background-image': 'Background image',
  'border-top-width': 'Border top',
  'border-top-style': 'Border style',
  'border-top-color': 'Border color',
  'border-radius': 'Radius',
  'box-shadow': 'Shadow',
  opacity: 'Opacity',
  filter: 'Filter',
  'backdrop-filter': 'Backdrop filter',
  'mix-blend-mode': 'Blend mode',
  'clip-path': 'Clip path',
  'mask-image': 'Mask',
  isolation: 'Isolation',
  // Typography
  'font-family': 'Font family',
  'font-size': 'Font size',
  'font-weight': 'Font weight',
  'font-style': 'Font style',
  'line-height': 'Line height',
  'letter-spacing': 'Letter spacing',
  'word-spacing': 'Word spacing',
  'text-transform': 'Text transform',
  'text-decoration': 'Decoration',
  'text-align': 'Text align',
  'white-space': 'White space',
  'text-overflow': 'Text overflow',
  'font-variant-numeric': 'Numeric variant',
  // Advanced
  transform: 'Transform',
  'transform-origin': 'Transform origin',
  transition: 'Transition',
  animation: 'Animation',
  perspective: 'Perspective',
  'backface-visibility': 'Backface visibility',
  contain: 'Contain',
  'content-visibility': 'Content visibility',
  'container-type': 'Container type',
  'container-name': 'Container name',
  'aspect-ratio': 'Aspect ratio',
  'will-change': 'Will change',
  cursor: 'Cursor',
  'user-select': 'User select',
};

export function propertyLabel(name: string): string {
  return PROPERTY_LABELS[name] ?? prettify(name);
}

function prettify(name: string): string {
  return name
    .split('-')
    .map((part) => (part.length > 2 ? (part[0] ?? part).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

const HEX_RE = /^#([0-9a-f]{3,8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/;

/** Convert an rgb()/rgba() string to #hex for swatches (no color science yet). */
export function colorToHex(value: string): string {
  const trimmed = value.trim();
  if (HEX_RE.test(trimmed)) return trimmed;
  const match = RGB_RE.exec(trimmed);
  if (match) {
    const r = Math.round(Number(match[1]));
    const g = Math.round(Number(match[2]));
    const b = Math.round(Number(match[3]));
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  if (trimmed.startsWith('oklch(') || trimmed.startsWith('lab(') || trimmed.startsWith('hsl(')) {
    return trimmed;
  }
  return trimmed;
}

export function isColorValue(value: string): boolean {
  const v = value.trim();
  if (!v || v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'none') return false;
  return (
    HEX_RE.test(v) ||
    RGB_RE.test(v) ||
    v.startsWith('oklch(') ||
    v.startsWith('lab(') ||
    v.startsWith('hsl(')
  );
}

export function isMeaningful(value: string | undefined | null): boolean {
  if (!value) return false;
  const v = value.trim();
  return v !== '' && v !== 'none' && v !== '0px' && v !== 'auto' && v !== 'normal' && v !== '0';
}

// ---------------------------------------------------------------------------
// Designer-mode summaries
// ---------------------------------------------------------------------------

function flexSummary(layout: LayoutInfo): string | null {
  if (layout.display !== 'flex' && layout.display !== 'inline-flex') return null;
  const direction =
    layout.flexDirection === 'row'
      ? 'horizontal'
      : layout.flexDirection === 'column'
        ? 'vertical'
        : layout.flexDirection;
  const align = layout.justifyContent !== 'normal' ? layout.justifyContent : null;
  const parts = ['Flex', direction];
  if (align) parts.push(align);
  if (layout.gap && layout.gap !== 'normal') parts.push(`gap ${layout.gap}`);
  return parts.join(', ');
}

function gridSummary(layout: LayoutInfo): string | null {
  if (!layout.display.startsWith('grid')) return null;
  const parts: string[] = ['Grid'];
  if (layout.gridTemplateColumns && !layout.gridTemplateColumns.startsWith('none')) {
    parts.push(`${layout.gridTemplateColumns} columns`);
  }
  if (layout.gap && layout.gap !== 'normal') parts.push(`gap ${layout.gap}`);
  return parts.join(', ');
}

export function layoutSummary(inspection: ElementInspection): string | null {
  const { layout } = inspection;
  return flexSummary(layout) ?? gridSummary(layout) ?? null;
}

export function typographySummary(inspection: ElementInspection): string | null {
  const { typography } = inspection;
  if (!isMeaningful(typography.fontFamily) && !isMeaningful(typography.fontSize)) return null;
  const parts: string[] = [];
  const family = (typography.fontFamily.split(',')[0] ?? '').trim();
  if (family) parts.push(family);
  if (isMeaningful(typography.fontSize)) parts.push(typography.fontSize);
  if (isMeaningful(typography.fontWeight) && typography.fontWeight !== '400') {
    parts.push(`weight ${typography.fontWeight}`);
  }
  if (isMeaningful(typography.lineHeight) && typography.lineHeight !== 'normal') {
    parts.push(`line-height ${typography.lineHeight}`);
  }
  return parts.join(', ');
}

export function boxModelSummary(inspection: ElementInspection): string | null {
  const { boxModel } = inspection;
  const parts: string[] = [];
  if (isMeaningful(boxModel.padding.top)) parts.push(`padding ${boxModel.padding.top}`);
  if (isMeaningful(boxModel.margin.top)) parts.push(`margin ${boxModel.margin.top}`);
  if (isMeaningful(inspection.appearance.borderRadius)) {
    parts.push(`radius ${inspection.appearance.borderRadius}`);
  }
  if (isMeaningful(inspection.appearance.boxShadow)) parts.push('shadow');
  return parts.length > 0 ? parts.join(', ') : null;
}

// ---------------------------------------------------------------------------
// Raw CSS generation (Designer "Show CSS" + copy actions)
// ---------------------------------------------------------------------------

export type PropertyGroup = 'layout' | 'appearance' | 'typography' | 'advanced';

export const GROUP_PROPERTIES: Record<PropertyGroup, string[]> = {
  layout: [
    'display',
    'position',
    'width',
    'height',
    'min-width',
    'max-width',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'gap',
    'flex-direction',
    'flex-wrap',
    'justify-content',
    'align-items',
    'align-content',
    'flex-grow',
    'flex-shrink',
    'flex-basis',
    'order',
    'grid-template-columns',
    'grid-template-rows',
    'overflow-x',
    'overflow-y',
    'z-index',
  ],
  appearance: [
    'color',
    'background-color',
    'background-image',
    'border-radius',
    'border-top-width',
    'border-top-style',
    'border-top-color',
    'box-shadow',
    'opacity',
    'filter',
    'backdrop-filter',
    'mix-blend-mode',
    'clip-path',
    'mask-image',
  ],
  typography: [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'text-transform',
    'text-decoration',
    'text-align',
    'white-space',
    'text-overflow',
  ],
  advanced: [
    'transform',
    'transform-origin',
    'transition',
    'animation',
    'perspective',
    'backface-visibility',
    'contain',
    'content-visibility',
    'container-type',
    'container-name',
    'aspect-ratio',
    'will-change',
    'cursor',
    'user-select',
  ],
};

function infoOf(inspection: ElementInspection, group: PropertyGroup): Record<string, string> {
  switch (group) {
    case 'layout':
      return inspection.layout as unknown as Record<string, string>;
    case 'appearance':
      return inspection.appearance as unknown as Record<string, string>;
    case 'typography':
      return inspection.typography as unknown as Record<string, string>;
    case 'advanced':
      return inspection.advanced as unknown as Record<string, string>;
  }
}

/** CSS declaration block from the *computed* values of a property group. */
export function cssBlockFor(
  inspection: ElementInspection,
  group: PropertyGroup,
  indent = '  ',
): string {
  const info = infoOf(inspection, group);
  const lines: string[] = [];
  for (const name of GROUP_PROPERTIES[group]) {
    const value = (info[name] ?? '').trim();
    if (isMeaningful(value)) lines.push(`${indent}${name}: ${value};`);
  }
  return lines.join('\n');
}

/** Full element rule: selector + grouped computed declarations. */
export function fullCssFor(inspection: ElementInspection): string {
  const groups: PropertyGroup[] = ['layout', 'appearance', 'typography', 'advanced'];
  const block = groups
    .map((g) => cssBlockFor(inspection, g))
    .filter(Boolean)
    .join('\n');
  return `${inspection.html.selector} {\n${block}\n}`;
}

/** Trace helper: find a property's trace in the inspection. */
export function traceOf(inspection: ElementInspection, property: string) {
  return inspection.traces.find((t) => t.property === property);
}

export type { AdvancedInfo, AppearanceInfo, LayoutInfo, TypographyInfo };
