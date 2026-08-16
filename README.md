<p align="center">
  <img src="public/icon/128.png" width="96" height="96" alt="Vizquo">
</p>

<h1 align="center">Vizquo</h1>

<p align="center">
  <strong>See beyond the surface.</strong><br>
  A browser extension that turns any live webpage into a visual blueprint —
  revealing its CSS, design tokens, assets, responsive behavior, and reusable
  patterns. Every value traced back to its source, labeled with its confidence.
</p>

<p align="center">
  <a href="https://github.com/WebDclassified/vizquo/actions/workflows/ci.yml">
    <img src="https://github.com/WebDclassified/vizquo/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <img src="https://img.shields.io/badge/version-0.11.1-6E7BFF" alt="Version 0.11.1">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license">
  <img src="https://img.shields.io/badge/Chrome-MV3-4285F4" alt="Chrome MV3">
  <img src="https://img.shields.io/badge/Firefox-MV3-FF7139" alt="Firefox MV3">
  <img src="https://img.shields.io/badge/browsers-7-28C840" alt="7 desktop browsers">
  <img src="https://img.shields.io/badge/tests-415%20unit%20%C2%B7%2031%20torture-28C840" alt="415 unit tests + 31 torture scenarios">
  <img src="https://img.shields.io/badge/PRs-welcome-6E7BFF" alt="PRs welcome">
</p>

<p align="center">
  <a href="https://webdclassified.github.io/vizquo/landing/">🌐 Live demo — the landing page <i>(see the product inspect itself)</i></a>
</p>

<p align="center">
  <strong>Created by <a href="https://github.com/WebDclassified">Prabhat Teotia</a></strong> · Free · Local-first · No tracking
</p>

---

## Why Vizquo?

Designers and frontend developers spend a shocking amount of time asking the
same questions:

> What font is that heading? What's the exact color? Where does that spacing
> come from? Which rule overrides which? How does this layout behave at 390px?
> Can I extract that SVG?

DevTools answers some of these — one tab at a time. Vizquo answers all of
them **from one side panel**, against the **live page**, in seconds, and
remembers the answers as a browsable library.

The difference that matters most:

> **Vizquo tells you what it knows — and what it only thinks.**

Every extracted value carries a confidence label: **Detected** (observed in
the computed styles), **Derived** (calculated from observed data), or
**Inferred** (pattern-based). Truncated scans and inaccessible resources are
surfaced honestly, never hidden. It is an instrument, not a magic oracle.

## Live demo

See the product inspect itself — the landing page runs the real demo:
[**webdclassified.github.io/vizquo/landing/**](https://webdclassified.github.io/vizquo/landing/)

| Design overview | Element inspector | Assets |
|---|---|---|
| ![Design overview](deploy-kit/screenshots/design-overview.png) | ![Element inspector](deploy-kit/screenshots/inspector.png) | ![Assets](deploy-kit/screenshots/assets.png) |

## Features

- **Element inspector** — computed styles, CSS cascade & specificity, variable
  chains, box-model diagram, DOM tree, and plain-language Designer summaries
  with a *Show CSS* toggle (Designer ⇄ Engineer modes).
- **Design DNA** — automatic color roles, typographic hierarchy, spacing /
  radius / shadow scales, CSS variables, and a design-consistency score (0–100)
  with click-to-highlight on the real page.
- **Asset extraction** — images, SVGs, icons, backgrounds, video posters and
  more, deduped and classified; an SVG inspector with SVG → React conversion;
  one-click bulk ZIP export.
- **Screenshot studio** — viewport, element, full-page and multi-selection
  captures.
- **Code generation** — turn any element into **React, Vue, Svelte, HTML, or
  Tailwind** code; export design tokens to **CSS, SCSS, Tailwind, JSON, TS,
  Figma Tokens, and Style Dictionary**.
- **Audits** — WCAG contrast with exact luminance math, performance, and
  accessibility findings, anchored to their elements.
- **Responsive Time Machine** — see the layout at any viewport width via
  real iframe emulation.
- **Library** — scan history, per-page version timeline with diff summaries,
  collections, notes, comparison, and printable reports.
- **Command palette** (Ctrl/⌘K) and omnibox commands (`viz scan`, `viz
  inspect`, …) for keyboard-first workflows.
- **Optional AI** — "Why?" element explanations and design-system summaries via
  free OpenRouter models or a fully-local Ollama. Off by default, consent-gated.

## Privacy

- **Local by default.** Scans, screenshots, and your library live only in your
  browser (IndexedDB). No account, no tracking, no analytics — and **zero
  network requests** until you choose otherwise (the UI loads no external
  fonts, scripts, or resources).
- **Full access, zero friction.** The extension carries `<all_urls>` host
  access so it connects to every page instantly — no per-site grants, no
  reloads, no prompts. Cross-origin iframes and closed Shadow DOM are
  honestly labeled, never bypassed.
- **AI is opt-in and bounded.** Disabled by default; shows exactly what it will
  send before the first request; payloads are redacted (no input values, no
  data attributes). You can use a local model that never leaves your machine.

See [`PRIVACY.md`](PRIVACY.md) and [`SECURITY.md`](SECURITY.md) for details.

## Install

> Store listings are in progress — links appear here when live.

**Chrome / Edge** — install from the Chrome Web Store / Edge Add-ons, or load
the unpacked build:

```sh
npm install
npm run build        # production build → .output/chrome-mv3
```

1. Open `chrome://extensions` (or `edge://extensions`) → enable **Developer mode**.
2. **Load unpacked** → select `.output/chrome-mv3`.
3. Pin Vizquo and open the side panel — it connects to the current page
   automatically (full host access; no grants or reloads).

**Firefox** — `npm run build:firefox:mv3`, then load `.output/firefox-mv3` via
`about:debugging#/runtime/this-firefox` (temporary add-on).

Ready-to-download ZIPs for every release live in the
[`landing/downloads/`](landing/downloads/) folder.

## Development

```sh
npm install
npm run dev            # Chrome dev build with HMR
npm run dev:firefox    # Firefox dev build
npm run compile        # strict tsc
npm run lint           # Biome
npm run test           # vitest unit suite (415 tests)
npm run test:torture   # 31 deterministic Chrome torture scenarios
npm run test:e2e       # Playwright E2E (needs `npm run build` first)
npm run zip            # store-ready ZIP → .output/
```

Validation gate before shipping: `compile → lint → test → build → test:e2e`.

Store assets (promo tiles + real panel screenshots) are generated by scripts:

```sh
node scripts/generate-promo-tile.mjs    # → deploy-kit/promo/
node scripts/capture-screenshots.mjs    # → deploy-kit/screenshots/ (add CAPTURE_WIDTH=420 for side-panel shots)
```

## Built to be tested

Vizquo takes its own reliability seriously — a **deterministic torture suite**
drives the *built extension* in real Chromium against the worst pages a
designer could encounter: 250k-node DOMs, mutation storms, hostile CSS and
strict CSP, Shadow DOM, iframe mazes, WebGL/WebGPU, animation monsters,
infinite scroll, SPA races, and prompt-injection/secret-leak fixtures.

| Gate | Result (current release) |
|---|---|
| Unit tests | ✅ 415 tests · 49 files |
| Torture suite | ✅ 31/31 scenarios (real Chrome) |
| Extension probes | ✅ 7/7 + 7/7 (real flows) |
| Live-site corpus | ✅ 23/23 default · 15/15 core corpus |
| Landing smoke | ✅ Chromium + Firefox + WebKit |
| Keyless scan | ✅ 0 secrets in the built output |

Every confirmed bug gets a permanent regression test (e.g. `TOR-028` for
Tailwind-v4 arbitrary-value classes, `TOR-030` for panel-initiated live
editing, `TOR-031` for API-key isolation). Details in
[`TESTING.md`](TESTING.md) and [`HARDENING_REPORT.md`](HARDENING_REPORT.md).

## Tech stack

| Concern | Pick |
|---|---|
| Extension framework | **WXT** (Vite-based, MV3, cross-browser) |
| UI | **SolidJS** (fine-grained reactivity for live property rows) |
| Primitives | **Kobalte** (accessible dialog, combobox, tabs, tooltip, toast) |
| Styling | **UnoCSS** + CSS custom properties |
| Local persistence | **Dexie / IndexedDB** behind a repository interface |
| Messaging | **@webext-core/messaging** (typed RPC) |
| Worker offloading | **Comlink** |
| CSS parsing | **css-tree** · Color science **culori** · ZIP export **fflate** |
| AI | **OpenRouter** (free `:free` models) + **Ollama** (fully local) |
| Tests | **Vitest** + **Playwright** + a custom Chrome torture harness · Lint/format **Biome** |

## Project structure

```text
vizquo/
├── entrypoints/        # WXT entrypoints: background worker, content scripts, side panel
├── ui/                 # SolidJS side-panel UI (inspect, design, create, analyze, assets, library)
├── engine/             # DOM/scanning/analysis engine: refs, pipeline, inspectors, workers
├── shared/             # Typed message bus, constants, sender guard, tab isolation
├── storage/            # IndexedDB repository + adapters (inspections, cache, settings, notes)
├── ai/                 # Optional AI: gate, providers (OpenRouter / Ollama), bounded payloads
├── export/             # Code generation, token export, ZIP, library port
├── workers/            # Off-main-thread analysis workers
├── tests/              # Unit, integration, E2E specs
├── scripts/            # Release pipeline, torture suite, probes, screenshots, promo
├── landing/            # The product landing page (also the live demo)
└── deploy-kit/         # Store listings, promo tiles, screenshots, privacy policy
```

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — folder layout, stores, caching tiers
- [`PERMISSIONS.md`](PERMISSIONS.md) — every manifest permission and why
- [`SECURITY.md`](SECURITY.md) — page content treated as untrusted input
- [`PRIVACY.md`](PRIVACY.md) — what leaves the browser (nothing, except opt-in AI)
- [`DATA_MODEL.md`](DATA_MODEL.md) — the normalized entity types
- [`TESTING.md`](TESTING.md) — test matrix and how to run it
- [`THREAT_MODEL.md`](THREAT_MODEL.md) — assets, actors, security invariants
- [`CHANGELOG.md`](CHANGELOG.md) — release notes (also powers the in-app
  "What's new" dialog)
- [`DECISIONS.md`](DECISIONS.md) — running log of non-obvious choices

## Contributing

Contributions of all kinds are welcome — code, docs, bug reports, design
feedback, and real-world torture-test findings. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev setup, workflow, and the
testing bar every PR must clear.

Looking for a place to start? Check the
[open issues](https://github.com/WebDclassified/vizquo/issues) and look for
the `good first issue` label.

## Roadmap

- **Store listings** — Chrome Web Store, Edge Add-ons, Firefox AMO (one-click
  installs; the manual ZIP path already works)
- **Safari** — native build via Apple's converter (vote in the issues)
- **Designer/Engineer narrative AI** — richer design-system storytelling, still
  local-first and consent-gated
- **Comparison studio** — side-by-side design-system diffs across pages

## License

[MIT](LICENSE)

## Credits

Created and maintained by **Prabhat Teotia** — designed, engineered, and
shipped as a labor of love for the open web. <3
