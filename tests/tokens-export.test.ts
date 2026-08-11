import { describe, expect, it } from 'vitest';
import {
  tokensToCss,
  tokensToFigmaTokens,
  tokensToFiles,
  tokensToJson,
  tokensToScss,
  tokensToStyleDictionary,
  tokensToTailwind,
  tokensToTs,
} from '../export/tokens';
import type { InspectionTokens } from '../shared/types';

function tokens(): InspectionTokens {
  return {
    colors: [
      {
        value: { hex: '#635bff', oklch: 'oklch(0.55 0.25 280)', role: 'primary' },
        confidence: { level: 'derived', score: 0.96, basis: 'inferred from 42 usages' },
        usageCount: 42,
        usedBy: [],
      },
      {
        value: { hex: '#ffffff', oklch: 'oklch(1 0 0)', role: 'background' },
        confidence: { level: 'detected' },
        usageCount: 100,
        usedBy: [],
      },
    ],
    fonts: [
      {
        value: { family: 'Inter', source: 'google', weight: 400 },
        confidence: { level: 'detected' },
        usageCount: 12,
        usedBy: [],
      },
    ],
    spacing: [
      { value: 4, confidence: { level: 'detected' }, usageCount: 30, usedBy: [] },
      { value: 8, confidence: { level: 'detected' }, usageCount: 55, usedBy: [] },
    ],
    radius: [{ value: 8, confidence: { level: 'detected' }, usageCount: 20, usedBy: [] }],
    shadows: [
      {
        value: '0 1px 3px rgba(0,0,0,0.1)',
        confidence: { level: 'detected' },
        usageCount: 5,
        usedBy: [],
      },
    ],
  };
}

describe('tokensToCss (7.19)', () => {
  it('emits custom properties from every token kind', () => {
    const css = tokensToCss(tokens());
    expect(css).toContain(':root {');
    expect(css).toContain('--primary: #635bff;');
    expect(css).toContain('--background: #ffffff;');
    expect(css).toContain('--space-1: 4px;');
    expect(css).toContain('--space-2: 8px;');
    expect(css).toContain('--radius-1: 8px;');
    expect(css).toContain('--shadow-1: 0 1px 3px rgba(0,0,0,0.1);');
    expect(css).toContain('--font-family-1: Inter;');
  });

  it('handles empty token sets without fabricating values', () => {
    const empty = tokensToCss({
      colors: [],
      fonts: [],
      spacing: [],
      radius: [],
      shadows: [],
    });
    expect(empty).toContain(':root {');
    expect(empty).toContain('No tokens extracted');
  });
});

describe('tokensToScss / tokensToJson / tokensToTs', () => {
  it('SCSS uses dollar variables', () => {
    const scss = tokensToScss(tokens());
    expect(scss).toContain('$color-primary: #635bff;');
    expect(scss).toContain('$space-1: 4px;');
  });

  it('JSON is parseable and complete', () => {
    const json = tokensToJson(tokens());
    const parsed = JSON.parse(json) as { colors: { name: string; hex: string }[] };
    expect(parsed.colors[0]).toMatchObject({ name: 'primary', hex: '#635bff' });
  });

  it('TypeScript emits `as const` exports', () => {
    const ts = tokensToTs(tokens());
    expect(ts).toContain('export const colors = {');
    expect(ts).toContain("'primary': '#635bff',");
    expect(ts).toContain('} as const;');
    expect(ts).toContain('export const fontFamily = {');
  });
});

describe('tokensToTailwind', () => {
  it('produces a module.exports config with extend', () => {
    const config = tokensToTailwind(tokens());
    expect(config).toContain('module.exports = {');
    expect(config).toContain('theme: {');
    expect(config).toContain('extend: {');
    expect(config).toContain('colors: {');
    expect(config).toContain("'primary': '#635bff'");
    expect(config).toContain('spacing: {');
  });
});

describe('tokensToFigmaTokens / tokensToStyleDictionary (9.1)', () => {
  it('Figma Tokens emits a global set of value+type entries', () => {
    const figma = JSON.parse(tokensToFigmaTokens(tokens())) as {
      global: Record<string, { value: string; type: string }>;
    };
    expect(figma.global.primary).toEqual({ value: '#635bff', type: 'color' });
    expect(figma.global['space-1']).toEqual({ value: '4px', type: 'spacing' });
    expect(figma.global['radius-1']).toEqual({ value: '8px', type: 'borderRadius' });
    expect(figma.global['shadow-1']).toEqual({
      value: '0 1px 3px rgba(0,0,0,0.1)',
      type: 'boxShadow',
    });
    expect(figma.global['font-family-1']).toEqual({ value: 'Inter', type: 'fontFamilies' });
  });

  it('style-dictionary emits nested category → name → value', () => {
    const sd = JSON.parse(tokensToStyleDictionary(tokens())) as Record<
      string,
      Record<string, { value: string }>
    >;
    expect(sd.color?.primary).toEqual({ value: '#635bff' });
    expect(sd.spacing?.['1']).toEqual({ value: '4px' });
    expect(sd.borderRadius?.['1']).toEqual({ value: '8px' });
    expect(sd.boxShadow?.['1']).toEqual({ value: '0 1px 3px rgba(0,0,0,0.1)' });
    expect(sd.fontFamily?.['family-1']).toEqual({ value: 'Inter' });
  });
});

describe('tokensToFiles (page scope)', () => {
  it('returns one file per format with unique paths', () => {
    const files = tokensToFiles(tokens());
    expect(files).toHaveLength(7);
    const paths = new Set(files.map((f) => f.path));
    expect(paths.size).toBe(7);
    expect(files[0]!.path).toBe('tokens/tokens.css');
    expect(files[4]!.path).toBe('tokens/tokens.ts');
    expect(files[5]!.path).toBe('tokens/tokens.figma.json');
    expect(files[6]!.path).toBe('tokens/style-dictionary.json');
  });
});
