# Vizquo — Tomorrow's Handoff

> Everything you need to pick this project back up tomorrow. If you read one
> file, read this one; then `CHANGELOG.md` for the full history and
> `ARCHITECTURE.md` / `DATA_MODEL.md` for the deep dive.

---

## 1. What this project is

**Vizquo** — a browser extension (Chrome + Firefox) for designers and frontend
developers: inspect a live webpage and understand its visual system. A "lens
into the visual DNA of the web": structure, CSS, typography, colors, spacing,
assets, components, design tokens, responsive behavior, accessibility.

- **Inspect** → **Understand** → **Extract** → **Rebuild**
- Tagline: *See beyond the surface.*
- All data is **local** (IndexedDB) — nothing leaves the browser except the
  optional, consent-gated AI request (OpenRouter free models or local Ollama).
- 100% **free to run** — no paid services, no new dependencies needed for any
  feature so far.

### Stack
WXT (web-extension toolkit, v0.21) · SolidJS · UnoCSS · TypeScript (strict) ·
Dexie/IndexedDB · Comlink worker · Vitest + Playwright · Biome

### Current version
- `package.json` version: **0.10.9** ✅ (in sync with CHANGELOG).

---

## 2. Current state — everything is green ✅

Last full validation (all passed):

| Check | Command | Result |
|---|---|---|
| Type check | `npm run compile` | ✅ clean |
| Lint | `npm run lint` | ✅ **fully clean** (landing's pre-existing `!important`/descending-specificity warnings are now a documented rule override) |
| Unit tests | `npm run test` | ✅ **402/402** |
| Production build (Chrome MV3) | `npm run build` | ✅ keyless, 1.3 MB |
| Firefox AMO-ready build | `npm run build:firefox:mv3` | ✅ |
| E2E (Playwright, 13 tests) | `npm run test:e2e` | ✅ 12 pass, 1 honest skip (grant-dependent capture success) |
| Live probe (core + advanced) | `node scripts/probe-extension*.mjs` | ✅ 7/7 + 7/7 (capture SKIPs without host access) |
| Live probe (real sites) | `node scripts/probe-real-sites.mjs` | ✅ 19/19 — example.com, Wikipedia, MDN, HN |
| Big-site verification (YouTube) | `node scripts/diag-youtube.mjs` | ✅ scan completes via main-thread fallback (~20 s) |
| Landing smoke (3 engines) | `node scripts/check-landing-browsers.mjs` | ✅ chromium · firefox · webkit |
| Torture suite (deterministic stress/security) | `npm run test:torture` | ✅ **23/23** (huge-dom/css, deep-dom, mutation storm, shadow/iframe/SVG/CSP, spa-race, WebGL, responsive, secrets, storage isolation) |
| Store ZIP | `npm run zip` | ✅ `vizquo-0.10.9-chrome.zip` |

Manifest permissions (minimal, all used): `storage`, `sidePanel`, `downloads`,
`contextMenus`, `activeTab`. No unused `scripting`/`offscreen` (WXT auto-adds
those in dev mode only). Production bundles are **keyless** (the author's
OpenRouter key is stripped by `import.meta.env.DEV` gating).

---

## 3. What's built (feature inventory)

**Phase 1 — Foundation**: typed message bus (content ↔ background ↔ panel),
repository pattern + IndexedDB adapter (incl. L3 cache), design system
(light/dark/auto, high contrast, reduced motion, font scale), command palette
(Ctrl/⌘K), cheatsheet (?), settings, onboarding tour, on-demand site access.

**Phase 2 — Inspection**: element inspector (Overview/Layout/Appearance/
Typography/Advanced/Source tabs), CSS source-of-truth traces (specificity,
overridden declarations, variable chains, inheritance), smart measurement
overlay, box-model layers, DOM tree, arrow-key navigation, context menu.

**Phase 3 — Design intelligence**: time-sliced page scan → analysis worker
(Comlink, L2 memoized) → Design DNA: color roles, typographic hierarchy,
spacing/radius/shadow/gradient scales, consistency score 0–100, find
instances / find similar highlighting, shift-click multi-select, progressive
section reveal.

**Phase 4 — Assets**: extractor (img/picture/CSS bg/inline SVG/use sprites/
video/audio/Lottie/favicon/OG), role classification + issue flags (never
asserted), SVG inspector + SVG→React converter, bulk ZIP export via background
worker (CORS failures reported, never bypassed).

**Phase 5 — Responsive & audits**: WCAG contrast audit (exact luminance math),
performance audit, technology detection (DOM-only), breakpoint + @container
parsing, Time Machine (iframe emulation at any width).

**Phase 6 — Create**: screenshot studio (viewport/element/fullpage/multi-
selection), live editing (in-memory, revertible), codegen (React/Vue/Svelte/
HTML/Tailwind), token exports (CSS/SCSS/Tailwind/JSON/TS/Figma/style-dict),
export center.

**Phase 7 — AI**: privacy-gated "Why?" explanations, explain design system,
BYOK OpenRouter (free models by default) + local Ollama provider, AI off by
default, prompt hygiene (bounded/redacted payloads).

**Phase 8 — Library & intelligence**: cache-first scans (L3 fingerprint),
component explorer, Library panel (Collections/History/Notes/Compare/Reports),
resizable split pane, What's-new dialog, omnibox commands, detachable
inspector window, settings diagnostics.

**Phase 9 — Release readiness + power-ups**: CI workflow, Figma Tokens +
Style Dictionary exports, backup/restore, AI-narrated diff compare, palette
search in ⌘K, live-edit persistence, AI-prioritized audit fixes, code-split
panels, storage estimates, multi-selection screenshot, favorites + copy-as-var,
contrast explorer, font specimens, device presets, library search, reset-all.

**Phase 10 — just shipped today**:
- **Measure mode (Ruler)** — click-drag ruler with JetBrains Mono ticks
  (`engine/inspect/measure-line.ts` + overlay + controller gesture).
- **Version timeline** — Library tab grouping every scan per URL with
  per-version diff summaries (`engine/timeline/timeline.ts`,
  `summarizeComparison` in `export/compare.ts`).
- **Report print view** — in-report Print/Save-as-PDF button + `@media print`
  CSS; Reports tab "Open & print".
- **Batch export by type** — "Export all SVGs/Images/…" in the Assets panel.
- **Palette PNG card** — download the palette as a PNG
  (`engine/tokens/palette-card.ts` layout + canvas renderer).

---

## 4. Architecture map (where things live)

```
entrypoints/
  background.ts        message handlers, capture, export, windows, omnibox
  content.ts           page-side: inspect controller + scan orchestrator wiring
  sidepanel/main.tsx   panel entry
engine/                pure logic, unit-tested, no browser deps where possible
  analysis/            scan orchestrator + Comlink worker client
  inspect/             controller.ts, overlay.ts, measure-line.ts (Phase 10)
  css/                 cascade + style cache
  dom/                 refs + DOM tree
  measure/  responsive/  scan/  tokens/  accessibility/  performance/
  technology/  live-edit/  assets/  timeline/            ← timeline is Phase 10
export/                compare.ts, report.ts, tokens.ts, library-port.ts, codegen
shared/                types.ts (the data model), messages.ts (typed bus), constants.ts
storage/               repository.ts (interface) + adapters/indexeddb (Dexie)
ui/screens/sidepanel/  panels: inspect/ design/ assets/ analyze/ create/ library/
ui/stores/             analysis-store, ui-store, persisted-store
ai/                    provider adapter: openrouter.ts + ollama.ts, prompts.ts, config.ts
tests/                 unit tests (mirror engine/export layout) + e2e/sidepanel.spec.ts
```

**Conventions (follow these when adding code):**
- Every feature goes through the typed message bus (`shared/messages.ts`) —
  never stringly-typed `postMessage`.
- Pure logic lives in `engine/` or `export/` with a unit test; UI components
  stay thin. **New pure module → new test file** (see `tests/`).
- Data access only via `repository` (`storage/repository.ts`) — never touch
  IndexedDB directly from UI code.
- All page-derived content is treated as untrusted: set via `textContent`,
  escape in reports, sandbox iframes, shadow-DOM for page SVGs.
- Honesty laws: confidence labels on every inference, `truncated` flags,
  CORS failures reported, never fabricated audit results.

**Docs that matter:** `ARCHITECTURE.md`, `DATA_MODEL.md`, `PERMISSIONS.md`,
`SECURITY.md`, `PRIVACY.md`, `TESTING.md`, `DECISIONS.md`, `CHANGELOG.md`.

---

## 5. Commands (daily workflow)

```bash
npm run dev              # Chrome dev build with HMR (auto-adds scripting/tabs)
npm run dev:firefox      # Firefox dev
npm run compile          # strict tsc — fast feedback
npm run lint             # Biome
npm run lint:fix         # Biome auto-fix
npm run test             # unit tests (vitest, 392 tests)
npx vitest run tests/foo.test.ts   # one test file
npm run test:e2e         # Playwright E2E (needs `npm run build` first — loads .output/chrome-mv3)
npm run build            # production Chrome build (keyless)
npm run build:firefox:mv3  # AMO-ready Firefox build (gecko ID + data_collection none)
npm run zip              # store-ready ZIP → .output/
```

**Validation before anything ships:** `compile` → `lint` → `test` → `build` →
`test:e2e` (in that order; E2E tests the built artifact).

---

## 6. What's left to do

### A. Human/store tasks (the only blockers to market)
1. **Chrome Web Store**: create a developer account (one-time $5), submit the
   ZIP (`npm run zip`) with description, 1–5 screenshots, and a **privacy
   policy URL** (publish `PRIVACY.md` to a page/gist).
2. **Firefox AMO**: submit `.output/firefox-mv3` (same listing needs:
   description + screenshots).
3. **Manual QA on real sites is now automated** (`scripts/probe-real-sites.mjs`
   runs connect → inspect-lock → right-click → scan on example.com,
   Wikipedia, MDN, HN). Still worth a human pass on the **screenshot studio
   with a real toolbar click** (grants `activeTab`, which automation can't)
   and the **Ruler** with a connected page.

### A4. Triage: the CI probe job failed

The `probe` job runs the real-sites probe against live pages, so a failure is
usually the *site* changing markup, not the extension — treat it as a probe
maintenance task first: re-run locally with `node
scripts/probe-real-sites.mjs`, and if the failing check is a target-picker or
click-landing issue (not a connect/scan/console-error regression), fix the
probe's selector/point and re-push. Only investigate extension code when the
probe reports a connect failure, a scan failure, or console errors on a site
that used to pass.

### B. Suggested features not yet built (all free, all reuse existing machinery)
- **AI "Explain the difference" between two timeline versions** — the Compare
  tab already has "Narrate the diff (AI)"; wire the same pipeline into the
  Timeline tab so a version pair can be narrated in place.
- **Copy as Tailwind on the locked element** — reuse the codegen Tailwind
  mapping on the inspector Overview.
- **Palette wallpaper/vertical banner** — a second layout for
  `palette-card.ts` (cover-image format).
- **Timeline metadata-only query** — repository method returning light rows
  instead of full inspections (see gotcha #2).
- **Report PDF** — the print path exists; a direct `print`-triggered download
  or PDF export would complete it.### C. Known trade-offs / technical debt (fix only when they bite)
1. `package.json` version lag (see A4).
2. ✅ **FIXED — inspection GC** (`storage/adapters/indexeddb/indexeddb-repository.ts`
   `gcInspections()`): every history write keeps history-referenced inspections
   plus the newest `MAX_VERSIONS_PER_PAGE` (25) per URL and prunes the rest —
   storage can no longer grow unboundedly on repeated rescans.
3. ✅ **FIXED — timeline metadata query**: `listInspectionMetas()` returns a
   light projection (no assets/findings); `TimelineTab` renders + diffs from
   metas and fetches the full payload only when a version is "Open"ed.
4. ✅ **FIXED — layering**: `normalizeCacheUrl` moved to `shared/url.ts`
   (re-exported by the cache adapter so imports keep working);
   `engine/timeline` no longer imports from `storage/` internals.
5. Measure mode + click-through are mutually exclusive in the panel client;
   the controller independently guards clicks while measuring.

---

## 7. Key gotchas & lessons (learned the hard way)

- **Builds are keyless by construction**: `AUTHOR_DEFAULT_KEY` in
  `ai/config.ts` is `''` in every build (a bundled dev key was removed —
  GitHub secret scanning blocks keys in public repos). After any build,
  verify with `grep -ro 'sk-or-[a-zA-Z0-9]\{8,\}' .output/chrome-mv3 | wc -l`
  → must be 0. Users add their own key in Settings or use Ollama.
- **Manifest permissions are minimal on purpose** (`storage`, `sidePanel`,
  `downloads`, `contextMenus`, `activeTab`). Store reviewers flag unused
  permissions — don't re-add `scripting`/`offscreen`; WXT injects them
  automatically for dev HMR only.
- **Firefox needs MV3 + gecko ID + `data_collection_permissions: { required:
  ['none'] }`** — already configured; use `npm run build:firefox:mv3`, never
  the default MV2 build, for AMO submissions.
- **Content scripts inject without a host grant** (static manifest `matches`
  on http/https) — a fresh profile auto-connects on real sites. The native
  permission prompt is still needed for `captureVisibleTab`; automation can't
  always complete it, so grant-dependent checks SKIP honestly (probes + the
  capture E2E) and `activeTab` (toolbar/context-menu invocation) covers real
  users. Also: **the Inspect switch name is ambiguous** — the connection
  card has "Inspect mode" AND the toolbar has "Inspect"; use `exact: true`
  when targeting one.
- **Strict page CSPs block the blob analysis worker — the scan falls back to
  the main thread now.** YouTube (and other big sites) ship a CSP whose
  `script-src` has no `blob:`. `new Worker(blobUrl)` *succeeds* there but the
  worker never loads: no Comlink reply ever arrives, so every scan hung until
  the 90 s timeout ("The analysis worker did not respond"). The fix:
  `engine/analysis/pipeline.ts` is the single pure analysis pipeline used by
  BOTH the worker and a main-thread fallback; the orchestrator health-checks
  a freshly-built worker (`ping()` + the worker `error` event, 2.5 s window)
  and runs the identical pipeline synchronously when the worker is blocked.
  Detection lives in `engine/analysis/orchestrator.ts` — if you change the
  analysis, change the pipeline, never the worker wrapper.
- **Big-site scans are slower than small-site scans, by design.** The DOM
  walk now pre-filters with `el.checkVisibility()` (cheap, catches hidden
  ancestors + `content-visibility`) before `getComputedStyle` — YouTube went
  from ~34 s to ~20 s and samples only rendered elements (hidden subtrees are
  noise, not tokens). The remaining cost is walking YouTube's enormous CSS
  rule sets (`collectVariables`/`collectBreakpoints`) — bounded, cached by
  the style cache, and streamed to the panel progressively, so it completes.
- **Format before validating**: `npx biome check --write .` then `npm run
  lint` — Biome formatting differences fail the lint gate.
- **Solid patterns**: use `For` (not `.map`) for lists, `createSignal` for
  local UI state, and the three explicit stores (`analysis`, `ui`,
  `persisted`) — don't add ad hoc stores.
- **JSX gotcha**: lucide-solid icon names differ from lucide-react (e.g.
  `OpenInNew` doesn't exist — use `Eye`); check the icon exists before using.
- **Windows shell**: commands run in bash (`ls`, forward slashes), not cmd.

---

## 8. Files changed today (0.10.8 — probes in CI, real-site QA, handoff UX) — in case you need to review or revert

| File | What |
|---|---|
| `ui/screens/sidepanel/connection.ts` | **injection-race fix** (bounded silent retries when a reachable page's content script hasn't injected yet) + **tab-switch sync** (inspector store mirrors the content script's inspect state; old tab's selection/DOM dropped when the connected tab changes) |
| `engine/inspect/controller.ts` | `selectRef(ref, { flash })` — scroll-into-view + 1.8 s attention pulse on right-click handoff |
| `engine/inspect/overlay.ts` | `.vq-flash`/`.vq-flash-chip` layer (own z-layer, reduced-motion aware) |
| `shared/messages.ts` | `SELECT_ELEMENT` gains optional `flash` |
| `entrypoints/content.ts` | passes `flash` through to the controller |
| `ui/.../inspector/inspector-client.ts` | `selectElement(ref, { flash })` |
| `ui/.../sidepanel/App.tsx` | handoff toasts (selected / vanished-element warning); guards the storage-removal echo that duplicated toasts |
| `scripts/probe-lib.mjs` | NEW — shared probe harness (launch/open/onboarding/connect/errors/reporter; CI-safe `--no-sandbox`) |
| `scripts/probe-extension.mjs` + `probe-extension-advanced.mjs` | refactored onto the harness (same 7/7 + 7/7) |
| `scripts/probe-real-sites.mjs` | NEW — deterministic 4-site QA (19/19); layout-agnostic click targeting |
| `.github/workflows/ci.yml` | NEW `probe` job (xvfb) running all three probes on every push |
| `tests/connection.test.ts` | +3: retry chain (success + bounded give-up), tab-switch store sync |
| `tests/controller-lifecycle.test.ts` | +1: flash + scroll-into-view on `selectRef({ flash })` |
| `tests/create-client.test.ts` | NEW — 8 capture-flow tests (viewport guard/success, fullpage stitching, cap, scroll restore) |
| `tests/e2e/handoff.spec.ts` | NEW — handoff selects + flashes + toasts; vanished-element warning |
| `tests/e2e/capture.spec.ts` | NEW — deterministic error path + conditional success path (honest skip) |
| `tests/e2e/hostile.spec.ts` | manual "Check" click removed — the auto-connect retry chain made it obsolete (and it broke once connected) |
| `CHANGELOG.md` | 0.10.8 entry |

## 9. Files changed today (0.10.5 — context-menu fix) — in case you need to review or revert

| File | What |
|---|---|
| `engine/inspect/controller.ts` | contextmenu listener now registered in the constructor — the "Inspect with Vizquo" right-click handoff works with inspect mode OFF (it previously returned `null` and the panel opened with nothing selected) |
| `tests/controller-lifecycle.test.ts` | updated listener counts + 2 regression tests for the context-target fix |
| `scripts/probe-extension.mjs` | NEW — live probe: loads the built extension in real Chrome, connects (grant→reload), scans, audits console errors |
| `scripts/probe-extension-advanced.mjs` | NEW — right-click handoff, screenshot, time machine, detach window, export center |
| `CHANGELOG.md` | 0.10.5 entry |

Probe notes: screenshots fail in automation because the panel is driven as a tab (captureVisibleTab needs the active tab + activeTab/host grant — real users get activeTab from the toolbar click). Everything else passes; context-menu + detach + scan verified live.

---

## 10. Files changed today (Phase 10) — in case you need to review or revert

| File | What |
|---|---|
| `engine/inspect/measure-line.ts` | NEW — ruler geometry (pure) |
| `engine/inspect/controller.ts` | measure gesture + Esc/scroll handling |
| `engine/inspect/overlay.ts` | ruler layer (line, dots, labels, rect) |
| `shared/types.ts` | `OverlayOptions.measureMode` |
| `ui/.../inspector/inspector-store.ts` | `measureMode` in overlay state |
| `ui/.../inspector/inspector-client.ts` | mutual exclusion + merge |
| `ui/.../inspector/InspectorToolbar.tsx` | Ruler toggle |
| `engine/timeline/timeline.ts` | NEW — URL grouping (pure) |
| `export/compare.ts` | `summarizeComparison` |
| `ui/.../library/tabs/TimelineTab.tsx` | NEW — timeline UI |
| `ui/.../library/LibraryPanel.tsx` | sixth tab |
| `ui/.../library/library-client.ts` | `listInspections()` |
| `export/report.ts` | print button + `@media print` |
| `ui/.../library/tabs/ReportsTab.tsx` | Open & print |
| `ui/.../assets/AssetsPanel.tsx` | export-by-type |
| `engine/tokens/palette-card.ts` | NEW — palette layout (pure) |
| `ui/.../design/palette-card-render.ts` | NEW — canvas renderer |
| `ui/.../design/ColorSystem.tsx` | PNG card button |
| `tests/measure-line.test.ts`, `tests/timeline.test.ts`, `tests/palette-card.test.ts` | NEW |
| `tests/compare.test.ts`, `tests/report.test.ts`, `tests/e2e/sidepanel.spec.ts` | updated |
| `CHANGELOG.md` | 0.10.0 entry |

---

## 11. Files changed today (CSP-proof analysis — big-site scans) — in case you need to review or revert

| File | What |
|---|---|
| `engine/analysis/pipeline.ts` | NEW — the pure Design DNA pipeline extracted from the worker (colors/typography/scales/structure/assets/audits + L2 memos + `ping()`); runs in the worker AND on the main thread as the fallback |
| `workers/analysis-worker.ts` | slimmed to a Comlink wrapper over the pipeline (the RPC surface is unchanged) |
| `engine/analysis/orchestrator.ts` | worker creation now health-checks via `ping()` + `error` event (2.5 s); CSP-blocked/blob-fetch-failed → main-thread pipeline fallback; `AnalysisRunner` type accepts sync + async runners |
| `engine/scan/scan.ts` | walk pre-filters with `el.checkVisibility()` before `getComputedStyle` — big sites (YouTube) skip hidden/collapsed subtrees cheaply |
| `tests/analysis-pipeline.test.ts` | NEW — full pipeline surface + L2 memoization (covers the fallback path in unit tests, not just live probes) |
| `scripts/diag-youtube.mjs` | NEW — loads the built extension against YouTube: connect → lock → overlay → **timed scan**; reports where the flow breaks (used to find + verify this fix) |
| `tomorrow.md` | this handoff |

**How to verify live:** `npm run build` → `node scripts/diag-youtube.mjs` → the scan reports
`ok=true` (previously `ok=false … timed out — the page may block web workers` after 90 s).
A CSP violation + `[vizquo] analysis worker error` in the page console is **expected** — that's
the worker attempt being blocked, which now routes to the fallback instead of hanging.

## 12. Files changed today (UI redesign — refined glassmorphism, brand system v3)

| File | What |
|---|---|
| `ui/theme.css` | **the liquid-glass material system (v4)**: ambient environment on `body` (3 visible color fields + a top-left light beam + baked-in SVG grain — all static, zero repaint cost), four token-backed materials (`--vq-mat-*-bg`, `--vq-blur-*`, `--vq-saturate`), edge-light shadow token, translucent app/surface tokens, literal glass classes (`.vq-chrome` = thin material, `.vq-float` = floating material with blur+saturate, `.vq-overlay` = dim+blur scrim), universal high-contrast blur-kill + solid-fill overrides, `vq-fade-in` entrance, z-layer map |
| `uno.config.ts` | shortcuts inline the material recipes (UnoCSS **drops unknown classes in shortcuts** — that's why `vq-panel`/`vq-btn-secondary`/`vq-tooltip` carry their own declarations instead of a `.vq-mat-*` class). **Performance rule: blur only where visible** — tooltips (elevated material) get backdrop blur because they float over real content; panels/cards/buttons sit on the soft ambient scene, so blurring it would be invisible → they express glass through translucency + edge light alone (no backdrop-filter, no layer promotion cost) |
| `ui/components/Badge.tsx`, `Segmented.tsx`, `Toggle.tsx` | glass pills (tinted fill + hairline), sunken segmented track with inset well + raised thumb, switch track with inner shadow + accent glow |
| `ui/components/GuidedTour.tsx` | overlay + card are now `vq-overlay`/`vq-float` |
| `ui/stores/toast.tsx` | toasts are `vq-float` (blurred glass) |
| `Header.tsx` / `NavTabs.tsx` / `Footer.tsx` | glass chrome bars (`vq-chrome`), selected tab gets a rim-light |
| `CheatsheetDialog.tsx` / `WhatNewDialog.tsx` / `AiExplainDialog.tsx` / `CommandPalette.tsx` / `AssetsPanel.tsx` | overlays → `vq-overlay` (dim + blur), contents → `vq-float` (blurred glass) |
| `scripts/diag-ui.mjs` | NEW — verifies the glass system renders (ambient, translucent panels, chrome, blurred palette, HC fallback) and saves light/dark/palette screenshots to the OS temp dir |

**Why it's fast:** backdrop blur exists only on surfaces where it is *visible* — dialogs, palette, toasts, tooltips (small, few at a time). Panels/cards/buttons/chrome are translucent + edge-lit with NO `backdrop-filter`, so dozens of them cost no blur composites; the ambient scene is static gradients + one grain tile (painted once, fixed while scrolling); all entrances are opacity-only 140 ms; high-contrast (solid fills, blur killed globally) and reduced-motion are enforced at the token level. Verified by `scripts/diag-ui.mjs` + pixel sampling: dark top-left reads a clear violet field (rgb ≈ 22,23,46) through the glass.

## 13. Files changed today (landing — liquid-glass, brand system v4)

| File | What |
|---|---|
| `landing/index.html` | **re-skinned into the extension's liquid-glass v4 system** — same palette, materials, ambient environment, radii, and motion, so the site and the side panel read as one product. No HTML structure or JS hooks changed; only the `<style>` block's tokens/recipes plus one instrumentation addition |

**What changed:**
- **Design tokens mirror the extension** — `--mat-thin/standard/elevated/float` (α 0.34/0.5/0.58/0.68), `--blur-*` (10/16/20/26), `--saturate: 1.5`, `--edge-light` (inset top + side rims), ambient fields, palette (`#08090e` bg, `#6e7bff` indigo, `#3fe0c8` teal, `#a78bfa` violet), radii 16/10, `--ease-out` cubic-bezier(.16,1,.3,1).
- **Ambient environment on `body`** — the extension's exact scene: 4 fixed radial color fields (violet top-left, teal bottom-right, indigo top) + a soft top-left beam + baked-in grain, `background-attachment: fixed` so glass reads through at any scroll position. The old separate `body::after` grain overlay was removed (grain is baked in now).
- **Four materials applied by role** — thin (header/nav/pill/ghost buttons/chips), standard (cards, steps, features, AI cards, browser frame, inspector, chat, hero stats, details, table, free card), elevated (floating chips, back-top, blur 20), floating (download dialog, blur 26 + saturate). Every surface carries the edge-light rim; primary buttons get an inset top sheen.
- **Performance rule carried over from the panel** — backdrop blur only where visible: header (scrolls over content), hero pill/stats, showcase/inspector/chat (over the aurora), chips, dialog, back-top. Grid cards are translucent + edge-lit with **no backdrop-filter** (blurring the flat mid-page background would be invisible and would multiply compositing layers).
- **Instrumentation** — the live demo inspector footer now shows cursor coordinates (`x:625 y:042`, mono + tabular-nums); mono values use tabular numerals.

**Verification:** `node scripts/check-landing-browsers.mjs` → **all 3 engines pass** (hero, counters, demo rows, download overlay + Escape, burger, back-top, reduced-motion, zero console errors). Computed-style glass checks all pass (materials, blurs, edge light, fixed ambient, coordinate readout). Screenshots for eyeballing: OS temp dir `vizquo-landing/` (hero + features). Lint: zero NEW warnings vs baseline (the 20 `noImportantStyles`/`noDescendingSpecificity` warnings in this file are pre-existing).

**Promo refresh (same glass theme):** `scripts/generate-promo-tile.mjs` now renders the v4 glass language — dark base `#08090e`, ambient radial fields (violet/teal/indigo) + top-left beam, edge-lit glass chips (inset highlight), translucent panel mock in the OG card, v4 accent values. Single dark theme by design — there is **no light/dark mode** anywhere in the landing/promo (the landing has no `prefers-color-scheme` handling; the only theme meta is the browser-chrome `theme-color`). Regenerate with `node scripts/generate-promo-tile.mjs` (writes `deploy-kit/promo/`; the OG card is the landing's `og:image`).

**De-flash pass (calm glass, not fancy):** after review, all decorative motion machinery was stripped from `landing/index.html` (−337/+65 lines) — word-mask headline reveals + `data-split` attributes + `wordSplit()` JS, aurora drift orbs (hero + CTA, `display:none` already; now deleted), 3D tilt cards + `perspective`, magnetic cursor, scroll-progress bar (CSS+div+JS), `hitPulse` selection ring, `--grad-anim` token, download-logo `dlFloat` bob, and spring-ease icon hovers (now gentle `ease-out` lifts). What remains animates only where it communicates: the 32s logo marquee, the download progress ring/sheen, the typing dots in the AI chat mock, scroll-reveal fades (`.reveal`/`.reveal-l`/`.reveal-r`), and the mobile-menu `dropIn`. The technical hero grid (`hero-grid`) stays — it's instrumentation, not decoration. Re-verify: `node scripts/check-landing-browsers.mjs` (all 3 engines pass; zero console errors; only `marquee-track` + `dl-ring` animate).

## 14. Files changed today (remaining-issues sweep — storage GC + timeline perf + lint) — in case you need to review or revert

| File | What |
|---|---|
| `shared/url.ts` | NEW — `normalizeCacheUrl` moved out of the storage adapter (pure, shared across layers) |
| `storage/adapters/indexeddb/cache.ts` | imports + re-exports `normalizeCacheUrl` (no behavior change) |
| `shared/constants.ts` | `MAX_VERSIONS_PER_PAGE = 25` — single source for the timeline cap |
| `shared/types.ts` | `InspectionMeta` — light inspection projection (id/page/createdAt/tokens/gradients/breakpoints/technologies/consistencyScore/scannedElementCount) |
| `storage/repository.ts` | `listInspectionMetas()` on the repository contract |
| `storage/adapters/indexeddb/indexeddb-repository.ts` | `listInspectionMetas()` projection + `gcInspections()` (runs on `saveHistory` and `deleteHistory`: keeps history-referenced + newest 25 per URL, prunes the rest) |
| `engine/timeline/timeline.ts` | now groups `InspectionMeta[]`; imports the cap + normalizer from `shared/` |
| `export/compare.ts` | `compareInspections` accepts the inspection summary shape it actually reads (full `Inspection` or `InspectionMeta`) |
| `ui/.../library/library-client.ts` | `listInspectionMetas()` wrapper |
| `ui/.../library/tabs/TimelineTab.tsx` | loads metas only; "Open" fetches the full inspection lazily (toast if the scan is gone) |
| `ui/.../design/scan-client.ts` | imports `normalizeCacheUrl` from `shared/url` |
| `tests/storage.test.ts` | +4: meta projection, per-URL GC cap, history-referenced keep, deleteHistory GC |
| `biome.json` | landing joins the `ui/theme.css` rule override (intentional `!important`/descendant selectors in the hand-written token stylesheet) — `npm run lint` is now **fully clean** |
| `landing/index.html` | biome auto-fix (`Math.pow` → `**`) — behavior-identical |
| `ui/components/GuidedTour.tsx` | optional-chain auto-fix — behavior-identical |
| `scripts/check-landing-browsers.mjs` | download check now verifies only local `downloads/` ZIPs (the Safari "vote" button is an external destination — checking it made the gate flaky on slow/blocked outbound networks) |

**How to verify:** `npm run test` (396/396) → `npm run build` → `npm run test:e2e` (12 pass + 1 honest skip) → `node scripts/check-landing-browsers.mjs` (3 engines).

## 15. Hardening mission (master-spec torture suite + identity fix)

**Bug found + fixed by the torture suite** (the suite is what caught it):
`buildSelector` produced an **ambiguous selector** for identical siblings
(`#list > div.card` matched every card), so a selector round-trip silently
resolved to the wrong element (§6 violation). Fixes in `engine/dom/ref.ts`:

- **Unique selector generation** — identical siblings disambiguate
  positionally (cheap, local, no document query — critical on huge flat
  DOMs), and identical-ancestor collisions fall back to a bounded document
  query climbing from the leaf until unique.
- **Identity-agreement in `resolveRef`** — the element at the stored domPath
  must still match the stored selector (element-vs-selector `matches()`, no
  document walk); on disagreement the selector is tried and only accepted if
  it lands at the stored path; otherwise null (STALE) is returned — never a
  silently-wrong element. `inspectRef` already surfaces STALE honestly.

Regression tests added (`tests/dom-ref.test.ts`): unique selectors for
identical siblings/subtrees, makeRef round-trip under class changes, and
path/selector disagreement → null.

**Torture suite delivered** (`scripts/torture.mjs`, `npm run test:torture`,
14 scenarios): huge-dom (250k), mutation-storm, element-replacement,
shadow-dom, iframe-maze, csp-hostile (`script-src 'none'` → main-thread
fallback), css-hostile (z-index max + pointer-events), live-edit-race,
asset-monster (incl. honest 404/403 reporting), infinite-scroll (no silent
cache reuse), virtualized-list (only observed DOM claimed), prompt-injection-
secrets (no key in storage, AI optional, zero external requests),
multi-tab-isolation, memory-soak (5 cycles, no error accumulation). Full
matrix + evidence in TESTING.md. All 14 VERIFIED PASS.

**Second pass — torture suite extended 14 → 23 scenarios** (huge-css,
deep-dom, svg-security, animation-monster, webgl-monster, spa-race,
screenshot-monster, responsive-monster, storage-isolation/lifecycle) and the
real-site probe gained a **WebGL/WebGPU corpus** (Three.js, WebGL animation
demo, WebGPU samples — 15/15). Two more real bugs caught and fixed:

- **BUG-H-002 (P1, stale cache):** the L2 `roleMemo` was keyed on structure
  only, though color roles depend on the color values — a same-structure SPA
  re-render served the previous page's colors, and the orchestrator's
  `cached` flag (structural hash) mislabeled the scan as cached. Fixed:
  role key = colors + structure; `getSnapshotHash` now hashes EVERY field any
  analysis unit reads (full-input hash). Regression: same-structure/
  different-colors pipeline test.
- **BUG-H-003 (P2, ghost state):** the controller reported a lock on a REMOVED
  element. Fixed: `getLockedRef`/`getHoveredRef`/`paintLocked`/`paintHover`
  check `isConnected` — state reads REMOVED, no ghost outline. Regression:
  removed-element lock test.

**Re-verification after the second pass:** unit 402/402 · E2E 12 pass + 1
honest skip · torture 23/23 (twice) · real-site probe 19/19 + WebGL corpus
15/15 · YouTube scan 19.5 s · lint/compile clean · landing smoke 3/3.

**Honest limitations (from the mission report):** closed/open shadow roots
and cross-origin iframe content are correctly NOT claimed (document-scoped
walk — verified by TOR-004/005); the overlay mounts under
`z-index:2147483647 !important` (TOR-007) but page elements at the max
z-index can still paint above it (browser semantics — best-effort); memory
soak covers error-level stabilization, not CDP heap deltas (documented);
full 500-iteration soak and Awwwards/creative-WebGL sites (Lusion, Resn) need
a headed GPU machine (NOT TESTED); screenshot pixel-capture needs a real user
gesture (BLOCKED in automation — geometry/scroll verified).

## 16. Real-site corpus + landing redesign (af26714)

**Extension hardening (committed 98bd8fb):**
- `ui/screens/sidepanel/connection.ts` — the connection card's retry chain was
  4×1.5s ≈ 6s, so heavy pages whose `document_idle` injects late (YouTube,
  Awwwards) sat on "Not connected" forever despite a working bus. Now backs
  off across ~66s (`CONTENT_RETRY_SCHEDULE_MS`) and still terminates for
  permanently unreachable tabs. Verified: YouTube + Awwwards connect in the
  probe; 3-engine smoke green.
- `scripts/torture.mjs` — **TOR-024 nightmare** (Tier-9 brutal page): dynamic
  iframes created/destroyed, open+closed shadow roots cycled, WebGL1/2 +
  WebGPU canvases, rAF + WAAPI + CSS animation, SPA route churn, media zoo
  (GIF/AVIF/blob/data/svg-sprite). Suite now **24 scenarios, all PASS**.
- `scripts/probe-real-sites.mjs` — tiered corpus (tiers 1–8 + core-15 + fast
  CI set), honest login-wall/bot detection (title redirect, redirect host, or
  password form on a sparse page — nav links like HN's "login" no longer
  false-positive), and a deterministic 100k-DOM fixture member
  (`huge-dom-fixture`). Run: `VQ_PROBE_SITES=corpus15 node scripts/probe-real-sites.mjs`.

**Landing redesign (af26714):** `landing/index.html` fully rebuilt on the
"See the web differently" inspection-instrument narrative per the premium
SaaS spec — `--vz` token set (values matched to the extension palette), Inter
+ JetBrains Mono only, glass materials mirrored from the side panel, one
accent, instrumentation as the differentiator (crosshairs, measurement
rulers, token chips, confidence badges). New order: hero with the live demo
above the fold → trust strip → product reveal (honest counters: 100% local,
7 browsers) → 7-step narrative → inspect measurement section → features bento
→ optional AI → privacy/security → personas → product proof (real torture-
suite evidence) → install (browser/OS detection kept) → spec FAQ → final CTA
→ footer. All functional hooks + smoke-test selectors preserved; `npm run
check:landing` passes all 3 engines (hero, counters, demo, download overlay,
burger, back-top, reduced motion, zero overflow at 1280/390); biome clean.
The old `--vz`-themed de-flash note (§13) is superseded by this rebuild — the
calm/no-decorative-motion stance is unchanged.

## 17. Recommended first tasks tomorrow

1. **Submit the 0.10.9 store packages (§6A)** — the release was cut
   (`npm run release -- 0.10.8 0.10.9`): packages are in
   `.output/release/vizquo-0.10.9/` (chrome/firefox/sources ZIPs + listing
   kit), screenshots + promo tiles are regenerated at 0.10.9 (dark glass
   theme), and the landing download ZIPs are staged at `landing/downloads/`.
   The remaining steps are web-console uploads (Edge, Firefox AMO, Chrome
   Web Store — keep the PEM key safe).
2. **Human QA on the screenshot studio with a real toolbar click** (the one
   flow automation can't fully drive — `activeTab` needs a real user gesture)
   and the **Ruler** on a connected page.
3. Pick one from §6B (the AI timeline narration is the most "Vizquo" and
   cheapest).
