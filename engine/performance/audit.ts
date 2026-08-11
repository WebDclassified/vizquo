/**
 * Performance audit (Section 7.13) — pure, worker-side.
 *
 * Flags the observable, real signals: images without reserved dimensions
 * (layout shift), many eager-loaded images, oversized/low-res assets (from
 * the Phase 4 asset issues), very large DOMs, and animation counts. Every
 * finding is a flag with the observed basis, never an asserted fix.
 */
import type { A11ySample, Asset, ElementRef, Finding } from '../../shared/types';

/** Images beyond this without width/height attributes → CLS risk worth noting. */
const CLS_IMAGE_WARN = 3;
/** Images loaded eagerly beyond this → defer-below-fold note. */
const EAGER_IMAGE_WARN = 8;
/** DOM node count beyond this → paint/compositing pressure note. */
const DOM_NODE_WARN = 3000;
/** Running/fading animations beyond this → battery + jank note. */
const ANIMATION_WARN = 12;

let counter = 0;
function finding(severity: Finding['severity'], message: string, element?: ElementRef): Finding {
  counter += 1;
  return { id: `perf-${counter}`, category: 'performance', severity, message, element };
}

export interface PerformanceAuditInput {
  /** A11y facts (img dims/lazy state). */
  a11y: A11ySample[];
  /** Classified assets (oversized/low-res/large-file issues). */
  assets: Asset[];
  elementCount: number;
  animationCount: number;
  transitionCount: number;
}

/** Audit the page's performance-relevant signals. */
export function auditPerformance(input: PerformanceAuditInput): Finding[] {
  counter = 0;
  const findings: Finding[] = [];
  const { a11y, assets, elementCount, animationCount, transitionCount } = input;

  const imgs = a11y.filter((s) => s.tag === 'img');
  const missingDims = imgs.filter((s) => !s.hasDimsAttrs);
  if (missingDims.length >= CLS_IMAGE_WARN) {
    findings.push(
      finding(
        'warning',
        `${missingDims.length} images have no width/height attributes — the layout can shift when they load.`,
        missingDims[0]?.ref,
      ),
    );
  }

  const eager = imgs.filter((s) => s.loading !== 'lazy');
  if (eager.length >= EAGER_IMAGE_WARN) {
    findings.push(
      finding(
        'info',
        `${eager.length} images load eagerly — adding loading="lazy" below the fold defers fetch until needed.`,
        eager[0]?.ref,
      ),
    );
  }

  // Reuse the Phase 4 asset issues — flagged once, not asserted.
  for (const asset of assets) {
    for (const issue of asset.issues ?? []) {
      findings.push(
        finding(issue.kind === 'large-file' ? 'warning' : 'info', issue.message, asset.ref),
      );
    }
  }

  if (elementCount > DOM_NODE_WARN) {
    findings.push(
      finding(
        'warning',
        `${elementCount.toLocaleString()} elements in the DOM — interactivity and paint can suffer on low-end devices.`,
      ),
    );
  }

  if (animationCount > ANIMATION_WARN) {
    findings.push(
      finding(
        'info',
        `${animationCount} animated elements and ${transitionCount} transitions — heavy continuous animation can drain battery on mobile.`,
      ),
    );
  }

  return findings;
}
