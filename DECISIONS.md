# Decisions

> Created by Prabhat Teotia


A running log of non-obvious architectural choices and the smallest reasonable
assumptions made while building. The master spec says: when a requirement is
ambiguous, make the smallest reasonable assumption, state it here, and keep
moving.

## Phase 1

### Command palette uses Kobalte Combobox, not a Command primitive
Kobalte 0.13.12 (the version locked in this project) does not ship a `Command`
primitive. `Combobox` is the standard accessible alternative — input + listbox
with arrow-key navigation and typeahead — and matches the palette's
interaction model directly. If a future Kobalte ships `Command`, this is a
localized swap in `CommandPalette.tsx`.

### Theme resolution is done in JS, not CSS media queries
`data-theme` on `<html>` is resolved to `light`/`dark` at runtime; `auto`
listens to `prefers-color-scheme` via `matchMedia`. This defines the dark
palette exactly once instead of duplicating it in a media-query block, and
gives the Settings screen a single source of truth. Trade-off: a tiny bit of
JS instead of pure CSS.

### chrome.storage.sync mirroring is deferred
The spec allows `chrome.storage.sync` for small settings that must roam
across devices. No Phase 1 setting needs roaming (theme/onboarding are
session-preference, and roaming adds failure modes). All settings persist
through the repository (IndexedDB). When a setting that must roam appears,
add a sync adapter behind the same interface.

### Browser-level commands reach the panel via storage events
In MV3, `commands.onCommand` fires reliably in the background worker, not in
side-panel pages. The background writes a timestamped marker to
`chrome.storage.local` (`command:mode-toggle`, `command:screenshot-viewport`)
and the panel reacts to `storage.onChanged`. Simple, permission-free (we
already hold `storage`), and avoids an extra message-hop protocol for Phase 1.

### Site access is full by default (no grant flow)
Vizquo is an inspection instrument: the manifest carries a REQUIRED
`host_permissions: ['<all_urls>']`, so the statically-declared content script
injects on every http/https page at load time. There are no per-site grants,
no reloads, and no prompts — the panel connects the instant it opens. The
earlier on-demand model (optional `<all_urls>`, "Grant access to this tab",
tab reload after grant) was replaced because it added friction for the exact
inspection workflow the product exists to serve. The AI-provider origins
(openrouter.ai / localhost) are subsumed by the grant and never prompt.
Data remains local-first regardless — page content leaves the browser only
when the user opts into AI with their own key.

### Eviction order: kind first, then LRU
Per Section 2.3, screenshots/large blobs are evicted before inspection token
data (they dominate size). Within a kind, least-recently-accessed goes first.
This is implemented as a pure function (`evictToBudget`) and unit-tested.

### L1/L2 caches are data structures now, shipped with their phases
The L3 cache (repository + schema + eviction) ships in Phase 1 because the
storage layer is foundational. L1 (per-node WeakMap) and L2 (worker memoized
results) are documented in `ARCHITECTURE.md` and ship with the phases that
need them (2 and 3) so they aren't built against a spec that later phases
revise.

### JSX elements hoisted into variables lose Solid's context chain
Kobalte (and any context-based component) throws `useTooltipContext must be
used within a Tooltip component` if the `Trigger` is created as a variable
outside the `Root` subtree — Solid captures the owner when the JSX expression
is created, not when it is inserted. IconButton inlines its `Trigger` inside
`Tooltip.Root` accordingly. The E2E smoke test caught this where tsc/build
could not.

### Coming-soon tabs are honest gap labels, not placeholders
Per the quality bar, tabs whose features ship in later phases render a labeled
"Phase N" panel describing exactly what arrives — no dead controls, no fake
data, no claim that a stubbed capability works.

### The `toggle-inspect-mode` shortcut avoids Chrome-reserved keys
Chrome reserves `Ctrl+Shift+I` for DevTools and will not bind it to an
extension command. Vizquo uses `Ctrl+Shift+E` (⌘⇧E on macOS) for inspect mode;
it remains remappable at `chrome://extensions/shortcuts`.

### No `any` without a documented reason
The one gray area is Dexie table rows, which are entity-typed via
`EntityTable`. Everything else is `strict`-clean and `noUncheckedIndexedAccess`
is enabled.

## Phase 2

### Specificity is the full (inline, id, class, type) 4-tuple
The master spec sketches `specificity: [number, number, number]` with an
ambiguous "class/element" note. Collapsing class+type into one number is not
cascade-correct (e.g. `(0,0,2,5)` vs `(0,0,3,0)` order wrong), so Vizquo uses
the standard 4-tuple everywhere — the spec doesn't define the tuple meaning,
so the CSS-spec-correct interpretation is the smallest reasonable choice.

### css-tree v3: specificity and pseudo-class argument shapes
css-tree v3 dropped the `specificity` helper and stores `:is()`/`:not()`/
`:has()` arguments in the pseudo node's `children` (a SelectorList), with
`:nth-child(of S)` keeping S inside an `Nth` node — not in a `selector`
property as in v2. Both shapes are handled in `engine/css/specificity.ts` and
locked in by unit tests. A minimal ambient declaration (`types/css-tree.d.ts`)
covers the API surface Vizquo uses since v3 ships no TypeScript types.

### Stylesheet source text is fetched; cssRules is the fallback
Source lines require the real stylesheet text. Inline `<style>` tags read
`ownerNode.textContent`; same-origin link sheets are fetched (extension
context, force-cached). When no text is readable (happy-dom, constructed
sheets), `cssRules` is serialized instead — authoritative rules, but no line
numbers. Cross-origin sheets whose `cssRules` throws SecurityError are labeled
blocked in the UI with an explanation; Vizquo never bypasses same-origin
policy.

### Stylesheet collection is async
Because link-sheet source text needs `fetch`, `collectStylesheets` (and
therefore the cascade) is async. The L1 cache stores the collection promise
per document, so the cost is paid once per page.

### `instanceof Document` fails across happy-dom/vitest boundaries
A global `Document` from one realm is not `instanceof` the other's class. The
DOM tree builder checks `nodeType === Node.DOCUMENT_NODE` instead.

### happy-dom has no layout engine
`getBoundingClientRect` returns zeroes and its cascade engine disagrees with
real browsers on compound selectors. Measurement tests stub rects; cascade
tests assert on Vizquo's own winner/overridden/variable-chain output rather
than happy-dom's computed values (computed values are ground truth only in
real browsers).

### Inspector state sync rides storage events, heavy payloads ride the bus
Hover moves publish the `ElementRef` to `chrome.storage.local` (cheap,
debounced by content-script change detection) and the panel reacts via
`storage.onChanged` — zero round-trips per pixel. Full inspections and DOM
trees are fetched on demand over the typed message bus.

### Kobalte 0.13 rewrote Combobox — the Phase 1 palette never rendered options
Kobalte 0.13 (locked version 0.13.12) removed the Listbox children-as-
render-prop pattern that pre-0.13 docs show. A non-virtualized `Listbox` now
ignores its children entirely and renders the filtered `options` collection
via the `itemComponent` prop on `Combobox.Root` (confirmed in Kobalte's own
`combobox.test.tsx`). Consequences, all fixed in `CommandPalette.tsx`:
1. **Items render via `itemComponent`**, which receives `{ item }` and returns
   a `Combobox.Item` — the old `<Listbox>{(items) => <For>…}` renders nothing.
2. **`onChange` passes `Option | null`** (single selection), not a render
   object.
3. **An empty collection closes the dropdown** unless `allowsEmptyCollection`
   is set — required for the "No matching commands" state, which is now driven
   by our own `createMemo` over the query signal.
4. **Never portal combobox content out of a modal Dialog**: portaled content
   lands in `document.body` as a sibling of the dialog, which aria-hides all
   non-dialog siblings — the options vanish from the accessibility tree (and
   from Playwright role locators). The dropdown now renders inside the dialog
   subtree; the dialog dropped `overflow-hidden` (dropdown would clip) and
   corner rounding moved to the control/footer.

The Phase 1 E2E "palette filters" assertion was a false positive: it matched
the header's `Theme: dark` quick-toggle button after toggling, not a palette
option — options were never actually rendered. The Phase 2 E2E now asserts
inside `getByRole('listbox')`, which would have caught this on day one.
Lesson: when E2E locators could match a visible UI control by accident,
scope them to the interactive region.

### A leading `{/* */}` in `return (` is a TypeScript parse error
A JSX container comment (`{/* … */}`) placed as the *first* child of
`return (…)` — before any element — breaks the parse: TS treats the leading
`{` as a block statement, not a JSX container, and cascades errors from
`<KDialog.Root` onward. TSC failed on the palette's "reset query" comment
with `')' expected` while the bytes on disk were perfectly valid. Fix: keep
such comments as plain `//` lines above the `return`, or place them after a
real element. (Minimal reproduction confirmed the behavior.)

## Phase 3

### OKLCH ΔE is 0–1, not 0–100
A color-cluster threshold of `4.0` — borrowed from CIELAB ΔE habits — merges
*every* color on a page in OKLCH, because OKLCH L ranges 0–1 (black↔white
sits at ~1.0, near-duplicates at ~0.003, a subtle off-white at ~0.03). The
cluster/match thresholds are now `0.04` (role attribution `0.08`). The unit
test "keeps clearly different colors separate" caught it; there is no
sensible conversion factor to reuse — the scale is just different.

### `formatHex` drops alpha; semi-transparency is a real color
`culori.formatHex('#635bff80')` returns `#635bff`, silently collapsing
semi-transparent colors into their opaque siblings. `normalizeColorValue`
now uses `formatHex8` whenever `alpha ≠ 1`, so `rgba(0,0,0,.1)` stays
distinct from `#000000`. (This matters for shadow tokens and find-instances
matching, where a 10%-black overlay is genuinely a different value.)

### A scale needs a frequency bar, or every value is on-scale
The first scale detector made the most-frequent remaining value a step until
nothing was left — so `offScale` was always empty and the consistency
"outlier" findings could never fire. A cluster now joins the scale when its
frequency reaches half the dominant cluster's, or when it sits at an integer
multiple of an existing step (16 = 2×8 even when rarely used); everything
else is off-scale and flaggable.

### SVG `tagName` is lowercase (it's XML, not HTML)
`el.tagName === 'SVG'` is false for real SVG elements — SVG is an XML
language and reports `tagName` lowercase in every browser. The scan engine
now compares `el.tagName.toLowerCase()`. (HTML elements are uppercase, so
`IMG` was fine.)

### Shadow parsing must respect parens
Splitting a shadow string on whitespace tears `rgba(0, 0, 0, 0.1)` into four
pieces. The normalizer now tokenizes whitespace at paren-depth zero, so a
color with spaces inside stays one token.

### Google Fonts URLs carry one `family=` per family
`?family=Inter:wght@400;600&family=Roboto` puts each family in its own
parameter; `searchParams.get('family')` returns only the first. The scan
uses `getAll('family')`.

### Extension pages are not scannable — say so, don't round-trip
Scanning starts by messaging the tab's content script. When the active tab is
a `chrome-extension://` page (or anything without a content script), the
round-trip fails with a noisy "receiving end does not exist" console error.
The scan client now guards on the tab URL being `http(s)` and shows a plain
"Nothing to scan" message instead — the same guard covers find-instances and
highlight actions.

## Phase 4

### The ZIP is built in the background, where CORS is a browser feature
Fetching assets from arbitrary origins from the side panel would hit the
panel's own origin restrictions. The background worker runs in the extension
context with on-demand host permissions, so fetches are governed by the same
rules as any page request. Failures are collected into `metadata.json` with
per-asset reasons — the spec's "never silently drop" rule, without attempting
any bypass.

### Inline SVGs render in shadow DOM
SVG content is untrusted page markup. Asset previews render the SVG into an
attached shadow root so its `<script>`s/styles can never touch Vizquo's own
document (same rule as the highlight overlay).

### SVG→React is a tokenizer, not an HTML parser
A dependency-free well-formed-XML tokenizer converts SVG source to JSX
(attributes, self-closing tags, text) — `export/svg-react.ts`. The unit
tests caught two real bugs: the scanner never accumulated text between tags
(`<text>` rendered empty), and `class` wasn't converted to `className`.
Entity handling is verbatim: the source is already XML-escaped and JSX uses
the same escaping, so re-escaping would double-escape (`&amp;` → `&amp;amp;`).

### Asset filenames default by type, not a generic extension
`filenameForUrl` appends a default extension from a per-type map (`svg` →
`.svg`, `lottie` → `.json`, …) when the URL has none — the initial
implementation appended the caller's generic fallback and produced
`anim.bin`. Sanitization strips path separators and control characters so a
hostile URL can't escape the ZIP's `vizquo-assets/` root.

### Dimension reporting is honest about layout
`getBoundingClientRect` is 0×0 before layout (and in happy-dom). Rendered
dimensions fall back to the `width`/`height` attributes when the rect is
empty, and natural dimensions come from the image's intrinsic size where the
browser knows it — each value labeled by origin in the UI (`400×300 (src
1600×900)`).

### `video.poster` is read via `getAttribute`
The reflected `poster` property is not implemented in every DOM runtime; the
attribute is the source of truth and works everywhere.

### SVG roles are always `inferred`, never asserted
Asset classification is filename/shape heuristics (a `logo.png` could be a
photo). Every role carries `level: 'inferred'` with a basis and score (law
#2); the UI renders it as a labeled badge, and `unknown` is a real outcome.

## Phase 5

### Technology detection is DOM-only — by necessity
Content scripts run in an isolated world and cannot see page globals
(`window.React`, `__NUXT_DATA__`, …). Detection therefore reads what *is*
visible: attributes (`data-reactroot`, `data-v-` hashes, `ng-version`),
special `<script>`/`<style>` nodes, and script/link srcs. Markers are split
into strong (`detected`) and heuristic (`probable`) — a `data-reactroot`
attribute is `detected`, a handful of utility classes is `probable`, and
plain HTML produces an empty stack. No marker is ever promoted past its
evidence (law #2).

### culori's rgb mode is 0–1, and luminance math is 0–255
The audit initially converted parsed colors straight into
`relativeLuminance`, which divides by 255 — so every channel (already 0–1
from culori) collapsed to ~0 and every pair computed ≈1:1 contrast. The
converter now multiplies channels by 255 before the WCAG math; the unit test
(passes 21:1 black/white, fails 4.48:1 normal text) locked it in. Two
similar scale traps from Phase 3 (OKLCH 0–1) are noted there.

### Contrast on unparsable colors is skipped, never fabricated
A transparent or translucent foreground can't be scored without knowing its
backdrop (law #5). Those samples simply don't produce a contrast finding —
no invented pass, no invented fail. The test asserts exactly that.

### The Time Machine emulates in a same-origin iframe, reused per probe
Resizing the live page would mutate what the user is looking at (law #4) and
be slow. A single off-screen same-origin iframe is created once and resized
per width — media queries genuinely re-evaluate inside it (no per-probe
reload). `X-Frame-Options`/CSP can block framing; the result then carries
`emulated: false` and the panel shows the deterministic breakpoint mapping
with the emulation gap labeled — never a fake number.

### Breakpoint scale folds complementary boundaries
`(min-width: 768px)` and `(max-width: 767px)` describe the same boundary.
The layout-width scale drops any max-width that is exactly `min-1` of
another rule, so the Time Machine timeline shows 768 once, not 767 and 768.

### `[data-v-]` matches a literal attribute name, not a prefix
A CSS selector `[data-v-]` matches an attribute *named* `data-v-`, but Vue
scoped styles emit `data-v-<hash>`. Detection scans attribute names for the
`data-v-` prefix instead. Similarly, happy-dom doesn't populate
`styleSheets` from `<link>` tags, so Tailwind detection reads
`link[rel="stylesheet"]` hrefs directly — the happy-dom test caught both.

## Phase 6

### Live edits are in-memory by construction, not by cleanup
Applying an edit as an inline style means the *browser itself* reverts it on
reload — no cleanup code to get wrong, no persisted state to purge. The
content script additionally drops the session on `pagehide` so a stale edit
list can never outlive the page it edited. Per-edit undo records the
computed value *before* the change, making undo exact rather than a best-
effort guess.

### Codegen skips browser defaults and `var()` chains
Generated code is judged by whether it matches what the user saw. Emitting
`opacity: 1`, `position: static`, or `color: var(--x)` would be noise or a
broken literal, so the style map filters defaults and refuses unresolved
variable chains. The unit test "never emits a bare var() chain" pins the
second one — a computed value that is still a `var()` can't be a truthful
inline style.

### Codegen output is code text, never executed
React/Vue/Svelte/HTML/Tailwind generators are pure string functions over the
inspection payload — no `eval`, no template import, nothing runs. The export
center downloads the text; the browser or user's toolchain compiles it.

### Fullpage screenshots stitch in the panel canvas and restore scroll
`captureVisibleTab` captures one viewport. Fullpage capture scrolls the page
in viewport steps, draws the tiles onto a panel-side canvas, and — in a
`finally` — scrolls back to the original position. The page the user was
looking at is never left moved (law #4). Element capture crops the locked
rect at devicePixelRatio rather than re-capturing.

### The export matrix is data, not control flow
The valid scope × format pairs live in one `EXPORT_MATRIX` table; the UI
renders from it and the generator throws loudly on mismatches. Every format
is reachable from some scope, and the project ZIP is an fflate round-trip
tested against the real `tokens.ts` output — the same serializer the UI
uses, not a fixture.

### AI key: keyless by construction
Vizquo embeds **no API key** in the repository or any build
(`AUTHOR_DEFAULT_KEY` is `''` everywhere). A dev key was bundled initially so
AI worked out of the box in dev, but it was removed: a key embedded in a
*published* extension would be extractable by anyone who downloads it, and
GitHub secret scanning rejects pushes that contain known key patterns. Users
bring their own key via Settings (free `:free` models are the default) or use
the fully-local Ollama provider. Unit tests pin the keyless state so adding a
key stays a deliberate choice.

### AI prompts are bounded and redacted at the builder, not at the gate
The privacy gate is a UX layer; the real guarantee is that `ai/prompts.ts`
can only produce bounded, sanitized payloads (text ≤ 200 chars, HTML snippets
≤ 160 chars with `value`/`name`/`data-*` stripped, no input values by
construction). The gate shows the builder's exact `payloadSummary`, so what
is displayed is byte-for-byte what is sent. Free `:free` OpenRouter models
are the defaults so the feature costs users nothing; rate-limit errors are
surfaced honestly.

### AI runs in the background worker only
The API key never crosses into the content script, the page, or the panel's
renderer state (the UI sees only a `hasKey` boolean). The side panel builds
the request; the worker enforces the enabled flag + key and performs the
network call (defense in depth).

## Phase 8

### The L3 probe is one cheap fingerprint, computed before any engine work
`GET_PAGE_FINGERPRINT` (content script) hashes normalized URL + title +
stylesheet hrefs + bounded CSS text + element count/top-level tags
(`engine/scan/fingerprint.ts`). The panel compares it to the cached entry's
fingerprint before scanning: equal → serve instantly; different → serve
stale-while-revalidate. The fingerprint is a one-way hash of what a design
scan depends on — no page content ever crosses into the extension's storage
in raw form beyond what a scan already stores.

### What's-new renders CHANGELOG.md as the single source of truth
The dialog imports the file raw (`?raw`), parses `## <version>` sections with
`shared/changelog.ts` (pure, Node-tested), and shows versions newer than the
stored `changelog.seenVersion`. First run records the latest version silently
— onboarding covers the welcome, so the dialog appears only for actual
updates ("one per version"). Shipping a release is editing CHANGELOG.md and
bumping `APP_VERSION`.

### Omnibox commands ride the same storage channel as browser commands
`chrome.omnibox` fires in the background; the panel is a separate page that
can't be messaged directly. The background opens the side panel first, then
writes `command:omnibox` — the panel routes it via `storage.onChanged` AND
re-reads the key on mount, so a command typed while the panel is closed still
lands when it opens. Same pattern as `command:mode-toggle` (Phase 1).

### The detachable window reuses the whole App, not a second UI
`entrypoints/window/index.html` is an unlisted WXT page rendering the exact
same `<App />` as the side panel — one code path for connection, state, and
messaging. `windows.create` (popup, 980×720) is the only new API surface; the
inspector toolbar's detach button fires `OPEN_INSPECTOR_WINDOW` and the
background owns the window (side-panel pages can't call `windows.create` with
a panel-relative context reliably).

### Split-pane sizes persist per-region via a settings key
The DOM-tree divider width is stored under `split.inspector` through the
repository — the same adapter every other setting uses. One key per split
region keeps the layout logic in the component and the persistence invisible.

### Compare and reports are pure modules; the tabs are thin UI
The diff (`export/compare.ts`) and report HTML (`export/report.ts`) are pure
functions over `Inspection` entities — Node-unit-tested, no browser needed.
The Library tabs fetch inspections through the repository and render the
results; the report preview is sandboxed (`<iframe sandbox>`), and the
standalone file is fully escaped so untrusted page strings can't inject
markup.

### The debug bundle redacts the AI key by construction
Settings diagnostics export settings, cache stats, permissions, and
connection state as JSON for issue reports — the `ai.apiKey` slot is
overwritten with `[redacted]` before serialization. A diagnostic export must
never leak a secret, so the redaction lives in the exporter, not in the UI.

## Phase 9

### Extension icons are generated from the brand SVG, not hand-drawn
`scripts/generate-icons.mjs` loads `entrypoints/sidepanel/index.html`'s logo
SVG into Playwright's bundled Chromium and screenshots it at 16/32/48/128px
into `public/icon/icon-<size>.png` — WXT auto-discovers the `icon-*.png`
pattern and wires them into the manifest. No image editor, no new
dependencies (Playwright is already a devDependency), reproducible from the
single source of truth for the brand.

### Provider routing lives in the background worker, like the key
The panel says which provider it wants, but the worker re-reads the stored
provider setting and routes the request itself — a compromised or stale panel
can never send your key to the wrong host. The consent gate requests the
right optional host permission per provider (`https://openrouter.ai/*` vs
`http://localhost/*`), so local AI never asks for network permissions it
doesn't need.

### Ollama is the same adapter, not a parallel feature
`ai/ollama.ts` implements the existing `AIProvider` interface with an
OpenAI-compatible `/v1/chat/completions` request. Zero new concepts in the
UI: the settings picker, the consent gate, the readiness gate, and the AI
dialogs all treat it as another provider. Local inference costs nothing and
needs no key — but it is not the default, so the out-of-box experience stays
the free OpenRouter models.

### Library backup is a validated document, not a dump
`export/library-port.ts` serializes the library as a versioned, kind-tagged
JSON document and *validates* before it writes: non-objects, foreign kinds,
unknown versions, non-array sections, and rows without ids all fail loudly
with a human-readable reason. Validation is per entity type — an inspection
needs `page.url`/`createdAt`/`tokens`, a note needs `targetType`/`targetId`/
`createdAt`, a collection needs `name`/`createdAt`/`updatedAt`, a screenshot
needs `dataUrl`, and so on. The list-order fields (`createdAt`, `updatedAt`,
`scannedAt`) are checked deliberately: Dexie's `orderBy` queries skip records
missing their index key, so a row without one would import "successfully" and
then be silently invisible — validation rejects it instead. So a file that
passes parse cannot break the repository write or vanish from the UI. Imports are capped at 50 MB (a real export is
nowhere near that) to refuse quota-blowout files before parsing, and any
unexpected per-row write failure is counted and reported — never a silent
partial import. Untrusted input (a file from anywhere) follows the same
discipline as page data — it can never corrupt the local database.

### Live-edit persistence keeps law #4 as the default
Edits are now saved per page and offered back after a reload, but the
default behavior is unchanged: reload reverts, and **Restore** is an explicit
action in the Create panel banner. Persistence is additive — it can only
*return* state the user deliberately re-applies, never surprise the user
with edits they didn't ask for.

### Compare narration and audit ranking reuse the bounded prompt pipeline
The new AI actions (narrate a compare diff, prioritize audit fixes) build
prompts through the same `ai/prompts.ts` builders that bound length and
strip markup — they are features of the existing privacy posture, not
exceptions to it. Compare narration passes only the structured diff (never
page markup); audit ranking passes severity + category + message lines
(never element source).

### Heavy panels are lazy-loaded chunks, the shell stays eager
The feature panels (Design, Assets, Analyze, Create, Library, Settings)
mount via Solid `lazy()` under one Suspense boundary in `App.tsx`. The
initial side-panel bundle drops well under the 500 kB warning; each heavy
feature downloads only when first opened. Skeleton placeholders keep the
shell stable while a chunk loads.

### Storage estimate comes from the browser, cache stats from the DB
Settings Diagnostics reports the live `navigator.storage.estimate()`
(usage vs quota — the number the browser will actually enforce) alongside
the repository's internal cache stats. The two numbers answer different
questions (global browser budget vs Vizquo's own LRU), and both are shown,
labeled, rather than one masquerading as the other.
