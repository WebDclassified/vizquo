# AI Privacy

> Requirements §26–§29. Contextual AI is additive, disabled by default, and
> never load-bearing: every core inspection feature works without it.

## The model in one sentence

Nothing is sent anywhere unless the user enables AI, picks a provider,
consents to the exact payload shown in the privacy gate, and asks — and the
payload itself is bounded and redacted by construction.

## What is sent

- Only the element / page / asset / comparison the user asked about.
- Bounded computed styles, ≤ 200 characters of visible text, ≤ 160-character
  HTML snippets with `value`/`name`/`data-*` attributes stripped, relevant
  CSS variables, and source traces (see `ai/prompts.ts`).
- The `payloadSummary` the privacy gate displays is built from the exact same
  data that ships — the summary can never drift from the payload.

## What is never sent

- Input values, passwords, cookies, auth tokens, complete DOM, unrelated page
  HTML, unrelated storage, screenshots, inspection history, or any API key.

## Key isolation

- The API key lives in extension-scoped IndexedDB and is read only by the
  background worker, which performs the network call. Content scripts and the
  panel renderer only ever see `hasKey: true/false`.
- The debug bundle overwrites the key slot with `[redacted]` before
  serialization (`SettingsScreen`), and `scripts/release-store.mjs` refuses to
  ship a build containing a key.

## Providers

- **Custom (OpenAI-compatible)** — the user's own endpoint (OpenAI, DeepSeek,
  Together, LM Studio, vLLM, a private proxy…), configured with their base
  URL, their key, and the exact model slug. No built-in vendor or model ships
  with Vizquo.
- **Ollama** — fully local inference on `localhost`, no key at all, the
  strictest privacy posture. Provider origins are requested on demand only
  (`optional_host_permissions`); the custom endpoint's origin is derived from
  the base URL the user enters.

## Page content is data, not instructions

- Page text, comments, SVG, ARIA labels, alt text, and metadata are treated as
  hostile data — never as trusted instructions (prompt injection).
- `TOR-012` runs a page full of injection text + fake secrets and proves: no
  key ever lands in storage, AI refuses honestly without consent, and zero
  external requests occur without the user enabling it.
- AI output is text. Nothing AI generates is ever executed — no JavaScript,
  no extension calls, no browser actions.

## The consent flow

1. AI starts disabled.
2. Enabling it asks for the provider (and key, for the custom endpoint).
3. The first request shows the privacy gate with the exact `payloadSummary`.
4. The user approves; subsequent requests reuse the consent for this session.

## Automated verification

- `tests/ai.test.ts` — prompt builders are bounded + redacted; the summary
  matches the payload; keys never leak into prompts.
- `TOR-012 prompt-injection-secrets` — live-browser proof of the guarantees
  above.
- `TOR-029 message-sender-validation` — only the side panel can trigger AI
  requests; oversized payloads are refused at the worker.
