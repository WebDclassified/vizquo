import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildProjectZip,
  EXPORT_MATRIX,
  filenameFor,
  isExportable,
  renderExport,
} from '../export/export-center';
import { tokensToCss } from '../export/tokens';
import type { Inspection, InspectionTokens } from '../shared/types';
import { buttonInspection } from './helpers/element-fixture';

function tokens(): InspectionTokens {
  return {
    colors: [
      {
        value: { hex: '#635bff', oklch: '', role: 'primary' },
        confidence: { level: 'detected' },
        usageCount: 1,
        usedBy: [],
      },
    ],
    fonts: [],
    spacing: [{ value: 8, confidence: { level: 'detected' }, usageCount: 1, usedBy: [] }],
    radius: [],
    shadows: [],
  };
}

function inspection(): Inspection {
  return {
    id: 'i-1',
    page: { url: 'https://example.com', title: 'Example', scannedAt: 1 },
    createdAt: 1,
    tokens: tokens(),
    assets: [],
    components: [],
    findings: [],
    variables: [],
    gradients: [],
    breakpoints: [{ raw: '(min-width: 768px)', minWidth: 768, maxWidth: null }],
    typeStyles: [],
    consistencyScore: 85,
    scanDurationMs: 10,
    technologies: [{ name: 'React', category: 'frontend', confidence: 'detected' }],
    containerQueries: [],
    viewportMeta: true,
    truncated: false,
    scannedElementCount: 100,
    metrics: {
      imageCount: 0,
      svgCount: 0,
      animationCount: 0,
      transitionCount: 0,
      breakpointCount: 1,
    },
    cached: false,
    stale: false,
  };
}

describe('export matrix (7.24)', () => {
  it('covers every format across scopes', () => {
    const all = new Set(Object.values(EXPORT_MATRIX).flat());
    expect(all).toEqual(
      new Set([
        'css',
        'scss',
        'tailwind',
        'json',
        'ts',
        'figma',
        'styledict',
        'react',
        'vue',
        'svelte',
        'html',
        'zip',
      ]),
    );
  });

  it('isExportable follows the matrix', () => {
    expect(isExportable('token', 'css')).toBe(true);
    expect(isExportable('token', 'react')).toBe(false);
    expect(isExportable('element', 'react')).toBe(true);
    expect(isExportable('project', 'zip')).toBe(true);
    expect(isExportable('project', 'css')).toBe(false);
  });
});

describe('renderExport', () => {
  it('token scope renders the CSS serializer', () => {
    const css = renderExport('token', 'css', { inspection: inspection() });
    expect(css).toContain('--primary: #635bff;');
    expect(css).toBe(tokensToCss(tokens()));
  });

  it('page scope renders token formats', () => {
    const json = renderExport('page', 'json', { inspection: inspection() });
    expect(JSON.parse(json)).toHaveProperty('colors');
  });

  it('element scope requires an element and renders component code', () => {
    expect(() => renderExport('element', 'react', { inspection: inspection() })).toThrow(
      /Select an element/,
    );
    const code = renderExport('element', 'react', {
      inspection: inspection(),
      element: buttonInspection(),
    });
    expect(code).toContain('export function ButtonComponent');
  });

  it('rejects mismatched pairs loudly', () => {
    expect(() => renderExport('token', 'react', { inspection: inspection() })).toThrow(
      /does not apply to tokens/,
    );
  });
});

describe('buildProjectZip', () => {
  it('produces a valid ZIP with tokens + component + report', () => {
    const { bytes, content } = buildProjectZip(inspection(), buttonInspection());
    expect(content).toContain('ZIP bundle');
    const files = unzipSync(bytes);
    expect(files['tokens/tokens.css']).toBeDefined();
    expect(files['tokens/tokens.ts']).toBeDefined();
    expect(files['report.json']).toBeDefined();
    expect(files['components/ButtonComponent.tsx']).toBeDefined();
    // The CSS inside the ZIP is the real serializer output.
    const css = strFromU8(files['tokens/tokens.css'] as Uint8Array);
    expect(css).toContain('--primary: #635bff;');
    const report = JSON.parse(strFromU8(files['report.json'] as Uint8Array)) as {
      url: string;
      consistencyScore: number;
    };
    expect(report.url).toBe('https://example.com');
    expect(report.consistencyScore).toBe(85);
  });

  it('works without a locked element (component file omitted, report still there)', () => {
    const { bytes } = buildProjectZip(inspection());
    const files = unzipSync(bytes);
    expect(files['report.json']).toBeDefined();
    expect(Object.keys(files).some((k) => k.startsWith('components/'))).toBe(false);
  });
});

describe('filenameFor', () => {
  it('names files by scope and format', () => {
    expect(filenameFor('token', 'css')).toBe('tokens.css');
    expect(filenameFor('element', 'react')).toBe('element.tsx');
    expect(filenameFor('page', 'json')).toBe('page-tokens.json');
    expect(filenameFor('project', 'zip')).toBe('vizquo-project.zip');
  });
});
