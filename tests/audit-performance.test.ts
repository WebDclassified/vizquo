import { describe, expect, it } from 'vitest';
import { auditPerformance } from '../engine/performance/audit';
import type { A11ySample, Asset, ElementRef } from '../shared/types';

let counter = 0;

function ref(): ElementRef {
  counter += 1;
  return { selector: `#n-${counter}`, xpath: `/html/body/div[${counter}]`, domPath: [1, counter] };
}

function img(overrides: Partial<A11ySample> = {}): A11ySample {
  return {
    ref: ref(),
    tag: 'img',
    text: '',
    color: '',
    backgroundColor: '',
    fontSize: '',
    fontWeight: '',
    tabIndex: 0,
    headingLevel: 0,
    isLink: false,
    isButton: false,
    isFormControl: false,
    inputType: '',
    hasLabel: false,
    hasDimsAttrs: true,
    loading: 'lazy',
    ...overrides,
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: `a-${counter}`,
    type: 'image',
    url: `https://x.com/${counter}.png`,
    source: 'img',
    ...overrides,
  };
}

const BASE = {
  a11y: [],
  assets: [],
  elementCount: 100,
  animationCount: 0,
  transitionCount: 0,
};

describe('auditPerformance (Section 7.13)', () => {
  it('flags many images without width/height attributes (CLS)', () => {
    const findings = auditPerformance({
      ...BASE,
      a11y: [
        img({ hasDimsAttrs: false }),
        img({ hasDimsAttrs: false }),
        img({ hasDimsAttrs: false }),
        img({ hasDimsAttrs: false }),
      ],
    });
    expect(findings.some((f) => f.message.includes('width/height attributes'))).toBe(true);
  });

  it('passes images that reserve their dimensions', () => {
    const findings = auditPerformance({
      ...BASE,
      a11y: [img(), img(), img()],
    });
    expect(findings.some((f) => f.message.includes('width/height attributes'))).toBe(false);
  });

  it('flags many eager-loaded images', () => {
    const findings = auditPerformance({
      ...BASE,
      a11y: Array.from({ length: 10 }, () => img({ loading: 'eager' })),
    });
    expect(findings.some((f) => f.message.includes('load eagerly'))).toBe(true);
  });

  it('surfaces Phase 4 asset issues as performance findings', () => {
    const findings = auditPerformance({
      ...BASE,
      assets: [
        asset({
          issues: [{ kind: 'large-file', message: '~900 KB payload — large for an image asset.' }],
        }),
      ],
    });
    expect(findings.some((f) => f.message.includes('900 KB'))).toBe(true);
  });

  it('flags very large DOMs', () => {
    const findings = auditPerformance({ ...BASE, elementCount: 5000 });
    expect(findings.some((f) => f.message.includes('elements in the DOM'))).toBe(true);
  });

  it('flags heavy animation', () => {
    const findings = auditPerformance({ ...BASE, animationCount: 20, transitionCount: 30 });
    expect(findings.some((f) => f.message.includes('animated elements'))).toBe(true);
  });

  it('stays quiet on a clean page', () => {
    const findings = auditPerformance({ ...BASE });
    expect(findings).toHaveLength(0);
  });
});
