import { describe, expect, it } from 'vitest';
import {
  detectRecurringComponents,
  findSimilarSamples,
  lcsLength,
  structuralSimilarity,
} from '../engine/tokens/structure';
import { sample } from './helpers/sample';

describe('structural similarity (Section 7.8)', () => {
  it('computes LCS over signature arrays', () => {
    expect(lcsLength(['a', 'b', 'c'], ['a', 'c'])).toBe(2);
    expect(lcsLength(['a'], ['b'])).toBe(0);
  });

  it('scores identical structures at 1 and penalizes tag mismatch', () => {
    const a = sample({ tag: 'button', classes: ['btn'], childTags: ['span', 'svg'] });
    const b = sample({ tag: 'button', classes: ['btn'], childTags: ['span', 'svg'] });
    const same = structuralSimilarity(a, b);
    expect(same.similarity).toBe(1);
    expect(same.basis).toMatch(/same tag/);

    const c = sample({ tag: 'div', classes: ['btn'], childTags: ['span', 'svg'] });
    const different = structuralSimilarity(a, c);
    expect(different.similarity).toBeLessThan(1);
  });
});

describe('findSimilarSamples', () => {
  it('returns top candidates above the threshold, excluding the target', () => {
    const target = sample({ tag: 'button', classes: ['btn'], childTags: ['span'] });
    const samples = [
      sample({ tag: 'button', classes: ['btn'], childTags: ['span'] }),
      sample({ tag: 'button', classes: ['btn'], childTags: ['span'] }),
      sample({ tag: 'footer', classes: ['foot'], childTags: ['p'] }),
    ];
    const results = findSimilarSamples(target, samples);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.similarity).toBeGreaterThanOrEqual(0.5);
      expect(r.ref.domPath.join('.')).not.toBe(target.ref.domPath.join('.'));
    }
  });
});

describe('detectRecurringComponents (Section 7.3/7.11)', () => {
  it('detects structures with 3+ identical instances', () => {
    const samples = Array.from({ length: 4 }, () =>
      sample({ tag: 'button', classes: ['btn'], childTags: ['span'] }),
    );
    const components = detectRecurringComponents(samples);
    expect(components).toHaveLength(1);
    expect(components[0]!.type).toBe('button');
    expect(components[0]!.instances).toHaveLength(4);
    expect(components[0]!.confidence.level).toBe('inferred');
  });

  it('ignores structures with fewer than 3 instances', () => {
    const samples = [sample({ tag: 'aside' }), sample({ tag: 'aside' })];
    expect(detectRecurringComponents(samples)).toHaveLength(0);
  });
});
