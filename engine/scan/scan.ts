/**
 * Page scan engine (Section 7.1) — runs in the content script.
 *
 * Walks the DOM once, sampling computed styles through the L1 cache (the hard
 * rule: never call getComputedStyle twice for the same node in one pass), and
 * produces the serializable ScanSnapshot the analysis worker consumes.
 *
 * Incremental & bounded: the walk yields to the main thread every N elements
 * (the page stays interactive) and caps at MAX_WALK_ELEMENTS; larger pages are
 * marked `truncated` rather than blocking. Script/style/template subtrees and
 * visually-hidden elements (display:none / visibility:hidden) are skipped —
 * they render nothing, so their values are noise, not tokens.
 */
import type {
  A11ySample,
  Asset,
  AssetSample,
  Breakpoint,
  ColorToken,
  ConsistencyResult,
  ContainerQuery,
  CssVariableInfo,
  ElementSample,
  Finding,
  FontSource,
  FontSourceInfo,
  Inspection,
  PartialInspection,
  ScalesAnalysis,
  ScanMetrics,
  ScanSnapshot,
  StructureAnalysis,
  TypeStyleUsage,
  TypographyAnalysis,
} from '../../shared/types';
import { extractAssets } from '../assets/extract';
import { styleCache } from '../css/style-cache';
import { makeRef } from '../dom/ref';
import { hasViewportMeta, parseContainerQuery } from '../responsive/breakpoints';
import { detectTechnologies } from '../technology/detect';
import { normalizeColorValue } from '../tokens/color';

export const MAX_WALK_ELEMENTS = 12000;
export const MAX_SAMPLES = 4000;
/** Cap on accessibility facts (audit runs on these — bounded like samples). */
export const MAX_A11Y_SAMPLES = 2500;
/** Yield to the main thread after this many sampled elements. */
const YIELD_EVERY = 300;
/** Cap on classes/text copied into a sample (keeps snapshots small). */
const MAX_CLASSES = 8;
const MAX_CHILD_TAGS = 8;

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'TEMPLATE',
  'NOSCRIPT',
  'BASE',
  'TITLE',
]);

const BUTTON_HINT = /(^|[-_])(btn|button)([-_]|$)/i;

function roleOf(el: Element): string | undefined {
  return el.getAttribute('role') ?? undefined;
}

function isButton(el: Element, display: string): boolean {
  const tag = el.tagName;
  const role = roleOf(el);
  if (tag === 'BUTTON') return true;
  if (role === 'button') return true;
  if (tag === 'A' && BUTTON_HINT.test(`${el.className}`)) return true;
  if (tag === 'INPUT') {
    const type = el.getAttribute('type') ?? 'text';
    return type === 'button' || type === 'submit' || type === 'reset';
  }
  return BUTTON_HINT.test(`${el.className}`) && display !== 'contents';
}

function isLink(el: Element): boolean {
  return el.tagName === 'A' && el.hasAttribute('href');
}

function isFormControl(el: Element): boolean {
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON';
}

function sectionKeyOf(el: Element): string {
  let node: Element | null = el;
  let depth = 0;
  while (node?.parentElement && depth < 32) {
    if (node.parentElement.tagName === 'BODY' || node.parentElement.tagName === 'HTML') {
      const parent = node.parentElement;
      let index = 0;
      for (let i = 0; i < parent.children.length; i += 1) {
        if (parent.children[i] === node) {
          index = i;
          break;
        }
      }
      return `${parent.tagName.toLowerCase()}-${index}`;
    }
    node = node.parentElement;
    depth += 1;
  }
  return 'root';
}

function depthOf(el: Element): number {
  let depth = 0;
  let node = el.parentElement;
  while (node && depth < 32) {
    depth += 1;
    node = node.parentElement;
  }
  return depth;
}

function childTagsOf(el: Element): string[] {
  const out: string[] = [];
  for (const child of el.children) {
    if (out.length >= MAX_CHILD_TAGS) break;
    out.push(child.tagName.toLowerCase());
  }
  return out;
}

function textLengthOf(el: Element): number {
  if (el.children.length > 0) return 0;
  const text = el.textContent ?? '';
  return Math.min(200, text.trim().length);
}

/** Build a single element's sample from its computed style (find-similar target). */
export function sampleElement(
  el: Element,
  style: CSSStyleDeclaration = getComputedStyle(el),
): ElementSample {
  return sampleOf(el, style);
}

function sampleOf(el: Element, style: CSSStyleDeclaration): ElementSample {
  const display = style.display;
  const tag = el.tagName;
  const classes = Array.from(el.classList).slice(0, MAX_CLASSES);
  return {
    ref: makeRef(el),
    tag: tag.toLowerCase(),
    id: el.id || undefined,
    classes,
    role: roleOf(el),
    textLength: textLengthOf(el),
    depth: depthOf(el),
    parentTag: el.parentElement?.tagName.toLowerCase() ?? '',
    childTags: childTagsOf(el),
    sectionKey: sectionKeyOf(el),
    display,
    color: style.color,
    backgroundColor: style.backgroundColor,
    borderColor: style.borderTopColor,
    borderRadius: style.borderRadius,
    boxShadow: style.boxShadow,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textTransform: style.textTransform,
    margin: style.margin,
    padding: style.padding,
    gap: style.gap,
    backgroundImage: style.backgroundImage,
    opacity: style.opacity,
    position: style.position,
    isButton: isButton(el, display),
    isLink: isLink(el),
    isFormControl: isFormControl(el),
  };
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const TRANSPARENT = new Set(['transparent', 'rgba(0, 0, 0, 0)', '']);

/**
 * Resolve an element's effective background up its ancestor chain using the
 * L1 cache (every ancestor was already computed during the walk — no second
 * getComputedStyle per node, the hard rule). Returns '' when nothing is
 * opaque (the audit skips those honestly).
 */
function effectiveBackground(el: Element, style: CSSStyleDeclaration): string {
  let node: Element | null = el;
  let currentStyle = style;
  while (node) {
    const bg = currentStyle.backgroundColor;
    if (bg && !TRANSPARENT.has(bg.trim())) return bg;
    node = node.parentElement;
    if (!node) break;
    currentStyle = styleCache.computedFor(node);
  }
  return '';
}

/** Accessible-name detection: aria-* or a real <label> association. */
function hasLabelAssociation(el: Element, id: string): boolean {
  if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return true;
  if (el.closest('label')) return true;
  if (!id) return false;
  try {
    return document.querySelector(`label[for="${CSS.escape(id)}"]`) !== null;
  } catch {
    // Unescaped fallback — still a real check, just less precise for odd ids.
    return document.querySelector(`label[for="${id}"]`) !== null;
  }
}

/** Build one element's accessibility facts from its computed style. */
function a11yOf(el: Element, style: CSSStyleDeclaration): A11ySample {
  const tag = el.tagName;
  const text = el.children.length === 0 ? (el.textContent ?? '').trim().slice(0, 120) : '';
  const id = el.id;
  return {
    ref: makeRef(el),
    tag: tag.toLowerCase(),
    text,
    alt: el.getAttribute('alt') ?? undefined,
    ariaLabel: el.getAttribute('aria-label') ?? undefined,
    ariaLabelledby: el.getAttribute('aria-labelledby') ?? undefined,
    ariaHidden: el.getAttribute('aria-hidden') ?? undefined,
    role: roleOf(el),
    tabIndex: Number.parseInt(el.getAttribute('tabindex') ?? '', 10) || 0,
    headingLevel: HEADING_TAGS.has(tag) ? Number(tag[1]) : 0,
    isLink: isLink(el),
    isButton: isButton(el, style.display),
    isFormControl: isFormControl(el),
    inputType: el.getAttribute('type') ?? '',
    hasLabel: hasLabelAssociation(el, id),
    placeholder: el.getAttribute('placeholder') ?? undefined,
    color: style.color,
    backgroundColor: effectiveBackground(el, style),
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    hasDimsAttrs: tag === 'IMG' && el.hasAttribute('width') && el.hasAttribute('height'),
    loading: el.getAttribute('loading') ?? '',
  };
}

/** True for subtrees that can never render (noise for token extraction). */
function isNonVisual(el: Element): boolean {
  const tag = el.tagName;
  if (SKIP_TAGS.has(tag)) return true;
  if (tag === 'HEAD') return true;
  return false;
}

export function collectFontSources(doc: Document = document): FontSourceInfo[] {
  const found = new Map<string, { source: FontSource; weight: number }>();
  const set = (family: string, source: FontSource): void => {
    const clean = family.replace(/^['"]|['"]$/g, '').trim();
    if (!clean) return;
    const existing = found.get(clean);
    if (!existing) found.set(clean, { source, weight: 400 });
  };

  // Google Fonts <link> stylesheets: css2?family=Inter:wght@400;600&family=Roboto
  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))) {
    const href = link.href ?? '';
    try {
      const url = new URL(href);
      if (/fonts\.googleapis\.com/i.test(url.hostname)) {
        // ?family=Inter:wght@400;600&family=Roboto — one param per family.
        for (const familyParam of url.searchParams.getAll('family')) {
          const family = familyParam.split(':')[0]?.replace(/\+/g, ' ').trim();
          if (family) set(family, 'google');
        }
      } else if (/use\.typekit\.net|fonts\.adobe\.com/i.test(url.hostname)) {
        set('Adobe Fonts', 'adobe');
      } else if (/api\.fontshare\.com/i.test(url.hostname)) {
        set('Fontshare', 'fontshare');
      } else if (/fonts\.cdnfonts\.com|cdn/i.test(url.hostname)) {
        set('CDN Fonts', 'cdn');
      }
    } catch {
      // Unparsable href — ignore.
    }
  }

  // @font-face rules from readable sheets.
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      void sheet.cssRules;
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    const walk = (list: CSSRuleList): void => {
      for (const rule of Array.from(list)) {
        if (typeof CSSFontFaceRule !== 'undefined' && rule instanceof CSSFontFaceRule) {
          const family = rule.style.getPropertyValue('font-family');
          if (!family) continue;
          const src = rule.style.getPropertyValue('src');
          let source: FontSource = 'local';
          if (/gstatic|fonts\.googleapis/i.test(src)) source = 'google';
          else if (/use\.typekit|adobe/i.test(src)) source = 'adobe';
          else if (/fontshare/i.test(src)) source = 'fontshare';
          else if (/^local\(/i.test(src) || src === '') source = 'local';
          else if (/^https?:/i.test(src)) source = 'cdn';
          set(family, source);
        }
        if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
          walk((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    try {
      walk(rules);
    } catch {
      // Unreadable sheet — skip.
    }
  }
  return [...found.entries()].map(([family, info]) => ({ family, ...info }));
}

function parseWidth(raw: string, re: RegExp): number | null {
  const match = re.exec(raw);
  if (!match) return null;
  const n = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(n) ? n : null;
}

export function collectBreakpoints(doc: Document = document): Breakpoint[] {
  const out: Breakpoint[] = [];
  const seen = new Set<string>();
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      void sheet.cssRules;
    } catch {
      continue;
    }
    const walk = (list: CSSRuleList): void => {
      for (const rule of Array.from(list)) {
        if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
          const raw = rule.conditionText;
          if (/min-width|max-width/i.test(raw) && !seen.has(raw)) {
            seen.add(raw);
            out.push({
              raw,
              minWidth: parseWidth(raw, /min-width\s*:\s*([\d.]+)px/i),
              maxWidth: parseWidth(raw, /max-width\s*:\s*([\d.]+)px/i),
            });
          }
        }
        if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
          try {
            walk((rule as CSSGroupingRule).cssRules);
          } catch {
            // Unreadable nested rules — skip.
          }
        }
      }
    };
    try {
      walk(sheet.cssRules);
    } catch {
      // Unreadable sheet — skip.
    }
  }
  return out.sort((a, b) => (a.minWidth ?? 0) - (b.minWidth ?? 0));
}

/** Collect `@container` rules from reachable stylesheets (Section 7.15). */
export function collectContainerQueries(doc: Document = document): ContainerQuery[] {
  const out: ContainerQuery[] = [];
  const seen = new Set<string>();
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      void sheet.cssRules;
    } catch {
      continue;
    }
    const walk = (list: CSSRuleList): void => {
      for (const rule of Array.from(list)) {
        const isContainerRule =
          typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule;
        if (isContainerRule) {
          const raw = (rule as CSSContainerRule).conditionText;
          if (raw && !seen.has(raw)) {
            seen.add(raw);
            out.push(parseContainerQuery(raw));
          }
        }
        if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
          try {
            walk((rule as CSSGroupingRule).cssRules);
          } catch {
            // Unreadable nested rules — skip.
          }
        }
      }
    };
    try {
      walk(sheet.cssRules);
    } catch {
      // Unreadable sheet — skip.
    }
  }
  return out;
}

/** Resolve CSS custom properties defined in the page's stylesheets. */
export async function collectVariables(): Promise<CssVariableInfo[]> {
  const sheets = await styleCache.getSheets();
  const defs = new Map<string, string>();
  for (const sheet of sheets) {
    if (sheet.blocked) continue;
    for (const rule of sheet.rules) {
      const selector = rule.selectorText;
      const isRootish =
        selector === ':root' ||
        selector === 'html' ||
        selector === '*' ||
        selector.startsWith(':root');
      for (const declaration of rule.declarations) {
        if (!declaration.name.startsWith('--')) continue;
        if (isRootish || !defs.has(declaration.name)) {
          defs.set(declaration.name, declaration.value);
        }
      }
    }
  }
  const resolve = (value: string, depth = 0): string => {
    if (depth > 6) return value;
    const match = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/.exec(value);
    if (!match) return value;
    const resolved = defs.get(match[1] ?? '') ?? match[2]?.trim() ?? '';
    return resolve(value.replace(match[0], resolved), depth + 1);
  };
  return [...defs.entries()].map(([name, value]) => ({
    name,
    value: resolve(value).trim(),
    usageCount: 0,
  }));
}

/**
 * Walk the page once (time-sliced, bounded) and build the scan snapshot.
 * `onSample` fires every yield batch so the orchestrator can stream progress.
 * `isCancelled` is polled every iteration — when it flips true mid-walk the
 * snapshot is abandoned early (marked truncated) so the orchestrator can
 * surface a clean cancellation instead of blocking on the whole page.
 */
export async function buildScanSnapshot(
  onProgress?: (sampled: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<ScanSnapshot> {
  const elements = Array.from(document.querySelectorAll('*'));
  const total = Math.min(elements.length, MAX_WALK_ELEMENTS);
  const samples: ElementSample[] = [];
  const a11y: A11ySample[] = [];
  let imageCount = 0;
  let svgCount = 0;
  let animationCount = 0;
  let transitionCount = 0;
  let a11yTruncated = false;

  // Early abandon: a valid-but-incomplete snapshot the orchestrator discards
  // the moment it sees the cancel flag. Never used for analysis.
  const cancelledSnapshot = (): ScanSnapshot => ({
    url: window.location.href,
    title: document.title,
    samples,
    variables: [],
    fontSources: [],
    breakpoints: [],
    assets: [],
    a11y,
    technologies: [],
    containerQueries: [],
    viewportMeta: hasViewportMeta(document),
    truncated: true,
    elementCount: samples.length,
    imageCount,
    svgCount,
    animationCount,
    transitionCount,
  });

  for (let i = 0; i < elements.length && samples.length < MAX_SAMPLES; i += 1) {
    if (isCancelled?.()) return cancelledSnapshot();
    const el = elements[i];
    if (!el || isNonVisual(el)) continue;
    const style = styleCache.computedFor(el);
    const display = style.display;
    const visibility = style.visibility;
    if (display === 'none' || visibility === 'hidden') continue;
    if (el.tagName === 'IMG') imageCount += 1;
    // SVG elements report a lowercase tagName (they are XML, not HTML).
    if (el.tagName.toLowerCase() === 'svg') svgCount += 1;
    if (style.animationName && style.animationName !== 'none') animationCount += 1;
    if (style.transitionDuration && style.transitionDuration !== '0s') transitionCount += 1;
    samples.push(sampleOf(el, style));
    // A11y facts ride the same walk — same computed style, no second pass.
    if (a11y.length < MAX_A11Y_SAMPLES) a11y.push(a11yOf(el, style));
    else a11yTruncated = true;

    if (samples.length % YIELD_EVERY === 0) {
      onProgress?.(samples.length, total);
      // Let the page breathe between batches (setTimeout, not a microtask).
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (isCancelled?.()) return cancelledSnapshot();
  onProgress?.(samples.length, total);
  const [variables, fontSources, breakpoints, containerQueries, technologies] = await Promise.all([
    collectVariables(),
    Promise.resolve(collectFontSources()),
    Promise.resolve(collectBreakpoints()),
    Promise.resolve(collectContainerQueries()),
    Promise.resolve(detectTechnologies(document)),
  ]);

  // Assets: one extra DOM pass (bounded) + backgrounds read from the samples
  // we already computed (L1 rule: no second getComputedStyle per node).
  const { assets, truncated: assetsTruncated } = extractAssets(document, {
    backgroundSamples: samples.map((s) => ({ backgroundImage: s.backgroundImage, ref: s.ref })),
  });

  return {
    url: window.location.href,
    title: document.title,
    samples,
    variables,
    fontSources,
    breakpoints,
    assets,
    a11y,
    technologies,
    containerQueries,
    viewportMeta: hasViewportMeta(document),
    truncated:
      elements.length > MAX_WALK_ELEMENTS ||
      samples.length >= MAX_SAMPLES ||
      assetsTruncated ||
      a11yTruncated,
    elementCount: samples.length,
    imageCount,
    svgCount,
    animationCount,
    transitionCount,
  };
}

/** Usage counts for CSS variables: which tokens resolve to each variable. */
function countVariableUsage(
  variables: CssVariableInfo[],
  colors: ColorToken[],
  typeStyles: TypeStyleUsage[],
): CssVariableInfo[] {
  return variables.map((variable) => {
    let usage = 0;
    const varColor = normalizeColorValue(variable.value);
    if (varColor) {
      for (const color of colors) {
        if (normalizeColorValue(color.value.hex)?.hex === varColor.hex) {
          usage += color.usageCount;
        }
      }
    }
    for (const style of typeStyles) {
      if (style.family === variable.value || style.family.includes(variable.value))
        usage += style.usageCount;
    }
    return { ...variable, usageCount: usage };
  });
}

export interface InspectionAssembly {
  snapshot: ScanSnapshot;
  colors: ColorToken[];
  typography: TypographyAnalysis;
  scales: ScalesAnalysis;
  structure: StructureAnalysis;
  assets: Asset[];
  consistency: ConsistencyResult;
  /** Accessibility audit findings (Phase 5, Section 7.13). */
  a11yFindings: Finding[];
  /** Performance audit findings (Phase 5, Section 7.13). */
  performanceFindings: Finding[];
  durationMs: number;
  cached: boolean;
  stale: boolean;
}

/** Assemble the final Inspection entity from the scan + analysis results. */
export function buildInspection(input: InspectionAssembly): Inspection {
  const {
    snapshot,
    colors,
    typography,
    scales,
    structure,
    assets,
    consistency,
    a11yFindings,
    performanceFindings,
    durationMs,
    cached,
    stale,
  } = input;
  const metrics: ScanMetrics = {
    imageCount: snapshot.imageCount,
    svgCount: snapshot.svgCount,
    animationCount: snapshot.animationCount,
    transitionCount: snapshot.transitionCount,
    breakpointCount: snapshot.breakpoints.length,
  };
  const variables = countVariableUsage(snapshot.variables, colors, typography.typeStyles);
  return {
    id: `${snapshot.url}|${Date.now()}`,
    page: { url: snapshot.url, title: snapshot.title, scannedAt: Date.now() },
    createdAt: Date.now(),
    tokens: {
      colors,
      fonts: typography.fonts,
      spacing: scales.spacing,
      radius: scales.radius,
      shadows: scales.shadows,
    },
    variables,
    gradients: scales.gradients,
    breakpoints: snapshot.breakpoints,
    typeStyles: typography.typeStyles,
    consistencyScore: consistency.score,
    scanDurationMs: durationMs,
    truncated: snapshot.truncated,
    scannedElementCount: snapshot.elementCount,
    metrics,
    cached,
    stale,
    assets,
    components: structure.components,
    findings: [...consistency.findings, ...a11yFindings, ...performanceFindings],
    technologies: snapshot.technologies,
    containerQueries: snapshot.containerQueries,
    viewportMeta: snapshot.viewportMeta,
  };
}

/** Partial assemblies for the progressive section reveal. */
export function partialInspection(
  snapshot: ScanSnapshot,
  patch: PartialInspection,
): PartialInspection {
  const base: PartialInspection = {
    page: { url: snapshot.url, title: snapshot.title, scannedAt: Date.now() },
    scannedElementCount: snapshot.elementCount,
    truncated: snapshot.truncated,
    metrics: {
      imageCount: snapshot.imageCount,
      svgCount: snapshot.svgCount,
      animationCount: snapshot.animationCount,
      transitionCount: snapshot.transitionCount,
      breakpointCount: snapshot.breakpoints.length,
    },
    technologies: snapshot.technologies,
    containerQueries: snapshot.containerQueries,
    viewportMeta: snapshot.viewportMeta,
  };
  return { ...base, ...patch };
}

export type { AssetSample };
