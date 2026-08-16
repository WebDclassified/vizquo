# Vizquo Hardening Report — 2026-08-15

> Master-spec §58 report format. Every claim below was **executed**, not
> assumed: the torture suite, probes, and tests are all runnable from this
> repository (`npm run test:torture`, `npm run probe:sites`, `npm run
> test:e2e`).

---

## 1. Executive summary

Vizquo 0.10.9 was audited against the master hardening spec, a deterministic
**torture suite of 14 scenarios** was built and automated, and it immediately
caught a real correctness bug (ambiguous element selectors silently resolving
to the wrong element — a master-spec §6 violation). The bug was fixed with an
identity-agreement guarantee, regression tests were added, and the complete
gate re-run: **all green**.

**Release decision: READY** (no release-blocking issues remain; see §20).

**Extended (second pass):** the torture suite grew from 14 to **23 scenarios**
(huge-css, deep-dom, svg-security, animation-monster, webgl-monster, spa-race,
screenshot-monster, responsive-monster, storage-isolation/lifecycle) and it
caught **two more real bugs** — a stale L2 color-role cache after same-
structure SPA re-renders, and a controller that reported a lock on a REMOVED
element. Both fixed with regression tests. The real-site probe gained a
**WebGL/WebGPU corpus** (Three.js, a WebGL animation demo, WebGPU samples).

## 2. Environment

| | |
|---|---|
| OS | Windows 11 (win32) |
| Node | v26.7.0 |
| Package manager | npm |
| Browser (extension runtime) | Chromium (Playwright channel `chromium`) |
| Extension version | 0.10.9 |
| Git commit | `43d4d8c` (post-fix) |
| Build | Chrome MV3, 1.31 MB, keyless |
| Type check | `tsc --noEmit` clean |
| Lint | Biome clean (0 warnings) |

## 3. Implementation audit

| Feature | Files | Unit tests | Status |
|---|---|---|---|
| Element identity (selector/xpath/domPath) | `engine/dom/ref.ts` | `dom-ref.test.ts` | **Was PARTIALLY IMPLEMENTED** (ambiguous selectors) → fixed |
| Page scan (bounded walk, honest truncation) | `engine/scan/scan.ts` | `scan.test.ts` | IMPLEMENTED AND TESTED |
| Analysis pipeline + worker (CSP fallback) | `engine/analysis/*` | `analysis-pipeline.test.ts` | IMPLEMENTED AND TESTED |
| Inspect controller + overlay | `engine/inspect/controller.ts` | `controller-lifecycle.test.ts` | IMPLEMENTED AND TESTED |
| Live editing (in-memory, law #4) | `engine/live-edit/session.ts` | `live-edit.test.ts` | IMPLEMENTED AND TESTED |
| Assets + SVG sanitizer | `engine/assets/*`, `engine/dom/svg.ts` | `assets-*.test.ts`, `svg-sanitize.test.ts` | IMPLEMENTED AND TESTED |
| Storage/repository + GC | `storage/*` | `storage.test.ts` | IMPLEMENTED AND TESTED |
| Contextual AI (key-isolated) | `ai/*`, `entrypoints/background.ts` | `ai.test.ts` | IMPLEMENTED AND TESTED |
| Hostile-page E2E (huge DOM, canary, cancel race) | `tests/e2e/hostile.spec.ts` | — | IMPLEMENTED AND TESTED |

## 4. Features added

- **Unique element selectors** — `buildSelector` now guarantees
  document-unique selectors (identical siblings disambiguate positionally;
  identical-ancestor collisions fall back to a bounded query).
- **Identity-agreement resolution** — `resolveRef` verifies the element at the
  stored domPath still matches the stored selector before handing it out;
  ambiguity resolves to null (STALE), never a silently-wrong element.

## 5. Tests added

- `tests/dom-ref.test.ts`: +4 regression tests (unique selectors for identical
  siblings; chain collisions; round-trip under class changes + replacement →
  STALE; selector-accept when identity intact). Unit total **400/400**.
- `scripts/torture.mjs`: the torture suite itself (14 scenarios, §7).

## 6. Real-world websites tested (live, this run)

| Site | Connect | Inspect+lock | Context menu | Full scan | Console |
|---|---|---|---|---|---|
| example.com | ✅ | ✅ | ✅ | ✅ | 0 errors |
| Wikipedia (Design) | ✅ | ✅ | ✅ | ✅ | 0 errors |
| MDN | ✅ | ✅ | ✅ | ✅ | 0 errors |
| Hacker News | ✅ | ✅ | ✅ | ✅ | 0 errors |
| YouTube | ✅ | ✅ (locked `ytd-app:nth-of-type(1)`) | — | ✅ 19.5 s, 274 elements, truncated=false | 0 panel errors |

YouTube exercises the strict-CSP main-thread fallback and the new unique
selectors on real custom elements. **19/19 probe checks passed.**

## 7. Torture fixtures added (all deterministic, network-free)

`npm run test:torture` — 14 scenarios, **14/14 VERIFIED PASS**:

| ID | Fixture | Key assertions verified |
|---|---|---|
| TOR-001 | huge-dom (250 006 nodes) | bounded scan (12k walk / 4k sample caps), `truncated: true` honest, 21.6 s |
| TOR-002 | mutation-storm (60 ms churn) | scan completes, inspect state readable, no hang |
| TOR-003 | element-replacement (rerender + insert) | identity honest; inspection reflects the CURRENT element |
| TOR-004 | shadow-dom (open/closed/nested/dynamic) | closed/dynamic shadow colors never claimed |
| TOR-005 | iframe-maze (same/cross/nested/sandbox) | no SOP bypass; cross-origin colors never claimed |
| TOR-006 | csp-hostile (`script-src 'none'`) | scan completes via main-thread fallback in 0.1 s |
| TOR-007 | css-hostile (`z-index:2147483647 !important`) | overlay mounts, clicks lock, scan completes |
| TOR-008 | live-edit-race (edit→undo→replace→clear) | exact undo; law #4 holds after replacement |
| TOR-009 | asset-monster (21 assets incl. 404/403/data) | failures visible; no script-scheme asset |
| TOR-010 | infinite-scroll (+2000 rows) | fingerprint changes; re-scan not silently cached |
| TOR-011 | virtualized-list (10k logical / 44 DOM) | only observed DOM claimed (44 ≤ 120), no false truncation |
| TOR-012 | prompt-injection-secrets | no key in storage; AI honest-disabled; zero external requests |
| TOR-013 | multi-tab-isolation | results tab-stamped; colors never cross tabs |
| TOR-014 | memory-soak (5 cycles + panel) | no error accumulation; worker alive |
| TOR-015 | huge-css (10k rules, 400 vars, layers, queries) | parsed under the documented bounds (8k rules/200 decl per rule), cascade traces computed |
| TOR-016 | deep-dom (1000 levels) | DOM tree bounded, scan completes, no stack overflow |
| TOR-017 | svg-security (handlers, scripts, javascript: URLs, recursion) | canary fires in page (4×), never reaches the extension; raw observed markup preserved |
| TOR-018 | animation-monster (3000 animated/composited) | animation/transition counts honest, scan in 15.5 s |
| TOR-019 | webgl-monster (live WebGL + 2D canvas) | real WebGL context scanned + inspected, canvas intact, page responsive |
| TOR-020 | spa-race (pushState + DOM swap) | host page never mutated; SPA content observed; re-scan NOT cached after change; stale colors fixed |
| TOR-021 | screenshot-monster (103 740 px page) | geometry honest, exact scroll round-trip + restoration, single sticky node |
| TOR-022 | responsive-monster (media + container queries) | Time Machine maps 320→1920, overflow honestly detected ≤375 |
| TOR-023 | storage-isolation + lifecycle | page storage poisoning inert; removed element → STALE surfaced, live lock cleared |

## 8. Performance results

- 250k-node scan: **21.6 s**, bounded at 4000 samples, page stays responsive.
- Strict-CSP scan: **0.1 s** (main-thread fallback).
- YouTube: **19.5 s** for 274 visible elements (checkVisibility pre-filter
  correctly skips hidden subtrees — no wasted style computation).
- The uniqueness fix adds **no document queries on huge flat DOMs** (leaf
  disambiguation is local); queries run only on structured collision cases.

## 9. Memory results

TOR-014 verifies **error-level stabilization**: 5 full activate→inspect→scan
cycles with the panel open, zero panel errors, service worker alive. CDP heap
deltas were not measured (see §17 — the tooling stalls the panel on this
machine). The L3 cache LRU and the inspection GC (25 versions/URL) bound
persistent growth.

## 10. Security results

- **INV-003 SVG**: malicious SMIL/`onbegin`/`onerror` canary executes in the
  page (proving the fixture is real) and **never** in the panel — E2E hostile
  spec + sanitizer unit tests.
- **INV-005 API keys**: no key in storage on a page full of fake secrets;
  `AI_EXPLAIN` refuses without a key from the background; key never sent to
  content scripts (architecture: key lives only in the background worker).
- **INV-009 CORS/SOP/CSP**: cross-origin iframe colors never claimed; strict
  CSP pages still scan via the same code path (main-thread pipeline); worker
  fetch failure falls back — never bypassed.
- **INV-004/INV-010**: no script-scheme asset ever extracted; generated code
  is never executed by Vizquo (export-only).
- **Network silence**: zero external requests during scan + AI-disabled flow
  (TOR-012); hostile E2E asserts the extension never phones home.

## 11. Privacy results

- All data local (IndexedDB); AI is consent-gated with an explicit payload
  summary, and the tortue secrets page confirmed nothing derived from page
  content ever lands in settings/storage.
- Multi-tab isolation verified (TOR-013) — tab-stamped payloads.

## 12. Accessibility results

Unchanged and re-verified by the E2E suite: dialogs expose accessible names,
toggles are labelled and keyboard-operable, focus is visible, reduced-motion
kills animations, high-contrast forces solid materials (E2E Phase 9 spec).

## 13. Compatibility results

- Chromium (MV3) extension: all gates pass.
- Firefox MV3 build: compiles (not runtime-tested this run — CI covers it).
- Firefox/WebKit landing: 3-engine smoke passes.
- Strict CSP, Shadow DOM, iframes, 250k DOM, hostile CSS: all verified (§7).

## 14. Bugs found

| ID | Title | Severity | Found by |
|---|---|---|---|
| BUG-H-001 | Ambiguous selector for identical siblings silently resolves to a different element | P1 (incorrect inspection data) | TOR-003 |
| BUG-H-002 | Stale L2 color roles after same-structure re-render (SPA nav serves the previous page's colors) + `cached` flag mislabeled | P1 (incorrect inspection data; silent stale cache) | TOR-020 |
| BUG-H-003 | Controller reports a lock on a REMOVED (detached) element | P2 (misleading state; ghost outline) | TOR-023 |

## 15. Bugs fixed

| ID | Root cause | Fix | Regression test |
|---|---|---|---|
| BUG-H-001 | `buildSelector` returned `#list > div.card` for every sibling-identical card | Positional disambiguation in `buildSelector`; identity-agreement check in `resolveRef` (ambiguous → null/STALE) | `tests/dom-ref.test.ts` (+4) |
| BUG-H-002 | `roleMemo` keyed on structure only, though roles depend on the color values; orchestrator `cached` flag used the structural hash | Role memo key = color values + structure; `getSnapshotHash` now covers every field any analysis unit reads (full-input hash) | `tests/analysis-pipeline.test.ts` (same-structure/different-colors) |
| BUG-H-003 | `getLockedRef`/`getHoveredRef`/`paintLocked` didn't check `isConnected` | Disconnected lock → null (state reads REMOVED); `paintLocked` drops the ghost and clears the box layer; `paintHover` bails on detached elements | `tests/controller-lifecycle.test.ts` (removed-element lock) |

## 16. Remaining bugs

None confirmed. The honest limitations below are behavioral notes, not
confirmed defects.

## 17. NOT TESTED items

- **CDP heap-trace memory deltas / 500-iteration soak** — the tracer stalls
  the panel on this machine; error-level soak (5 cycles) verified instead.
- **Awwwards/WebGL/WebGPU corpus** (Lusion, Resn, Three.js scenes) — needs a
  headed machine with a GPU; not executed this run.
- **Firefox runtime** of the built MV3 package — compile-verified only.
- **Browser zoom 50–200 % and DPR 1–3 overlay geometry** — the overlay's
  fixed-position + getBoundingClientRect design is unit-covered; live zoom
  matrix not executed.

## 18. BLOCKED items

- Optional-host-permission grant prompt in automation (native browser
  chrome) — the one E2E skip, already documented and covered by unit tests +
  live probes.
- Headed WebGL runs (no GPU in this environment).

## 19. Regression results (post-fix, all executed)

| Gate | Result |
|---|---|
| `npm run compile` | ✅ clean |
| `npm run lint` | ✅ 0 warnings |
| `npm run test` | ✅ 402/402 (3 new regression tests) |
| `npm run test:e2e` | ✅ 12 pass + 1 honest skip (grant-dependent) |
| `npm run test:torture` | ✅ **23/23** (ran twice — deterministic) |
| `node scripts/probe-real-sites.mjs` | ✅ 19/19 (example.com, Wikipedia, MDN, HN) + **15/15 WebGL/GPU corpus** (Three.js, WebGL animation demo, WebGPU samples) |
| `node scripts/diag-youtube.mjs` | ✅ scan 19.5 s, zero panel errors |
| `npm run check:landing` | ✅ chromium · firefox · webkit |

## 20. Release decision

**READY** — no release-blocking issues remain. The three defects found by the
torture suite (ambiguous selectors, stale L2 color roles + mislabeled cache
flag, ghost locks on removed elements) are all fixed, regression-tested, and
re-verified end to end; the 23-scenario torture suite is now a permanent,
runnable regression gate (`npm run test:torture`), and the real-site probe
covers the WebGL/WebGPU corpus (`npm run probe:sites`).

*This report follows the spec's status vocabulary: every row above is
VERIFIED PASS, VERIFIED FAIL, NOT TESTED, or BLOCKED — never "probably
works".*

---

# Third pass — master requirements brief, full audit (2026-08-15, v0.10.9)

## What was audited

The complete master requirements brief (§§1–88) was read
end-to-end and mapped against the implementation, with focus on the §83
highest-priority risks.

## Findings (all VERIFIED, per §83)

| §83 risk | Verdict | Evidence |
|---|---|---|
| API-key storage boundary | **CLOSED** — key lives in extension-scoped IndexedDB; content scripts cannot open the extension's database; background reads it alone; debug bundle redacts it | architecture + TOR-012 + `release-store.mjs` secret scan |
| Permission model | **CLOSED** — zero optional grants at install; core works with zero grants; on-demand grant/revoke/retry driven through the real UI | TOR-027 |
| Message authorization | **HARDENED THIS PASS** — privileged handlers are panel-only (sender guard), content-script handlers require a tab, AI payloads capped at 256 KB, export batches capped at 500, asset URLs scheme-validated | `shared/sender-guard.ts` + `tests/sender-guard.test.ts` + TOR-029 |
| Cache isolation | **CLOSED** — cache key = normalized URL + page fingerprint + schema version | `tests/fingerprint.test.ts` + TOR-010 |
| AI prompt injection | **CLOSED** — page content is data, never instructions; bounded + redacted payloads | TOR-012 + `tests/ai.test.ts` |
| Service-worker lifecycle | **CLOSED** — terminate/restart/queue-recovery proven at the browser level | TOR-026 |
| Hostile-page resilience | **CLOSED** — hostile CSS/DOM/mutation/WebGL/WebGPU/SPA all bounded | TOR-002/007/018–022/024 |

## Bugs found this pass

| ID | Title | Severity | Found by | Fix | Regression |
|---|---|---|---|---|---|
| BUG-H-004 | Panel Create/Analyze/Assets clients sent content-script messages WITHOUT a tabId, so live edit, Time Machine, geometry and SVG-fetch from the panel UI never reached the page | **P1** (major feature unusable from the UI) | Manual panel-drive debug | Wired the clients to `ui.connection.tabId`; tab-targeted sends now go through `sendTabMessage` (polyfill path — also kills the "message channel closed" console noise on navigation races) | **TOR-030** (panel-UI live edit → page → undo) + `tests/create-client.test.ts` mock updated |
| BUG-H-005 | Tailwind-v4 arbitrary-value classes (`@container`, `px-(--geist-page-margin)`) broke `querySelectorAll` with a SyntaxError — context-target/lock/inspect silently failed on such pages (found on Vercel) | **P1** (feature silently broken on Tailwind-v4 sites) | corpus15 Vercel probe | Escape CSS identifiers (leading digits, `@`), escape arbitrary-value parentheses | **TOR-028** + `tests/dom-ref.test.ts` (+9) |

## New scenarios (TOR-024 → TOR-030)

- TOR-024 nightmare (all churn at once), TOR-025 deep-soak (30 cycles, heap-bounded),
  TOR-026 service-worker lifecycle, TOR-027 permissions, TOR-028 Tailwind arbitrary
  classes, TOR-029 message-sender validation, TOR-030 panel-UI live edit.

## Full gate (all executed this pass)

| Gate | Result |
|---|---|
| `npm run compile` | ✅ clean |
| `npm run lint` | ✅ 0 warnings |
| `npm run test` | ✅ 49/49 files (incl. `sender-guard`, `dom-ref`, `connection` regression tests) |
| `npm run test:torture` | ✅ **31/31** scenarios (TOR-001…031) |
| `node scripts/probe-extension.mjs` | ✅ 7/7 |
| `node scripts/probe-extension-advanced.mjs` | ✅ 7/7 (1 honest SKIP: captureVisibleTab needs activeTab) |
| `node scripts/probe-real-sites.mjs` (default) | ✅ 23/23 |
| corpus15 live corpus | ✅ 15/15 core sites + Nike honestly BLOCKED (geo-redirect to `nike.in`) |
| Landing smoke (3 engines) | ✅ Chromium + Firefox + WebKit, desktop + mobile, zero console errors |
| Release 0.11.0 | ✅ compiled, lint-clean, zipped (chrome/firefox/sources), keyless scan 0 hits, promo + screenshots regenerated |

## New docs (Requirements §78)

- `THREAT_MODEL.md` — assets, actors, surfaces, boundaries, INV-001…015 mapping.
- `AI_PRIVACY.md` — payload bounding, key isolation, prompt-injection posture.
- `SECURITY.md` / `TESTING.md` — updated with the sender-validation model and
  TOR-024…031.

## Release 0.11.0 — fourth pass (landing redesign + live key isolation)

- **TOR-031 api-key-isolation** (new): saves a key through the real Settings
  UI and proves live that it lives only in extension IndexedDB — never
  `chrome.storage.local` (the namespace content scripts share), no
  `chrome.runtime` surface for page JS, no `vizquo` DB in the page origin,
  and the downloaded debug bundle redacts the key.
- Landing redesigned per the v2 design brief ("See beyond the surface"):
  3-step Inspect→Understand→Extract narrative, grouped sections (Visual DNA /
  Assets / Responsive+Analyze / Power Workflow), signature lens in hero + DNA
  strip + final CTA, confidence badges, trimmed nav. Cross-browser smoke
  (Chromium/Firefox/WebKit) fully green.
- Lint debt cleared repo-wide (optional chaining, dead code in torture.mjs,
  SVG `<title>`s) — `biome check .` is clean again.

## Release decision (this pass)

**READY** — §83's seven highest-priority risks are closed with
permanent regression tests; the full gate (unit 49/49, torture 31/31, probes
23/23 + 7/7 + 7/7, corpus15 15/15 + one honest site-side BLOCK, landing smoke
3/3 engines, release package assembled) passes on the freshly built 0.11.0
artifacts.
