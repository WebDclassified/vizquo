import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor } from '../engine/accessibility/audit';
import { contrastVerdicts } from '../engine/accessibility/contrast-verdicts';

describe('contrastVerdicts', () => {
  it('labels the canonical black/white pair as passing everything', () => {
    const v = contrastVerdicts(21);
    expect(v).toEqual({
      aaNormal: true,
      aaLarge: true,
      aaaNormal: true,
      aaaLarge: true,
    });
  });

  it('marks 4.5:1 as AA normal + AAA large, but not AAA normal', () => {
    const v = contrastVerdicts(4.5);
    expect(v.aaNormal).toBe(true);
    expect(v.aaLarge).toBe(true);
    expect(v.aaaNormal).toBe(false);
    expect(v.aaaLarge).toBe(true);
  });

  it('marks 3:1 as large-text AA only', () => {
    const v = contrastVerdicts(3.0);
    expect(v.aaNormal).toBe(false);
    expect(v.aaLarge).toBe(true);
    expect(v.aaaNormal).toBe(false);
    expect(v.aaaLarge).toBe(false);
  });

  it('fails everything at 1:1', () => {
    const v = contrastVerdicts(1);
    expect(v.aaNormal).toBe(false);
    expect(v.aaaLarge).toBe(false);
  });

  it('matches the audit math for a real pair (same-color 1:1, near-duplicate ~1.01)', () => {
    // Same color on itself.
    const same = parseColor('#6e7bff');
    const sameRatio = same ? contrastRatio(same, same) : 0;
    expect(sameRatio).toBe(1);
    expect(contrastVerdicts(sameRatio).aaNormal).toBe(false);
    // A slightly darker sibling is still far from 4.5:1.
    const fg = parseColor('#6e7bff');
    const bg = parseColor('#7c86ff');
    const ratio = fg && bg ? contrastRatio(fg, bg) : 0;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(4.5);
    expect(contrastVerdicts(ratio).aaNormal).toBe(false);
  });
});
