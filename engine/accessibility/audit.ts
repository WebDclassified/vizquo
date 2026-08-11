/**
 * Accessibility audit (Section 7.13) — pure, worker-side.
 *
 * Runs on the A11ySample facts collected during the scan walk. Every finding
 * is anchored to the real element (ref) so the panel can highlight it. Values
 * the audit cannot determine (unparsable/transparent colors) are skipped, not
 * fabricated — law #5: "Unknown" beats a made-up pass or fail.
 *
 * Checks: text contrast (WCAG 2.x — 4.5:1 normal, 3:1 large), missing/empty
 * alt on <img>, empty links/buttons (no accessible name), unlabeled form
 * controls, skipped heading levels, aria-hidden on focusable elements, and
 * tabindex > 0 anti-pattern.
 */
import * as culori from 'culori';
import type { A11ySample, ElementRef, Finding } from '../../shared/types';

/** Contrast ratio floor: normal text (AA). */
const CONTRAST_NORMAL = 4.5;
/** Contrast ratio floor: large text (≥18.66px bold or ≥24px) — 3:1. */
const CONTRAST_LARGE = 3.0;
/** Only flag below this — small rounding margins don't warrant findings. */
const CONTRAST_FLOOR = 2.0;

/**
 * Parse a computed color; null when transparent or unparsable. Exported so
 * the contrast explorer can reuse the same parse the audit trusts.
 */
export function parseColor(value: string): { r: number; g: number; b: number } | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'rgba(0, 0, 0, 0)') return null;
  try {
    const parsed = culori.parse(trimmed);
    if (!parsed) return null;
    const rgb = culori.converter('rgb')(parsed);
    if (rgb.alpha != null && rgb.alpha < 1) return null; // translucent — can't know the backdrop
    // culori's rgb mode channels are 0..1; luminance math here expects 0..255.
    return { r: rgb.r * 255, g: rgb.g * 255, b: rgb.b * 255 };
  } catch {
    return null;
  }
}

/** WCAG relative luminance, 0..1 (sRGB linearization + weights). */
export function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

/** WCAG contrast ratio between two colors, 1..21. */
export function contrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Large text per WCAG: ≥24px, or ≥18.66px bold. */
export function isLargeText(fontSize: string, fontWeight: string): boolean {
  const px = Number.parseFloat(fontSize);
  if (!Number.isFinite(px)) return false;
  if (px >= 24) return true;
  const weight = Number.parseInt(fontWeight, 10);
  if (px >= 18.66 && (weight >= 700 || /bold/i.test(fontWeight))) return true;
  return false;
}

let counter = 0;
function finding(severity: Finding['severity'], message: string, element?: ElementRef): Finding {
  counter += 1;
  return { id: `a11y-${counter}`, category: 'accessibility', severity, message, element };
}

/** Has any accessible name: aria-label, aria-labelledby, wrapping label, label[for]. */
function hasName(sample: A11ySample): boolean {
  if (sample.ariaLabel?.trim()) return true;
  if (sample.ariaLabelledby?.trim()) return true;
  return sample.hasLabel;
}

/**
 * Audit the collected facts. Input order = DOM order, so heading-level
 * progression is checked as the elements actually appear.
 */
export function auditAccessibility(samples: A11ySample[]): Finding[] {
  counter = 0;
  const findings: Finding[] = [];
  const seenSelectors = new Set<string>();

  const push = (f: Finding): void => {
    const key = f.element ? `${f.element.selector}::${f.message}` : f.message;
    if (seenSelectors.has(key)) return;
    seenSelectors.add(key);
    findings.push(f);
  };

  let lastHeadingLevel = 0;

  for (const sample of samples) {
    // --- Contrast: text-bearing leaves only (parent text is duplicated). ---
    if (sample.text.length > 0) {
      const fg = parseColor(sample.color);
      const bg = parseColor(sample.backgroundColor);
      if (fg && bg) {
        const ratio = contrastRatio(fg, bg);
        const threshold = isLargeText(sample.fontSize, sample.fontWeight)
          ? CONTRAST_LARGE
          : CONTRAST_NORMAL;
        if (ratio < threshold && ratio >= CONTRAST_FLOOR) {
          push(
            finding(
              ratio < threshold * 0.6 ? 'error' : 'warning',
              `Text contrast ${ratio.toFixed(2)}:1 is below the WCAG AA ${threshold.toFixed(1)}:1 minimum (${sample.tag}, ${sample.fontSize || '?px'}).`,
              sample.ref,
            ),
          );
        } else if (ratio < CONTRAST_FLOOR) {
          push(
            finding(
              'error',
              `Text contrast ${ratio.toFixed(2)}:1 is critically low (${sample.tag}).`,
              sample.ref,
            ),
          );
        }
      }
      // Skipped when either color is unparsable — never a fabricated pass.
    }

    // --- <img> alt. ---
    if (sample.tag === 'img') {
      const isDecorative =
        sample.role === 'presentation' || sample.role === 'none' || sample.ariaHidden === 'true';
      if (isDecorative) continue;
      if (sample.alt === undefined) {
        push(
          finding(
            'error',
            'Image has no alt attribute — screen readers announce the filename or nothing.',
            sample.ref,
          ),
        );
      } else if (sample.alt.trim() === '') {
        push(
          finding(
            'info',
            'Image is marked decorative (alt="") — confirm it adds no information.',
            sample.ref,
          ),
        );
      }
      continue;
    }

    // --- Links and buttons must have an accessible name. ---
    if (sample.isLink && !hasName(sample) && !sample.text.trim()) {
      push(
        finding(
          'warning',
          "Link with no accessible name — screen reader users don't know where it goes.",
          sample.ref,
        ),
      );
    }
    if (sample.isButton && !hasName(sample) && !sample.text.trim()) {
      push(
        finding('warning', 'Button with no accessible name — add text or aria-label.', sample.ref),
      );
    }

    // --- Form controls need a label (placeholder is not a label). ---
    if (sample.isFormControl && sample.tag !== 'button') {
      const named = hasName(sample) || sample.text.trim().length > 0;
      if (!named && sample.placeholder) {
        push(
          finding(
            'warning',
            `Form control uses only a placeholder ("${sample.placeholder}") — it disappears when typing and isn't a label.`,
            sample.ref,
          ),
        );
      } else if (!named) {
        push(
          finding(
            'error',
            'Form control has no label — associate one with <label for>, aria-label, or aria-labelledby.',
            sample.ref,
          ),
        );
      }
    }

    // --- Heading order. ---
    if (sample.headingLevel > 0) {
      if (lastHeadingLevel > 0 && sample.headingLevel > lastHeadingLevel + 1) {
        push(
          finding(
            'warning',
            `Heading order skips from h${lastHeadingLevel} to h${sample.headingLevel} — screen reader users miss structure.`,
            sample.ref,
          ),
        );
      }
      lastHeadingLevel = sample.headingLevel;
    }

    // --- aria-hidden on a focusable element hides it from everyone. ---
    if (sample.ariaHidden === 'true' && sample.tabIndex >= 0) {
      push(
        finding(
          'error',
          'aria-hidden="true" on a focusable element — keyboard users can focus it but screen readers can\'t see it.',
          sample.ref,
        ),
      );
    }

    // --- tabindex > 0 breaks the natural tab order. ---
    if (sample.tabIndex > 0) {
      push(
        finding(
          'warning',
          `tabindex="${sample.tabIndex}" places this element ahead of the natural order — prefer source order.`,
          sample.ref,
        ),
      );
    }
  }

  return findings;
}
