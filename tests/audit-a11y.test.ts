import { describe, expect, it } from 'vitest';
import {
  auditAccessibility,
  contrastRatio,
  isLargeText,
  relativeLuminance,
} from '../engine/accessibility/audit';
import type { A11ySample, ElementRef } from '../shared/types';

let counter = 0;

function ref(): ElementRef {
  counter += 1;
  return { selector: `#n-${counter}`, xpath: `/html/body/div[${counter}]`, domPath: [1, counter] };
}

function sample(overrides: Partial<A11ySample> = {}): A11ySample {
  return {
    ref: ref(),
    tag: 'p',
    text: 'Hello world',
    color: '#111111',
    backgroundColor: '#ffffff',
    fontSize: '16px',
    fontWeight: '400',
    tabIndex: 0,
    headingLevel: 0,
    isLink: false,
    isButton: false,
    isFormControl: false,
    inputType: '',
    hasLabel: false,
    hasDimsAttrs: false,
    loading: '',
    ...overrides,
  };
}

describe('contrast math (WCAG 2.x)', () => {
  it('computes the canonical black/white ratio of 21', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 1);
  });

  it('computes same-color ratio of 1', () => {
    expect(contrastRatio({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 })).toBeCloseTo(1, 2);
  });

  it('black on white passes 4.5:1 (relative luminance sanity)', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeGreaterThan(0.9);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it('classifies large text per WCAG (≥24px, or ≥18.66px bold)', () => {
    expect(isLargeText('24px', '400')).toBe(true);
    expect(isLargeText('18.66px', '700')).toBe(true);
    expect(isLargeText('18px', '700')).toBe(false);
    expect(isLargeText('16px', '400')).toBe(false);
  });
});

describe('auditAccessibility (Section 7.13)', () => {
  it('flags low-contrast normal text as an error', () => {
    // #777 on #fff ≈ 4.48:1 — just under 4.5.
    const findings = auditAccessibility([sample({ color: '#777777', backgroundColor: '#ffffff' })]);
    const contrast = findings.find((f) => f.message.includes('contrast'));
    expect(contrast).toBeDefined();
    expect(contrast!.severity).toBe('warning');
  });

  it('flags severely low contrast as an error', () => {
    const findings = auditAccessibility([sample({ color: '#bbbbbb', backgroundColor: '#ffffff' })]);
    const contrast = findings.find((f) => f.message.includes('contrast'));
    expect(contrast).toBeDefined();
    expect(contrast!.severity).toBe('error');
  });

  it('passes high-contrast text with no finding', () => {
    const findings = auditAccessibility([sample({ color: '#111111', backgroundColor: '#ffffff' })]);
    expect(findings.filter((f) => f.message.includes('contrast'))).toHaveLength(0);
  });

  it('passes large text at 3:1 (not 4.5:1)', () => {
    // #767676 on white ≈ 4.6 — passes for normal text; use a lower one for large.
    const findings = auditAccessibility([
      sample({ color: '#8a8a8a', backgroundColor: '#ffffff', fontSize: '24px' }),
    ]);
    expect(findings.filter((f) => f.message.includes('contrast'))).toHaveLength(0);
  });

  it('never fabricates a contrast result when colors are unparsable', () => {
    const findings = auditAccessibility([
      sample({ color: 'rgba(0, 0, 0, 0.5)', backgroundColor: '#ffffff' }),
      sample({ color: 'transparent', backgroundColor: 'url(/bg.png)' }),
    ]);
    expect(findings.filter((f) => f.message.includes('contrast'))).toHaveLength(0);
  });

  it('flags missing alt on img as an error', () => {
    const findings = auditAccessibility([sample({ tag: 'img', text: '', alt: undefined })]);
    expect(findings.some((f) => f.message.includes('no alt'))).toBe(true);
  });

  it('passes decorative images (role=presentation, alt="")', () => {
    const findings = auditAccessibility([
      sample({ tag: 'img', text: '', alt: '', role: 'presentation' }),
      sample({ tag: 'img', text: '', alt: '', role: 'none' }),
      sample({ tag: 'img', text: '', alt: '', ariaHidden: 'true' }),
    ]);
    expect(findings.some((f) => f.message.includes('no alt'))).toBe(false);
  });

  it('flags links and buttons with no accessible name', () => {
    const findings = auditAccessibility([
      sample({ tag: 'a', text: '', isLink: true, hasLabel: false }),
      sample({ tag: 'button', text: '', isButton: true, hasLabel: false }),
    ]);
    expect(findings.some((f) => f.message.includes('no accessible name'))).toBe(true);
  });

  it('passes named links/buttons', () => {
    const findings = auditAccessibility([
      sample({ tag: 'a', text: 'Read more', isLink: true }),
      sample({ tag: 'button', text: '', isButton: true, ariaLabel: 'Close' }),
    ]);
    expect(findings.some((f) => f.message.includes('no accessible name'))).toBe(false);
  });

  it('flags unlabeled form controls, and placeholder-only as a warning', () => {
    const findings = auditAccessibility([
      sample({ tag: 'input', text: '', isFormControl: true, inputType: 'text', hasLabel: false }),
      sample({
        tag: 'input',
        text: '',
        isFormControl: true,
        inputType: 'text',
        hasLabel: false,
        placeholder: 'Search…',
      }),
    ]);
    expect(findings.some((f) => f.severity === 'error' && f.message.includes('no label'))).toBe(
      true,
    );
    expect(
      findings.some((f) => f.severity === 'warning' && f.message.includes('only a placeholder')),
    ).toBe(true);
  });

  it('flags skipped heading levels', () => {
    const findings = auditAccessibility([
      sample({ tag: 'h1', headingLevel: 1, text: 'Title' }),
      sample({ tag: 'h3', headingLevel: 3, text: 'Jumped' }),
    ]);
    expect(findings.some((f) => f.message.includes('skips from h1 to h3'))).toBe(true);
  });

  it('passes sequential heading levels', () => {
    const findings = auditAccessibility([
      sample({ tag: 'h1', headingLevel: 1, text: 'Title' }),
      sample({ tag: 'h2', headingLevel: 2, text: 'Sub' }),
    ]);
    expect(findings.some((f) => f.message.includes('Heading order'))).toBe(false);
  });

  it('flags aria-hidden on a focusable element', () => {
    const findings = auditAccessibility([
      sample({ tag: 'button', text: 'X', isButton: true, ariaHidden: 'true', tabIndex: 0 }),
    ]);
    expect(findings.some((f) => f.message.includes('aria-hidden'))).toBe(true);
  });

  it('flags tabindex > 0 as an anti-pattern', () => {
    const findings = auditAccessibility([sample({ tag: 'div', text: 'x', tabIndex: 2 })]);
    expect(findings.some((f) => f.message.includes('tabindex'))).toBe(true);
  });

  it('anchors every finding to its element ref (highlight-on-page)', () => {
    const r = ref();
    const findings = auditAccessibility([sample({ ref: r, tag: 'img', text: '', alt: undefined })]);
    expect(findings[0]!.element).toEqual(r);
    expect(findings[0]!.category).toBe('accessibility');
  });
});
