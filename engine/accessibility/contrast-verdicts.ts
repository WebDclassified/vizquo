/**
 * Contrast verdicts (Phase 9 power-up) — the WCAG AA/AAA thresholds applied
 * to a single ratio, so the contrast explorer can label a pair of colors
 * without duplicating audit logic. Pure and unit-tested.
 */

export interface ContrastVerdicts {
  /** 4.5:1 — normal text AA. */
  aaNormal: boolean;
  /** 3:1 — large text AA. */
  aaLarge: boolean;
  /** 7:1 — normal text AAA. */
  aaaNormal: boolean;
  /** 4.5:1 — large text AAA. */
  aaaLarge: boolean;
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const AAA_NORMAL = 7.0;

/** Label verdicts for a ratio (1..21). Thresholds match the a11y audit. */
export function contrastVerdicts(ratio: number): ContrastVerdicts {
  return {
    aaNormal: ratio >= AA_NORMAL,
    aaLarge: ratio >= AA_LARGE,
    aaaNormal: ratio >= AAA_NORMAL,
    aaaLarge: ratio >= AA_NORMAL,
  };
}
