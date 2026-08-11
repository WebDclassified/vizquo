# Privacy Policy — Vizquo (browser extension)

_Effective date: August 11, 2026_

This policy describes what the Vizquo browser extension ("Vizquo", "we", "our")
does with your data. In short: **Vizquo is local by default. It collects
nothing. It transmits nothing unless you explicitly choose to use the optional
AI features.**

## 1. Data that never leaves your device

All inspection results, scans, screenshots, collections, notes, history, and
the local cache are stored **only in your browser** using IndexedDB on your own
device. There is no account, no sign-in, no cloud storage, and no analytics or
tracking of any kind.

- **No browsing history** is collected.
- **No web activity** is collected or transmitted.
- **No personal data** (name, email, identifiers) is collected.
- Opening the extension and inspecting pages makes **no network requests**.

## 2. Site access (on demand)

Vizquo runs on a page only after you explicitly grant access to that site
(per-site, via the browser's own permission prompt). Access can be revoked at
any time. When granted, Vizquo reads the page's DOM, computed styles, and
assets to build its inspection — this data is processed locally and is never
transmitted.

## 3. Optional AI features (off by default)

The only functionality that can send data over the network is the optional AI
layer ("Why?" explanations and design-system summaries). It is **disabled by
default** and must be explicitly enabled in Settings.

- **Before the first request**, Vizquo shows exactly what will be sent and
  requires your confirmation. The summary stays visible above every send
  button.
- The payload is bounded and redacted: at most 200 characters of visible text,
  a ≤160-character HTML snippet with `value`/`name`/`data-*` attributes
  stripped, computed styles, and CSS variables in scope. Form input values and
  data attributes are excluded by construction.
- **Cloud provider (OpenRouter):** requests go to the provider only when you
  enable cloud AI and only with your confirmation. The API key is stored
  locally in your browser and is never logged or transmitted to the pages you
  inspect. You may use your own key, or none at all.
- **Local provider (Ollama):** with this option, requests never leave your
  machine (they go to your local Ollama server at `localhost`).

You can disable AI at any time. Every non-AI feature works fully without it.

## 4. Downloads and exports

Assets you choose to export (ZIP archives), screenshots, and generated code are
saved only to locations you choose (your Downloads folder or saved locally).

## 5. Third parties

Vizquo contains **no third-party analytics, advertising, or tracking code** and
loads **no external resources** (fonts, scripts, or libraries) from the
network. The only optional third-party connection is the OpenRouter AI service,
used solely when you enable cloud AI, under the terms described in section 3.

## 6. Children's privacy

Vizquo does not collect any personal information from anyone, including
children.

## 7. Changes to this policy

If this policy changes, the updated version will be posted at the same URL with
a new effective date.

## 8. Contact

For privacy questions: open an issue on the project repository, or contact the
developer through the store listing's support link.

---

_Source: this document mirrors `PRIVACY.md` in the project repository._
