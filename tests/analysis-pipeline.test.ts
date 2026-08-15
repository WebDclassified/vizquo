import { describe, expect, it } from 'vitest';
import { createAnalysisPipeline } from '../engine/analysis/pipeline';
import type { ScanSnapshot } from '../shared/types';
import { sample } from './helpers/sample';

/**
 * The analysis pipeline is the code both the Comlink worker and the
 * main-thread fallback run (the fallback is what scans sites like YouTube,
 * whose CSP blocks blob workers). This test exercises the whole surface the
 * orchestrator calls, including L2 memoization, so the fallback path is
 * covered by unit tests — not just by the live probes.
 */
function snapshot(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    url: 'https://example.com/',
    title: 'Example',
    samples: [
      sample({
        tag: 'h1',
        textLength: 8,
        color: '#111111',
        backgroundColor: '#ffffff',
        fontFamily: 'Roboto, sans-serif',
        fontSize: '32px',
        fontWeight: '700',
        padding: '8px 16px',
        borderRadius: '4px',
      }),
      sample({
        tag: 'p',
        textLength: 24,
        color: '#333333',
        backgroundColor: '#ffffff',
        fontFamily: 'Roboto, sans-serif',
        fontSize: '16px',
        fontWeight: '400',
        padding: '4px 8px',
      }),
      sample({
        tag: 'button',
        textLength: 6,
        isButton: true,
        color: '#ffffff',
        backgroundColor: '#635bff',
        fontFamily: 'Roboto, sans-serif',
        fontSize: '14px',
        fontWeight: '600',
        padding: '8px 16px',
        borderRadius: '4px',
      }),
    ],
    variables: [],
    fontSources: [{ family: 'Roboto', source: 'google', weight: 400 }],
    breakpoints: [],
    assets: [],
    a11y: [],
    technologies: [],
    containerQueries: [],
    viewportMeta: true,
    truncated: false,
    elementCount: 3,
    imageCount: 0,
    svgCount: 0,
    animationCount: 0,
    transitionCount: 0,
    ...overrides,
  };
}

describe('createAnalysisPipeline (worker + main-thread fallback surface)', () => {
  it('runs the full pipeline and returns coherent results', () => {
    const pipeline = createAnalysisPipeline();
    pipeline.setSnapshot(snapshot());

    const colors = pipeline.analyzeColors();
    expect(colors.colors.length).toBeGreaterThan(0);
    expect(colors.colors.map((c) => c.value.hex)).toContain('#635bff');

    const typography = pipeline.analyzeTypography();
    expect(typography.fonts.length).toBeGreaterThan(0);
    expect(typography.typeStyles.length).toBeGreaterThan(0);

    const scales = pipeline.analyzeScales();
    expect(scales.spacing.length).toBeGreaterThan(0);
    expect(scales.radius.length).toBeGreaterThan(0);

    const structure = pipeline.analyzeStructure();
    expect(Array.isArray(structure.components)).toBe(true);

    // Empty asset/a11y inputs are handled honestly — no findings, no throw.
    const assets = pipeline.analyzeAssets();
    expect(assets.assets).toEqual([]);
    const a11y = pipeline.analyzeAccessibility();
    expect(a11y.findings).toEqual([]);
    const perf = pipeline.analyzePerformance();
    expect(perf.findings).toEqual([]);
  });

  it('memoizes L2 units across calls on the same snapshot', () => {
    const pipeline = createAnalysisPipeline();
    pipeline.setSnapshot(snapshot());

    const first = pipeline.analyzeColors();
    expect(first.cached).toBe(false);
    const second = pipeline.analyzeColors();
    expect(second.cached).toBe(true);
    expect(second.colors).toEqual(first.colors);

    // A changed snapshot recomputes (new sample set → new hash).
    pipeline.setSnapshot(
      snapshot({
        samples: [sample({ tag: 'div', textLength: 0, backgroundColor: '#00ff00' })],
      }),
    );
    const changed = pipeline.analyzeColors();
    expect(changed.cached).toBe(false);
    expect(changed.colors.map((c) => c.value.hex)).toContain('#00ff00');
  });

  it('recomputes color roles when colors change but structure is identical (SPA re-render)', () => {
    const pipeline = createAnalysisPipeline();
    // Same component tree (identical domPaths/tags/classes), different data.
    const mk = (bg: string) => ({
      tag: 'button',
      isButton: true,
      classes: ['btn'],
      backgroundColor: bg,
      ref: { selector: '#same', xpath: '/html/body/button', domPath: [1, 2, 0] },
    });
    pipeline.setSnapshot(
      snapshot({
        samples: [sample(mk('#635bff')), sample(mk('#e8e9ff'))],
      }),
    );
    const first = pipeline.analyzeColors();
    expect(first.cached).toBe(false);
    expect(first.colors.map((c) => c.value.hex)).toContain('#635bff');

    // SPA swap: the SAME structure now renders with a different brand color.
    pipeline.setSnapshot(
      snapshot({
        samples: [sample(mk('#11aa55')), sample(mk('#e8e9ff'))],
      }),
    );
    const second = pipeline.analyzeColors();
    expect(second.cached).toBe(false);
    expect(second.colors.map((c) => c.value.hex)).toContain('#11aa55');
    expect(second.colors.map((c) => c.value.hex)).not.toContain('#635bff');
  });

  it('supports the health probe and structural hash used by the orchestrator', () => {
    const pipeline = createAnalysisPipeline();
    const { hash } = pipeline.setSnapshot(snapshot());
    expect(pipeline.ping()).toBe('pong');
    expect(pipeline.getSnapshotHash()).toBe(hash);
    expect(pipeline.cacheStats()).toHaveProperty('colors');
  });

  it('finds structurally similar samples', () => {
    const pipeline = createAnalysisPipeline();
    pipeline.setSnapshot(
      snapshot({
        samples: [
          sample({ tag: 'button', isButton: true, classes: ['btn', 'primary'] }),
          sample({ tag: 'button', isButton: true, classes: ['btn', 'ghost'] }),
          sample({ tag: 'div', classes: ['card'] }),
        ],
      }),
    );
    const results = pipeline.findSimilar(
      sample({ tag: 'button', isButton: true, classes: ['btn'] }),
    );
    expect(results.length).toBeGreaterThan(0);
    // Similarity results reference matching samples by ref — the target's own
    // structure should surface as the closest match.
    expect(results[0]!.similarity).toBeGreaterThan(0);
    expect(results[0]!.ref).toBeDefined();
  });
});
