import { describe, expect, it } from 'vitest';
import {
  activeAtWidth,
  breakpointScale,
  isRealBreakpoint,
  parseContainerQuery,
  sortBreakpoints,
} from '../engine/responsive/breakpoints';

const SAMPLE = [
  { raw: '(min-width: 768px)', minWidth: 768, maxWidth: null },
  { raw: '(max-width: 767px)', minWidth: null, maxWidth: 767 },
  { raw: '(min-width: 1024px)', minWidth: 1024, maxWidth: null },
  { raw: '(min-width: 480px) and (max-width: 767px)', minWidth: 480, maxWidth: 767 },
];

describe('activeAtWidth (Section 7.15 Time Machine mapping)', () => {
  it('activates min-width queries once the viewport passes them', () => {
    const at768 = activeAtWidth(SAMPLE, 768);
    expect(at768.find((b) => b.raw === '(min-width: 768px)')?.active).toBe(true);
    expect(at768.find((b) => b.raw === '(min-width: 1024px)')?.active).toBe(false);
  });

  it('activates max-width queries while under their ceiling', () => {
    const at375 = activeAtWidth(SAMPLE, 375);
    expect(at375.find((b) => b.raw === '(max-width: 767px)')?.active).toBe(true);
    const at800 = activeAtWidth(SAMPLE, 800);
    expect(at800.find((b) => b.raw === '(max-width: 767px)')?.active).toBe(false);
  });

  it('handles compound min+max bounds', () => {
    const at600 = activeAtWidth(SAMPLE, 600);
    expect(at600.find((b) => b.raw.includes('480px'))?.active).toBe(true);
    const at100 = activeAtWidth(SAMPLE, 100);
    expect(at100.find((b) => b.raw.includes('480px'))?.active).toBe(false);
    const at800 = activeAtWidth(SAMPLE, 800);
    expect(at800.find((b) => b.raw.includes('480px'))?.active).toBe(false);
  });

  it('reports the correct breakpoint count at a desktop width', () => {
    const atDesktop = activeAtWidth(SAMPLE, 1440);
    expect(atDesktop.filter((b) => b.active)).toHaveLength(2); // 768+, 1024+
  });

  it('sorts breakpoints by min-width for the timeline', () => {
    const sorted = sortBreakpoints(SAMPLE);
    expect(sorted[0]!.minWidth).toBe(480);
    expect(sorted.at(-1)!.minWidth).toBe(1024);
  });
});

describe('parseContainerQuery', () => {
  it('parses anonymous and named container queries', () => {
    expect(parseContainerQuery('(min-width: 600px)')).toEqual({
      raw: '(min-width: 600px)',
      name: '',
      minWidth: 600,
      maxWidth: null,
    });
    expect(parseContainerQuery('sidebar (max-width: 400px)')).toEqual({
      raw: 'sidebar (max-width: 400px)',
      name: 'sidebar',
      minWidth: null,
      maxWidth: 400,
    });
  });

  it('handles queries without width bounds', () => {
    const cq = parseContainerQuery('(orientation: portrait)');
    expect(cq.minWidth).toBeNull();
    expect(cq.maxWidth).toBeNull();
  });
});

describe('breakpoint helpers', () => {
  it('treats only width-bounded queries as real breakpoints', () => {
    expect(isRealBreakpoint({ raw: '(min-width: 768px)', minWidth: 768, maxWidth: null })).toBe(
      true,
    );
    expect(
      isRealBreakpoint({ raw: '(orientation: landscape)', minWidth: null, maxWidth: null }),
    ).toBe(false);
  });

  it('extracts the distinct layout widths', () => {
    expect(breakpointScale(SAMPLE)).toEqual([480, 768, 1024]);
  });
});
