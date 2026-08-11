/**
 * Asset extraction (Section 7.10) — runs in the content script where the live
 * DOM and computed styles are available.
 *
 * Detects: <img> (incl. srcset/currentSrc), <picture>/<source>, CSS
 * background-image url()s, inline <svg>, SVG <use> sprites, <video>/<audio>,
 * Lottie players, favicons, and Open Graph images. Every asset becomes a
 * serializable AssetSample the analysis worker classifies (pure).
 *
 * Bounded & honest: the DOM is queried once with caps (MAX_ASSETS); pages
 * with more assets are marked truncated in the snapshot. Cross-origin or
 * blocked resources surface as samples with whatever metadata is readable —
 * nothing is silently dropped.
 */
import type { AssetSample, AssetType, ElementRef, SvgInfo } from '../../shared/types';
import { makeRef } from '../dom/ref';

/** Hard cap on extracted assets — beyond this the snapshot reports truncation. */
export const MAX_ASSETS = 500;
/** Inline SVG content is bounded; larger sheets are truncated in the sample. */
const MAX_SVG_CONTENT = 60_000;
/** Distinct fill/stroke/class/id values kept per SVG. */
const MAX_SVG_COLLECT = 40;

/** CSS custom property readers use — extracted backgrounds come from samples. */

export interface ExtractAssetsOptions {
  /** Element samples already collected by the scan (backgrounds come from here). */
  backgroundSamples?: { backgroundImage: string; ref: ElementRef }[];
}

function absoluteUrl(raw: string): string | null {
  try {
    return new URL(raw, window.location.href).href;
  } catch {
    return null;
  }
}

/** UTF-8-safe base64: btoa throws on non-Latin1 characters (accents, emoji). */
function utf8Base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Parse url(...) tokens out of a computed background-image value. */
export function backgroundUrls(value: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*(?:['"]?)([^'")]+)(?:['"]?)\s*\)/g;
  let match = re.exec(value);
  while (match !== null) {
    const url = match[1];
    if (url && !url.startsWith('data:')) out.push(url);
    match = re.exec(value);
  }
  return out;
}

function dimsOf(
  el: HTMLElement | SVGSVGElement,
  naturalWidth?: number,
  naturalHeight?: number,
): {
  naturalDims?: [number, number];
  renderedDims?: [number, number];
} {
  const rect = el.getBoundingClientRect();
  let rendered =
    rect.width > 0 || rect.height > 0
      ? [Math.round(rect.width), Math.round(rect.height)]
      : undefined;
  // Before layout (or for unloaded elements) the rect is 0×0 — fall back to
  // the width/height attributes, which still describe the intended size.
  if (!rendered) {
    const aw = Number.parseInt(el.getAttribute('width') ?? '', 10);
    const ah = Number.parseInt(el.getAttribute('height') ?? '', 10);
    if (aw > 0 || ah > 0) rendered = [aw || 0, ah || 0];
  }
  const natural =
    naturalWidth != null && naturalHeight != null && (naturalWidth > 0 || naturalHeight > 0)
      ? [naturalWidth, naturalHeight]
      : undefined;
  return {
    naturalDims: natural as [number, number] | undefined,
    renderedDims: rendered as [number, number] | undefined,
  };
}

let idCounter = 0;
function nextId(type: AssetType): string {
  idCounter += 1;
  return `${type}-${idCounter}`;
}

function refOf(el: Element): ElementRef {
  return makeRef(el);
}

/** Structural summary of an inline SVG for the inspector. */
export function summarizeSvg(svg: SVGSVGElement): SvgInfo {
  const paths = Array.from(svg.querySelectorAll('path'));
  const fills = new Set<string>();
  const strokes = new Set<string>();
  const ids: string[] = [];
  const classes = new Set<string>();
  for (const el of Array.from(svg.querySelectorAll('*'))) {
    const fill = el.getAttribute('fill');
    if (fill && fill !== 'none') fills.add(fill);
    const stroke = el.getAttribute('stroke');
    if (stroke && stroke !== 'none') strokes.add(stroke);
    const id = el.id;
    if (id) ids.push(id);
    for (const cls of el.classList) classes.add(cls);
  }
  return {
    viewBox: svg.getAttribute('viewBox') ?? undefined,
    width: svg.getAttribute('width') ?? undefined,
    height: svg.getAttribute('height') ?? undefined,
    pathCount: paths.length,
    fillColors: [...fills].slice(0, MAX_SVG_COLLECT),
    strokeColors: [...strokes].slice(0, MAX_SVG_COLLECT),
    ids: ids.slice(0, MAX_SVG_COLLECT),
    classes: [...classes].slice(0, MAX_SVG_COLLECT),
    content: svg.outerHTML.slice(0, MAX_SVG_CONTENT),
  };
}

/**
 * Walk the document once and collect every extractable asset. Call from the
 * content script (needs window). `backgroundSamples` is the scan's element
 * samples — CSS backgrounds are read from their computed values, never by a
 * second getComputedStyle pass.
 */
export function extractAssets(
  doc: Document = document,
  opts: ExtractAssetsOptions = {},
): {
  assets: AssetSample[];
  truncated: boolean;
} {
  const assets: AssetSample[] = [];
  let truncated = false;

  const push = (asset: Omit<AssetSample, 'id'>): boolean => {
    if (!asset.url) return true;
    if (assets.length >= MAX_ASSETS) {
      truncated = true;
      return false;
    }
    // Dedupe identical absolute URLs (a srcset candidate often equals src).
    if (assets.some((a) => a.url === asset.url)) return true;
    assets.push({ ...asset, id: nextId(asset.type) });
    return true;
  };

  // --- <img> (incl. lazy loading, natural dims, alt, srcset) -------------
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img'))) {
    const url = absoluteUrl(img.currentSrc || img.src);
    if (!url) continue;
    const srcset = parseSrcset(img.srcset, window.location.href);
    const { naturalDims, renderedDims } = dimsOf(
      img,
      img.naturalWidth || undefined,
      img.naturalHeight || undefined,
    );
    push({
      type: 'image',
      url,
      source: 'img',
      naturalDims,
      renderedDims,
      alt: img.alt || undefined,
      loading: (img.loading as 'eager' | 'lazy') || undefined,
      srcset,
      ref: refOf(img),
    });
  }

  // --- <picture>/<source> srcset candidates ------------------------------
  for (const source of Array.from(doc.querySelectorAll<HTMLSourceElement>('picture > source'))) {
    if (!source.srcset) continue;
    for (const candidate of parseSrcset(source.srcset, window.location.href)) {
      push({ type: 'image', url: candidate, source: 'picture', ref: refOf(source) });
    }
  }

  // --- Inline <svg> -------------------------------------------------------
  for (const svg of Array.from(doc.querySelectorAll<SVGSVGElement>('svg'))) {
    const url = `data:image/svg+xml;base64,${utf8Base64(svg.outerHTML)}`;
    const summary = summarizeSvg(svg);
    const { renderedDims } = dimsOf(svg);
    push({
      type: 'svg',
      url,
      source: 'inline-svg',
      svg: summary,
      renderedDims,
      ref: refOf(svg),
    });
  }

  // --- SVG <use> sprites (external symbol libraries) ----------------------
  for (const use of Array.from(doc.querySelectorAll<SVGUseElement>('use'))) {
    const href = use.getAttribute('href') ?? use.getAttribute('xlink:href');
    if (!href || href.startsWith('#')) continue;
    const url = absoluteUrl(href.split('#')[0] ?? '');
    if (!url) continue;
    push({ type: 'svg', url, source: 'svg-use', ref: refOf(use) });
  }

  // --- <video>/<audio> ----------------------------------------------------
  for (const video of Array.from(doc.querySelectorAll<HTMLVideoElement>('video'))) {
    const url = absoluteUrl(video.currentSrc || video.src);
    if (url) {
      const { naturalDims, renderedDims } = dimsOf(
        video,
        video.videoWidth || undefined,
        video.videoHeight || undefined,
      );
      push({ type: 'video', url, source: 'video', ref: refOf(video), naturalDims, renderedDims });
    }
    // getAttribute over .poster: the reflected property is not implemented in
    // every DOM runtime, the attribute is the source of truth.
    const poster = absoluteUrl(video.getAttribute('poster') ?? '');
    if (poster) push({ type: 'image', url: poster, source: 'video', ref: refOf(video) });
  }
  for (const audio of Array.from(doc.querySelectorAll<HTMLAudioElement>('audio'))) {
    const url = absoluteUrl(audio.currentSrc || audio.src);
    if (url) push({ type: 'audio', url, source: 'audio', ref: refOf(audio) });
  }

  // --- Lottie players (custom elements, detectable without executing JS) ---
  for (const el of Array.from(
    doc.querySelectorAll<HTMLElement>('lottie-player, dotlottie-player, [data-lottie]'),
  )) {
    const src = el.getAttribute('src') ?? el.getAttribute('data-src');
    const url = src ? absoluteUrl(src) : null;
    if (url) push({ type: 'lottie', url, source: 'lottie', ref: refOf(el) });
  }

  // --- Favicon -------------------------------------------------------------
  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))) {
    const url = absoluteUrl(link.href);
    if (url) push({ type: 'image', url, source: 'favicon', ref: refOf(link) });
  }

  // --- Open Graph image ----------------------------------------------------
  for (const meta of Array.from(
    doc.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="og:image"]'),
  )) {
    const url = absoluteUrl(meta.content);
    if (url) push({ type: 'image', url, source: 'og-image', ref: refOf(meta) });
  }

  // --- CSS backgrounds (from the scan's computed samples — L1 cache) ------
  const seenBackgrounds = new Set<string>();
  for (const sample of opts.backgroundSamples ?? []) {
    for (const raw of backgroundUrls(sample.backgroundImage)) {
      const url = absoluteUrl(raw);
      if (!url || seenBackgrounds.has(url)) continue;
      seenBackgrounds.add(url);
      if (!push({ type: 'image', url, source: 'css-background', ref: sample.ref })) break;
    }
    if (truncated) break;
  }

  return { assets, truncated };
}

/** Parse a srcset attribute into absolute candidate URLs (deduped). */
export function parseSrcset(srcset: string, base: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of srcset.split(',')) {
    const url = part.trim().split(/\s+/)[0];
    if (!url) continue;
    try {
      const absolute = new URL(url, base).href;
      if (!seen.has(absolute)) {
        seen.add(absolute);
        out.push(absolute);
      }
    } catch {
      // Malformed candidate — skip.
    }
  }
  return out;
}
