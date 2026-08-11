/**
 * Variable helpers (Phase 9 power-ups) — match a computed value back to the
 * CSS variable that produces it, so the UI can offer "copy var(--name)"
 * instead of a literal. Pure and unit-tested; used by the color and font
 * token rows in the Design panel.
 */
import * as culori from 'culori';
import type { CssVariableInfo } from '../../shared/types';

/** Strip a leading `--` if present (the scan may store either shape). */
function cleanName(name: string): string {
  return name.trim().replace(/^--/, '');
}

/**
 * Normalize a value for comparison. Colors are parsed through culori so
 * `rgb(110, 123, 255)` matches `#6e7bff` (declared vs computed shapes);
 * everything else gets `!important` stripped and whitespace collapsed.
 */
function comparisonKey(value: string): string {
  const cleaned = value
    .trim()
    .replace(/\s*!important\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',');
  try {
    const parsed = culori.parse(cleaned);
    if (parsed) {
      const rgb = culori.converter('rgb')(parsed);
      // Keep semi-transparent colors distinct (same rule as the audit).
      return rgb.alpha != null && rgb.alpha < 1
        ? (culori.formatHex8(rgb) ?? cleaned)
        : (culori.formatHex(rgb) ?? cleaned);
    }
  } catch {
    // Not a color — fall through to string comparison.
  }
  return cleaned.toLowerCase();
}

/**
 * The `var(--name)` reference for the first variable whose resolved value
 * equals `value` (normalized), or null when nothing matches. The returned
 * string is always a usable CSS reference (`--`-prefixed).
 */
export function findVariableForValue(variables: CssVariableInfo[], value: string): string | null {
  const target = comparisonKey(value);
  if (!target) return null;
  for (const variable of variables) {
    if (comparisonKey(variable.value) === target) {
      return `--${cleanName(variable.name)}`;
    }
  }
  return null;
}
