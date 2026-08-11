/**
 * Export center (Section 7.24) — the scope × format matrix.
 *
 * Every (scope, format) pair the UI offers maps to a pure generator here, so
 * the export center is a thin presentation layer and the outputs are
 * unit-testable. Page scope bundles the token files; project scope bundles
 * tokens + components + a report into a ZIP (fflate).
 */
import { strToU8, zipSync } from 'fflate';
import type {
  CodegenInput,
  ElementInspection,
  ExportFile,
  ExportFormat,
  ExportScope,
  Inspection,
} from '../shared/types';
import { type CodegenFormat, componentName, elementToCode } from './codegen';
import {
  tokensToCss,
  tokensToFigmaTokens,
  tokensToFiles,
  tokensToJson,
  tokensToScss,
  tokensToStyleDictionary,
  tokensToTailwind,
  tokensToTs,
} from './tokens';

/** Which formats each scope offers (the matrix the UI renders). */
export const EXPORT_MATRIX: Record<ExportScope, ExportFormat[]> = {
  token: ['css', 'scss', 'tailwind', 'json', 'ts', 'figma', 'styledict'],
  element: ['react', 'vue', 'svelte', 'html', 'tailwind'],
  component: ['react', 'vue', 'svelte', 'html', 'tailwind'],
  page: ['css', 'scss', 'tailwind', 'json', 'ts', 'figma', 'styledict'],
  project: ['zip'],
};

/** Human-readable scope/format labels for the UI. */
export const SCOPE_LABEL: Record<ExportScope, string> = {
  token: 'Design tokens',
  element: 'This element',
  component: 'Component',
  page: 'Whole page',
  project: 'Full project (ZIP)',
};

export const FORMAT_LABEL: Record<ExportFormat, string> = {
  css: 'CSS variables',
  scss: 'SCSS variables',
  tailwind: 'Tailwind config',
  json: 'JSON',
  ts: 'TypeScript',
  figma: 'Figma Tokens',
  styledict: 'Style Dictionary',
  react: 'React component',
  vue: 'Vue component',
  svelte: 'Svelte component',
  html: 'HTML + inline styles',
  zip: 'Project ZIP',
};

/** Build the CodegenInput for a specific element. */
export function codegenInputOf(inspection: ElementInspection): CodegenInput {
  return {
    tagName: inspection.tagName,
    text: inspection.text,
    layout: inspection.layout,
    appearance: inspection.appearance,
    typography: inspection.typography,
    advanced: inspection.advanced,
    html: inspection.html,
  };
}

function codegenFormat(format: ExportFormat): CodegenFormat | null {
  return format === 'react' ||
    format === 'vue' ||
    format === 'svelte' ||
    format === 'html' ||
    format === 'tailwind'
    ? format
    : null;
}

/** Filename for a single-file export. */
export function filenameFor(scope: ExportScope, format: ExportFormat): string {
  const base =
    scope === 'element'
      ? 'element'
      : scope === 'component'
        ? 'component'
        : scope === 'page'
          ? 'page-tokens'
          : 'tokens';
  // `tailwind` is a config file for token/page scope, but a component (.tsx)
  // for element/component scope.
  if (format === 'tailwind') {
    return scope === 'element' || scope === 'component'
      ? `${base}.tsx`
      : `${base}.tailwind.config.js`;
  }
  switch (format) {
    case 'css':
      return `${base}.css`;
    case 'scss':
      return `${base}.scss`;
    case 'json':
      return `${base}.json`;
    case 'ts':
      return `${base}.ts`;
    case 'figma':
      return `${base}.figma.json`;
    case 'styledict':
      return `${base}.style-dictionary.json`;
    case 'react':
      return `${base}.tsx`;
    case 'vue':
      return `${base}.vue`;
    case 'svelte':
      return `${base}.svelte`;
    case 'html':
      return `${base}.html`;
    case 'zip':
      return 'vizquo-project.zip';
  }
}

/**
 * Generate the content for one export. Returns null when the scope needs
 * data that isn't provided (element/component without an inspection).
 */
export function renderExport(
  scope: ExportScope,
  format: ExportFormat,
  data: { inspection: Inspection; element?: ElementInspection },
): string {
  const { inspection, element } = data;
  switch (scope) {
    case 'token':
      return renderTokenFormat(format, inspection);
    case 'page':
      return renderTokenFormat(format, inspection);
    case 'element':
    case 'component': {
      if (!element) throw new Error('Select an element first — there is nothing to generate.');
      const gen = codegenFormat(format);
      if (gen) return elementToCode(codegenInputOf(element), gen);
      throw new Error(`The ${format} format does not apply to elements.`);
    }
    case 'project': {
      // ZIPs are built by the caller (buildProjectZip) so the bytes aren't
      // thrown away by a string return — renderExport only produces text.
      throw new Error('Project scope is a ZIP — build it with buildProjectZip().');
    }
  }
}

function renderTokenFormat(format: ExportFormat, inspection: Inspection): string {
  const tokens = inspection.tokens;
  switch (format) {
    case 'css':
      return tokensToCss(tokens);
    case 'scss':
      return tokensToScss(tokens);
    case 'tailwind':
      return tokensToTailwind(tokens);
    case 'json':
      return tokensToJson(tokens);
    case 'ts':
      return tokensToTs(tokens);
    case 'figma':
      return tokensToFigmaTokens(tokens);
    case 'styledict':
      return tokensToStyleDictionary(tokens);
    default:
      throw new Error(`The ${format} format does not apply to tokens.`);
  }
}

/* ------------------------------------------------------------------------ */
/* Project ZIP (project scope)                                               */
/* ------------------------------------------------------------------------ */

/** Assemble the full project ZIP: tokens, components, and a report. */
export function buildProjectZip(
  inspection: Inspection,
  element?: ElementInspection,
): { content: string; bytes: Uint8Array } {
  const files: Record<string, Uint8Array> = {};
  const add = (path: string, content: string): void => {
    files[path] = strToU8(content);
  };

  // Design tokens in every format.
  for (const file of tokensToFiles(inspection.tokens)) {
    add(`tokens/${file.path.split('/').pop() ?? 'tokens'}`, file.content);
  }

  // The currently-inspected element, as a React component (the one live
  // element we have real computed styles for). Other detected components are
  // listed in the report — code needs a live inspection (element scope).
  if (element) {
    const input = codegenInputOf(element);
    add(`components/${componentFileName(element.tagName)}.tsx`, elementToCode(input, 'react'));
  }

  // Report — the page's design system in one file.
  const report: ExportFile = {
    path: 'report.json',
    content: JSON.stringify(
      {
        url: inspection.page.url,
        title: inspection.page.title,
        scannedAt: new Date(inspection.createdAt).toISOString(),
        consistencyScore: inspection.consistencyScore,
        technologies: inspection.technologies.map((t) => t.name),
        tokens: {
          colors: inspection.tokens.colors.length,
          fonts: inspection.tokens.fonts.length,
          spacing: inspection.tokens.spacing.length,
          radius: inspection.tokens.radius.length,
          shadows: inspection.tokens.shadows.length,
        },
        assets: inspection.assets.length,
        components: inspection.components.length,
        findings: inspection.findings.length,
        breakpoints: inspection.breakpoints.map((b) => b.raw),
      },
      null,
      2,
    ),
  };
  add(report.path, report.content);

  const bytes = zipSync(files, { level: 6 });
  // The export center returns a string for preview; ZIPs are downloaded by
  // the caller from `bytes`.
  return {
    content: `ZIP bundle (${Object.keys(files).length} files, ${bytes.byteLength} bytes)`,
    bytes,
  };
}

function componentFileName(tag: string): string {
  // The file must match the exported function name in the generated code.
  return componentName(tag);
}

/** Whether a scope+format pair is valid (the matrix). */
export function isExportable(scope: ExportScope, format: ExportFormat): boolean {
  return EXPORT_MATRIX[scope].includes(format);
}

export type { ExportFile };
