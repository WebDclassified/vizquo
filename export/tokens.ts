/**
 * Token export (Section 7.19) — pure serializers for the design token sets a
 * scan produces (colors, fonts, spacing, radius, shadows, CSS variables).
 *
 * Every serializer is a pure function of an `Inspection`-shaped token bundle
 * so it can be unit-tested without a browser and reused by the export center
 * (Section 7.24) for token/page scopes. Output is deterministic: same input,
 * same bytes.
 */
import type { Inspection, InspectionTokens } from '../shared/types';

/** Kebab-case helper for token names (colors → `color-primary`, …). */
function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function colorName(token: { value: { role?: string; hex: string } }, index: number): string {
  const role = token.value.role;
  if (role && role !== 'unknown') return kebab(role);
  return `color-${index + 1}`;
}

/** Sanitize a value for use in a CSS/SCSS declaration. */
function cssValue(raw: string | number): string {
  if (typeof raw === 'number') return String(raw);
  return raw.trim().replace(/;/g, '');
}

function px(value: number): string {
  return `${value}px`;
}

/* ------------------------------------------------------------------------ */
/* CSS custom properties                                                     */
/* ------------------------------------------------------------------------ */

export function tokensToCss(tokens: InspectionTokens): string {
  const lines: string[] = [];
  for (const [index, color] of tokens.colors.entries()) {
    lines.push(`  --${colorName(color, index)}: ${cssValue(color.value.hex)};`);
  }
  for (const [index, spacing] of tokens.spacing.entries()) {
    lines.push(`  --space-${index + 1}: ${px(spacing.value)};`);
  }
  for (const [index, radius] of tokens.radius.entries()) {
    lines.push(`  --radius-${index + 1}: ${px(radius.value)};`);
  }
  for (const [index, shadow] of tokens.shadows.entries()) {
    lines.push(`  --shadow-${index + 1}: ${cssValue(shadow.value)};`);
  }
  const families = [...new Set(tokens.fonts.map((f) => f.value.family))];
  for (const [index, family] of families.entries()) {
    lines.push(`  --font-family-${index + 1}: ${family};`);
  }
  if (lines.length === 0) return ':root {\n  /* No tokens extracted from this page yet. */\n}';
  return `:root {\n${lines.join('\n')}\n}`;
}

/* ------------------------------------------------------------------------ */
/* SCSS variables                                                            */
/* ------------------------------------------------------------------------ */

export function tokensToScss(tokens: InspectionTokens): string {
  const lines: string[] = [];
  for (const [index, color] of tokens.colors.entries()) {
    lines.push(`$color-${colorName(color, index)}: ${cssValue(color.value.hex)};`);
  }
  for (const [index, spacing] of tokens.spacing.entries()) {
    lines.push(`$space-${index + 1}: ${px(spacing.value)};`);
  }
  for (const [index, radius] of tokens.radius.entries()) {
    lines.push(`$radius-${index + 1}: ${px(radius.value)};`);
  }
  for (const [index, shadow] of tokens.shadows.entries()) {
    lines.push(`$shadow-${index + 1}: ${cssValue(shadow.value)};`);
  }
  const families = [...new Set(tokens.fonts.map((f) => f.value.family))];
  for (const [index, family] of families.entries()) {
    lines.push(`$font-family-${index + 1}: ${family};`);
  }
  if (lines.length === 0) return '// No tokens extracted from this page yet.';
  return lines.join('\n');
}

/* ------------------------------------------------------------------------ */
/* Tailwind config extension                                                 */
/* ------------------------------------------------------------------------ */

/** Render one theme block as `key: { 'name': 'value', … },` lines. */
function tailwindBlock(key: string, entries: [string, string][]): string[] {
  if (entries.length === 0) return [];
  const inner = entries.map(([name, value]) => `      '${name}': '${value}',`);
  return [`    ${key}: {`, ...inner, '    },'];
}

export function tokensToTailwind(tokens: InspectionTokens): string {
  const colors: [string, string][] = tokens.colors.map((c, index) => [
    colorName(c, index),
    cssValue(c.value.hex),
  ]);
  const spacing: [string, string][] = tokens.spacing.map((s, index) => [
    String(index + 1),
    px(s.value),
  ]);
  const radius: [string, string][] = tokens.radius.map((r, index) => [
    String(index + 1),
    px(r.value),
  ]);
  const shadows: [string, string][] = tokens.shadows.map((s, index) => [
    String(index + 1),
    cssValue(s.value),
  ]);
  const families = [...new Set(tokens.fonts.map((f) => f.value.family))];
  // One `sans` entry with every family joined — duplicate keys would silently
  // collapse in the generated config.
  const fontFamily: [string, string][] = families.length > 0 ? [['sans', families.join(', ')]] : [];

  const blocks = [
    tailwindBlock('colors', colors),
    tailwindBlock('spacing', spacing),
    tailwindBlock('borderRadius', radius),
    tailwindBlock('boxShadow', shadows),
    tailwindBlock('fontFamily', fontFamily),
  ].flat();

  if (blocks.length === 0) {
    return [
      "/** @type {import('tailwindcss').Config} */",
      'module.exports = {',
      '  theme: {',
      '    extend: {}',
      '  },',
      '};',
      '',
    ].join('\n');
  }
  return [
    "/** @type {import('tailwindcss').Config} */",
    'module.exports = {',
    '  theme: {',
    '    extend: {',
    ...blocks,
    '    },',
    '  },',
    '};',
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------------ */
/* JSON                                                                      */
/* ------------------------------------------------------------------------ */

export function tokensToJson(tokens: InspectionTokens): string {
  return JSON.stringify(
    {
      colors: tokens.colors.map((c, index) => ({
        name: colorName(c, index),
        hex: c.value.hex,
        oklch: c.value.oklch,
        role: c.value.role,
        usageCount: c.usageCount,
      })),
      spacing: tokens.spacing.map((s, index) => ({
        name: `space-${index + 1}`,
        value: s.value,
        usageCount: s.usageCount,
      })),
      radius: tokens.radius.map((r, index) => ({
        name: `radius-${index + 1}`,
        value: r.value,
        usageCount: r.usageCount,
      })),
      shadows: tokens.shadows.map((s, index) => ({
        name: `shadow-${index + 1}`,
        value: s.value,
        usageCount: s.usageCount,
      })),
      fonts: [...new Set(tokens.fonts.map((f) => f.value.family))].map((family, index) => ({
        name: `font-family-${index + 1}`,
        family,
      })),
    },
    null,
    2,
  );
}

/* ------------------------------------------------------------------------ */
/* TypeScript module                                                         */
/* ------------------------------------------------------------------------ */

export function tokensToTs(tokens: InspectionTokens): string {
  const lines: string[] = ['/** Vizquo design tokens — generated, deterministic. */', ''];
  const colors: string[] = [];
  for (const [index, c] of tokens.colors.entries()) {
    colors.push(`  '${colorName(c, index)}': '${cssValue(c.value.hex)}',`);
  }
  if (colors.length > 0)
    lines.push(`export const colors = {\n${colors.join('\n')}\n} as const;`, '');
  const spacing: string[] = [];
  for (const [index, s] of tokens.spacing.entries()) {
    spacing.push(`  '${index + 1}': '${px(s.value)}',`);
  }
  if (spacing.length > 0)
    lines.push(`export const spacing = {\n${spacing.join('\n')}\n} as const;`, '');
  const radius: string[] = [];
  for (const [index, r] of tokens.radius.entries()) {
    radius.push(`  '${index + 1}': '${px(r.value)}',`);
  }
  if (radius.length > 0)
    lines.push(`export const radius = {\n${radius.join('\n')}\n} as const;`, '');
  const shadows: string[] = [];
  for (const [index, s] of tokens.shadows.entries()) {
    shadows.push(`  '${index + 1}': '${cssValue(s.value)}',`);
  }
  if (shadows.length > 0)
    lines.push(`export const shadows = {\n${shadows.join('\n')}\n} as const;`, '');
  const families = [...new Set(tokens.fonts.map((f) => f.value.family))];
  if (families.length > 0) {
    lines.push(
      `export const fontFamily = {\n  sans: [${families.map((f) => `'${f}'`).join(', ')}],\n} as const;`,
      '',
    );
  }
  if (lines.length <= 2) return 'export {};\n';
  return lines.join('\n');
}

/* ------------------------------------------------------------------------ */
/* Figma Tokens (Tokens Studio plugin format)                                */
/* ------------------------------------------------------------------------ */

/**
 * Figma Tokens / Tokens Studio format: one `global` set of `{ value, type }`
 * entries. Drop-in importable via the Figma Tokens plugin, which then lets
 * designers drive the design system in Figma from the extracted page tokens.
 */
export function tokensToFigmaTokens(tokens: InspectionTokens): string {
  const global: Record<string, { value: string; type: string }> = {};
  for (const [index, color] of tokens.colors.entries()) {
    global[colorName(color, index)] = { value: cssValue(color.value.hex), type: 'color' };
  }
  for (const [index, spacing] of tokens.spacing.entries()) {
    global[`space-${index + 1}`] = { value: px(spacing.value), type: 'spacing' };
  }
  for (const [index, radius] of tokens.radius.entries()) {
    global[`radius-${index + 1}`] = { value: px(radius.value), type: 'borderRadius' };
  }
  for (const [index, shadow] of tokens.shadows.entries()) {
    global[`shadow-${index + 1}`] = { value: cssValue(shadow.value), type: 'boxShadow' };
  }
  const families = [...new Set(tokens.fonts.map((f) => f.value.family))];
  for (const [index, family] of families.entries()) {
    global[`font-family-${index + 1}`] = { value: family, type: 'fontFamilies' };
  }
  return JSON.stringify({ global }, null, 2);
}

/* ------------------------------------------------------------------------ */
/* Style Dictionary (Amazon style-dictionary format)                         */
/* ------------------------------------------------------------------------ */

/**
 * Style Dictionary format: nested `{ category: { name: { value } } }`
 * structure consumable by `style-dictionary` / `tokens-studio` pipelines to
 * generate platform artifacts (CSS, SCSS, iOS, Android…).
 */
export function tokensToStyleDictionary(tokens: InspectionTokens): string {
  const color: Record<string, { value: string }> = {};
  for (const [index, c] of tokens.colors.entries()) {
    color[colorName(c, index)] = { value: cssValue(c.value.hex) };
  }
  const spacing: Record<string, { value: string }> = {};
  for (const [index, s] of tokens.spacing.entries()) {
    spacing[String(index + 1)] = { value: px(s.value) };
  }
  const radius: Record<string, { value: string }> = {};
  for (const [index, r] of tokens.radius.entries()) {
    radius[String(index + 1)] = { value: px(r.value) };
  }
  const shadow: Record<string, { value: string }> = {};
  for (const [index, s] of tokens.shadows.entries()) {
    shadow[String(index + 1)] = { value: cssValue(s.value) };
  }
  const fontFamily: Record<string, { value: string }> = {};
  const families = [...new Set(tokens.fonts.map((f) => f.value.family))];
  for (const [index, family] of families.entries()) {
    fontFamily[`family-${index + 1}`] = { value: family };
  }
  return JSON.stringify(
    { color, spacing, borderRadius: radius, boxShadow: shadow, fontFamily },
    null,
    2,
  );
}

/* ------------------------------------------------------------------------ */
/* Page scope: full token bundle                                             */
/* ------------------------------------------------------------------------ */

/** All token files for the page scope of the export center. */
export function tokensToFiles(tokens: InspectionTokens): {
  path: string;
  content: string;
  format: 'css' | 'scss' | 'tailwind' | 'json' | 'ts' | 'figma' | 'styledict';
}[] {
  return [
    { path: 'tokens/tokens.css', content: tokensToCss(tokens), format: 'css' },
    { path: 'tokens/_tokens.scss', content: tokensToScss(tokens), format: 'scss' },
    { path: 'tokens/tailwind.config.js', content: tokensToTailwind(tokens), format: 'tailwind' },
    { path: 'tokens/tokens.json', content: tokensToJson(tokens), format: 'json' },
    { path: 'tokens/tokens.ts', content: tokensToTs(tokens), format: 'ts' },
    { path: 'tokens/tokens.figma.json', content: tokensToFigmaTokens(tokens), format: 'figma' },
    {
      path: 'tokens/style-dictionary.json',
      content: tokensToStyleDictionary(tokens),
      format: 'styledict',
    },
  ];
}

/** Re-export a Token-safe subset for callers that only need the bundle. */
export type TokenBundle = Inspection['tokens'];
