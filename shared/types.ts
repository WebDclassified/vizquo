/**
 * Vizquo data model — normalized entity types (master spec, Section 3).
 *
 * Every engine module reads/writes these entities; there are no per-module ad
 * hoc shapes. Entity names follow the spec and must not silently diverge.
 * See DATA_MODEL.md for the full picture.
 */

/** Confidence labeling (product law #2): never present an inference as fact. */
export type ConfidenceLevel = 'detected' | 'derived' | 'inferred' | 'ai-generated';

export interface Confidence {
  level: ConfidenceLevel;
  /** 0..1 likelihood when the level is derived/inferred/ai-generated. */
  score?: number;
  /** Human-readable basis, e.g. "inferred from 42 usages: 12 buttons". */
  basis?: string;
}

/** Where a rule/value physically lives in the page's stylesheets. */
export interface SourceLocation {
  stylesheet: string;
  line: number;
  column: number;
}

/** A stable reference to an element on the inspected page. */
export interface ElementRef {
  selector: string;
  xpath: string;
  domPath: number[];
}

export interface CSSRule {
  selectorText: string;
  source: SourceLocation | null;
  /** CSS specificity as (inline, id, class, type) — the full 4-tuple. */
  specificity: [number, number, number, number];
}

export interface CSSProperty {
  name: string;
  value: string;
  matchedRule?: CSSRule;
  inherited: boolean;
  overridden: boolean;
}

export type TechnologyCategory = 'frontend' | 'styling' | 'platform' | 'infra';
export type TechnologyConfidence = 'detected' | 'probable' | 'unknown';

export interface Technology {
  name: string;
  category: TechnologyCategory;
  confidence: TechnologyConfidence;
}

export interface Page {
  url: string;
  title: string;
  scannedAt: number;
  framework?: Technology;
}

export interface Token<T> {
  value: T;
  confidence: Confidence;
  usageCount: number;
  usedBy: ElementRef[];
  source?: SourceLocation;
}

export interface ColorToken extends Token<{ hex: string; oklch: string; role?: string }> {}

export type FontSource = 'google' | 'adobe' | 'fontshare' | 'local' | 'cdn' | 'unknown';

export interface FontToken extends Token<{ family: string; source: FontSource; weight: number }> {}

export type AssetType = 'image' | 'svg' | 'font' | 'video' | 'audio' | 'lottie';

/** Where an asset was found on the page (Section 7.10). */
export type AssetSource =
  | 'img'
  | 'picture'
  | 'css-background'
  | 'inline-svg'
  | 'svg-use'
  | 'video'
  | 'audio'
  | 'lottie'
  | 'favicon'
  | 'og-image'
  | 'font-face';

/** A potential problem with an asset — flagged, never asserted as a fix. */
export interface AssetIssue {
  kind: 'oversized' | 'low-res' | 'large-file' | 'wrong-format';
  message: string;
}

/** SVG structural summary for the SVG inspector (7.10). */
export interface SvgInfo {
  viewBox?: string;
  width?: string;
  height?: string;
  pathCount: number;
  fillColors: string[];
  strokeColors: string[];
  ids: string[];
  classes: string[];
  /** Serialized outerHTML — the source of truth for copy/download. */
  content: string;
}

export interface Asset {
  id: string;
  type: AssetType;
  url: string;
  /** Which construct produced this asset. */
  source: AssetSource;
  naturalDims?: [number, number];
  /** Rendered (layout) dimensions — the size the user actually sees. */
  renderedDims?: [number, number];
  fileSize?: number;
  alt?: string;
  loading?: 'eager' | 'lazy';
  /** Responsive candidate URLs from srcset (deduped, absolute). */
  srcset?: string[];
  classification?: { label: string; confidence: Confidence };
  issues?: AssetIssue[];
  svg?: SvgInfo;
  /** The page element that owns this asset (highlight on click). */
  ref?: ElementRef;
}

/**
 * Serializable asset row for the analysis worker — produced in the content
 * script (needs the live DOM), classified in the worker (pure).
 */
export interface AssetSample {
  id: string;
  type: AssetType;
  url: string;
  source: AssetSource;
  naturalDims?: [number, number];
  renderedDims?: [number, number];
  fileSize?: number;
  alt?: string;
  loading?: 'eager' | 'lazy';
  srcset?: string[];
  ref?: ElementRef;
  /** For inline SVGs: structural facts + content (bounded). */
  svg?: {
    viewBox?: string;
    width?: string;
    height?: string;
    pathCount: number;
    fillColors: string[];
    strokeColors: string[];
    ids: string[];
    classes: string[];
    content: string;
  };
}

export interface Component {
  id: string;
  type: string;
  instances: ElementRef[];
  confidence: Confidence;
  variants: Record<string, ElementRef[]>;
}

export type FindingCategory = 'accessibility' | 'consistency' | 'performance';
export type FindingSeverity = 'info' | 'warning' | 'error';

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  element?: ElementRef;
  message: string;
}

export interface InspectionTokens {
  colors: ColorToken[];
  fonts: FontToken[];
  spacing: Token<number>[];
  radius: Token<number>[];
  shadows: Token<string>[];
}

/** A full page inspection — the L3 cache payload (schema-tagged, Section 2.3). */
export interface Inspection {
  id: string;
  page: Page;
  createdAt: number;
  tokens: InspectionTokens;
  assets: Asset[];
  components: Component[];
  findings: Finding[];
  /* --- Phase 3 additions (schema version 2) --- */
  /** CSS variables on :root with usage counts (Section 7.2 metric). */
  variables: CssVariableInfo[];
  /** Gradient values in use, deduped, with usage (Section 7.9). */
  gradients: Token<string>[];
  /** Media-query breakpoints parsed from reachable stylesheets. */
  breakpoints: Breakpoint[];
  /** The auto-built typographic hierarchy (Section 7.3). */
  typeStyles: TypeStyleUsage[];
  /** Design Consistency score, 0–100, derived (Section 7.2). */
  consistencyScore: number;
  scanDurationMs: number;
  /* --- Phase 5 additions (schema version 4) --- */
  /** Detected frameworks / libraries / platforms (Section 7.14). */
  technologies: Technology[];
  /** `@container` rules parsed from reachable stylesheets (Section 7.15). */
  containerQueries: ContainerQuery[];
  /** True when the page sets <meta name="viewport"> (mobile reflow). */
  viewportMeta: boolean;
  /** True when samples were capped (very large pages). */
  truncated: boolean;
  scannedElementCount: number;
  metrics: ScanMetrics;
  /** True when served from the L2 worker memo without recomputation. */
  cached: boolean;
  /** True when served stale-while-revalidate (recompute in flight). */
  stale: boolean;
}

/** Light projection of an Inspection for list-heavy views (version timeline).
 * Everything the timeline renders and diffs fits in this shape — only "Open"
 * fetches the full payload (assets, findings, etc.) via getInspection. */
export type InspectionMeta = Pick<
  Inspection,
  | 'id'
  | 'page'
  | 'createdAt'
  | 'tokens'
  | 'gradients'
  | 'breakpoints'
  | 'technologies'
  | 'consistencyScore'
  | 'scannedElementCount'
>;

export type CollectionItem =
  | { kind: 'asset'; asset: Asset }
  | { kind: 'color'; token: ColorToken }
  | { kind: 'font'; token: FontToken }
  | { kind: 'component'; component: Component }
  | { kind: 'screenshot'; id: string }
  | { kind: 'element'; element: ElementRef; label?: string };

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: CollectionItem[];
}

export type AIRequestContext = 'element' | 'asset' | 'design-system' | 'page' | 'compare' | 'audit';

export interface AIRequest {
  context: AIRequestContext;
  payloadSummary: string;
  sentAt?: number;
}

/* ------------------------------------------------------------------ */
/* Phase 7: contextual AI (Sections 7.22–7.23)                         */
/* ------------------------------------------------------------------ */

/** AI backends the AIProvider adapter supports (Section 2.2 pattern). */
export type AIProviderId = 'openrouter' | 'ollama';

/**
 * One explain request. Built in the side panel from page data, sent to the
 * background worker (the only context that holds the API key) which calls the
 * provider. `payloadSummary` is the exact plain-language description of what
 * will be sent — the privacy gate shows it verbatim before the first send.
 */
export interface AIExplainRequest {
  context: AIRequestContext;
  /** What will be sent, in plain language (shown in the privacy gate). */
  payloadSummary: string;
  systemPrompt: string;
  userPrompt: string;
  /** OpenRouter model ID — free models by default, so AI costs nothing. */
  model: string;
}

export type AIExplainResult =
  | { ok: true; text: string; model: string; provider: AIProviderId }
  | { ok: false; error: string };

export type ExportFormat =
  | 'css'
  | 'scss'
  | 'tailwind'
  | 'json'
  | 'ts'
  | 'figma'
  | 'styledict'
  | 'react'
  | 'vue'
  | 'svelte'
  | 'html'
  | 'zip';

export type ExportScope = 'token' | 'element' | 'component' | 'page' | 'project';

export interface ExportJob {
  format: ExportFormat;
  scope: ExportScope;
}

/* ------------------------------------------------------------------ */
/* Phase 1 additions: history, notes, screenshots, L3 cache rows       */
/* ------------------------------------------------------------------ */

export type NoteTargetType =
  | 'element'
  | 'asset'
  | 'screenshot'
  | 'color'
  | 'font'
  | 'inspection'
  | 'collection';

export interface Note {
  id: string;
  targetType: NoteTargetType;
  targetId: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  id: string;
  inspectionId: string;
  page: Page;
  scannedAt: number;
  pinned: boolean;
  screenshotId?: string;
}

export type ScreenshotRegion = 'viewport' | 'fullpage' | 'element' | 'selection';

export interface Screenshot {
  id: string;
  pageUrl: string;
  region: ScreenshotRegion;
  /** data: URL — screenshots dominate cache size and are evicted first. */
  dataUrl: string;
  width: number;
  height: number;
  createdAt: number;
  elementRef?: ElementRef;
}

/** One row of the L3 persistent cache (Section 2.3). */
export type CacheKind = 'inspection' | 'screenshot' | 'blob';

export interface CacheEntry<T = unknown> {
  /** `${normalizedUrl}::${fingerprint}` */
  key: string;
  kind: CacheKind;
  url: string;
  fingerprint: string;
  schemaVersion: number;
  createdAt: number;
  lastAccessedAt: number;
  sizeBytes: number;
  data: T;
}

export interface CacheStats {
  count: number;
  sizeBytes: number;
  byKind: Record<CacheKind, number>;
  /** Most recent successful scan timestamp across entries, if any. */
  lastScannedAt?: number;
}

/* ------------------------------------------------------------------ */
/* Phase 2: element inspection (Sections 7.4, 7.5, 7.17)               */
/* ------------------------------------------------------------------ */

/** Axis-aligned rectangle in viewport coordinates (getBoundingClientRect). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface Sides {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/** A CSS rule as it participates in the cascade for one element (7.5). */
export interface RuleSource {
  selectorText: string;
  /** (inline, id, class, type) — the full cascade comparison tuple. */
  specificity: [number, number, number, number];
  source: SourceLocation | null;
  styleSheetIndex: number;
  ruleIndex: number;
  important: boolean;
}

/** value → CSS variable → defining rule (Section 7.5 source-of-truth chain). */
export interface VariableTrace {
  variable: string;
  value: string;
  /** Where the variable is defined; null when only resolvable via the computed cascade. */
  definedBy: RuleSource | null;
}

export interface OverriddenDeclaration {
  value: string;
  rule: RuleSource;
}

export type TraceKind =
  | 'inline'
  | 'stylesheet'
  | 'css-variable'
  | 'inherited'
  | 'computed'
  | 'browser-default';

/** Source-of-truth trace for one property (Section 7.5). */
export interface CSSPropertyTrace {
  property: string;
  /** Final computed value. */
  computedValue: string;
  /** Literal declared value (may contain var()). */
  declaredValue?: string;
  kind: TraceKind;
  variableChain?: VariableTrace[];
  matchedRule?: RuleSource;
  overriddenDeclarations?: OverriddenDeclaration[];
  /** Present when the value is inherited from an ancestor. */
  inheritedFrom?: string;
}

export interface BoxModel {
  margin: Sides;
  padding: Sides;
  borderWidth: Sides;
  borderStyle: Sides;
  borderColor: Sides;
  /** Border-box minus border + padding. */
  contentRect: Rect;
}

export interface LayoutInfo {
  display: string;
  position: string;
  width: string;
  height: string;
  minWidth: string;
  maxWidth: string;
  minHeight: string;
  maxHeight: string;
  boxSizing: string;
  margin: Sides;
  padding: Sides;
  gap: string;
  rowGap: string;
  columnGap: string;
  flexDirection: string;
  flexWrap: string;
  justifyContent: string;
  alignItems: string;
  alignContent: string;
  flexBasis: string;
  flexGrow: string;
  flexShrink: string;
  order: string;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  gridTemplateAreas: string;
  gridAutoFlow: string;
  justifyItems: string;
  overflowX: string;
  overflowY: string;
  zIndex: string;
  float: string;
  clear: string;
}

export interface AppearanceInfo {
  color: string;
  backgroundColor: string;
  borderWidth: string;
  borderStyle: string;
  borderColor: string;
  borderRadius: string;
  boxShadow: string;
  opacity: string;
  filter: string;
  backdropFilter: string;
  mixBlendMode: string;
  clipPath: string;
  maskImage: string;
  isolation: string;
}

export interface TypographyInfo {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  lineHeight: string;
  letterSpacing: string;
  wordSpacing: string;
  textTransform: string;
  textDecoration: string;
  textAlign: string;
  whiteSpace: string;
  textOverflow: string;
  fontVariantNumeric: string;
}

export interface AdvancedInfo {
  transform: string;
  transformOrigin: string;
  transition: string;
  animation: string;
  perspective: string;
  backfaceVisibility: string;
  contain: string;
  contentVisibility: string;
  containerType: string;
  containerName: string;
  aspectRatio: string;
  willChange: string;
  cursor: string;
  userSelect: string;
}

export interface ElementHtmlInfo {
  tagName: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  aria: Record<string, string>;
  data: Record<string, string>;
  outerHTML: string;
  outerHTMLTruncated: boolean;
  innerHTML: string;
  innerHTMLTruncated: boolean;
  textContent: string;
  selector: string;
  xpath: string;
  domPath: number[];
}

/** Full analysis of one element — the Phase 2 inspector payload. */
export interface ElementInspection {
  ref: ElementRef;
  tagName: string;
  visible: boolean;
  rect: Rect;
  text: string;
  layout: LayoutInfo;
  appearance: AppearanceInfo;
  typography: TypographyInfo;
  advanced: AdvancedInfo;
  boxModel: BoxModel;
  html: ElementHtmlInfo;
  /** Source-of-truth traces for the key properties (7.5). */
  traces: CSSPropertyTrace[];
  /** CSS variables visible to this element (name → resolved value + definition). */
  variables: VariableTrace[];
  variablesTruncated: boolean;
  /** Properties inherited from an ancestor (Source tab). */
  inherited: { property: string; value: string; from: string }[];
  /** Author-declared matched rules for the Source tab. */
  matchedRules: RuleSource[];
  matchedRulesTruncated: boolean;
  /** Stylesheets that could not be read (cross-origin / CSP). */
  blockedStylesheets: string[];
  /** Total author declarations considered (diagnostics). */
  declarationCount: number;
}

export type ElementInspectionResult =
  | { ok: true; inspection: ElementInspection }
  | { ok: false; error: string };

export interface DomNode {
  tagName: string;
  id?: string;
  classes: string[];
  isElement: boolean;
  nodeType: string;
  /** Truncated text for text nodes. */
  text?: string;
  depth: number;
  childCount: number;
  visible: boolean;
  ref?: ElementRef;
  children: DomNode[];
}

export interface DomTreeRequest {
  maxDepth?: number;
  maxNodes?: number;
}

export type DomTreeResult =
  | { ok: true; nodes: DomNode[]; truncated: boolean }
  | { ok: false; error: string };

export interface InspectState {
  enabled: boolean;
  locked: ElementRef | null;
  hovered: ElementRef | null;
}

export interface OverlayOptions {
  measurements?: boolean;
  clickThrough?: boolean;
  boxModel?: { margin: boolean; border: boolean; padding: boolean; content: boolean };
  /** Phase 10: click-drag ruler mode — clicks draw a measure line instead of locking. */
  measureMode?: boolean;
}

export type NavigateDirection = 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling';

/* ------------------------------------------------------------------ */
/* Phase 3: full-page scan, Design DNA, find instances/similar,        */
/* multi-select (Sections 7.1–7.3, 7.7–7.9)                            */
/* ------------------------------------------------------------------ */

/** Design-DNA color roles (Section 7.3). */
export type ColorRole =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'background'
  | 'surface'
  | 'text'
  | 'muted'
  | 'border'
  | 'success'
  | 'warning'
  | 'error'
  | 'unknown';

/** Automatic typographic hierarchy roles (Section 7.3). */
export type TypeRole =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'small'
  | 'caption'
  | 'label'
  | 'button';

export interface Breakpoint {
  raw: string;
  minWidth: number | null;
  maxWidth: number | null;
}

export interface CssVariableInfo {
  name: string;
  value: string;
  /** Number of token values (colors/typography) that resolve to this value. */
  usageCount: number;
}

export interface FontSourceInfo {
  family: string;
  source: FontSource;
  weight: number;
}

/**
 * One element's extracted, serializable design data — the scan snapshot row.
 * Produced in the content script, analyzed in the analysis worker (structured
 * clone across the Comlink boundary).
 */
export interface ElementSample {
  ref: ElementRef;
  tag: string;
  id?: string;
  classes: string[];
  role?: string;
  textLength: number;
  depth: number;
  parentTag: string;
  /** Up to 8 child tags, lowercase — the structural signature input. */
  childTags: string[];
  sectionKey: string;
  display: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  /** Border-top width — distinguishes a real border from the browser's
   *  currentcolor default on borderless elements (border-color computes to
   *  currentcolor even when no border exists; without this the scan would
   *  count every borderless element as "using" a border color). */
  borderTopWidth: string;
  /** Border-bottom width — covers dividers and underline borders that only
   *  exist on the bottom edge (the border-color check accepts either side). */
  borderBottomWidth: string;
  borderRadius: string;
  boxShadow: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
  margin: string;
  padding: string;
  gap: string;
  backgroundImage: string;
  opacity: string;
  position: string;
  isButton: boolean;
  isLink: boolean;
  isFormControl: boolean;
}

/** Serializable input for the analysis worker (Section 2.3 L2 cache). */
export interface ScanSnapshot {
  url: string;
  title: string;
  samples: ElementSample[];
  variables: CssVariableInfo[];
  fontSources: FontSourceInfo[];
  breakpoints: Breakpoint[];
  /** Extracted asset rows (Phase 4) — classified by the worker. */
  assets: AssetSample[];
  /** Accessibility facts (Phase 5) — audited purely in the worker. */
  a11y: A11ySample[];
  /** DOM-based technology detection (Phase 5, Section 7.14). */
  technologies: Technology[];
  /** `@container` rules parsed from reachable stylesheets (7.15). */
  containerQueries: ContainerQuery[];
  /** True when the page sets <meta name="viewport">. */
  viewportMeta: boolean;
  truncated: boolean;
  /** Total element count on the page (samples may be capped). */
  elementCount: number;
  imageCount: number;
  svgCount: number;
  animationCount: number;
  transitionCount: number;
}

/** One observed text style with its hierarchy role (Section 7.3/7.9). */
export interface TypeStyleUsage {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
  role: TypeRole;
  confidence: Confidence;
  usageCount: number;
  usedBy: ElementRef[];
}

/** Per-analysis-unit results from the worker (each L2-memoized). */
export interface ColorAnalysis {
  colors: ColorToken[];
  /** True when this unit was served from the worker's memo (unchanged input). */
  cached: boolean;
}

export interface TypographyAnalysis {
  typeStyles: TypeStyleUsage[];
  fonts: FontToken[];
  cached: boolean;
}

export interface ScalesAnalysis {
  spacing: Token<number>[];
  radius: Token<number>[];
  shadows: Token<string>[];
  gradients: Token<string>[];
  /** Detected spacing scale steps with on-scale flags (Section 7.3). */
  spacingScale: { value: number; frequency: number; onScale: boolean }[];
  /** Outlier spacing/radius values worth flagging (consistency findings). */
  outliers: Finding[];
  cached: boolean;
}

export interface StructureAnalysis {
  components: Component[];
  cached: boolean;
}

export interface SimilarityResult {
  ref: ElementRef;
  /** 0..1 structural similarity score (tree-edit-distance heuristic). */
  similarity: number;
  basis: string;
}

export interface ConsistencyResult {
  score: number;
  findings: Finding[];
}

export interface ScanMetrics {
  imageCount: number;
  svgCount: number;
  animationCount: number;
  transitionCount: number;
  breakpointCount: number;
}

export type ScanPhase =
  | 'scanning'
  | 'colors'
  | 'typography'
  | 'scales'
  | 'structure'
  | 'assets'
  | 'audits'
  | 'responsive'
  | 'technology'
  | 'done'
  | 'error';

/** Deep-partial Inspection for progressive section reveal (Section 7.27). */
export type PartialInspection = Partial<Omit<Inspection, 'tokens'>> & {
  tokens?: Partial<InspectionTokens>;
};

/** Incremental scan progress delivered via storage events (progressive reveal). */
export interface ScanProgressPayload {
  phase: ScanPhase;
  /** Partial inspection for the phase — merged into the panel store as it lands. */
  inspection?: PartialInspection;
  error?: string;
  /** The content-script tab that produced this payload (multi-tab isolation). */
  tabId?: number;
}

export type ScanPageResult = { ok: true; inspection: Inspection } | { ok: false; error: string };

export type FindInstancesKind = 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'gradient';

export interface FindInstancesResult {
  count: number;
  refs: ElementRef[];
  truncated: boolean;
}

export interface MultiSelectSummary {
  count: number;
  /** Properties identical across every selected element. */
  common: Record<string, string>;
  /** Property names that vary across the selection. */
  differing: string[];
}

/* ------------------------------------------------------------------ */
/* Phase 5: audits, technology detection, responsive (Sections 7.12–7.15) */
/* ------------------------------------------------------------------ */

/**
 * One element's accessibility facts, collected during the scan walk in the
 * content script (needs the live DOM), audited purely in the worker.
 * Bounded: text/alt values are truncated, and the array is capped — the
 * snapshot's `truncated` flag stays honest about that.
 */
export interface A11ySample {
  ref: ElementRef;
  tag: string;
  /** Visible text (bounded to 120 chars; '' when the element has children). */
  text: string;
  alt?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaHidden?: string;
  role?: string;
  tabIndex: number;
  /** 1–6 for h1–h6, 0 otherwise. */
  headingLevel: number;
  isLink: boolean;
  isButton: boolean;
  isFormControl: boolean;
  /** input type for form controls ('' for non-inputs). */
  inputType: string;
  /** Has an accessible name via <label for>, wrapping <label>, aria-*. */
  hasLabel: boolean;
  placeholder?: string;
  /** Computed foreground color (contrast audit) — raw computed value. */
  color: string;
  /** Computed backgroundColor, resolved up the ancestor chain (contrast). */
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  /** CLS input: the img carries explicit width/height attributes. */
  hasDimsAttrs: boolean;
  /** Lazy-loading state for imgs ('' when not an img). */
  loading: string;
}

/** One `@container` rule parsed from reachable stylesheets. */
export interface ContainerQuery {
  /** Full condition text, e.g. `(min-width: 600px)`. */
  raw: string;
  /** The container name the query targets ('' for anonymous). */
  name: string;
  minWidth: number | null;
  maxWidth: number | null;
}

/** Audits + L2 memo flag from the analysis worker. */
export interface AuditAnalysis {
  findings: Finding[];
  cached: boolean;
}

export interface ResponsiveAnalysis {
  containerQueries: ContainerQuery[];
  /** True when the page sets <meta name="viewport"> (mobile reflow). */
  viewportMeta: boolean;
  cached: boolean;
}

export interface TechnologyAnalysis {
  technologies: Technology[];
  cached: boolean;
}

/** Deterministic active-breakpoint mapping for a viewport width. */
export interface ActiveBreakpoint extends Breakpoint {
  active: boolean;
}

/**
 * Time Machine (7.15) — one width probe. The deterministic mapping from the
 * page's own media queries is always computed; `emulated` becomes true when
 * the content script's same-origin iframe verified real layout at that width.
 */
export type TimeMachineResult =
  | {
      ok: true;
      width: number;
      /** Every parsed breakpoint with its active flag at this width. */
      breakpoints: ActiveBreakpoint[];
      /** Document scrollWidth inside the emulated viewport (0 when not emulated). */
      layoutWidth: number;
      /** True when the page overflows horizontally at this width. */
      horizontalOverflow: boolean;
      emulated: boolean;
    }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Phase 4: asset extraction, classification, bulk export (Section 7.10) */
/* ------------------------------------------------------------------ */

/** Classified assets + L2 cached flag from the analysis worker. */
export interface AssetAnalysis {
  assets: Asset[];
  cached: boolean;
}

/** One requested download for the bulk ZIP export. */
export interface ExportAssetRequest {
  /** The page URL of the asset (absolute). */
  url: string;
  /** Asset type — drives the ZIP subdirectory (images/, svgs/, …). */
  type: AssetType;
  /** Suggested file name inside the ZIP (sanitized, with extension). */
  filename: string;
}

export interface ExportAssetFailure {
  url: string;
  reason: string;
}

export type ExportAssetsResult =
  | {
      ok: true;
      /** Number of assets written into the ZIP. */
      downloaded: number;
      /** Assets that could not be fetched (CORS / network) — explained, never silently dropped. */
      failures: ExportAssetFailure[];
      /** Total payload bytes written (before compression). */
      totalBytes: number;
    }
  | { ok: false; error: string };

/** SVG source fetched from the page on demand (copy/download actions). */
export type FetchAssetSvgResult = { ok: true; content: string } | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Phase 6: live editing, screenshots, codegen (Sections 7.18–7.21, 7.24) */
/* ------------------------------------------------------------------ */

/**
 * One applied live edit (Section 7.21). Edits live only in the content
 * script's memory — a page reload reverts them by construction (law #4:
 * nothing Vizquo does mutates the live page permanently).
 */
export interface LiveEdit {
  id: string;
  ref: ElementRef;
  /** CSS property edited, e.g. `background-color`. */
  property: string;
  /** The applied value. */
  value: string;
  /** The computed value before the edit — the undo target. */
  originalValue: string;
  at: number;
}

export type LiveEditResult = { ok: true; edits: LiveEdit[] } | { ok: false; error: string };

/** Page geometry for fullpage screenshot stitching (7.20). */
export interface PageGeometry {
  scrollY: number;
  scrollHeight: number;
  viewportHeight: number;
  scrollWidth: number;
  viewportWidth: number;
  devicePixelRatio: number;
}

/** Viewport screenshot result (background CAPTURE_VIEWPORT). */
export type CaptureResult =
  | { ok: true; dataUrl: string; width?: number; height?: number }
  | { ok: false; error: string };

/** One file in a multi-file export (page/project scope). */
export interface ExportFile {
  /** Path inside the project (e.g. `tokens/tokens.css`). */
  path: string;
  content: string;
}

/** Code generation input — the inspector's ElementInspection, or a subset. */
export interface CodegenInput {
  tagName: string;
  text?: string;
  layout: LayoutInfo;
  appearance: AppearanceInfo;
  typography: TypographyInfo;
  advanced: AdvancedInfo;
  html: ElementHtmlInfo;
}

/** Valid (scope, format) pairs for the export center (Section 7.24). */
export type ExportMatrix = Record<ExportScope, ExportFormat[]>;
