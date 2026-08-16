/**
 * Design Consistency score (Sections 7.2/7.12) — pure, derived. Every term in
 * the formula is documented below; the score is a derived value (law #2), not
 * a ground-truth measurement.
 *
 * Score = 100 − penalties:
 *   spacing on-scale ratio     (values within 2px of the detected scale)  ≤ 15
 *   radius on-scale ratio                                                  ≤ 10
 *   distinct text styles beyond 8, 2 pts each                              ≤ 20
 *   distinct font families beyond 3, 5 pts each                           ≤ 15
 *   distinct color clusters beyond 12, 1.5 pts each                       ≤ 15
 */
import type {
  ColorToken,
  ConsistencyResult,
  Finding,
  FontToken,
  Token,
  TypeStyleUsage,
} from '../../shared/types';

export const IDEAL_STYLE_COUNT = 8;
export const IDEAL_FONT_COUNT = 3;
export const IDEAL_COLOR_COUNT = 12;

export function computeConsistency(input: {
  colors: ColorToken[];
  typeStyles: TypeStyleUsage[];
  fonts: FontToken[];
  spacing: Token<number>[];
  radius: Token<number>[];
  spacingScale: { value: number; frequency: number; onScale: boolean }[];
  /** Outlier findings produced by the scale detector. */
  scaleOutliers: Finding[];
}): ConsistencyResult {
  const { colors, typeStyles, fonts, spacing, radius, spacingScale, scaleOutliers } = input;

  const totalSpacing = spacing.reduce((acc, t) => acc + t.usageCount, 0);
  const onScaleSpacing = spacingScale.reduce((acc, step) => acc + step.frequency, 0);
  const spacingRatio = totalSpacing > 0 ? onScaleSpacing / totalSpacing : 1;
  const totalRadius = radius.reduce((acc, t) => acc + t.usageCount, 0);
  const radiusStepCount = new Set(radius.map((t) => t.value)).size;
  // Radius is naturally sparse (2–3 values per site); a ratio-based penalty is
  // too harsh, so count only clearly off-scale patterns instead.
  const radiusPenalty =
    radius.filter((t) => t.usageCount >= 3 && totalRadius > 0 && radiusStepCount > 8).length * 1.5;

  let score = 100;
  score -= (1 - spacingRatio) * 15;
  score -= Math.min(10, radiusPenalty);
  score -= Math.max(0, typeStyles.length - IDEAL_STYLE_COUNT) * 2;
  score -= Math.max(0, fonts.length - IDEAL_FONT_COUNT) * 5;
  score -= Math.max(0, colors.length - IDEAL_COLOR_COUNT) * 1.5;
  // Defensive: a malformed input (e.g. a non-finite usage count from an old
  // cached scan) must degrade to a sane number, never NaN — the UI ring would
  // otherwise render stroke-dasharray="NaN 360".
  score = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;

  const findings: Finding[] = [...scaleOutliers];
  if (fonts.length > IDEAL_FONT_COUNT) {
    findings.push({
      id: 'consistency-fonts',
      category: 'consistency',
      severity: 'warning',
      message: `${fonts.length} distinct font families in use (${fonts
        .map((f) => f.value.family)
        .join(', ')}). Consider consolidating to ${IDEAL_FONT_COUNT} or fewer.`,
    });
  }
  if (typeStyles.length > IDEAL_STYLE_COUNT + 4) {
    findings.push({
      id: 'consistency-type-styles',
      category: 'consistency',
      severity: 'warning',
      message: `${typeStyles.length} distinct text styles detected — above the ${IDEAL_STYLE_COUNT} the hierarchy model expects.`,
    });
  }
  if (colors.length > IDEAL_COLOR_COUNT + 4) {
    findings.push({
      id: 'consistency-colors',
      category: 'consistency',
      severity: 'info',
      message: `${colors.length} color clusters detected. Consider trimming to a tighter palette.`,
    });
  }
  if (spacingRatio < 0.85 && totalSpacing > 0) {
    findings.push({
      id: 'consistency-spacing',
      category: 'consistency',
      severity: 'warning',
      message: `${Math.round((1 - spacingRatio) * 100)}% of spacing values fall outside the detected scale — spacing may be inconsistent.`,
    });
  }
  findings.sort((a, b) =>
    a.severity === b.severity
      ? 0
      : a.severity === 'error'
        ? -1
        : b.severity === 'error'
          ? 1
          : a.severity === 'warning'
            ? -1
            : 1,
  );

  return { score, findings };
}
