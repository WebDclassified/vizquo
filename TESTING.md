# Testing

> Created by Prabhat Teotia


## How to run

```sh
npm run test        # vitest run (unit + integration)
npm run test:watch  # watch mode
npm run compile     # tsc --noEmit (strict)
npm run lint        # biome check
npm run build       # wxt build → .output/chrome-mv3 (required before E2E)
npm run test:e2e    # playwright test (loads the BUILT extension in Chromium)
```

Vitest uses `fake-indexeddb` (`tests/setup.ts`) so the repository adapter and
cache logic are tested in Node without a browser. Playwright needs the built
extension and a Chromium install (`npx playwright install chromium`).

## Current coverage

### Phase 1 — Foundation

- `tests/cache.test.ts` — L3 cache primitives: URL normalization, FNV-1a
  fingerprints, cache-key composition, kind-aware LRU eviction ordering.
- `tests/storage.test.ts` — the IndexedDB repository: CRUD for inspections,
  settings, collections, notes, history, screenshots; cache stamping, schema
  invalidation, eviction, stats, and clear.
- `tests/e2e/sidepanel.spec.ts` — Phase 1+2+3 DoD smoke test: loads the
  unpacked extension in a persistent Chromium context, opens the side panel
  page, completes the onboarding tour (and verifies it never reappears),
  switches themes, opens/filters/closes the command palette, opens the
  cheatsheet with `?`, reaches Phase 2 inspector commands and the Phase 3
  Design panel + scan hero from the palette, and asserts zero console errors.
  Host-page inspection (the full round-trip) requires granting site access,
  which browser automation cannot
  do — that part is unit-tested and manually verified.

### Phase 2 — Core inspection

- `tests/specificity.test.ts` — css-tree specificity for compound/pseudo
  selectors including `:is()`/`:not()`/`:has()`/`:where()`/`:nth-child(of S)`.
- `tests/cascade.test.ts` — winner/overridden/variable-chain resolution from
  Vizquo's own cascade output (happy-dom's computed styles are not ground
  truth).
- `tests/dom-ref.test.ts` — ElementRef generation (selector, XPath, domPath
  round-trip) and DOM tree bounding.
- `tests/measure.test.ts` — measurement labels and alignment detection
  (rects stubbed; happy-dom has no layout engine).

### Phase 3 — Design intelligence

- `tests/hash-memo.test.ts` — FNV-1a hashing and the L2 `AnalysisMemo`
  (cached vs recomputed, invalidation, stats).
- `tests/color.test.ts` — culori normalization (hex/rgb/named, alpha
  preservation, transparent rejection, neutral flag) and perceptual OKLCH
  clustering (near-duplicates merge, black/white stay separate).
- `tests/roles.test.ts` — Design-DNA color role classification (primary from
  button usage, background from most-used neutral, semantic hints, never
  fabricate without a signal).
- `tests/typography.test.ts` — px parsing, family extraction, hierarchy
  anchoring (dominant → body, larger → h1), uppercase labels, font tokens
  with sources.
- `tests/scales.test.ts` — scale detection (frequency bar, integer multiples,
  off-scale flagging), paren-safe shadow normalization, gradient
  normalization, outlier findings.
- `tests/structure.test.ts` — structural signatures, LCS similarity,
  find-similar thresholding, recurring component detection (≥3 instances).
- `tests/consistency.test.ts` — score derivation, font/style bloat penalties,
  finding surfacing.
- `tests/find.test.ts` — find-instances per kind (color/font/spacing/radius/
  shadow/gradient) with per-element dedup.
- `tests/scan.test.ts` — snapshot building under happy-dom: visible-element
  sampling with style projections, image/SVG counts, hidden-element skipping,
  font sources from `<link>` + `@font-face`, Inspection assembly.

### Phase 4 — Assets

- `tests/assets-extract.test.ts` — happy-dom extraction: `<img>` dims/alt/
  lazy/srcset, `<picture>/<source>`, inline-SVG summaries (viewBox, paths,
  fills, IDs, content bounds), external `<use>` sprites, video/audio/poster/
  lottie/favicon/og:image, CSS backgrounds from scan samples, URL dedup,
  `backgroundUrls`/`parseSrcset` pure helpers.
- `tests/assets-classify.test.ts` — role classification (source-based,
  filename hints, shape heuristics, honest `unknown`) and issue flags
  (oversized, low-res, large-file, wrong-format) — all `inferred`-labeled.
- `tests/assets-zip.test.ts` — `filenameForUrl` per-type default extensions,
  filename sanitization, and a full fflate ZIP round-trip: directory layout,
  `metadata.json` contents, CORS-failure handling.
- `tests/svg-react.test.ts` — SVG→React conversion: camelCase props,
  `class`→`className`, style objects, self-closing elements, verbatim
  entity preservation (no double-escaping), and malformed-input errors.

### Phase 6 — Create

- `tests/codegen.test.ts` — element → React/Vue/Svelte/HTML/Tailwind: style
  map dedupe + browser-default skipping, `var()` chains never emitted as
  literals, Sides → shorthand, accessible React output (typed children,
  preserved attributes, single declarations), Tailwind utility mapping,
  inline-style HTML, and slot fallbacks for empty text.
- `tests/tokens-export.test.ts` — CSS custom properties, SCSS variables,
  Tailwind config, JSON, TypeScript, **Figma Tokens (Tokens Studio)**, and
  **style-dictionary** serializers, including honest empty token sets, the
  five-file page bundle, and the seven-file page bundle with the two new
  formats.
- `tests/live-edit.test.ts` (happy-dom) — apply records the original computed
  value, undo restores it exactly, clear reverts everything, edits never
  survive a reload, and missing elements/properties are honest errors.
- `tests/export-center.test.ts` — the scope × format matrix (every format
  reachable, mismatches rejected loudly), per-scope rendering, and a full
  project ZIP round-trip (fflate) with tokens + component + report.

### Phase 8 — Library & intelligence

- `tests/library-port.test.ts` — library export/import: a full round-trip
  preserves scans, collections, notes, history, and screenshots;
  non-objects, foreign kinds, unknown versions, non-array sections, and
  rows without ids are all rejected loudly before anything is written
  (untrusted input never corrupts the database).
- `tests/fingerprint.test.ts` — the L3 cache-key fingerprint: stable for an
  unchanged page, sensitive to styles/structure/title, bounded on large pages.
- `tests/compare.test.ts` — `compareInspections`: same-value normalization
  (case-insensitive hex, font family+weight identity), only-one-side flags,
  consistency scores, technologies, gradients/shadows/radius sections.
- `tests/report.test.ts` — `buildReportHtml`: self-contained (no external
  resources), HTML-escaping of untrusted page strings (no injection), section
  coverage, graceful empty inspections.
- `tests/changelog.test.ts` — `parseChangelog`: version/title/bullet
  extraction, newest-version detection, em-dash-less headings, empty input.

### Phase 7 — Contextual AI

- `tests/ai.test.ts` — prompt hygiene: long text bounded to 200 chars, raw
  outerHTML never dumped beyond the 160-char sanitized snippet, input values
  / data-* attributes excluded by construction, payload summaries state
  exactly what is sent, and page/asset summaries omit HTML/DOM. The OpenRouter
  provider (mocked fetch) maps success, 401, 429, network failure, empty
  key, and empty model responses to honest results. The Ollama provider
  (mocked fetch) builds correct localhost requests from a base URL + model,
  and fails loudly when either is missing. The readiness gate enforces
  disabled → no-key → no-consent ordering, and the consent dialog requests
  the right host origin per provider (OpenRouter vs localhost).

### Phase 5 — Responsive & audits

- `tests/audit-a11y.test.ts` — WCAG contrast math (canonical 21:1 black/white,
  same-color 1:1, luminance sanity), large-text classification (≥24px, or
  ≥18.66px bold), and the full audit: low/critical contrast, unparsable or
  transparent colors never fabricated, missing/empty alt, unnamed
  links/buttons, unlabeled inputs (placeholder-only is a distinct warning),
  skipped heading levels, aria-hidden on focusables, tabindex>0, and
  element anchoring for highlight-on-page.
- `tests/audit-performance.test.ts` — performance findings: missing
  width/height attrs, eager-loading offscreen images, oversized assets.
- `tests/technology.test.ts` (happy-dom) — DOM-only detection: React,
  Next.js (`#__NEXT_DATA__`), Vue (`data-v-` prefix attributes), Angular
  (`ng-version`), Tailwind (stylesheet = detected, class heuristics =
  probable), jQuery/GSAP/Three.js, WordPress, Shopify, Svelte — and an empty
  stack for plain HTML (never fabricated).
- `tests/responsive.test.ts` — active-at-width mapping (min/max/compound),
  breakpoint sorting for the timeline, `@container` parsing (anonymous +
  named), real-vs-not breakpoints, and the folded layout-width scale
  (767 vs 768 is one boundary).

## Phase 9 — Release readiness & zero-cost power-ups

- `tests/tokens-export.test.ts` (extended) — Figma Tokens + style-dictionary
  serializers: Tokens Studio `{ global: { name: { value, type } } }` shape,
  Amazon nested JSON, both added to page-scope bundles.
- `tests/library-port.test.ts` — validated backup/restore, see Phase 8.
- `tests/ai.test.ts` (extended) — Ollama provider requests and error paths.
- `tests/e2e/sidepanel.spec.ts` (extended) — accessibility regression guard:
  dialogs (command palette, cheatsheet, AI explain) expose accessible names,
  theme toggles are labelled and keyboard-operable (Enter/Space), and the
  whole exercise asserts zero console errors.
- Icons: `scripts/generate-icons.mjs` renders the brand mark to
  `public/icon/icon-{16,32,48,128}.png` via Playwright's bundled Chromium
  (no new dependencies) — WXT auto-discovers them into the manifest.

## Matrix (target, per Section 4)

**Unit:** color/typography/spacing/token detection, asset detection, CSS
parsing, component detection (Phases 3–4).

**Integration:** content ↔ background ↔ sidepanel messaging, scan lifecycle,
SPA navigation, iframe handling (Phases 2–3).

**E2E (Playwright, later phases):** plain HTML, React, Next.js, Tailwind, CSS
Modules, dynamic/mutating DOM, SVG-heavy, image-heavy, animated pages,
iframes, Shadow DOM, 10k+ node pages, aggressive-CSP pages, infinite scroll.

## Definition of Done discipline

After every phase: lint, typecheck, build, check the console for errors, and
verify the phase's DoD against real pages before proceeding (Section 9).
