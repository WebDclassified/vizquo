# Architecture

> Created by Prabhat Teotia


## Folder layout

```
entrypoints/
  background.ts        # service worker: side panel, commands, message handlers
  content.ts           # page-side connection surface + inspect controller wiring
  sidepanel/           # the side panel app (Solid)
engine/                # Phase 2+: scan, css, tokens, assets, components, a11y, responsive, technology
ai/                    # Phase 7: contextual AI behind an AIProvider interface
export/                # Phase 6: codegen, token export, ZIP/report generation
workers/               # Phase 3: Comlink-wrapped worker entrypoints
storage/
  repository.ts        # VizquoRepository — the ONLY storage contract feature code depends on
  index.ts             # adapter swap point
  adapters/indexeddb/  # default Dexie implementation + L3 cache logic
shared/
  types.ts             # data model (Section 3)
  messages.ts          # typed messaging protocol
  constants.ts         # settings keys, shortcuts, schema version
ui/
  theme.css            # design tokens: light/dark/auto, high contrast, reduced motion
  stores/              # ui-store, analysis-store, persisted-store, toast
  components/          # design system primitives (Kobalte + UnoCSS)
  screens/sidepanel/   # the side panel screens
```

## Three explicit stores (solid-js/store)

- `ui-store` — active panel, Designer/Engineer mode, theme, overlays,
  connection state, onboarding.
- `analysis-store` — scan results, tokens, assets, components (populated by
  the engine in Phase 3; every feature panel reads from here).
- `persisted-store` — repository-backed settings (load on start, persist on
  change).

## Storage abstraction (Section 2.2)

Nothing in engine/UI talks to Dexie, IndexedDB, or chrome.storage directly —
everything goes through `VizquoRepository`. Today's default adapter is Dexie
over IndexedDB. Swapping the adapter in `storage/index.ts` is the only change
required to move data elsewhere (sql.js, a REST API, Supabase, …). The
interface deliberately covers settings, notes, history, screenshots, and
collections so no future feature needs to bypass it.

## Caching (Section 2.3)

Three explicit tiers, all routed through the repository:

- **L1 — in-memory, per-tab, per-session.** Computed-style lookups for the
  hovered/selected element (`WeakMap<Element, …>` so entries are
  garbage-collected with their node). Lands with the Phase 2 inspector.
- **L2 — worker-level memoized results.** Color clustering and similarity
  matching keyed by a hash of the relevant subtree, stale-while-revalidate.
  Ships with Phase 3 workers.

## Scan pipeline (Phase 3)

The page scan is split across three contexts so heavy compute never blocks the
panel or the page:

1. **Content script** (`engine/scan/scan.ts`): one time-sliced DOM walk
   (yields every 300 sampled elements, capped at 12k walked / 4k sampled;
   larger pages are marked `truncated`). Computed styles go through the L1
   cache — one `getComputedStyle` per node per pass. Output: a serializable
   `ScanSnapshot` (element samples, CSS variables, font sources,
   breakpoints, media counts).
2. **Analysis pipeline** (`engine/analysis/pipeline.ts`): the pure Design
   DNA pipeline — colors (culori OKLCH clustering), typography hierarchy,
   scales (spacing/radius/shadow/gradient + outliers), structure (recurring
   components), asset classification, and the a11y/performance audits — each
   unit memoized by a content hash of its input projection
   (`engine/tokens/memo.ts`). An unchanged page reuses cached results
   instantly; the assembled `Inspection` carries `cached`/`stale` flags the
   panel surfaces honestly. The same code runs in two environments:
   - **Comlink worker** (`workers/analysis-worker.ts`) — a thin wrapper;
     heavy compute stays off the content-script thread.
   - **Main thread** — some sites ship a CSP whose `script-src` lacks
     `blob:` (YouTube is a known case), which makes a blob-URL worker load
     silently fail. The orchestrator health-checks the worker (`ping()` +
     the worker `error` event) and falls back to the identical pipeline
     synchronously, so scans complete on every page.
3. **Orchestrator** (`engine/analysis/orchestrator.ts`): runs in the content
   script, streams each finished unit to the panel via storage events
   (`scanProgress`) for progressive section reveal — colors first, then
   typography, scales, structure — and assembles the final `Inspection`
   (plus the derived Design Consistency score).

The panel's `analysis-store` holds the (possibly partial) `Inspection`;
`scan-client` bridges messages and storage events. Find-instances,
find-similar (structural LCS heuristic in the worker), and shift-click
multi-select all flow through the same orchestration and highlight layer.

## Asset pipeline (Phase 4)

Assets follow the same content → worker → panel split as the scan:

1. **Content script** (`engine/assets/extract.ts`): one DOM pass over `img` /
   `picture` / `svg` / `use` / `video` / `audio` / lottie / favicon / OG
   meta, plus CSS backgrounds read from the scan's computed-style samples
   (L1 cache — never a second `getComputedStyle` pass). Produces
   `AssetSample[]` (bounded at 500, `truncated` when exceeded, deduped by
   absolute URL) embedded in the `ScanSnapshot`.
2. **Analysis worker**: `analyzeAssets` classifies each sample into a role
   (`inferred`, always labeled) and flags issues; L2-memoized by content
   hash like every other unit.
3. **Background** (`EXPORT_ASSETS`): fetches each selected asset in the
   extension context (host permissions + `downloads`), packs them with
   `export/assets-zip.ts` (fflate) into `vizquo-assets/{type}/{filename}` +
   `metadata.json`, and calls `chrome.downloads.download`. Fetch failures
   (CORS etc.) are recorded per-asset in the metadata — never silently
   dropped, never bypassed.
4. **Panel** (`ui/screens/sidepanel/assets/`): filterable/selectable grid;
   inline SVGs render in shadow DOM (untrusted content); the SVG inspector
   offers copy / download / open / URL and SVG→React conversion
   (`export/svg-react.ts`, pure string transform, unit-tested).
- **L3 — persistent, cross-session.** `CacheEntry` rows keyed by normalized
  URL + content fingerprint, schema-versioned (a version bump invalidates),
  LRU evicted with blobs/screenshots evicted before inspection token data.
  Ships now in Phase 1; cache stats + clear are visible in Settings.

## Audits, technology & Time Machine (Phase 5)

Three more analysis surfaces, following the same content → worker → panel
split:

1. **Audits** (`engine/accessibility/audit.ts`, `engine/performance/audit.ts`):
   pure functions over the `A11ySample[]` facts the scan walk collects. The
   WCAG contrast check uses exact relative-luminance math (culori parses
   colors, converted to 0–255 rgb); transparent/unparsable colors are
   skipped, never fabricated. Every finding anchors to its `ElementRef`.
2. **Technology detection** (`engine/technology/detect.ts`): DOM-only markers
   — the content script runs in an isolated world, so page globals
   (`window.React`, `__NEXT_DATA__`, …) are deliberately invisible. Strong
   markers (attributes, `#__NEXT_DATA__`, stylesheet/script srcs) are
   `detected`; class-name heuristics are `probable`; empty pages yield an
   empty stack.
3. **Responsive + Time Machine** (`engine/responsive/`): `breakpoints.ts` is
   pure (deterministic active-at-width mapping, `@container` parsing, folded
   layout-width scale); `time-machine.ts` runs in the content script and
   emulates widths in a lazily-created same-origin iframe — one iframe,
   resized per probe, so media queries genuinely re-evaluate. Pages that
   forbid framing return `emulated: false`; the panel falls back to the
   deterministic mapping (never a fabricated emulation).

The orchestrator streams an `audits` phase after the design units; the
worker adds `analyzeAccessibility` / `analyzePerformance` /
`analyzeResponsive` (all L2-memoized) and technologies travel through the
snapshot. The Analyze panel (`ui/screens/sidepanel/analyze/`) groups
findings by severity with click-to-highlight, shows the technology stack,
and drives the Time Machine slider via the `RUN_TIME_MACHINE` message.

## Create (Phase 6)

Four surfaces, each following the established split:

1. **Live editing** (`engine/live-edit/session.ts`, content script): a pure
   in-memory edit list + DOM application. `APPLY_LIVE_EDIT` records the
   element's computed value *before* the change so `UNDO_LIVE_EDIT` is exact;
   `CLEAR_LIVE_EDITS` reverts everything. Nothing touches a stylesheet or the
   repository, and `pagehide` drops the session — a reload reverts every
   edit by construction (law #4).
2. **Screenshot studio** (7.20): `CAPTURE_VIEWPORT` runs in the background
   (`chrome.tabs.captureVisibleTab`, which needs tab + host access the
   background holds). Element capture crops the locked element's rect at
   devicePixelRatio; fullpage capture scrolls the page in viewport steps
   (`SCROLL_TO` + `GET_PAGE_GEOMETRY` in the content script), stitches the
   tiles onto a canvas in the panel, and always restores the original scroll
   position. Screenshots persist through the repository's screenshot store.
3. **Code generation** (7.18) + **token export** (7.19): pure modules in
   `export/` — `codegen.ts` turns an `ElementInspection` into React/Vue/
   Svelte/HTML/Tailwind (accessible, responsive, deduped, faithful);
   `tokens.ts` serializes the token bundle to CSS/SCSS/Tailwind/JSON/TS.
4. **Export center** (7.24): `export-center.ts` maps every (scope, format)
   pair to a generator and assembles the project ZIP (tokens in every
   format + the locked element as React + `report.json`) with fflate.

## Messaging

One typed protocol (`shared/messages.ts`, @webext-core/messaging) shared by
content script, background, and side panel. Phase 1 proves the pipeline with
the `PING` round-trip: sidepanel → background → content → background →
sidepanel. Phase 2 adds the element-inspection surface (inspect mode, element
analysis, DOM tree, selection/navigation); Phase 3 adds the scan surface
(`SCAN_PAGE`, `FIND_INSTANCES`, `FIND_SIMILAR`, multi-selection); Phase 4
adds the asset surface (`EXPORT_ASSETS` to the background for ZIP downloads,
`FETCH_ASSET_SVG` + `HIGHLIGHT_REFS` to the content script); Phase 5 adds
`RUN_TIME_MACHINE` (width probe → iframe emulation in the content script);
Phase 6 adds live editing (`APPLY_LIVE_EDIT` / `UNDO_LIVE_EDIT` /
`CLEAR_LIVE_EDITS` / `GET_LIVE_EDITS`), screenshot geometry (`GET_PAGE_GEOMETRY`,
`SCROLL_TO` in the content script, `CAPTURE_VIEWPORT` in the background).
Heavy inspection payloads ride the message bus; small state (hover moves,
scan progress, multi-selection refs) flows through `chrome.storage` events.

## Theming

CSS custom properties in `ui/theme.css`. `data-theme` on `<html>` is resolved
to `light`/`dark` at runtime — `auto` follows `prefers-color-scheme` via a
live `matchMedia` listener — so the palette is defined exactly once. High
contrast and reduced motion are data attributes; font scale is a CSS variable
on the root. See `DECISIONS.md` for why this beats a pure-CSS media-query
approach.

The UI is a **liquid-glass material system (brand system v4)**: four
materials (thin / standard / elevated / floating) built from token-backed
recipes — translucent fill + hairline border + edge-light shadow + backdrop
blur with saturation where it is visible. The side panel is its own document,
so the "environment" the glass sits on is an ambient scene on `<body>`
(visible radial color fields + a light beam + grain — all static). Backdrop
blur is deliberately confined to floating surfaces (`.vq-float`, `.vq-overlay`,
tooltips) that have real content behind them; inline surfaces (panels, cards,
buttons, `.vq-chrome` bars) express glass through translucency and edge light
alone, which is what keeps dozens of panels cheap. High-contrast mode forces
solid fills and removes blur globally. UnoCSS shortcuts inline the material
recipes because shortcuts drop unknown classes (see the comment in
`uno.config.ts`).

The **landing page** (`landing/index.html`) is a static single-file re-skin of
the same system — its `<style>` block re-declares the v4 tokens (materials,
blur radii, `--saturate`, `--edge-light`, ambient fields, radii, ease) and
applies the identical ambient `body` environment and material-by-role rules
(thin chrome, standard content surfaces, elevated chips, floating dialog). If
you change a token value in `ui/theme.css`, mirror it in the landing's `:root`
so the two surfaces keep reading as one product; the landing's smoke gate is
`node scripts/check-landing-browsers.mjs`.
