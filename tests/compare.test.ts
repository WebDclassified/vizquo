import { describe, expect, it } from 'vitest';
import { compareInspections, summarizeComparison } from '../export/compare';
import type { ColorToken, FontToken, Inspection, InspectionTokens, Token } from '../shared/types';

interface InspectionOverrides extends Partial<Omit<Inspection, 'tokens'>> {
  tokens?: Partial<InspectionTokens>;
}

function makeInspection(overrides: InspectionOverrides = {}): Inspection {
  const { tokens: tokenOverrides, ...rest } = overrides;
  return {
    id: 'ins',
    page: { url: 'https://example.com/', title: 'Example', scannedAt: 1000 },
    createdAt: 1000,
    assets: [],
    components: [],
    findings: [],
    variables: [],
    gradients: [],
    breakpoints: [],
    typeStyles: [],
    consistencyScore: 100,
    scanDurationMs: 0,
    truncated: false,
    scannedElementCount: 0,
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
    tokens: {
      colors: tokenOverrides?.colors ?? [],
      fonts: tokenOverrides?.fonts ?? [],
      spacing: tokenOverrides?.spacing ?? [],
      radius: tokenOverrides?.radius ?? [],
      shadows: tokenOverrides?.shadows ?? [],
    },
    ...rest,
  };
}

function color(hex: string): ColorToken {
  return {
    value: { hex, oklch: '', role: undefined },
    confidence: { level: 'detected' },
    usageCount: 1,
    usedBy: [],
  };
}

function font(family: string, weight = 400): FontToken {
  return {
    value: { family, source: 'google', weight },
    confidence: { level: 'detected' },
    usageCount: 1,
    usedBy: [],
  };
}

function spacing(value: number): Token<number> {
  return { value, confidence: { level: 'detected' }, usageCount: 1, usedBy: [] };
}

describe('compareInspections (Phase 8, Section 7.25)', () => {
  it('reports identical tokens as present on both sides', () => {
    const a = makeInspection({
      tokens: { colors: [color('#635bff')], fonts: [font('Inter', 600)], spacing: [spacing(8)] },
    });
    const b = makeInspection({
      tokens: { colors: [color('#635BFF')], fonts: [font('Inter', 600)], spacing: [spacing(8)] },
    });
    const result = compareInspections(a, b);
    expect(result.differingCount).toBe(0);
    const colors = result.sections.find((s) => s.key === 'colors');
    expect(colors?.rows).toHaveLength(1);
    // Case-insensitive hex normalization means the same color on both sides.
    expect(colors?.rows[0]).toMatchObject({ inA: true, inB: true });
  });

  it('flags values present on only one side', () => {
    const a = makeInspection({
      tokens: { colors: [color('#635bff'), color('#111111')] },
      breakpoints: [{ raw: '(min-width: 768px)', minWidth: 768, maxWidth: null }],
    });
    const b = makeInspection({
      tokens: { colors: [color('#635bff')] },
      breakpoints: [],
    });
    const result = compareInspections(a, b);
    expect(result.differingCount).toBe(2); // #111111 + the breakpoint
    const colors = result.sections.find((s) => s.key === 'colors');
    const onlyA = colors?.rows.find((r) => r.key === '#111111');
    expect(onlyA).toMatchObject({ inA: true, inB: false });
    const bp = result.sections.find((s) => s.key === 'breakpoints');
    expect(bp?.rows.find((r) => r.inA !== r.inB)).toBeTruthy();
  });

  it('normalizes font family case and weight into one identity', () => {
    const a = makeInspection({ tokens: { fonts: [font('Inter', 600)] } });
    const b = makeInspection({ tokens: { fonts: [font('inter', 600)] } });
    const result = compareInspections(a, b);
    expect(result.differingCount).toBe(0);
  });

  it('compares consistency scores', () => {
    const a = makeInspection({ consistencyScore: 80 });
    const b = makeInspection({ consistencyScore: 55 });
    const result = compareInspections(a, b);
    expect(result.consistency).toEqual({ a: 80, b: 55 });
  });

  it('compares technologies by name', () => {
    const a = makeInspection({
      technologies: [{ name: 'React', category: 'frontend', confidence: 'detected' }],
    });
    const b = makeInspection({});
    const result = compareInspections(a, b);
    const tech = result.sections.find((s) => s.key === 'technologies');
    expect(tech?.rows.find((r) => r.inA !== r.inB)).toBeTruthy();
  });

  describe('summarizeComparison (Phase 10, version timeline)', () => {
    it('summarizes additions and removals per section', () => {
      const older = makeInspection({
        tokens: { colors: [color('#111111'), color('#222222')] },
        breakpoints: [{ raw: '(min-width: 768px)', minWidth: 768, maxWidth: null }],
      });
      const newer = makeInspection({
        tokens: { colors: [color('#111111'), color('#333333')] },
        breakpoints: [],
      });
      const summary = summarizeComparison(compareInspections(newer, older));
      expect(summary.changed).toBe(true);
      expect(summary.differingCount).toBe(3);
      expect(summary.lines).toContain('Colors +1 −1');
      expect(summary.lines).toContain('Breakpoints +0 −1');
    });

    it('returns an empty summary when nothing differs', () => {
      const a = makeInspection({ tokens: { colors: [color('#635bff')] } });
      const summary = summarizeComparison(compareInspections(a, a));
      expect(summary.changed).toBe(false);
      expect(summary.differingCount).toBe(0);
      expect(summary.lines).toEqual([]);
    });
  });

  it('handles gradients, shadows, and radius sections', () => {
    const a = makeInspection({
      tokens: {
        radius: [spacing(8)],
        shadows: [
          {
            value: '0 1px 2px rgba(0,0,0,0.1)',
            confidence: { level: 'detected' },
            usageCount: 1,
            usedBy: [],
          } as Token<string>,
        ],
      },
      gradients: [
        {
          value: 'linear-gradient(90deg, #000, #fff)',
          confidence: { level: 'detected' },
          usageCount: 1,
          usedBy: [],
        } as Token<string>,
      ],
    });
    const b = makeInspection({});
    const result = compareInspections(a, b);
    expect(result.sections.find((s) => s.key === 'radius')?.rows).toHaveLength(1);
    expect(result.sections.find((s) => s.key === 'gradients')?.rows).toHaveLength(1);
    expect(result.sections.find((s) => s.key === 'shadows')?.rows).toHaveLength(1);
  });
});
