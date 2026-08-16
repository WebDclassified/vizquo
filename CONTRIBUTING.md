# Contributing to Vizquo

Thanks for wanting to contribute! Vizquo is a free, local-first browser
extension, and every contributor makes it better. This guide keeps the bar
high so the repo stays trustworthy — the extension inspects *other people's*
pages, so correctness and security are not optional.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [What to work on](#what-to-work-on)
- [Dev environment](#dev-environment)
- [Running the app](#running-the-app)
- [Validation gate](#validation-gate)
- [Code style](#code-style)
- [Testing bar](#testing-bar)
- [Bug reports](#bug-reports)
- [Pull request workflow](#pull-request-workflow)
- [PR checklist](#pr-checklist)

## Code of conduct

Be kind and professional. Full text: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## What to work on

- **Bugs** — open an issue with the bug template first (or a PR with a
  regression test — even better).
- **Features** — open a feature request issue to align before writing code.
  Unrequested large features are hard to merge; small ones are welcome.
- **Docs, tests, fixtures** — always welcome without an issue.
- **Real-world findings** — Vizquo is torture-tested against real sites. If
  you find a page where inspection is wrong, slow, or crashes: that's a
  first-class bug report.

Look for the `good first issue` label in
[the issues](https://github.com/WebDclassified/vizquo/issues).

## Dev environment

Requirements: **Node 20+** and npm (the CI uses Node 20).

```sh
git clone https://github.com/WebDclassified/vizquo.git
cd vizquo
npm install
```

The project uses [WXT](https://wxt.dev) (Vite-based extension framework),
[SolidJS](https://www.solidjs.com), and TypeScript in strict mode.

## Running the app

```sh
npm run dev            # Chrome dev build with HMR
npm run dev:firefox    # Firefox dev build
```

Load the dev build in the browser:

1. **Chrome/Edge** — `chrome://extensions` (or `edge://extensions`) → enable
   **Developer mode** → **Load unpacked** → select `.output/chrome-mv3`.
2. **Firefox** — `about:debugging#/runtime/this-firefox` → **Load Temporary
   Add-on…** → select the `manifest.json` in `.output/firefox-mv3`.

Open the side panel, then **grant access to a tab** when prompted — that's
how Vizquo connects (always on demand, never by default).

## Validation gate

Every change must pass, in order, before a PR can merge:

```sh
npm run compile   # strict TypeScript — zero errors
npm run lint      # Biome — zero errors (npm run lint:fix auto-fixes most)
npm run test      # Vitest unit suite (415 tests)
npm run build     # production Chrome build must succeed
npm run test:e2e  # Playwright E2E (build first)
```

The CI runs exactly this gate (`compile → lint → test → build → e2e`), plus
the cross-browser landing smoke test and live probes against real sites.
A green local run is the fastest way to a green CI.

## Code style

- **Formatting/linting:** Biome with the repo's `biome.json` — no other
  formatter. Run `npm run lint:fix` before committing.
- **TypeScript:** strict mode. No `any` where a type can be written; no
  `@ts-ignore` without a comment explaining why.
- **Architecture:** keep the layering. The `engine/` (page analysis), `ui/`
  (panel), `shared/` (message bus, constants), and `storage/` (repository)
  boundaries exist for a reason — a feature file talks to the repository, not
  to IndexedDB directly.
- **Messaging:** new messages go through the typed bus in `shared/messages.ts`.
  Privileged background handlers are **panel-only** — see
  `shared/sender-guard.ts`. Never add a handler that trusts a content-script
  sender with AI/export/window privileges.
- **Page content is hostile input.** Any string from the inspected page
  (HTML, SVG, CSS, URLs, filenames, ARIA labels) must be treated as untrusted:
  escape it, sanitize it, and never execute it.
- **Honest data.** Observed data is `detected`, calculated data is `derived`,
  pattern data is `inferred`, AI output is `ai-generated`. Never label one as
  another, and never hide truncation or inaccessible resources.

## Testing bar

- **Every bug fix ships with a regression test.** If it was reproducible in a
  real browser, the regression belongs in the deterministic torture suite
  (`scripts/torture.mjs`, a `TOR-0xx` scenario) or a unit test.
- **New pure logic** (parsers, analyzers, guards, exporters) needs unit tests.
- **New UI flows** that touch the page need an E2E spec in `tests/e2e/`.
- The torture suite drives the **built** extension in real Chromium:

  ```sh
  npm run build
  node scripts/torture.mjs                 # all 31 scenarios
  VQ_TORTURE=huge-dom node scripts/torture.mjs   # a subset by id or category
  ```

- Don't weaken tests to make them pass, and don't increase scan limits to
  avoid truncation. If the expected behavior is wrong, document why before
  changing the test.

## Bug reports

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). A good
report includes:

- Browser + version + OS
- The page URL or a minimal fixture that reproduces it
- Steps, expected vs actual (screenshots help)
- Console errors, if any
- Whether it reproduces on a fresh profile

## Pull request workflow

1. Fork and branch: `git checkout -b fix/describe-the-fix` (or
   `feat/`, `docs/`, `test/`).
2. Make the change — small commits with clear messages are welcome.
3. Run the [validation gate](#validation-gate) locally.
4. Push and open a PR against `main` using the
   [PR template](.github/pull_request_template.md).
5. Address review feedback; keep the diff focused on the issue at hand.

## PR checklist

- [ ] `npm run compile`, `npm run lint`, `npm run test` all pass
- [ ] `npm run build` succeeds (Chrome)
- [ ] Behavior change has a regression test (unit and/or torture/E2E)
- [ ] No page-provided content is ever executed or trusted
- [ ] No secrets/API keys added, logged, or bundled (the release pipeline's
      keyless scan must stay green)
- [ ] Docs updated if user-facing behavior changed (README, CHANGELOG)
- [ ] PR description explains the *why*, not just the *what*
