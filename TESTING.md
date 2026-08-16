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
npm run test:torture # deterministic torture suite (needs npm run build first)
npm run probe:sites # live real-site QA probe (example.com, Wikipedia, MDN, HN)
```

Vitest uses `fake-indexeddb` (`tests/setup.ts`) so the repository adapter and
cache logic are tested in Node without a browser. Playwright needs the built
extension and a Chromium install (`npx playwright install chromium`).

## Torture suite (`scripts/torture.mjs`, master spec §49–§51)

Deterministic, network-free, repeatable stress + security regression suite. It
loads the BUILT extension in real Chromium and drives the content script over
the typed bus (plus the panel where UI behavior matters) against fixtures
served through route interception. Run `npm run build` first, then
`npm run test:torture` (or `VQ_TORTURE=<id,category> …` for a subset,
`VQ_TORTURE_MAX=…` to override the huge-DOM node count, default 250 000).
Every scenario reports TEST ID / CATEGORY / STEPS / EXPECTED / ACTUAL /
STATUS / EVIDENCE; statuses are VERIFIED PASS / FAIL / BLOCKED only.

- `TOR-001 huge-dom` — 250k-node page: scan stays bounded (12k walk / 4k
  sample caps), reports `truncated: true` honestly, completes in budget.
- `TOR-002 mutation-storm` — sustained add/remove/replace/move/class/attr
  churn while scanning + toggling inspect mode; no hang, no console errors.
- `TOR-003 element-replacement` — lock → framework rerender (`replaceWith`
  clone) → insertion before the target; identity stays honest, inspection
  reflects the CURRENT element, never a stale/wrong one.
- `TOR-004 shadow-dom` — open/closed/nested/dynamic roots; closed + dynamic
  shadow colors are never claimed as scanned.
- `TOR-005 iframe-maze` — same-origin/cross-origin/nested/sandboxed iframes;
  no SOP bypass, cross-origin colors never claimed.
- `TOR-006 csp-hostile` — `script-src 'none'` page: scan completes via the
  main-thread pipeline fallback, never hangs.
- `TOR-007 css-hostile` — `* { z-index: 2147483647 !important }` + fixed
  shroud: overlay still mounts, clicks still lock, scan completes.
- `TOR-008 live-edit-race` — edit → undo (exact original) → edit → element
  replaced → clear; law #4 holds (replacement is clean of the edit).
- `TOR-009 asset-monster` — 20+ asset types incl. 404/403/data-URL/sprite/
  poster/og/favicon; broken assets listed (failure visible), never silently
  dropped, no script-scheme asset ever extracted.
- `TOR-010 infinite-scroll` — scan → append 2000 rows → fingerprint changes →
  re-scan is not silently cached, sees the new content.
- `TOR-011 virtualized-list` — 10k logical items / ~40 DOM rows: only the
  observed DOM is reported, no false truncation.
- `TOR-012 prompt-injection-secrets` — injection text + fake secrets page:
  no API key in storage, AI refuses honestly without a key (optional by
  law #6), zero external network requests without consent.
- `TOR-013 multi-tab-isolation` — two tabs scanned alternately: results are
  tab-stamped, colors never leak across tabs.
- `TOR-014 memory-soak` — 5 activate→inspect→scan cycles with the panel open:
  no error accumulation, worker alive. (Full CDP heap-trace measurement is a
  documented limitation — see the hardening report.)
- `TOR-015 huge-css` — 10k rules, 400 variables, `@layer`, media + container
  queries, transforms/filters/containment: parsed under the engine's
  documented bounds (8k rules/sheet, 200 declarations/rule), cascade traces
  computed on a layered page.
- `TOR-016 deep-dom` — 1000 levels of nesting: bounded DOM tree, no stack
  overflow, scan completes.
- `TOR-017 svg-security` — `onbegin`/`onerror` handlers, inline `<script>`,
  `javascript:` URLs, recursive `<use>`, `foreignObject`, 5k-point paths: the
  canary fires in the page (4×) and never reaches the extension worker; raw
  observed markup preserved; render-time sanitization E2E-proven.
- `TOR-018 animation-monster` — 3000 animated/composited elements:
  animation/transition counts honest, scan completes in 15.5 s.
- `TOR-019 webgl-monster` — a live raw-WebGL scene + 2D canvas: real GL
  context scanned and inspected, canvas intact, page responsive under GL load.
- `TOR-020 spa-race` — pushState + `innerHTML` swap: the host page is never
  mutated by a scan, SPA content is observed after nav, the re-scan is NOT
  silently cached, and the L2 role memo cannot serve the previous page's
  colors (regression for BUG-H-002).
- `TOR-021 screenshot-monster` — 103 740 px page: honest geometry, exact
  scroll round-trip + restoration, single sticky node. (Pixel capture needs a
  user gesture — BLOCKED in automation, documented.)
- `TOR-022 responsive-monster` — media + container queries + a fixed-width
  overflow: Time Machine maps widths 320→1920, overflow honestly detected
  ≤375, `viewportMeta` detected.
- `TOR-023 storage-isolation + lifecycle` — page poisons its own
  localStorage/sessionStorage with Vizquo-looking keys (inert — the extension
  never reads page storage); a ref to a REMOVED element surfaces STALE with an
  actionable error and the live lock clears (regression for BUG-H-003).
- `TOR-024 nightmare` — the Tier-9 combo: rAF + WAAPI + CSS animation, SPA
  route churn, open/closed shadow roots cycled, dynamic same-/cross-origin
  iframes created then destroyed, WebGL1/2 + WebGPU canvases, and a media zoo
  (GIF/AVIF/blob/data/svg-sprite) all at once; the bus stays alive, the scan
  completes bounded, closed-shadow and cross-origin colors are never claimed,
  and the re-scan after a freeze is never silently cached.
- `TOR-025 deep-soak` — 30 activate→select→inspect→live-edit→undo→scan cycles
  under a 60 ms mutation storm with periodic reloads and panel close/reopen:
  zero panel errors, worker alive, panel heap bounded (6.2 MB → 8.4 MB).
- `TOR-026 service-worker-lifecycle` — terminate the SW via CDP
  (`Target.closeTarget`), then: message-after-restart answered, restart on
  demand, storage survives termination, 5 concurrent requests answered, full
  scan after restart. (The `ServiceWorker.stopAllWorkers` CDP method does not
  exist in this Chromium; `Target.closeTarget` on the SW target is the honest
  equivalent.)
- `TOR-027 permissions` — zero optional grants at install (only the static
  content-script `http/https` host access), full scan works with ZERO grants,
  the on-demand OpenRouter grant/revoke/retry cycle through the real Settings
  UI (auto-accept is BLOCKED by automation where the native prompt wins),
  `permissions.remove` for a subsumed origin throws the browser's own honest
  guard, and `chrome://` pages get the honest grant affordance.
- `TOR-028 tailwind-arbitrary-classes` — regression for the Vercel corpus
  finding: Tailwind-v4 classes like `@container` / `px-(--geist-page-margin)`
  made the unescaped selector throw a SyntaxError, breaking lock/inspect/
  context-target on such pages. The escaped selector round-trips in a real
  browser (regression for the `engine/dom/ref.ts` escaping fix).
- `TOR-029 message-sender-validation` — the worker's privileged handlers
  (AI_EXPLAIN, EXPORT_ASSETS, CAPTURE_VIEWPORT, OPEN_INSPECTOR_WINDOW) refuse
  non-panel senders and oversized payloads (INV-007, §15/§16): panel AI stays
  honest-disabled, a 300 KB AI payload is refused, a 501-asset export batch is
  refused, and a `javascript:` asset URL is refused with an honest reason
  (never fetched). Sender predicates are unit-tested in
  `tests/sender-guard.test.ts`.
- `TOR-030 panel-live-edit` — regression for BUG-H-004: the Create tab's live
  edit now routes through `ui.connection.tabId` (the old code sent
  content-script messages WITHOUT a tabId, so panel-initiated edits never
  reached the page). Drives the real Create-tab UI: lock → apply `color` via
  the panel → verified on the page → undo → verified reverted.
- `TOR-031 api-key-isolation` — LIVE proof of the key-isolation architecture
  (§22/INV-005): a key saved through the real Settings UI lands ONLY in the
  extension's IndexedDB (`vizquo` DB, `settings` table — the background-read
  path), never in `chrome.storage.local` (the namespace content scripts share
  with the extension), page-world JavaScript has zero `chrome.runtime`
  surface, the page origin's IndexedDB contains no `vizquo` DB, and the debug
  bundle redacts the key (verified from the actual downloaded file).

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
