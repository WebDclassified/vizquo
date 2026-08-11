# Data model

Normalized entity types live in `shared/types.ts` and are the single source of
truth for every engine module and feature panel. Entity names follow the
master spec (Section 3) and must not silently diverge.

## Core inspection entities

- **`Page`** — url, title, scannedAt, detected framework.
- **`ElementRef`** — stable element identity: CSS selector, XPath, and a DOM
  path (node indices from root).
- **`CSSRule` / `CSSProperty`** — matched-rule and cascade bookkeeping:
  selector text, source location, specificity, inherited/overridden flags.
- **`Token<T>`** — a recurring design value with a `Confidence` label,
  usage count, the elements that use it, and its source location. Subtypes:
  `ColorToken`, `FontToken`, `spacing`/`radius`/`shadow` tokens.
- **`Asset`** — image/svg/font/video/audio/lottie with dimensions, size, and
  a classified label.
- **`Component`** — detected recurring structure with instances and variants
  (always `inferred`, never asserted).
- **`Finding`** — audit result (accessibility/consistency/performance) with
  severity and an anchor to the real element.
- **`Inspection`** — one full page scan: page + tokens + assets + components +
  findings. This is the L3 cache payload.

## Phase 3 entities (Design intelligence)

- **`ElementSample`** — one element's serializable design data (computed
  style projections: colors, font, spacing, radius, shadow, structural
  signature). Produced in the content script, analyzed in the worker.
- **`ScanSnapshot`** — the full serializable scan input: samples, CSS
  variables, font sources, breakpoints, media counts. This crosses the
  Comlink boundary (structured clone).
- **`ColorToken`** — hex + OKLCH, `role` (primary/secondary/accent/…), and a
  `derived` confidence when near-duplicates were perceptually merged.
- **`TypeStyleUsage`** — one observed text style with its inferred hierarchy
  role (display/H1–H3/body/small/caption/label/button) and basis.
- **`Breakpoint`** — parsed media query with min/max widths.
- **`CssVariableInfo`** — `:root` custom property with usage counts.
- **`ScanMetrics`** — image/SVG/animation/transition/breakpoint counts for
  the Page overview tiles.
- **`MultiSelectSummary`** — common vs differing properties across a
  shift-click selection (Section 7.7).
- **`Inspection` (extended)** — adds `variables`, `gradients`, `breakpoints`,
  `typeStyles`, `consistencyScore`, `scanDurationMs`, `truncated`,
  `scannedElementCount`, `metrics`, and the L2 `cached`/`stale` flags.

## Phase 5 entities (Responsive & audits)

- **`A11ySample`** — serializable accessibility facts collected during the
  scan walk: tag, text, computed color/background, font size/weight,
  tabindex, heading level, link/button/form-control flags, input type,
  placeholder, label/aria signals, alt, role, aria-hidden. This is what the
  worker-side WCAG audit consumes.
- **`Finding` (extended)** — `category` now includes `accessibility` and
  `performance` alongside `consistency`; every finding carries a severity
  (`info`/`warning`/`error`) and an optional `ElementRef` anchor.
- **`AuditAnalysis`** — grouped findings per category for the Analyze panel.
- **`Technology`** — name + category + confidence (`detected` / `probable` /
  `unknown`). DOM-only markers by design (the content script's isolated
  world cannot see page globals).
- **`ContainerQuery`** — parsed `@container` condition (name, min/max width).
- **`ResponsiveAnalysis`** — `ActiveBreakpoint[]` mapping, layout widths,
  viewport-meta presence.
- **`TimeMachineResult`** — one width probe: deterministic active mapping,
  measured layout width, horizontal overflow, and an honest `emulated` flag
  (false when the page forbids framing).
- **`Inspection` (extended)** — adds `findings` (audit results merged into
  the assembled inspection), `technologies`, `containerQueries`, and
  `viewportMeta`; `ScanSnapshot` gains the corresponding raw collections
  (`a11ySamples`, `technologies`, `containerQueries`, `viewportMeta`).

## Phase 7 entities (Contextual AI)

- **`AIRequest`** (Section 3) — one AI interaction's declared context and
  `payloadSummary`; `sentAt` is set at send time. Used as the privacy-gate
  contract — the summary shown is the summary sent.
- **`AIExplainRequest`** — the full request the side panel builds and the
  background sends: context, the gate-visible `payloadSummary`, system + user
  prompts, and the model. Prompts come from `ai/prompts.ts` (bounded and
  redacted — text ≤ 200 chars, snippets ≤ 160 chars with `value`/`name`/
  `data-*` stripped, input values excluded).
- **`AIExplainResult`** — `{ ok: true; text; model; provider }` or an honest
  error string. AI output is always labeled `ai-generated` in the UI
  (confidence law #2).
- **`AIProviderId`** — the supported backends (`openrouter` today); the
  `AIProvider` interface in `ai/provider.ts` is the swap point for local
  models (Ollama) later.

## Phase 6 entities (Create)

- **`LiveEdit`** — one applied CSS edit (ref, property, value, the original
  computed value for exact undo, timestamp). Lives only in the content
  script's memory; a reload or `pagehide` drops the session (law #4).
- **`PageGeometry`** — scroll/scrollHeight/scrollWidth/viewport/devicePixelRatio
  for fullpage screenshot stitching.
- **`CaptureResult`** — a viewport capture (PNG data URL + optional dims).
- **`CodegenInput`** — the shape code generation consumes (tag, text, and the
  Phase 2 layout/appearance/typography/advanced/html info) — an
  `ElementInspection` satisfies it directly.
- **`ExportFile`** — one file in a multi-file export (path + content).
- **`ExportMatrix`** — the valid scope × format pairs (Section 7.24); the
  `ExportJob` / `ExportFormat` / `ExportScope` types from Section 3 drive it.

## Phase 4 entities (Assets)

- **`AssetSample`** — serializable raw asset row produced in the content
  script (where the live DOM + computed styles exist): URL, type, source
  (`img` / `picture` / `css-background` / `inline-svg` / `svg-use` / `video`
  / `audio` / `lottie` / `favicon` / `og-image` / `font-face`), natural +
  rendered dimensions, alt, lazy state, srcset candidates, and the owning
  element's `ElementRef`.
- **`Asset` (extended)** — adds `classification` (role + `inferred`
  confidence with basis), `issues` (`AssetIssue`: oversized / low-res /
  large-file / wrong-format, flagged never asserted), and `svg` (`SvgInfo`:
  viewBox, path count, fill/stroke colors, IDs, classes, serialized
  `content`).
- **`ExportAssetRequest` / `ExportAssetsResult`** — the background worker's
  ZIP-export contract; failures are reported per asset (CORS), never
  silently dropped.
- **`SvgInfo`** — structural summary of an inline SVG for the inspector
  (7.10).

## Confidence model (product law #2)

Every non-directly-observed value carries `Confidence`:

| Level | Meaning |
|---|---|
| `detected` | directly observed from the page |
| `derived` | calculated from observed data (e.g. a computed value) |
| `inferred` | pattern-based likelihood (component detection, token roles) |
| `ai-generated` | produced by the optional AI layer |

The UI renders these as labeled badges — an inference is never presented as
fact.

## Supporting entities

- **`Collection`** — user-named groups of assets/colors/components/
  screenshots/elements.
- **`Note`** — annotation attached to any target (element, asset, screenshot,
  color, font, inspection, collection).
- **`HistoryEntry`** — recent inspections with pin support.
- **`Screenshot`** — viewport/fullpage/element/selection captures as data URLs.
- **`CacheEntry`** — L3 cache rows keyed by `normalizedUrl::fingerprint`,
  schema-versioned, size-accounted, LRU-evicted.
- **`ExportJob`** — requested export (format × scope).

## Storage

Everything persists through `VizquoRepository` (`storage/repository.ts`); the
schema is implemented in `storage/adapters/indexeddb/schema.ts`. Bumping
`INSPECTION_SCHEMA_VERSION` invalidates cached entries automatically.
