# Threat Model

> Requirements §66–§68. Vizquo is a web-instrumentation platform inside the
> browser: it reads hostile webpages, so the security boundary is the
> extension itself. This document is a living map of assets, actors, attack
> surfaces, and the invariants that automated tests pin.

## Assets worth protecting

| Asset | Where it lives | Exposure if compromised |
|---|---|---|
| User's AI API key | Extension-scoped IndexedDB (`ai.apiKey`), read only by the background worker | Free AI usage / credential theft |
| Inspections, screenshots, notes, collections | IndexedDB | Private browsing data disclosure |
| Page content (hostile by definition) | Content-script memory, sanitized UI | Prompt injection, XSS attempts |
| Exports / debug bundles | Downloads, blob URLs | Secret leakage (redacted by construction) |

## Threat actors

- Malicious webpage (DOM, CSS, SVG, URLs, scripts — all hostile input)
- Malicious AI response (untrusted generated text)
- Malicious imported file (library import / export re-import)
- Compromised content script (hypothetical — a bug inside the isolated world)
- Local malicious software with OS-level access (out of scope: no extension
  can defend against this)
- Accidental user action

## Attack surfaces

1. **Content script ↔ page DOM** — read-only sampling; never executes page JS.
2. **Messaging** — validated senders + payload bounds (see below).
3. **SVG / HTML rendering** — sanitized before rendering in extension UI;
   raw observed markup is preserved only as data (code), never executed.
4. **URLs** — page URLs are untrusted: scheme-validated before fetch/download,
   `javascript:`/`file:`/`vbscript:` rejected.
5. **Downloads / ZIP export** — filenames sanitized (no separators, no
   control chars); paths stay inside `vizquo-assets/<type>/`.
6. **Storage** — the extension never reads page storage (local/session);
   page storage poisoning is inert (TOR-023).
7. **AI** — payloads bounded + redacted; page content is data, never
   instructions (TOR-012).
8. **Web-accessible resources** — only the analysis worker asset is exposed
   (required for MV3 content-script workers), no privileged pages.

## Key boundaries

| Boundary | How it's enforced |
|---|---|
| Page JS cannot reach the worker | Chrome messaging: only extension contexts can send; no `externally_connectable` |
| Content script cannot spend AI credits / trigger downloads / open windows | `shared/sender-guard.ts`: privileged handlers accept extension pages only (TOR-029) |
| Content script cannot read the API key | Key lives in extension IndexedDB (page-keyed IndexedDB is invisible to content scripts); content scripts see only `hasKey` |
| Page cannot break the extension UI | Shadow-root overlay host + fixed z-index, tested under `* { z-index: 2147483647 !important }` (TOR-007) |
| Cross-origin content stays opaque | No SOP bypass; cross-origin iframe/shadow colors never claimed (TOR-004/005/024) |
| Cache cannot cross users/sessions | Cache key = normalized URL + page fingerprint + schema version (TOR-010, `tests/fingerprint.test.ts`) |
| Stale ops cannot overwrite fresh state | Tab-stamped payloads + identity-agreement resolution (TOR-003/013) |
| Imported data cannot corrupt storage | Schema validation at write (rejected rows are dropped loudly, `tests/storage.test.ts`) |

## Security invariants (INV-001…015)

Each invariant maps to a permanent automated test:

| Invariant | Where it's proven |
|---|---|
| INV-001 page JS never runs inside Vizquo | Isolated world + no eval/`new Function`; hostile SVG canary never reaches the worker (TOR-017) |
| INV-002 page HTML cannot inject into Vizquo UI | Sanitizers + E2E hostile spec |
| INV-003 SVG scripts cannot execute in Vizquo | TOR-017 (`onbegin`/`onerror` canary) |
| INV-004 CORS/SOP/CSP never bypassed | TOR-005/006; asset failures reported, never bypassed |
| INV-005 API keys never reach content scripts | Key in extension IndexedDB; background-only read (architecture + SECURITY.md) |
| INV-006 API keys never enter inspection/cache/export/debug | Debug bundle redacts `ai.apiKey`; `release-store.mjs` scans builds |
| INV-007 page content cannot authorize privileged operations | `shared/sender-guard.ts` + TOR-029 |
| INV-008 AI output cannot execute extension operations | AI output is text; generated code is export-only |
| INV-009 tab A cannot read tab B state | Tab-stamped payloads (TOR-013) |
| INV-010 frame A cannot overwrite frame B | Content-script handlers require the sender's own tab (guard) |
| INV-011 stale ops cannot overwrite current state | Identity-agreement resolution + tab stamps (TOR-003) |
| INV-012 malformed imports cannot corrupt storage | Schema validation on write (storage tests) |
| INV-013 untrusted URLs cannot become arbitrary privileged fetches | Scheme whitelist + sender guard (TOR-029) |
| INV-014 generated code is never executed automatically | Export-only code generation |
| INV-015 no browser security boundary is bypassed | No SOP/CSP/CORS bypass anywhere (TOR-004/005/006) |

## Honest limitations

- Local malicious software with OS-level access is out of scope.
- The API-key boundary relies on IndexedDB origin isolation; it is verified by
  architecture review + TOR-012, not by a live cross-context read test (a
  content script cannot open the extension's IndexedDB by construction).
