// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildInspection,
  buildScanSnapshot,
  collectFontSources,
  sampleElement,
} from '../engine/scan/scan';
import type {
  ColorToken,
  ConsistencyResult,
  FontToken,
  ScalesAnalysis,
  StructureAnalysis,
  Token,
  TypeStyleUsage,
  TypographyAnalysis,
} from '../shared/types';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  window.location.href = 'https://example.com/test';
  document.title = 'Test page';
  // Never actually fetch linked stylesheets in tests.
  const happyDom = (
    window as unknown as { happyDOM?: { settings?: { disableCSSFileLoading?: boolean } } }
  ).happyDOM;
  if (happyDom?.settings) happyDom.settings.disableCSSFileLoading = true;
});

describe('buildScanSnapshot (Section 7.1)', () => {
  it('samples visible elements with computed style projections', async () => {
    document.body.innerHTML = `
      <style>
        .card { color: #111111; padding: 8px; border-radius: 4px; }
      </style>
      <div id="app">
        <button class="card btn-primary" style="background-color: #635bff">Go</button>
        <p class="card">Hello world</p>
        <div style="display: none">hidden</div>
      </div>
    `;
    const snapshot = await buildScanSnapshot();
    expect(snapshot.url).toBe('https://example.com/test');
    // Skipped: style + hidden div. Sampled: div#app, button, p (the div#app has no text).
    const button = snapshot.samples.find((s) => s.tag === 'button');
    expect(button).toBeDefined();
    expect(button!.isButton).toBe(true);
    expect(button!.backgroundColor).toBe('#635bff');
    const p = snapshot.samples.find((s) => s.tag === 'p');
    expect(p!.textLength).toBeGreaterThan(0);
    expect(snapshot.samples.some((s) => s.classes.includes('card'))).toBe(true);
  });

  it('counts images and svgs', async () => {
    document.body.innerHTML = `
      <img src="a.png" alt="" />
      <img src="b.png" alt="" />
      <svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>
    `;
    const snapshot = await buildScanSnapshot();
    expect(snapshot.imageCount).toBe(2);
    expect(snapshot.svgCount).toBe(1);
  });

  it('reports non-truncation on small pages', async () => {
    document.body.innerHTML = '<main><h1>Hi</h1></main>';
    const snapshot = await buildScanSnapshot();
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.elementCount).toBeGreaterThanOrEqual(2);
  });

  it('skips visually-hidden elements (display:none)', async () => {
    document.body.innerHTML = '<div>visible</div><div style="display:none">ghost</div>';
    const snapshot = await buildScanSnapshot();
    expect(snapshot.samples.some((s) => s.ref.selector.includes('ghost'))).toBe(false);
  });

  it('caps samples on huge pages and reports truncation honestly (hostile DOM)', async () => {
    // Just over MAX_SAMPLES visible elements: the walk must stop at the cap
    // instead of serializing the whole page, and flag truncated. (happy-dom
    // computed styles are slow, so the page is only slightly over the cap.)
    document.body.innerHTML = '<div class="row">x</div>'.repeat(4100);
    const snapshot = await buildScanSnapshot();
    expect(snapshot.samples.length).toBeLessThanOrEqual(4000);
    expect(snapshot.truncated).toBe(true);
  }, 60_000);

  it('abandons early when cancelled mid-walk (no partial-data corruption)', async () => {
    document.body.innerHTML = '<div class="row">x</div>'.repeat(1000);
    let cancelled = false;
    const promise = buildScanSnapshot(
      () => {
        // Cancel at the first yield batch (300 samples in).
        cancelled = true;
      },
      () => cancelled,
    );
    const snapshot = await promise;
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.samples.length).toBeGreaterThan(0);
    expect(snapshot.samples.length).toBeLessThan(1000);
  });

  it('does not cancel when the flag never flips', async () => {
    document.body.innerHTML = '<div class="row">x</div>'.repeat(500);
    const snapshot = await buildScanSnapshot(undefined, () => false);
    expect(snapshot.truncated).toBe(false);
    // 500 divs + <html> + <body> are all sampled.
    expect(snapshot.samples.length).toBe(502);
  }, 60_000);
});

describe('sampleElement', () => {
  it('builds a structural signature input with button/link semantics', () => {
    document.body.innerHTML = '<a class="btn-primary" href="/x"><span>Link</span></a>';
    const a = document.querySelector('a')!;
    const sample = sampleElement(a);
    expect(sample.tag).toBe('a');
    expect(sample.isLink).toBe(true);
    expect(sample.isButton).toBe(true); // btn hint in class
    expect(sample.childTags).toContain('span');
  });
});

describe('collectFontSources', () => {
  it('detects Google Fonts from <link> tags (multi-family)', () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Roboto">';
    const sources = collectFontSources(document);
    const inter = sources.find((f) => f.family === 'Inter');
    const roboto = sources.find((f) => f.family === 'Roboto');
    expect(inter?.source).toBe('google');
    expect(roboto?.source).toBe('google');
  });

  it('detects local @font-face', () => {
    document.head.innerHTML = `
      <style>
        @font-face { font-family: 'Custom'; src: url('/custom.woff2') format('woff2'); }
      </style>
    `;
    const sources = collectFontSources(document);
    expect(sources.some((f) => f.family === 'Custom' && f.source === 'local')).toBe(true);
  });
});

describe('buildInspection (entity assembly)', () => {
  it('assembles all Inspection fields from engine outputs', async () => {
    const colorToken: ColorToken = {
      value: { hex: '#635bff', oklch: 'oklch(0.58 0.23 278)' },
      confidence: { level: 'detected' },
      usageCount: 3,
      usedBy: [],
    };
    const fontToken: FontToken = {
      value: { family: 'Inter', source: 'google', weight: 400 },
      confidence: { level: 'detected' },
      usageCount: 1,
      usedBy: [],
    };
    const typeStyle: TypeStyleUsage = {
      family: 'Inter',
      size: '16px',
      weight: '400',
      lineHeight: '',
      letterSpacing: '',
      textTransform: '',
      role: 'body',
      confidence: { level: 'detected' },
      usageCount: 1,
      usedBy: [],
    };
    const spacing: Token<number> = {
      value: 8,
      confidence: { level: 'detected' },
      usageCount: 2,
      usedBy: [],
    };
    const radius: Token<number> = {
      value: 4,
      confidence: { level: 'detected' },
      usageCount: 2,
      usedBy: [],
    };
    const shadow: Token<string> = {
      value: '0 1px 3px #00000080',
      confidence: { level: 'detected' },
      usageCount: 1,
      usedBy: [],
    };
    const consistency: ConsistencyResult = { score: 92, findings: [] };
    const structure: StructureAnalysis = { components: [], cached: false };
    const scales: ScalesAnalysis = {
      spacing: [spacing],
      radius: [radius],
      shadows: [shadow],
      gradients: [],
      spacingScale: [{ value: 8, frequency: 2, onScale: true }],
      outliers: [],
      cached: false,
    };
    const typography: TypographyAnalysis = {
      typeStyles: [typeStyle],
      fonts: [fontToken],
      cached: false,
    };

    document.body.innerHTML = '<div class="a">x</div>';
    const snapshot = await buildScanSnapshot();
    const inspection = buildInspection({
      snapshot,
      colors: [colorToken],
      typography,
      scales,
      structure,
      assets: snapshot.assets,
      consistency,
      a11yFindings: [],
      performanceFindings: [],
      durationMs: 12,
      cached: false,
      stale: false,
    });
    expect(inspection.tokens.colors).toEqual([colorToken]);
    expect(inspection.consistencyScore).toBe(92);
    expect(inspection.scanDurationMs).toBe(12);
    expect(inspection.page.url).toBe('https://example.com/test');
    expect(inspection.metrics.breakpointCount).toBe(snapshot.breakpoints.length);
    expect(inspection.assets).toEqual(snapshot.assets);
  });
});
