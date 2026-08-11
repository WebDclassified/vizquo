import { describe, expect, it } from 'vitest';
import { groupInspectionsByUrl, MAX_VERSIONS_PER_PAGE } from '../engine/timeline/timeline';
import { compareInspections, summarizeComparison } from '../export/compare';
import type { ColorToken, Inspection } from '../shared/types';

function makeInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: `ins-${Math.random().toString(36).slice(2)}`,
    page: { url: 'https://example.com/', title: 'Example', scannedAt: 1700000000000 },
    createdAt: 1700000000000,
    tokens: { colors: [], fonts: [], spacing: [], radius: [], shadows: [] },
    assets: [],
    components: [],
    findings: [],
    variables: [],
    gradients: [],
    breakpoints: [],
    typeStyles: [],
    consistencyScore: 80,
    scanDurationMs: 1000,
    truncated: false,
    scannedElementCount: 100,
    metrics: {
      imageCount: 0,
      svgCount: 0,
      animationCount: 0,
      transitionCount: 0,
      breakpointCount: 0,
    },
    cached: false,
    stale: false,
    technologies: [],
    containerQueries: [],
    viewportMeta: true,
    ...overrides,
  };
}

function color(hex: string, role: string): ColorToken {
  return {
    value: { hex, oklch: '', role },
    confidence: { level: 'detected' },
    usageCount: 1,
    usedBy: [],
  };
}

describe('groupInspectionsByUrl (Phase 10, version timeline)', () => {
  it('groups scans of the same page, newest first', () => {
    const old = makeInspection({
      createdAt: 100,
      page: { url: 'https://x.test/a', title: 'A', scannedAt: 100 },
    });
    const mid = makeInspection({
      createdAt: 200,
      page: { url: 'https://x.test/a', title: 'A', scannedAt: 200 },
    });
    const newer = makeInspection({
      createdAt: 300,
      page: { url: 'https://x.test/a', title: 'A', scannedAt: 300 },
    });
    const other = makeInspection({
      createdAt: 250,
      page: { url: 'https://y.test/', title: 'Y', scannedAt: 250 },
    });

    const groups = groupInspectionsByUrl([old, other, mid, newer]);
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.url.includes('x.test'));
    expect(a?.versions.map((v) => v.createdAt)).toEqual([300, 200, 100]);
    // Most recently scanned page first — x.test's newest version (300) beats
    // y.test's (250).
    expect(groups[0]?.url).toBe('https://x.test/a');
  });

  it('normalizes URLs so fragments and trailing slashes group together', () => {
    const a = makeInspection({
      createdAt: 1,
      page: { url: 'https://x.test/a', title: 'A', scannedAt: 1 },
    });
    const b = makeInspection({
      createdAt: 2,
      page: { url: 'https://x.test/a/#frag', title: 'A', scannedAt: 2 },
    });
    const groups = groupInspectionsByUrl([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.versions).toHaveLength(2);
  });

  it('caps the versions per page', () => {
    const many = Array.from({ length: MAX_VERSIONS_PER_PAGE + 5 }, (_, i) =>
      makeInspection({
        createdAt: i,
        page: { url: 'https://x.test/', title: 'X', scannedAt: i },
      }),
    );
    const groups = groupInspectionsByUrl(many);
    expect(groups[0]?.versions).toHaveLength(MAX_VERSIONS_PER_PAGE);
  });

  it('returns an empty list for no inspections', () => {
    expect(groupInspectionsByUrl([])).toEqual([]);
  });
});

describe('summarizeComparison (Phase 10, timeline diff summary)', () => {
  const older = makeInspection({
    tokens: {
      colors: [color('#111111', 'background'), color('#222222', 'text')],
      fonts: [],
      spacing: [],
      radius: [],
      shadows: [],
    },
  });
  const newer = makeInspection({
    tokens: {
      colors: [color('#111111', 'background'), color('#333333', 'accent')],
      fonts: [],
      spacing: [],
      radius: [],
      shadows: [],
    },
  });

  it('reports additions (+) and removals (−) per section', () => {
    const summary = summarizeComparison(compareInspections(newer, older));
    expect(summary.changed).toBe(true);
    expect(summary.differingCount).toBe(2);
    expect(summary.lines).toContain('Colors +1 −1');
  });

  it('reports no change when inspections are identical', () => {
    const summary = summarizeComparison(compareInspections(older, older));
    expect(summary.changed).toBe(false);
    expect(summary.differingCount).toBe(0);
    expect(summary.lines).toEqual([]);
  });
});
