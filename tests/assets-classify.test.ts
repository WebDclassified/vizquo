import { describe, expect, it } from 'vitest';
import { analyzeAsset, classifyAsset } from '../engine/assets/classify';
import type { AssetSample } from '../shared/types';

function sample(overrides: Partial<AssetSample> = {}): AssetSample {
  return {
    id: 'a-1',
    type: 'image',
    url: 'https://cdn.example.com/asset.jpg',
    source: 'img',
    ...overrides,
  };
}

describe('classifyAsset (Section 7.10 asset intelligence)', () => {
  it('classifies source-based roles with high confidence', () => {
    expect(classifyAsset(sample({ source: 'favicon' })).label).toBe('logo');
    expect(classifyAsset(sample({ source: 'og-image' })).label).toBe('hero');
    expect(classifyAsset(sample({ source: 'css-background' })).label).toBe('background');
  });

  it('reads filename hints', () => {
    expect(classifyAsset(sample({ url: 'https://x.com/img/logo-dark.png' })).label).toBe('logo');
    expect(classifyAsset(sample({ url: 'https://x.com/img/avatar-user.jpg' })).label).toBe(
      'avatar',
    );
    expect(classifyAsset(sample({ url: 'https://x.com/screenshot-home.png' })).label).toBe(
      'screenshot',
    );
    expect(classifyAsset(sample({ url: 'https://x.com/img/product-hero.jpg' })).label).toBe(
      'product-image',
    );
  });

  it('classifies .svg filenames as icons and inline SVGs by shape', () => {
    expect(classifyAsset(sample({ type: 'svg', url: 'https://x.com/search.svg' })).label).toBe(
      'icon',
    );
    expect(
      classifyAsset(
        sample({
          type: 'svg',
          source: 'inline-svg',
          renderedDims: [200, 200],
          svg: {
            pathCount: 20,
            fillColors: [],
            strokeColors: [],
            ids: [],
            classes: [],
            content: '',
          },
        }),
      ).label,
    ).toBe('illustration');
    expect(
      classifyAsset(
        sample({
          type: 'svg',
          source: 'inline-svg',
          renderedDims: [200, 200],
          svg: {
            pathCount: 2,
            fillColors: [],
            strokeColors: [],
            ids: [],
            classes: [],
            content: '',
          },
        }),
      ).label,
    ).toBe('logo');
  });

  it('classifies tiny assets as icons and wide images as heroes', () => {
    expect(classifyAsset(sample({ naturalDims: [24, 24], renderedDims: [24, 24] })).label).toBe(
      'icon',
    );
    expect(
      classifyAsset(sample({ naturalDims: [1600, 400], renderedDims: [1600, 400] })).label,
    ).toBe('hero');
    expect(classifyAsset(sample({ naturalDims: [200, 200], renderedDims: [200, 200] })).label).toBe(
      'avatar',
    );
  });

  it('stays honest: unknown role with low confidence', () => {
    const result = classifyAsset(sample());
    expect(result.label).toBe('unknown');
    expect(result.confidence.level).toBe('inferred');
    expect(result.confidence.score).toBeLessThan(0.5);
  });

  it('labels every classification as inferred (law #2 — never presented as fact)', () => {
    expect(classifyAsset(sample({ source: 'favicon' })).confidence.level).toBe('inferred');
    expect(
      classifyAsset(sample({ naturalDims: [1600, 400], renderedDims: [1600, 400] })).confidence
        .level,
    ).toBe('inferred');
  });
});

describe('analyzeAsset (issue flags)', () => {
  it('flags oversized assets (natural ≥ 2× rendered)', () => {
    const { issues } = analyzeAsset(
      sample({ naturalDims: [2000, 1000], renderedDims: [400, 200] }),
    );
    expect(issues.some((i) => i.kind === 'oversized')).toBe(true);
  });

  it('flags low-res sources (rendered exceeds natural)', () => {
    const { issues } = analyzeAsset(sample({ naturalDims: [200, 100], renderedDims: [500, 250] }));
    expect(issues.some((i) => i.kind === 'low-res')).toBe(true);
  });

  it('flags large files by payload size', () => {
    const { issues } = analyzeAsset(sample({ fileSize: 600_000 }));
    expect(issues.some((i) => i.kind === 'large-file')).toBe(true);
  });

  it('flags wrong-format only for large non-screenshot rasters', () => {
    const raster = analyzeAsset(sample({ fileSize: 900_000 }));
    expect(raster.issues.some((i) => i.kind === 'wrong-format')).toBe(true);
    const screenshot = analyzeAsset(
      sample({ fileSize: 900_000, url: 'https://x.com/screenshot-home.png' }),
    );
    expect(screenshot.issues.some((i) => i.kind === 'wrong-format')).toBe(false);
  });

  it('does not flag small, properly-sized images', () => {
    const { issues } = analyzeAsset(
      sample({ naturalDims: [400, 300], renderedDims: [400, 300], fileSize: 40_000 }),
    );
    expect(issues).toHaveLength(0);
  });

  it('carries the classification and issues into the result', () => {
    const result = analyzeAsset(sample({ source: 'favicon' }));
    expect(result.classification.label).toBe('logo');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
