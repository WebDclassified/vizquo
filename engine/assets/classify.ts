/**
 * Asset intelligence (Section 7.10) — pure, worker-side. Every asset is
 * classified into a role (logo / hero / product-image / icon / avatar /
 * illustration / decoration / background / screenshot) with a confidence
 * label, and potential issues are flagged (oversized, low-resolution source,
 * large file, wrong format) — flagged, never asserted as a fix.
 *
 * Classifications are pattern-based, hence always `inferred` (law #2), with a
 * human-readable basis. Issues are `derived` from observed dimensions.
 */
import type { Asset, AssetSample, Confidence } from '../../shared/types';

/** Bytes above which a raster is considered a large file. */
const LARGE_FILE_BYTES = 300_000;
/** Rendered px above which we judge image quality (small icons are exempt). */
const QUALITY_FLOOR = 120;

export type AssetRole =
  | 'logo'
  | 'hero'
  | 'product-image'
  | 'icon'
  | 'avatar'
  | 'illustration'
  | 'decoration'
  | 'background'
  | 'screenshot'
  | 'unknown';

interface Classified {
  label: string;
  confidence: Confidence;
}

function inferred(label: AssetRole, basis: string, score: number): Classified {
  return { label, confidence: { level: 'inferred', score: Math.min(0.95, score), basis } };
}

const LOGO_HINTS = /(^|[-_])(logo|brand|wordmark|mark)([-_]|$)/i;
const ICON_HINTS = /(^|[-_])(icon|ic|glyph)([-_]|$)|\.svg$/i;
const AVATAR_HINTS = /(^|[-_])(avatar|profile|portrait|face|pfp)([-_]|$)/i;
const HERO_HINTS = /(^|[-_])(hero|banner|cover|header|og|opengraph)([-_]|$)/i;
const SCREENSHOT_HINTS = /(^|[-_])(screenshot|shot|snap)([-_]|$)/i;
const PRODUCT_HINTS = /(^|[-_])(product|item|tile|card|thumb|thumbnail)([-_]|$)/i;

function filenameHints(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split('/').pop() ?? '');
  } catch {
    return '';
  }
}

/** Classify one asset. Pure: same sample, same classification. */
export function classifyAsset(sample: AssetSample): Classified {
  const name = filenameHints(sample.url);
  const [nw, nh] = sample.naturalDims ?? [undefined, undefined];
  const [rw, rh] = sample.renderedDims ?? [undefined, undefined];
  const width = Math.max(nw ?? rw ?? 0, rw ?? nw ?? 0) || 0;
  const height = Math.max(nh ?? rh ?? 0, rh ?? nh ?? 0) || 0;
  const isSvg = sample.type === 'svg';
  const isSmall = width > 0 && width <= 96 && height > 0 && height <= 96;
  const isTiny = width > 0 && width <= 32 && height > 0 && height <= 32;

  // 1. Source-based roles are near-certain.
  if (sample.source === 'css-background') {
    return inferred(
      'background',
      `used as a CSS background-image${width > 0 ? ` at ${width}×${height}px` : ''}`,
      isSmall ? 0.6 : 0.85,
    );
  }
  if (sample.source === 'favicon') return inferred('logo', 'the page favicon', 0.9);
  if (sample.source === 'og-image') return inferred('hero', 'the Open Graph share image', 0.9);

  // 2. Filename hints (strong signal on real sites).
  if (SCREENSHOT_HINTS.test(name)) {
    return inferred('screenshot', `filename suggests a screenshot (${name})`, 0.8);
  }
  if (AVATAR_HINTS.test(name)) {
    return inferred('avatar', `filename suggests an avatar (${name})`, 0.8);
  }
  if (LOGO_HINTS.test(name)) {
    return inferred('logo', `filename suggests a logo (${name})`, 0.8);
  }
  if (ICON_HINTS.test(name) || (isSvg && isSmall)) {
    return inferred(
      'icon',
      `small ${isSvg ? 'SVG' : 'image'} (${width}×${height}px)${name ? ` named ${name}` : ''}`,
      0.75,
    );
  }
  if (HERO_HINTS.test(name)) {
    return inferred('hero', `filename suggests a hero (${name})`, 0.75);
  }
  if (PRODUCT_HINTS.test(name)) {
    return inferred('product-image', `filename suggests a product shot (${name})`, 0.7);
  }

  // 3. Shape-based classification.
  if (isTiny) return inferred('icon', `tiny asset (${width}×${height}px)`, 0.6);
  if (isSvg) {
    const pathCount = sample.svg?.pathCount ?? 0;
    if (width === 0 && height === 0) {
      return inferred('illustration', 'an inline SVG without intrinsic dimensions', 0.5);
    }
    if (pathCount >= 12) {
      return inferred('illustration', `SVG with ${pathCount} paths`, 0.65);
    }
    return inferred('logo', `SVG with ${pathCount} paths`, 0.55);
  }
  const aspect = width > 0 && height > 0 ? width / height : 0;
  if (width >= 800 && aspect >= 1.8) {
    return inferred('hero', `wide image (${width}×${height}px)`, 0.7);
  }
  if (width >= 400 && height >= 300) {
    return inferred('hero', `large image (${width}×${height}px)`, 0.55);
  }
  if (width > 0 && height > 0 && !isSmall && Math.abs(aspect - 1) <= 0.15) {
    return inferred('avatar', `square, non-tiny image (${width}×${height}px)`, 0.4);
  }
  return {
    label: 'unknown',
    confidence: { level: 'inferred', score: 0.3, basis: 'no strong signal' },
  };
}

export type AssetIssue = NonNullable<Asset['issues']>[number];

export interface ClassifiedAsset extends AssetSample {
  classification: Classified;
  issues: AssetIssue[];
}

/**
 * Classify an asset and flag issues. Oversized = natural ≫ rendered (the page
 * is shipping far more pixels than it displays); low-res = rendered exceeds
 * natural (the source is smaller than what is shown); large-file = payload
 * estimate over a threshold; wrong-format = raster served where a vector or
 * modern format would fit (flagged, never asserted).
 */
export function analyzeAsset(sample: AssetSample): ClassifiedAsset {
  const classification = classifyAsset(sample);
  const issues: AssetIssue[] = [];
  const [nw, nh] = sample.naturalDims ?? [undefined, undefined];
  const [rw, rh] = sample.renderedDims ?? [undefined, undefined];

  if (
    nw != null &&
    nh != null &&
    rw != null &&
    rh != null &&
    rw >= QUALITY_FLOOR &&
    nw >= rw * 2 &&
    nh >= rh * 2
  ) {
    issues.push({
      kind: 'oversized',
      message: `Natural size (${nw}×${nh}) is at least 2× the rendered size (${rw}×${rh}) — the page may be shipping excess pixels.`,
    });
  }
  if (
    nw != null &&
    nh != null &&
    rw != null &&
    rh != null &&
    rw > nw * 1.5 &&
    rh > nh * 1.5 &&
    rw >= QUALITY_FLOOR
  ) {
    issues.push({
      kind: 'low-res',
      message: `Rendered at ${rw}×${rh} from a ${nw}×${nh} source — the image may look soft.`,
    });
  }
  if (sample.fileSize != null && sample.fileSize > LARGE_FILE_BYTES) {
    issues.push({
      kind: 'large-file',
      message: `~${(sample.fileSize / 1024).toFixed(0)} KB payload — large for a ${sample.type} asset.`,
    });
  }
  if (
    sample.type === 'image' &&
    sample.fileSize != null &&
    sample.fileSize > LARGE_FILE_BYTES * 2
  ) {
    const name = filenameHints(sample.url);
    const isScreenshotLike = SCREENSHOT_HINTS.test(name);
    if (!isScreenshotLike) {
      issues.push({
        kind: 'wrong-format',
        message:
          'Large raster payload — a compressed or vector format may fit better (not asserted).',
      });
    }
  }

  return { ...sample, classification, issues };
}

/** Classify every sample into full Assets (used by the worker; memoized). */
export function analyzeAssets(samples: AssetSample[]): Asset[] {
  return samples.map((sample) => {
    const { classification, issues, ...rest } = analyzeAsset(sample);
    return { ...rest, classification, issues } as Asset;
  });
}
