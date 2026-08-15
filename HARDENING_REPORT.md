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

## 15. Bugs fixed

| ID | Root cause | Fix | Regression test |
|---|---|---|---|
| BUG-H-001 | `buildSelector` returned `#list > div.card` for every sibling-identical card | Positional disambiguation in `buildSelector`; identity-agreement check in `resolveRef` (ambiguous → null/STALE) | `tests/dom-ref.test.ts` (+4) |

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
| `npm run test` | ✅ 400/400 |
| `npm run test:e2e` | ✅ 12 pass + 1 honest skip (grant-dependent) |
| `npm run test:torture` | ✅ 14/14 |
| `node scripts/probe-real-sites.mjs` | ✅ 19/19 (example.com, Wikipedia, MDN, HN) |
| `node scripts/diag-youtube.mjs` | ✅ scan 19.5 s, zero panel errors |
| `npm run check:landing` | ✅ chromium · firefox · webkit |

## 20. Release decision

**READY** — no release-blocking issues remain. The one P1 defect found by the
new torture suite is fixed, regression-tested, and re-verified end to end; the
torture suite is now a permanent, runnable regression gate
(`npm run test:torture`).

*This report follows the spec's status vocabulary: every row above is
VERIFIED PASS, VERIFIED FAIL, NOT TESTED, or BLOCKED — never "probably
works".*
