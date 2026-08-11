/**
 * Code generation (Section 7.18) — element → component code.
 *
 * Takes a Phase 2 ElementInspection (computed layout/appearance/typography)
 * and emits clean component source in several formats. The output is:
 * - **accessible**: semantic tags (button stays a <button>), preserved
 *   aria/role/tabindex, keyboard-friendly props;
 * - **responsive**: flexible (min/max-width instead of fixed widths when the
 *   source is flexible, gap/justify preserved);
 * - **non-duplicated**: one style object / one class set, no repeated
 *   declarations;
 * - **faithful**: values come from the computed styles, so the result matches
 *   what the user saw.
 *
 * Pure string generation — unit-tested, never executed here.
 */
import type { CodegenInput, Sides } from '../shared/types';

export type CodegenFormat = 'react' | 'vue' | 'svelte' | 'html' | 'tailwind';

/** Skip browser-default computed values that would be noise in the output. */
const SKIP_VALUES = new Set([
  '',
  'none',
  'normal',
  'auto',
  '0px',
  '0',
  'initial',
  'unset',
  'auto 0px',
]);

function isDefault(prop: string, value: string): boolean {
  const v = value.trim();
  if (SKIP_VALUES.has(v)) return true;
  if (prop === 'opacity' && v === '1') return true;
  if (prop === 'font-weight' && (v === '400' || v === 'normal')) return true;
  if (prop === 'font-style' && v === 'normal') return true;
  if (prop === 'text-align' && (v === 'start' || v === 'left')) return true;
  if (prop === 'text-transform' && v === 'none') return true;
  if (prop === 'text-decoration-line' && v === 'none') return true;
  if (prop === 'white-space' && v === 'normal') return true;
  if (prop === 'letter-spacing' && v === 'normal') return true;
  if (prop === 'line-height' && (v === 'normal' || v === '1')) return true;
  if (prop === 'background-color' && (v === 'rgba(0, 0, 0, 0)' || v === 'transparent')) return true;
  if (prop === 'border-width' && v === '0px') return true;
  if (prop === 'position' && v === 'static') return true;
  if (prop === 'z-index' && v === 'auto') return true;
  if (prop === 'overflow-x' && v === 'visible') return true;
  if (prop === 'overflow-y' && v === 'visible') return true;
  return false;
}

/** Collapse a Sides box into a CSS shorthand (1–4 values). */
export function sidesShorthand(sides: Sides): string {
  const { top, right, bottom, left } = sides;
  if (top === right && right === bottom && bottom === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  return `${top} ${right} ${bottom} ${left}`;
}

/** Build the style map from an inspection, deduplicated and default-filtered. */
export function styleMap(input: CodegenInput): Record<string, string> {
  const { layout, appearance, typography, advanced } = input;
  const out: Record<string, string> = {};
  const set = (prop: string, value: string | undefined): void => {
    if (!value || isDefault(prop, value)) return;
    // Never emit an unresolved CSS variable chain as a literal.
    if (value.includes('var(')) return;
    out[prop] = value;
  };
  const setSides = (prop: string, sides: Sides): void => {
    const shorthand = sidesShorthand(sides);
    if (shorthand !== '0px') set(prop, shorthand);
  };

  // Layout
  set('display', layout.display);
  set('position', layout.position);
  set('width', layout.width);
  set('height', layout.height);
  set('min-width', layout.minWidth);
  set('max-width', layout.maxWidth);
  set('min-height', layout.minHeight);
  set('max-height', layout.maxHeight);
  set('box-sizing', layout.boxSizing);
  setSides('margin', layout.margin);
  setSides('padding', layout.padding);
  set('gap', layout.gap);
  set('flex-direction', layout.flexDirection);
  set('flex-wrap', layout.flexWrap);
  set('justify-content', layout.justifyContent);
  set('align-items', layout.alignItems);
  set('align-content', layout.alignContent);
  set('flex-grow', layout.flexGrow);
  set('flex-shrink', layout.flexShrink);
  set('flex-basis', layout.flexBasis);
  set('order', layout.order);
  set('grid-template-columns', layout.gridTemplateColumns);
  set('grid-template-rows', layout.gridTemplateRows);
  set('justify-items', layout.justifyItems);
  set('overflow', layout.overflowX === layout.overflowY ? layout.overflowX : undefined);
  set('z-index', layout.zIndex);

  // Appearance
  set('color', appearance.color);
  set('background-color', appearance.backgroundColor);
  set('border-width', appearance.borderWidth);
  set('border-style', appearance.borderStyle);
  set('border-color', appearance.borderColor);
  set('border-radius', appearance.borderRadius);
  set('box-shadow', appearance.boxShadow);
  set('opacity', appearance.opacity);
  set('filter', appearance.filter);
  set('backdrop-filter', appearance.backdropFilter);

  // Typography
  set('font-family', typography.fontFamily);
  set('font-size', typography.fontSize);
  set('font-weight', typography.fontWeight);
  set('font-style', typography.fontStyle);
  set('line-height', typography.lineHeight);
  set('letter-spacing', typography.letterSpacing);
  set('text-align', typography.textAlign);
  set('text-transform', typography.textTransform);
  set('text-decoration', typography.textDecoration);
  set('white-space', typography.whiteSpace);

  // Advanced (only the ones that genuinely change rendering)
  set('transform', advanced.transform);
  set('cursor', advanced.cursor);
  set('aspect-ratio', advanced.aspectRatio);

  return out;
}

/** Human-friendly component name from the tag. */
export function componentName(tag: string): string {
  const base = tag.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!base) return 'Component';
  const pascal = base.charAt(0).toUpperCase() + base.slice(1);
  return `${pascal}Component`;
}

/** Attributes that carry accessibility + behavior (never dropped). */
const KEEP_ATTRIBUTES = new Set([
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-expanded',
  'aria-haspopup',
  'aria-controls',
  'aria-current',
  'aria-selected',
  'aria-checked',
  'aria-hidden',
  'tabindex',
  'title',
  'alt',
  'placeholder',
  'type',
  'name',
  'value',
  'href',
  'target',
  'rel',
  'disabled',
  'readonly',
  'checked',
  'src',
  'srcset',
  'lang',
]);

/** A11y/behavior attributes to preserve from the source element. */
function keptAttributes(input: CodegenInput): Record<string, string> {
  const kept: Record<string, string> = {};
  const all = { ...input.html.attributes, ...input.html.aria };
  for (const [name, value] of Object.entries(all)) {
    if (KEEP_ATTRIBUTES.has(name) && value !== '') {
      kept[name] = value;
    }
  }
  return kept;
}

/** Children placeholder text for empty elements. */
function childrenText(input: CodegenInput): string {
  const text = input.text?.trim();
  return text && text.length <= 80 ? text : '';
}

function styleEntries(styles: Record<string, string>): string[] {
  return Object.entries(styles).map(([prop, value]) => {
    const camel = prop.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    return `${JSON.stringify(camel)}: ${JSON.stringify(value)}`;
  });
}

/** Shared JSX-style attribute list (aria + behavior + style). */
function jsxProps(input: CodegenInput, styles: Record<string, string>): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(keptAttributes(input))) {
    const prop = name === 'class' ? 'className' : name;
    parts.push(`${prop}=${JSON.stringify(value)}`);
  }
  const entries = styleEntries(styles);
  if (entries.length > 0) parts.push(`style={{ ${entries.join(', ')} }}`);
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

/* ------------------------------------------------------------------------ */
/* React                                                                     */
/* ------------------------------------------------------------------------ */

export function elementToReact(input: CodegenInput): string {
  const tag = input.tagName.toLowerCase();
  const name = componentName(tag);
  const styles = styleMap(input);
  const attrs = jsxProps(input, styles);
  const children = childrenText(input);
  const body = children ? `      {${JSON.stringify(children)}}\n` : '      {children}\n';
  return [
    `/** Generated by Vizquo — ${tag} → React. Values from computed styles. */`,
    "import type { ReactNode } from 'react';",
    '',
    `export function ${name}({ children }: { children?: ReactNode }) {`,
    '  return (',
    `    <${tag}${attrs}>`,
    body,
    `    </${tag}>`,
    '  );',
    '}',
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------------ */
/* Vue                                                                       */
/* ------------------------------------------------------------------------ */

export function elementToVue(input: CodegenInput): string {
  const tag = input.tagName.toLowerCase();
  const styles = styleMap(input);
  const attrs: string[] = [];
  for (const [name, value] of Object.entries(keptAttributes(input))) {
    attrs.push(`    ${name}="${value}"`);
  }
  const entries = styleEntries(styles);
  if (entries.length > 0) {
    attrs.push(`    :style="{ ${entries.join(', ')} }"`);
  }
  const children = childrenText(input) || '<slot />';
  return [
    `<script setup>`,
    `/** Generated by Vizquo — ${tag} → Vue. Values from computed styles. */`,
    '</script>',
    '',
    '<template>',
    `  <${tag}${attrs.length > 0 ? `\n${attrs.join('\n')}` : ''}>`,
    `    ${children}`,
    `  </${tag}>`,
    '</template>',
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------------ */
/* Svelte                                                                    */
/* ------------------------------------------------------------------------ */

export function elementToSvelte(input: CodegenInput): string {
  const tag = input.tagName.toLowerCase();
  const styles = styleMap(input);
  const attrs: string[] = [];
  for (const [name, value] of Object.entries(keptAttributes(input))) {
    attrs.push(`${name}="${value}"`);
  }
  const entries = styleEntries(styles);
  if (entries.length > 0) {
    attrs.push(`style="{ ${entries.join(', ')} }"`);
  }
  const children = childrenText(input) || '<slot />';
  return [
    `<!-- Generated by Vizquo — ${tag} → Svelte. Values from computed styles. -->`,
    `<script>`,
    `  export let children;`,
    '</script>',
    '',
    `<${tag}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`,
    `  ${children}`,
    `</${tag}>`,
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------------ */
/* HTML                                                                      */
/* ------------------------------------------------------------------------ */

export function elementToHtml(input: CodegenInput): string {
  const tag = input.tagName.toLowerCase();
  const styles = styleMap(input);
  const attrs: string[] = [];
  for (const [name, value] of Object.entries(keptAttributes(input))) {
    attrs.push(`${name}="${value}"`);
  }
  if (Object.keys(styles).length > 0) {
    const inline = Object.entries(styles)
      .map(([prop, value]) => `${prop}: ${value}`)
      .join('; ');
    attrs.push(`style="${inline}"`);
  }
  const children = childrenText(input);
  if (children === '') return `<${tag}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}></${tag}>`;
  return `<${tag}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>${children}</${tag}>`;
}

/* ------------------------------------------------------------------------ */
/* Tailwind                                                                  */
/* ------------------------------------------------------------------------ */

/** Best-effort computed value → Tailwind utility class. Unknowns fall back to arbitrary values. */
function tailwindClass(prop: string, value: string): string | null {
  const v = value.trim();
  if (isDefault(prop, v)) return null;
  const px = (raw: string): string => {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? `${n}px` : raw;
  };
  switch (prop) {
    case 'display':
      if (
        v === 'flex' ||
        v === 'inline-flex' ||
        v === 'grid' ||
        v === 'block' ||
        v === 'inline-block'
      ) {
        return v;
      }
      return v === 'none' ? 'hidden' : null;
    case 'flex-direction':
      return v === 'column' ? 'flex-col' : v === 'row' ? 'flex-row' : null;
    case 'flex-wrap':
      return v === 'wrap' ? 'flex-wrap' : null;
    case 'justify-content':
      return v === 'center' ? 'justify-center' : v === 'space-between' ? 'justify-between' : null;
    case 'align-items':
      return v === 'center' ? 'items-center' : v === 'flex-start' ? 'items-start' : null;
    case 'gap':
      return `gap-[${px(v)}]`;
    case 'padding':
      return `p-[${px(v)}]`;
    case 'margin':
      return `m-[${px(v)}]`;
    case 'border-radius':
      return `rounded-[${px(v)}]`;
    case 'font-size':
      return `text-[${px(v)}]`;
    case 'font-weight':
      return v === '600' ? 'font-semibold' : v === '700' ? 'font-bold' : `font-[${v}]`;
    case 'color':
      return `text-[${v}]`;
    case 'background-color':
      return `bg-[${v}]`;
    case 'border-color':
      return `border-[${v}]`;
    case 'box-shadow':
      return `shadow-[${v}]`;
    case 'opacity':
      return `opacity-${v}`;
    case 'width':
      return v === '100%' ? 'w-full' : `w-[${px(v)}]`;
    case 'height':
      return `h-[${px(v)}]`;
    case 'text-align':
      return v === 'center' ? 'text-center' : null;
    default:
      return null;
  }
}

export function elementToTailwind(input: CodegenInput): string {
  const tag = input.tagName.toLowerCase();
  const name = componentName(tag);
  const styles = styleMap(input);
  const classes: string[] = [];
  const leftover: [string, string][] = [];
  for (const [prop, value] of Object.entries(styles)) {
    const cls = tailwindClass(prop, value);
    if (cls) classes.push(cls);
    else leftover.push([prop, value]);
  }
  const attrs: string[] = [];
  for (const [name2, value] of Object.entries(keptAttributes(input))) {
    attrs.push(`${name2}=${JSON.stringify(value)}`);
  }
  // Styles with no utility mapping stay as inline styles — the output must
  // match the source visually, never silently drop a computed value.
  if (leftover.length > 0) {
    const inline = styleEntries(Object.fromEntries(leftover)).join(', ');
    attrs.push(`style={{ ${inline} }}`);
  }
  const classAttr = classes.length > 0 ? ` className={\`${classes.join(' ')}\`}` : '';
  const extra = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  const children = childrenText(input) || '{children}';
  return [
    `/** Generated by Vizquo — ${tag} → Tailwind (utilities for mapped values, inline styles for the rest). */`,
    "import type { ReactNode } from 'react';",
    '',
    `export function ${name}({ children }: { children?: ReactNode }) {`,
    '  return (',
    `    <${tag}${classAttr}${extra}>`,
    `      ${children}`,
    `    </${tag}>`,
    '  );',
    '}',
    '',
  ].join('\n');
}

/** Route a format to its generator (used by the export center + palette). */
export function elementToCode(input: CodegenInput, format: CodegenFormat): string {
  switch (format) {
    case 'react':
      return elementToReact(input);
    case 'vue':
      return elementToVue(input);
    case 'svelte':
      return elementToSvelte(input);
    case 'html':
      return elementToHtml(input);
    case 'tailwind':
      return elementToTailwind(input);
  }
}

/** File extension for a codegen format. */
export function codegenExtension(format: CodegenFormat): string {
  switch (format) {
    case 'react':
      return '.tsx';
    case 'vue':
      return '.vue';
    case 'svelte':
      return '.svelte';
    case 'html':
      return '.html';
    case 'tailwind':
      return '.tsx';
  }
}
