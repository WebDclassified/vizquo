/**
 * Find Instances (Section 7.8) — pure matcher over the scan snapshot. Every
 * extracted value (color, font, spacing, radius, shadow, gradient) can be
 * traced back to every element that uses it; the panel triggers this from a
 * token card and the content script highlights the returned refs.
 */
import type { ElementRef, ElementSample, FindInstancesKind } from '../../shared/types';
import { normalizeColorValue, oklchDistanceBetween } from './color';
import { normalizeGradient, normalizeShadow, splitShadows } from './scales';
import { firstFamily, parsePx } from './typography';

// OKLCH ΔE (L 0–1): near-duplicates ~0.01–0.04, black vs white ~1.0.
const COLOR_MATCH_THRESHOLD = 0.04;

export function matchInstances(
  samples: ElementSample[],
  kind: FindInstancesKind,
  value: string,
): { refs: ElementRef[]; count: number } {
  const refs: ElementRef[] = [];
  const seen = new Set<string>();

  const push = (sample: ElementSample): void => {
    const key = sample.ref.domPath.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(sample.ref);
  };

  switch (kind) {
    case 'color': {
      const target = normalizeColorValue(value);
      if (!target) return { refs, count: 0 };
      for (const sample of samples) {
        for (const candidate of [sample.color, sample.backgroundColor, sample.borderColor]) {
          if (!candidate) continue;
          const norm = normalizeColorValue(candidate);
          if (!norm) continue;
          if (
            norm.hex === target.hex ||
            oklchDistanceBetween(norm, target) <= COLOR_MATCH_THRESHOLD
          ) {
            push(sample);
            break;
          }
        }
      }
      break;
    }
    case 'font': {
      const family = value
        .trim()
        .toLowerCase()
        .replace(/^['"]|['"]$/g, '');
      for (const sample of samples) {
        if (firstFamily(sample.fontFamily).toLowerCase() === family) push(sample);
      }
      break;
    }
    case 'spacing':
    case 'radius': {
      const target = parsePx(value);
      if (target == null) return { refs, count: 0 };
      for (const sample of samples) {
        const raw =
          kind === 'spacing'
            ? `${sample.margin} ${sample.padding} ${sample.gap}`
            : sample.borderRadius;
        if (
          raw?.split(/\s+/).some((part) => {
            const n = parsePx(part);
            return n != null && Math.abs(n - target) < 0.5;
          })
        ) {
          push(sample);
        }
      }
      break;
    }
    case 'shadow': {
      const target = normalizeShadow(value);
      if (!target) return { refs, count: 0 };
      for (const sample of samples) {
        if (!sample.boxShadow || sample.boxShadow === 'none') continue;
        // A sample may stack several shadows; match any of them (the token
        // itself was created from one split shadow in analyzeScales).
        const matches = splitShadows(sample.boxShadow).some(
          (part) => normalizeShadow(part) === target,
        );
        if (matches) push(sample);
      }
      break;
    }
    case 'gradient': {
      const target = normalizeGradient(value);
      if (!target) return { refs, count: 0 };
      for (const sample of samples) {
        if (normalizeGradient(sample.backgroundImage) === target) push(sample);
      }
      break;
    }
    default:
      break;
  }
  return { refs, count: refs.length };
}
