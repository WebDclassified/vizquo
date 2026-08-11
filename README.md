# Vizquo

**Inspect anything. Understand everything. Build faster.**

Vizquo is a design-intelligence layer for the web — a browser extension side
panel that extracts a site's visual system (colors, typography, spacing,
components, assets) with every value traced back to its source and tagged with
its confidence. It is not a CSS inspector, not a screenshot tool, not a
scraper, and not a chatbot with a browser action.

## Two modes, one data model

- **Designer mode** — plain-language summaries ("Flex, horizontal,
  space-between, gap 16px") with a *Show CSS* toggle.
- **Engineer mode** — computed styles, cascade, specificity, source maps, DOM.

Both read from the same extraction engine. This is a presentation switch,
never two separate analyzers.

## Stack

| Concern | Pick |
|---|---|
| Extension framework | **WXT** (Vite-based, MV3, cross-browser) |
| UI | **SolidJS** (fine-grained reactivity for live property rows) |
| Primitives | **Kobalte** (accessible dialog, combobox, tabs, tooltip, toast) |
| Styling | **UnoCSS** + CSS custom properties |
| Local persistence | **Dexie / IndexedDB** behind a repository interface |
| Messaging | **@webext-core/messaging** (typed RPC) |
| Worker offloading | **Comlink** (Phase 3) |
| CSS parsing | **css-tree** (Phase 2) |
| Color science | **culori** (Phase 3) |
| ZIP export | **fflate** (Phase 4) |
| AI | **OpenRouter** (free `:free` models) + **Ollama** (fully local) behind an `AIProvider` adapter (Phases 7 & 9) |
| Tests | **Vitest** + **Playwright** (E2E smoke) |
| Lint / format | **Biome** |

Everything is MIT/Apache-licensed and runs locally — no backend, no account,
no cost. The AI layer is strictly additive and optional; see [AI — free by
default](#ai--free-by-default) below.

## Build phases (Section 9 of the spec)

| Phase | What ships | Status |
|---|---|---|
| 1 | Foundation: WXT skeleton, typed messaging, repository + IndexedDB adapter, L3 cache, design system, theming, command palette, settings, shortcuts + cheatsheet, onboarding tour | ✅ Done |
| 2 | Element inspector (six tabs), CSS source intelligence (cascade, specificity, variable chains), smart measurement + box-model overlay, DOM tree, L1 cache, toolbar badge, context menu | ✅ Done |
| 3 | Scan engine, Page overview, Design DNA (color roles, type hierarchy, scales), token systems, find instances/similar, multi-select, L2 worker memoization | ✅ Done |
| 4 | Asset extractor, SVG inspector, bulk ZIP export | ✅ Done |
| 5 | Accessibility/performance audits, consistency, technology detection, responsive Time Machine | ✅ Done |
| 6 | Screenshot studio, live editing, export center, code generation, token export | ✅ Done |
| 7 | Contextual AI (privacy-gated), "Why?" intelligence, BYOK OpenRouter | ✅ Done |
| 8 | Components/playground, history/collections/notes, comparison/reports, detachable window, omnibox, diagnostics | ✅ Done |
| 9 | Release readiness: version + icons + keyless builds, CI, Figma Tokens/Style Dictionary export, library backup/restore, live-edit persistence, AI diff narration + fix prioritization, local Ollama provider, code-split panels, storage awareness, a11y E2E guard | ✅ Done |

Each phase is gated by a Definition of Done — verified by running the build,
not assumed. See `DECISIONS.md` for the running log of architectural choices.

## Getting started

```sh
npm install
npm run dev        # start WXT dev server
npm run compile    # tsc --noEmit
npm run lint       # biome check
npm run test        # vitest run
npm run build       # wxt build (extension ready in .output)
npm run test:e2e    # Playwright smoke test against the built extension
```

Load the unpacked extension from `.output/chrome-mv3` in
`chrome://extensions` (Developer mode). Grant site access to a tab when
prompted — that is how Vizquo connects, always on demand, never by default.

## AI — free by default

AI features ("Why?" element explanations, design-system summaries, compare
diff narration, audit-fix prioritization) are **off by default** and every
other Vizquo feature works without them. Nothing is uploaded, tracked, or
sold — all analysis runs locally, and the AI layer is the only thing that can
talk to a network at all.

### Two providers, one adapter

| | OpenRouter | Ollama (local) |
|---|---|---|
| Where it runs | Cloud (your key) | Your machine (no key) |
| Cost | Free `:free` models by default | Zero — no cloud at all |
| Setup | Paste a key in Settings (or none, in dev) | Install Ollama, `ollama pull llama3.2` |
| Privacy | Bounded, redacted prompts to the model you chose | Nothing leaves the machine |
| Default | ✅ (nothing to install) | Opt-in from Settings |

- **OpenRouter** is the default: `openrouter/free` auto-selects the best
  available free model, and every listed model is free. Bring your own key
  (Settings → AI) to unlock paid models.
- **Ollama** runs inference locally via `http://localhost:11434` — the
  strictest privacy posture Vizquo offers. Settings lets you pick the
  provider, set the base URL and model, and grants the `localhost` permission
  on demand.

### Why production builds are keyless

Dev builds inline the author's own OpenRouter key so the full AI flow works
out of the box during development. Production builds (`wxt build`, including
the Web Store ZIP) ship **keyless by construction** — `import.meta.env.DEV`
strips the constant from every distributable bundle, so a key can never be
extracted from a published extension and used by someone else. Users paste
their own key in Settings (which always overrides the bundled default), or
use Ollama and skip keys entirely.

### Privacy posture

- The API key lives **only** in the background worker — never in the content
  script, the page, or the panel's renderer state (the UI sees a `hasKey`
  boolean).
- Prompts are bounded and redacted at the builder (`ai/prompts.ts`): text
  ≤ 200 chars, HTML snippets ≤ 160 chars with `value`/`name`/`data-*`
  attributes stripped, no input values by construction.
- Before the first request, a consent gate shows the exact payload summary
  — what you approve is byte-for-byte what is sent.

## Documentation

- `ARCHITECTURE.md` — folder layout, stores, caching tiers, storage abstraction
- `PERMISSIONS.md` — every manifest permission and why
- `SECURITY.md` — how page content is treated as untrusted input
- `PRIVACY.md` — what leaves the browser (nothing, except opt-in AI)
- `DATA_MODEL.md` — the normalized entity types
- `TESTING.md` — test matrix and how to run it
- `DECISIONS.md` — running log of non-obvious choices
- `CHANGELOG.md` — release notes (powers the "What's new" panel)
