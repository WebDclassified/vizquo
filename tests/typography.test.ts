import { describe, expect, it } from 'vitest';
import { analyzeTypography, firstFamily, parsePx } from '../engine/tokens/typography';
import { sample } from './helpers/sample';

/** Text-bearing sample (the engine only counts elements that render text). */
function textSample(overrides: Parameters<typeof sample>[0] = {}): ReturnType<typeof sample> {
  return sample({ textLength: 12, ...overrides });
}

describe('parsePx / firstFamily', () => {
  it('parses px lengths and rejects non-px', () => {
    expect(parsePx('16px')).toBe(16);
    expect(parsePx('12.5px')).toBe(12.5);
    expect(parsePx('1rem')).toBeNull();
    expect(parsePx('')).toBeNull();
  });

  it('extracts the first concrete family from a stack', () => {
    expect(firstFamily('Inter, system-ui, sans-serif')).toBe('Inter');
    expect(firstFamily('"Source Serif 4", Georgia, serif')).toBe('Source Serif 4');
  });
});

describe('analyzeTypography (Sections 7.3/7.9)', () => {
  it('groups distinct styles and anchors the hierarchy to the most-used', () => {
    const samples = [
      // Dominant body style (16px, 400).
      textSample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      textSample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      textSample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      textSample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      // Large heading → h1.
      textSample({ fontFamily: 'Inter, sans-serif', fontSize: '32px', fontWeight: '700' }),
    ];
    const { typeStyles } = analyzeTypography(samples, []);
    const body = typeStyles.find((s) => s.role === 'body');
    const heading = typeStyles.find((s) => s.size === '32px');
    expect(body).toBeDefined();
    expect(body!.usageCount).toBe(4);
    expect(heading).toBeDefined();
    expect(heading!.role).toBe('h1');
    expect(heading!.confidence.level).toBe('inferred');
  });

  it('labels uppercase small text as label', () => {
    const samples = [
      textSample({
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        textTransform: 'uppercase',
        fontWeight: '600',
      }),
      textSample({
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        textTransform: 'uppercase',
        fontWeight: '600',
      }),
    ];
    const { typeStyles } = analyzeTypography(samples, []);
    const label = typeStyles.find((s) => s.role === 'label');
    expect(label).toBeDefined();
    expect(label!.confidence.basis).toMatch(/uppercase/);
  });

  it('ignores non-text containers (they would inflate usage and skew the anchor)', () => {
    const { typeStyles } = analyzeTypography(
      [
        sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
        sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
        sample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
        textSample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
      ],
      [],
    );
    const body = typeStyles.find((s) => s.role === 'body');
    expect(body).toBeDefined();
    expect(body!.usageCount).toBe(1);
  });

  it('merges same visual family with different fallback stacks into one style', () => {
    const { typeStyles } = analyzeTypography(
      [
        textSample({
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
        }),
        textSample({
          fontFamily: 'Inter, "Segoe UI", Roboto, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
        }),
        textSample({
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
        }),
      ],
      [],
    );
    const body = typeStyles.find((s) => s.role === 'body');
    expect(body).toBeDefined();
    expect(body!.usageCount).toBe(3);
    expect(body!.family).toBe('Inter');
  });

  it('collapses line-height variants into one style with the dominant representative', () => {
    const { typeStyles } = analyzeTypography(
      [
        textSample({
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '1.5',
        }),
        textSample({
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '1.5',
        }),
        textSample({
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '1.2',
        }),
      ],
      [],
    );
    const body = typeStyles.find((s) => s.role === 'body');
    expect(body).toBeDefined();
    expect(body!.usageCount).toBe(3);
    // Dominant variant wins the representative line-height.
    expect(body!.lineHeight).toBe('1.5');
  });

  it('drops single-use non-heading rows but keeps rare display text', () => {
    const { typeStyles } = analyzeTypography(
      [
        // Body anchor.
        textSample({ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '400' }),
        textSample({ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '400' }),
        // One-off 12px tweak → noise, dropped.
        textSample({ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '400' }),
        // Rare 48px display → kept (ratio ≥ 1.1).
        textSample({ fontFamily: 'Inter, sans-serif', fontSize: '48px', fontWeight: '700' }),
      ],
      [],
    );
    const sizes = typeStyles.map((s) => s.size);
    expect(sizes).toContain('14px');
    expect(sizes).toContain('48px');
    expect(sizes).not.toContain('12px');
  });

  it('prefers a prose-tagged style as body over a wall of tiny nav labels', () => {
    // 12px nav/label text dominates by count, but the 16px paragraphs are the
    // real body — the anchor must not promote them to a heading.
    const samples = [
      ...Array.from({ length: 12 }, () =>
        textSample({
          tag: 'span',
          fontFamily: 'Inter, sans-serif',
          fontSize: '12px',
          fontWeight: '500',
        }),
      ),
      ...Array.from({ length: 5 }, () =>
        textSample({
          tag: 'p',
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
        }),
      ),
    ];
    const { typeStyles } = analyzeTypography(samples, []);
    const body = typeStyles.find((s) => s.role === 'body');
    expect(body).toBeDefined();
    expect(body!.size).toBe('16px');
    // The 12px nav text is demoted to small/caption, never the body.
    const twelve = typeStyles.find((s) => s.size === '12px');
    expect(['small', 'caption']).toContain(twelve?.role);
  });

  it('anchors on the median size when all text is outside the 12–20px band', () => {
    const samples = [
      ...Array.from({ length: 10 }, () =>
        textSample({
          fontFamily: 'Inter, sans-serif',
          fontSize: '9.3px',
          fontWeight: '400',
          tag: 'td',
        }),
      ),
      ...Array.from({ length: 6 }, () =>
        textSample({
          fontFamily: 'Inter, sans-serif',
          fontSize: '13.3px',
          fontWeight: '400',
          tag: 'td',
        }),
      ),
    ];
    const { typeStyles } = analyzeTypography(samples, []);
    // Median of [9.3 ×10, 13.3 ×6] is 13.3 → body anchors there, 9.3 becomes
    // caption instead of the reverse.
    const body = typeStyles.find((s) => s.role === 'body');
    expect(body).toBeDefined();
    expect(body!.size).toBe('13.3px');
    expect(typeStyles.some((s) => s.size === '9.3px' && s.role === 'caption')).toBe(true);
  });

  it('emits one font token per family × weight with short family names', () => {
    const { fonts } = analyzeTypography(
      [
        textSample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '600' }),
        textSample({
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '16px',
          fontWeight: '600',
        }),
        textSample({ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' }),
        textSample({ fontFamily: 'Roboto, sans-serif', fontSize: '16px', fontWeight: '400' }),
      ],
      [{ family: 'Inter', source: 'google', weight: 600 }],
    );
    const inter600 = fonts.find((f) => f.value.family === 'Inter' && f.value.weight === 600);
    const inter400 = fonts.find((f) => f.value.family === 'Inter' && f.value.weight === 400);
    expect(inter600).toBeDefined();
    expect(inter600!.value.source).toBe('google');
    expect(inter600!.usageCount).toBe(2);
    expect(inter400).toBeDefined();
    expect(inter400!.usageCount).toBe(1);
    expect(fonts).toHaveLength(3);
  });
});
