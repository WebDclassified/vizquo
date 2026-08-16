# Privacy

> Created by Prabhat Teotia


Vizquo is local by default. Nothing you inspect is uploaded, tracked, or sold.

## What stays in the browser

- All scans, inspections, collections, notes, history, screenshots, and the
  L3 cache live in local IndexedDB on your machine.
- The default repository adapter is fully local; the interface (Section 2.2)
  exists so a self-hosted/backend sync could be added later, but shipping
  Vizquo never requires one.
- No browsing-history collection. No analytics beyond what the extension
  needs to function.

## AI (Phase 7) — opt-in, consent-gated

The only feature that can send page content anywhere is Contextual AI
(Section 7.23), and it:

- is disabled by default,
- shows exactly what will be sent before the first send and requires explicit
  confirmation,
- keeps that summary visible above every Send button, so you always see what
  leaves the browser,
- lets you cancel, inspect the payload, or disable AI entirely,
- sits behind an `AIProvider` interface so a local model (e.g. Ollama) can
  replace any cloud provider without touching feature code.

**What AI sends (and never sends).** Element explanations include the
bounded computed styles, up to 200 chars of visible text, the CSS variables
in scope, source traces, and a ≤ 160-char HTML snippet with `value`/`name`/
`data-*` attributes stripped. Design-system summaries send tokens, type,
spacing, radius, component counts, and the consistency score — never page
HTML or DOM. Input values and data attributes are excluded by construction.

The `openrouter.ai` host permission is subsumed by the extension's required
`<all_urls>` host grant (see `PERMISSIONS.md`) — enabling AI never triggers
an extra permission prompt. Your API key is stored locally and used only by
the background worker. Vizquo is **fully keyless** — no key ships with the
extension; the only key involved is the one you paste in Settings (or none
at all, with the local Ollama provider), and you can remove it any time.

Every non-AI feature works with AI fully disabled. AI is additive, never
load-bearing.

## Sharing

Shareable inspections (Phase 8) ship read-only and never leak private page
info by default — you explicitly choose what, if anything, to share.
