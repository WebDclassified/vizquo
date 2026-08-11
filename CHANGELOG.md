# Changelog

## 0.10.1 — Release hardening

- **Fixed: analysis scans could hang forever on real pages.** The analysis
  worker (color clustering, typography, scales) is constructed inside the
  content script; in production builds its URL was resolved against the
  *page's* origin (WXT rewrites `import.meta.url` to `self.location.href`),
  so the worker script 404'd and every scan stalled. The worker now loads
  through a web-accessible asset via `browser.runtime.getURL()` + a Blob URL
  (with a hang timeout and one retry) — scans complete reliably on any page.
- **Removed external Google Fonts from the extension UI** (side panel and
  window). The panels are now fully self-contained on system font stacks, so
  opening Vizquo makes **zero network requests** — nothing is loaded from
  Google or any other third party. Fully offline by default.
- **Overlay idempotency**: repeated overlay pushes no longer re-create
  identical overlays (defensive fix for rapid inspect/hover churn).
- **E2E hostile-page suite**: a 13k-node adversarial fixture now runs in CI —
  full scan completes, a malicious SVG canary never executes, the network
  stays silent, and CANCEL always beats START in a race.

## 0.10.0 — Phase 10: Measure, timelines & report print

- **Measure mode (Ruler)**: a new inspector toolbar toggle switches the page
  into click-drag measuring — press and drag between any two points and the
  overlay draws the accent ruler line with JetBrains Mono ticks (`248px`;
  diagonal drags add `↔ 248px ↕ 96px`). Scroll/resize resets the tape (it
  works in viewport coordinates), Esc clears it, and clicks measure instead
  of locking while the mode is on. Geometry is a pure module
  (`engine/inspect/measure-line.ts`) with unit tests.
- **Version timeline**: the Library gains a Timeline tab that groups every
  stored scan by URL and shows the page's scan history newest-first — each
  version with its consistency score, element count, and a compact diff
  summary against the previous version (`+3 colors −1 font` via
  `summarizeComparison`), plus one-click Open into the Design panel. Pure
  grouping + summary in `engine/timeline/timeline.ts` with unit tests.
- **Report print view**: the standalone design report now carries a fixed
  **Print / Save as PDF** button and a `@media print` stylesheet (cards and
  table rows don't split across pages, swatches keep their color), so a
  report is one click from a PDF; the Reports tab adds **Open &amp; print**
  to launch the report in its own tab.
- **Batch export by type**: the Assets panel can now export every asset of
  the current type filter in one click (`Export all SVGs`, `Export all
  Images`, …) — no checkbox dance — alongside the existing selection export.
- **Palette PNG card**: the Design panel's Colors section can download the
  detected palette as a shareable PNG card — usage-sorted swatches with hex,
  role, and use counts on the near-black surface. Pure layout geometry in
  `engine/tokens/palette-card.ts` with unit tests.
- Pure modules with unit tests: `engine/inspect/measure-line.ts`,
  `engine/timeline/timeline.ts`, `engine/tokens/palette-card.ts`, and
  `summarizeComparison` in `export/compare.ts`.

## 0.9.0 — Phase 9: Release readiness & zero-cost power-ups

- **Release-ready builds**: the extension version is now `0.8.0` end to end;
  a brand PNG icon set (16/32/48/128) is generated from the logo into
  `public/icon/` and auto-wired into the manifest; and the bundled AI key is
  **dev-only** — production builds (`wxt build`, the Web Store ZIP) ship
  keyless, so the author's credits can never be extracted from a published
  extension. The manifest carries only the permissions that run
  (`storage`, `sidePanel`, `downloads`, `contextMenus`, `activeTab`) — no
  unused `scripting`/`offscreen` — and the Firefox build is AMO-ready MV3
  with a stable gecko ID and a `data_collection_permissions: none`
  declaration.
- **CI**: a GitHub Actions workflow runs compile, lint, the full unit suite,
  Chrome + Firefox builds, and the Playwright E2E smoke suite on every push
  (free GitHub-hosted runners, xvfb for the headed Chromium tests).
- **Figma Tokens + Style Dictionary exports**: two new pure serializers in
  `export/tokens.ts` — Tokens Studio-importable `{ global: { name: { value,
  type } } }` JSON and Amazon style-dictionary nested JSON — wired into the
  export center (token/page scopes, page-scope file bundles, project ZIPs)
  and covered by unit tests. Figma teams can now drive design tokens straight
  from an inspected site.
- **Library backup / restore**: Settings → Data & cache gains Export / Import
  of the whole library (scans, collections, notes, history, screenshots) as
  one validated JSON file. Import is defensive: `export/library-port.ts`
  shape-checks every row before anything is written (untrusted input — never
  corrupts the local database).
- **Visual-regression compare flow**: the Compare tab already diffed the live
  page against stored scans; it now adds a one-click **Narrate the diff (AI)**
  that turns the structured diff into a plain-language design-drift report.
- **Library search in the command palette**: recent history, collections, and
  notes are now searchable from Ctrl/⌘K with per-type icons — stored knowledge
  is never buried.
- **Live-edit persistence**: the live-edit session is now saved per page and
  offered back after a reload — **Restore** re-applies the edits, **Discard**
  drops them. Reload still reverts by default (law #4); restore is explicit.
- **AI-prioritized audit fixes**: the Analyze panel's Audits section can ask
  the free AI pipeline to rank findings into a must/should/nice fix order with
  concrete next steps — bounded findings only, no page markup.
- **Ollama provider (zero-cost local AI)**: a second `AIProvider` behind the
  same adapter — fully local inference with no key and no cloud. Settings
  picks the provider, configures the Ollama base URL + model, and requests the
  `http://localhost/*` permission on demand. OpenRouter (free models) remains
  the default.
- **Code-split panels**: the heavy feature panels (Design, Assets, Analyze,
  Create, Library, Settings) load as separate chunks via Solid `lazy()` — the
  initial side-panel bundle drops well under the 500 kB warning.
- **Storage awareness**: Settings Diagnostics now reports the browser's
  storage estimate (usage vs quota) alongside the internal cache stats.
- **Accessibility regression guard**: a new E2E test asserts dialogs expose
  accessible names, toggles are labelled and keyboard-operable, and no console
  errors occur while exercising them.
- **Power-up batch (offline, free)**:
  - **Multi-selection screenshot** — the Screenshot studio gains a
    "Multi-selection" region that captures the union bounding box of the
    shift-clicked elements.
  - **Favorites** — one-click stars on color/font tokens and the locked
    element land in a stable Favorites collection (Library → Collections);
    token rows also gain **copy-as-var(--name)** when a value resolves to a
    detected CSS variable.
  - **Contrast explorer** — pick any two palette colors and see the live
    WCAG ratio with AA/AAA verdicts, using the audit's own math.
  - **Font specimens** — the Fonts panel now renders "The quick brown fox"
    per family and weight, with a copy-stack action.
  - **Device presets** in the Time Machine — one-click 375/768/1024/1280/1440
    widths that jump and probe.
  - **Library search** — a query box filters collections, history, and notes
    across the Library tabs.
  - **Reset everything** in Settings — wipes all local data (scans,
    collections, notes, screenshots, cache, settings) back to a fresh install.
- Pure modules with unit tests: `export/tokens.ts` (Figma Tokens +
  style-dictionary), `export/library-port.ts` (validated backup), the
  `ai/ollama.ts` provider, `engine/tokens/variables.ts` (copy-as-var), and
  `engine/accessibility/contrast-verdicts.ts` (WCAG verdicts).

## 0.8.0 — Phase 8: Library & intelligence

- **Cache-first scans (2.3)**: the panel probes the L3 persistent cache with a
  cheap page fingerprint before running any engine work — an unchanged page
  loads near-instantly; a changed page serves the stored result immediately
  (stale-while-revalidate) while a fresh scan replaces it in place. Finished
  scans persist to the cache, the inspections table, and history.
- **Component explorer (7.6)**: the Design panel now lists every detected
  component — type, confidence, instance count, expandable instance
  selectors, variants — with a one-click **Locate** that highlights the real
  elements on the page. The overview's Components metric opens the section.
- **Library panel**: five tabs — **Collections** (curate colors, components,
  assets, and screenshots with add-from-current-page), **History** (open,
  pin, and delete past scans), **Notes** (attach observations to a scan or
  collection), **Compare** (diff two inspections side by side via
  `export/compare.ts`), and **Reports** (standalone sanitized HTML via
  `export/report.ts`, previewed in a sandboxed iframe and downloadable).
- **Resizable inspector**: drag the DOM-tree divider to resize; the position
  persists (`split.inspector`) across reopenings.
- **What's new dialog**: release notes straight from `CHANGELOG.md` (bundled
  raw, parsed by a pure module) — auto-opens once per new version, and is
  always reachable from the header and the command palette.
- **Omnibox**: type `viz scan`, `viz inspect`, `viz compare`, `viz report`,
  `viz history`, or `viz settings` in the address bar — the background
  suggests commands, the side panel routes them.
- **Detachable inspector window**: the toolbar's detach button opens the
  panel UI in its own popup window (`windows.create`), same App, more room.
- **Settings diagnostics**: granted permissions, last-scan state, and a
  downloadable debug bundle (the AI API key is always redacted).
- Pure modules with unit tests: `engine/scan/fingerprint.ts` (L3 cache key),
  `export/compare.ts` (inspection diff), `export/report.ts` (standalone
  report HTML), and `shared/changelog.ts` (release-notes parser).

## 0.6.1 — AI defaults & answer quality

- **Model default is now `openrouter/free`** — OpenRouter's auto-select
  routes to the best available free model, so AI works out of the box at zero
  cost.
- **Bundled author key (dev builds)**: the extension ships with the author's
  own OpenRouter key in `ai/config.ts` so AI works immediately. A user's own
  key in Settings always overrides it; setting `AUTHOR_DEFAULT_KEY` to `''`
  ships keyless (recommended for the Web Store).
- **Answer quality**: system prompts now require a direct lead answer, values
  cited from the extracted data (source-of-truth), design reasoning, and
  explicit honesty when data is missing — plus a low temperature (0.2) and a
  larger token budget so explanations are complete.
- **Settings**: custom model slug input (pick a listed free model or type any
  OpenRouter model), and clearer key states — bundled default vs. your own
  saved key, with a one-click remove.

## 0.6.0 — Phase 7: Contextual AI

- **Privacy-gated "Why?" (7.22)**: explain why a locked element looks the
  way it does. Before the first send, the dialog shows exactly what will go
  to the model (computed styles, bounded text, CSS variables, source traces,
  a sanitized HTML snippet) and requires explicit confirmation. After
  consent, the summary stays visible above every Send button.
- **Explain the design system (7.23 commands)**: summarize a scanned page's
  tokens, type, spacing, radius, components, and consistency score in one
  request — no page HTML or DOM is ever sent.
- **BYOK provider (7.23)**: OpenRouter backend with free `:free` models by
  default, so AI costs users nothing. Users bring their own API key from
  Settings; the key is stored locally, used only by the background worker,
  never sent to the page, never logged. The shipped bundle is keyless.
- **AI off by default**: a Settings toggle; every non-AI feature works
  unchanged with AI disabled.
- **On-demand host permission**: `https://openrouter.ai/*` is an optional
  host permission requested only when the user enables AI.
- **Prompt hygiene**: all payloads are bounded and redacted in
  `ai/prompts.ts` (text ≤ 200 chars, HTML snippets ≤ 160 chars with
  `value`/`name`/`data-*` attributes stripped, input values and data
  attributes excluded by construction). Unit-tested.

## 0.5.0 — Phase 6: Create

- **Screenshot studio (7.20)**: viewport capture via the background worker
  (`chrome.tabs.captureVisibleTab`), element capture (crops the locked
  element's rect at devicePixelRatio), and fullpage capture (scrolls the page
  in viewport steps, stitches the tiles on a canvas, and restores the
  original scroll position — law #4 reversible). Captures save to the
  screenshot library via the repository.
- **Live editing (7.21)**: apply CSS edits to the locked element from the
  panel — property select + value input, per-edit undo, and a "Reset all"
  that reverts every edit. Edits exist only in the content script's memory;
  a page reload (or `pagehide`) reverts them by construction. The original
  computed value is recorded per edit so undo is exact.
- **Code generation (7.18)**: element → React / Vue / Svelte / HTML /
  Tailwind. Generated code is accessible (semantic tags, preserved
  aria/role/tabindex, typed children), responsive (flex/gap/min-max widths
  kept), non-duplicated (one deduped style map, browser defaults skipped),
  and faithful (values come from the computed styles). Tailwind output maps
  common values to utilities with arbitrary-value fallbacks.
- **Token export (7.19)**: deterministic serializers for CSS custom
  properties, SCSS variables, Tailwind config, JSON, and TypeScript — pure
  functions over the scan's token bundle.
- **Export center (7.24)**: scope × format matrix — token/page (CSS, SCSS,
  Tailwind, JSON, TS), element/component (React, Vue, Svelte, HTML,
  Tailwind), and project (a ZIP bundling every token format, the locked
  element as a React component, and a `report.json` of the page's design
  system). Preview, copy, and download.
- Command palette grows Phase 6 commands: screenshot viewport / element,
  Generate React / Tailwind, Export design tokens.
- Fixed real bugs caught by the new unit tests: `componentName` uppercased
  already-uppercase tags (`BUTTON` → `BUTTONComponent`), Tailwind's display
  mapping ignored `inline-flex`, the Tailwind config serializer emitted
  double-quoted JSON with broken indentation, live-edit module state leaked
  across page navigations (now reset on `pagehide`), and margin/padding
  `Sides` objects were passed to the style map as strings.
- Unit tests for the code generator, token serializers, live-edit session,
  and the export center matrix + project ZIP (fflate round-trip).

## 0.4.0 — Phase 5: Responsive & audits

- **Accessibility audit (7.13)**: WCAG 2.x contrast checks with exact
  relative-luminance math (normal 4.5:1, large 3:1; never fabricated when a
  color is transparent or unparsable), missing/empty `alt`, unnamed links /
  buttons, unlabeled form controls (placeholder-only is a distinct warning),
  skipped heading levels, `aria-hidden` on focusable elements, `tabindex > 0`
  anti-pattern. Every finding anchors to its element for highlight-on-page.
- **Performance audit (7.13)**: missing width/height attrs (layout shift),
  lazy-loading for offscreen images, oversized / low-resolution assets, and
  DOM size beyond the walk budget — all informational or warning-level, with
  no false "pass" for things the audit can't observe.
- **Technology detection (7.14)**: DOM-only markers (the content script runs
  in an isolated world, so page globals are deliberately invisible) for
  React, Next.js, Vue, Nuxt, Angular, Svelte, Astro, Remix, Tailwind,
  Bootstrap, CSS Modules, jQuery, GSAP, Three.js, WordPress, Shopify, and
  Wix. Strong markers are `detected`; class-name heuristics are honestly
  `probable`; plain HTML yields an empty stack.
- **Responsive intelligence (7.15)**: deterministic active-at-width mapping
  from the page's own `@media (min|max-width)` rules, `@container` parsing,
  a folded layout-width scale (767 vs 768 is one boundary, not two), and a
  viewport-meta baseline.
- **Time Machine**: same-origin iframe emulation (created once, resized per
  probe — media queries genuinely re-evaluate), reporting the real layout
  width and horizontal overflow at any chosen width. Pages that forbid
  framing fall back to the deterministic mapping with `emulated: false` —
  never a fabricated result.
- **Analyze panel**: findings grouped by severity with click-to-highlight,
  technology stack, and the Time Machine slider; skeleton states during
  scan; honest empty state.
- Fixed real bugs caught by the new unit tests: culori's `rgb` mode returns
  channels 0–1 (contrast math was dividing them by 255 again, collapsing
  every pair to ≈1:1), Vue's `[data-v-]` selector matches an attribute
  *named* `data-v-` rather than the scoped prefix (now scans attribute
  names), happy-dom doesn't populate `styleSheets` from `<link>` (Tailwind
  detection now reads `link[rel=stylesheet]` hrefs), `sortBreakpoints`
  mishandled max-width-only rules, and the breakpoint scale counted
  complementary boundaries twice.
- Unit tests for contrast math, the accessibility audit, the performance
  audit, technology detection, and responsive mapping.

## 0.1.0 — Phase 1: Foundation

- WXT + SolidJS + UnoCSS scaffold with a typed manifest and permission set
  (see `PERMISSIONS.md`).
- Typed messaging bus (content ↔ background ↔ sidepanel) with a live
  round-trip connection check.
- Storage layer: `VizquoRepository` interface + Dexie/IndexedDB adapter,
  including the L3 persistent cache (schema-versioned, LRU with blob-first
  eviction) and cache stats/clear in Settings.
- Design system: token-based theming (light / dark / auto), high contrast,
  reduced motion, font scale; buttons, panels, property rows, badges,
  confidence labels, toasts.
- Command palette (Ctrl/⌘ K), keyboard-shortcuts cheatsheet (?), Settings
  screen, and a first-run onboarding tour that never reappears after
  completion.
- On-demand site access: "Grant access to this tab" — never granted by
  default.
- Unit tests for the cache primitives and the repository adapter.

## 0.1.1 — Phase 2: Core inspection

- Element inspector with six tabs — Overview (Designer plain-language
  summaries + “Show CSS”), Layout (with box-model diagram), Appearance,
  Typography, Advanced, and Source.
- CSS source intelligence: every value traces back to its declaring rule,
  stylesheet, and line — with specificity, overridden declarations
  (struck through), CSS-variable chains, inherited sources, and matched-rule
  lists. Cross-origin stylesheets are explained, never bypassed.
- Cascade engine on css-tree: exact (inline, id, class, type) specificity
  including `:is()`/`:not()`/`:has()`/`:where()`/`:nth-child(of S)`.
- Smart measurement overlay: distances to parent, nearest siblings, viewport,
  and alignment edges; box-model layers (margin/border/padding/content);
  click-to-lock, Esc to unlock, arrow-key DOM navigation.
- DOM tree with filtering, expand/collapse, and click-to-inspect.
- Toolbar: inspect / measure / click-through toggles; per-tab inspect-mode
  badge; “Inspect with Vizquo” context-menu item.
- L1 in-memory style cache: one `getComputedStyle` and one cascade pass per
  element per scan, invalidated on SPA navigation and stylesheet changes.
- Command palette grows inspector commands; skeletons for loading states.
- Fixed: command palette now renders options — it was written against the
  pre-0.13 Kobalte Combobox API (Listbox children render-prop), which 0.13
  replaced with `itemComponent` on `Combobox.Root`. Also keeps the dropdown
  inside the modal dialog so it stays in the accessibility tree.
- Unit tests for specificity, the cascade engine, ElementRef generation, DOM
  tree bounding, and measurement.

## 0.2.0 — Phase 3: Design intelligence

- **Page scan engine (7.1)**: one time-sliced DOM walk (yields every 300
  elements, capped at 12k walked / 4k sampled), skipping non-visual subtrees
  and `display:none` nodes; produces a serializable `ScanSnapshot` the
  analysis worker consumes.
- **Design DNA (7.3)**: color roles (primary/secondary/accent/…), automatic
  typographic hierarchy (display/H1–H3/body/small/caption/label/button),
  spacing/radius/shadow/gradient scales with outliers — every value
  confidence-labeled (Detected / Derived / Inferred) with a human-readable
  basis.
- **Design Consistency score (7.2)**: 0–100, derived from spacing on-scale
  ratio, style/font/color counts, and scale outliers; broken into findings.
- **Find instances / find similar (7.8)**: every token highlights its real
  occurrences on the page (highlight layer, Esc clears); find-similar runs a
  structural tree-edit heuristic in the worker with a confidence score.
- **Multi-select (7.7)**: shift-click in Inspect mode; the panel shows common
  properties vs. differences with a one-click clear.
- **L2 worker memoization (2.3)**: Comlink analysis worker (color clustering,
  typography, scales, structure) memoized by content hash — rescanning an
  unchanged page serves cached results instantly; `cached`/`stale` flags are
  surfaced honestly in the overview.
- **Design panel**: clickable metrics overview (every metric opens its
  section), color system by role, typography hierarchy + fonts with sources,
  spacing/radius/shadow/gradient scales, CSS variables, breakpoints,
  findings — with progressive skeleton reveal (colors → type → scales →
  structure).
- Fixed real bugs caught by the new unit tests: the OKLCH cluster threshold
  (4.0 would merge every color — OKLCH L is 0–1, black↔white is ~1.0),
  `formatHex` dropping alpha (semi-transparent colors collapsed into opaque),
  the scale detector never producing off-scale values (every value became a
  step), SVG `tagName` being lowercase (SVGs were never counted), shadow
  parsing splitting `rgba(…)` on internal spaces, and Google Fonts links with
  multiple `family=` params only reading the first.
- Unit tests for hashing/memo, color clustering, role classification,
  typography hierarchy, scale detection, structural similarity,  consistency scoring, find-instances matching, and the scan snapshot builder.

## 0.3.0 — Phase 4: Assets

- **Asset extractor (7.10)**: one DOM pass in the content script extracting
  `<img>` (incl. `currentSrc`/`srcset`), `<picture>/<source>`, CSS
  backgrounds (from the scan's computed samples — no second
  `getComputedStyle` pass), inline SVGs, SVG `<use>` sprites, `<video>`
  (incl. posters) / `<audio>`, Lottie players, favicons, and Open Graph
  images — deduped by absolute URL, capped at 500 with an honest `truncated`
  flag. Natural/rendered dimensions (with width/height attribute fallback
  before layout), alt text, lazy state, and element refs for highlighting.
- **Asset intelligence**: pattern-based role classification (logo / hero /
  product-image / icon / avatar / illustration / decoration / background /
  screenshot) always labeled `inferred` with a basis; issues flagged, never
  asserted — oversized (natural ≥ 2× rendered), low-resolution source,
  large file, wrong-format.
- **SVG inspector**: viewBox, dimensions, path count, fills/strokes, IDs,
  classes; the SVG renders in shadow DOM (untrusted page content); actions:
  copy SVG, download, copy URL, open, and **convert to a React component**.
- **Bulk ZIP export**: background worker fetches every selected asset and
  packs `vizquo-assets/{type}/{filename}` + a self-describing `metadata.json`
  (page URL, per-asset status, size). CORS failures are recorded in the
  metadata — never silently dropped.
- **Assets panel**: type filters with counts, select-all / select-all-assets /
  clear, multi-select card grid with previews and issue badges, per-asset
  highlight-on-page, and the one-click Export ZIP action.
- Fixed real bugs caught by the new unit tests: the SVG→React scanner never
  accumulated text between tags (empty `<text>`), `class` wasn't converted to
  `className`, `filenameForUrl` ignored the per-type default extension
  (produced `.bin`), `video.poster` isn't reflected in every DOM runtime
  (now read via `getAttribute`), and image rendered dimensions were 0×0
  before layout (attribute fallback).
- Unit tests for extraction (happy-dom), classification + issues, ZIP
  assembly (fflate round-trip), and the SVG→React converter.

