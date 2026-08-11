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
- `package.json` version: **0.10.1** ✅ (in sync with CHANGELOG).

---

## 2. Current state — everything is green ✅

Last full validation (all passed):

| Check | Command | Result |
|---|---|---|
| Type check | `npm run compile` | ✅ clean |
| Lint | `npm run lint` | ✅ zero warnings |
| Unit tests | `npm run test` | ✅ **315/315** |
| Production build (Chrome MV3) | `npm run build` | ✅ keyless, 1.24 MB |
| Firefox AMO-ready build | `npm run build:firefox:mv3` | ✅ |
| E2E (Playwright, 7 tests) | `npm run test:e2e` | ✅ 7/7, zero console errors |
| Store ZIP | `npm run zip` | ✅ `vizquo-0.10.1-chrome.zip` (~411 kB, 42 files) |

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
npm run test             # unit tests (vitest, 315 tests)
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
3. **Manual QA pass on 3–4 real sites**: grant access → reload → inspect /
   scan / assets / screenshots flows can't be automated (E2E runs the panel
   only). Also manually exercise the new **Ruler** (behind a connected page)
   and **Timeline/PNG/print** with real data.
4. **Bump `package.json` version** — ✅ done (0.10.0).

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
  or PDF export would complete it.

### C. Known trade-offs / technical debt (fix only when they bite)
1. `package.json` version lag (see A4).
2. The **inspections table accumulates orphaned rows** — deleting history
  entries doesn't GC their inspections. The Timeline tab *relies* on this
  accumulation, but storage grows unboundedly; add GC only if it becomes a
  problem.
3. `TimelineTab` loads full inspection payloads (assets + usedBy refs) even
  though rows render a few fields — documented in the file; revisit with a
  metadata query if the library grows past thousands of scans.
4. `engine/timeline/timeline.ts` imports `normalizeCacheUrl` from
  `storage/adapters/` — acceptable reuse; a `shared/` normalizer would clean
  the layering if you're touching that area anyway.
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
- **E2E cannot grant site access** — the extension is tested as a panel page;
  host-page flows (scan/inspect/capture) are unit-tested + manual QA. Don't
  write E2E assertions against UI that only renders after a scan.
- **Format before validating**: `npx biome check --write .` then `npm run
  lint` — Biome formatting differences fail the lint gate.
- **Solid patterns**: use `For` (not `.map`) for lists, `createSignal` for
  local UI state, and the three explicit stores (`analysis`, `ui`,
  `persisted`) — don't add ad hoc stores.
- **JSX gotcha**: lucide-solid icon names differ from lucide-react (e.g.
  `OpenInNew` doesn't exist — use `Eye`); check the icon exists before using.
- **Windows shell**: commands run in bash (`ls`, forward slashes), not cmd.

---

## 8. Files changed today (Phase 10) — in case you need to review or revert

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

## 9. Recommended first tasks tomorrow

1. **Manual QA** on 3–4 real sites (Ruler, Timeline, PNG card, report print,
   multi-select screenshot) — the only untested-by-automation surface.
2. ~~Bump version → `0.10.0`~~ ✅ done; re-run `npm run zip` (artifact is
   current).
3. Pick one from §6B (the AI timeline narration is the most "Vizquo" and
   cheapest).
4. Then the store submissions (§6A) — they're account actions, not code.
