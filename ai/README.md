# ai/

Contextual AI (master spec Section 7.23) — Phase 7. Scoped actions
(element / asset / design-system / page), a privacy gate that shows exactly
what will be sent before the first send, and an `AIProvider` interface
(`explain()`) with multiple backends.

Everything else in Vizquo works with AI fully disabled.

## Providers

Vizquo ships **no built-in AI vendor** — no bundled key, no preset model
list. Both supported backends are fully user-owned:

| id       | Backend                                   | Key        |
| -------- | ----------------------------------------- | ---------- |
| `custom` | Any OpenAI-compatible endpoint the user runs/chooses | Bearer key |
| `ollama` | Local Ollama server                       | none       |

### Custom (OpenAI-compatible)

The `custom` provider points at any server that speaks the OpenAI
chat-completions format — OpenAI, DeepSeek, Together, LM Studio, vLLM, a
private proxy, etc. Users configure three things in Settings:

1. **Base URL** — e.g. `https://api.example.com/v1`. The provider POSTs to
   `<baseUrl>/chat/completions`. Host permission is derived from the URL's
   origin and requested on demand.
2. **API key** — Bearer token for that endpoint (may be empty for local
   servers that accept keyless requests — the provider only errors when a key
   is missing and the endpoint rejects it).
3. **Model** — the exact slug the endpoint expects. There is **no default**:
   the field starts empty on purpose, because a guessed slug is what produces
   "model not found" 404s. The field persists as you type.

## Architecture

- `provider.ts` — the `AIProvider` interface (`explain(request, apiKey)`).
- `openai-compatible.ts` / `ollama.ts` — one file per backend, all throwing
  nothing (every path returns an honest `AIExplainResult`).
- `registry.ts` — `createProvider(providerId, settings)` is the only place
  that turns a stored id + settings into a provider; `providerOrigin()` maps
  a provider to its required host origin (used by Settings and the dialog).
- `config.ts` — keyless by construction: only the user's own key is ever
  used; nothing is bundled.
- `gate.ts` — pure readiness check (disabled → no key → no consent).
- `prompts.ts` — bounded, redacted prompt builders; the privacy gate shows
  exactly this payload before first send.

## Security contract

The API key lives in the background worker only — never in the content
script, the page, logs, cache, or exports. The panel builds bounded prompts
from inspected data; the worker performs the network call. Host permissions
per provider are requested explicitly in Settings (or on first send via the
privacy gate).
