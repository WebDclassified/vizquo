# Vizquo — Store Listing Kit (copy-paste)

Version: 0.10.9 · Build ZIPs: `.output/vizquo-0.10.9-chrome.zip` (Chrome + Edge),
`.output/vizquo-0.10.9-firefox.zip` + `.output/vizquo-0.10.9-sources.zip` (Firefox AMO).

---

## 0. Developer / publisher name

**Prabhat Teotia** — enter this exact name as the developer/publisher in every
store (Chrome Web Store, Edge Add-ons, Firefox AMO) so the credit is visible
on the listing.

---

## 1. Extension name

**Vizquo** (short name: **Vizquo**)

## 2. Summary / tagline (130 chars max for Chrome's "summary")

> Inspect any webpage and extract its design system — colors, typography, spacing, components, assets — in seconds.

## 3. Detailed description

> **Inspect anything. Understand everything. Build faster.**
>
> Vizquo is a design-intelligence side panel for designers and frontend developers. Point it at any webpage and it extracts the site's visual system — every value traced back to its source and tagged with its confidence (Detected / Derived / Inferred).
>
> **What you get:**
> - **Element inspector** — computed styles, CSS cascade and specificity, variable chains, box model, DOM tree, and plain-language Designer summaries with a "Show CSS" toggle.
> - **Design DNA** — automatic color roles, typographic hierarchy, spacing/radius/shadow scales, and a design-consistency score.
> - **Assets** — extract images, SVGs, icons, backgrounds and video posters; inspect SVGs; export everything as a ZIP.
> - **Screenshot studio** — viewport, element, full-page and multi-selection captures.
> - **Code generation** — turn any element into React, Vue, Svelte, HTML or Tailwind code.
> - **Audits** — WCAG contrast, performance, accessibility and technology detection.
> - **Responsive Time Machine** — see the layout at any viewport width.
> - **Library** — scan history, collections, notes, version timeline, and reports.
> - **Optional AI** — plain-language "Why?" explanations and design summaries (free models, off by default).
>
> **Privacy first.**
> - Everything is **local by default**: scans, screenshots and your library live only in your browser (IndexedDB). No account, no tracking, no analytics, and **zero network requests** until you choose otherwise.
> - Site access is granted **per-site, on demand** — never at install.
> - AI is **off by default** and consent-gated: it shows exactly what it will send before the first request, and you can use a local model (Ollama) that never leaves your machine.
> - The extension requests only the minimum permissions (see below).
>
> **Works on any page** — static sites, React, Vue, Angular, Next.js, Web Components, and pages with heavy DOM. Cross-origin iframes and closed Shadow DOM are honestly labeled, never bypassed.

## 4. Single purpose (privacy tab)

> Inspect and extract visual design information (colors, typography, spacing, components, assets) from web pages, entirely locally.

## 5. Category

**Developer Tools**

## 6. Permission justifications (paste into the permission/justification field)

- **storage** — persists settings, collections, history and the local scan cache (all on-device, never transmitted).
- **sidePanel** — opens the side panel, Vizquo's primary interface.
- **downloads** — saves exported asset ZIPs and screenshots.
- **contextMenus** — adds the "Inspect with Vizquo" right-click action.
- **activeTab** — the most conservative permission in Chrome: active only while you invoke the extension (toolbar click, context menu, or shortcut) so the screenshot studio and context-menu hand-off work without any prior site grant.
- **Optional host permissions** (`<all_urls>`, `https://openrouter.ai/*`, `http://localhost/*`) — requested **on demand** only: per-site inspection access when you click "Grant access to this tab", OpenRouter when you enable cloud AI, and localhost when you choose the local Ollama provider. Never granted at install.

## 7. Privacy form answers (Chrome Web Store)

- Does your product comply with the Chrome Web Store User Data Policy? **Yes**
- Single purpose: see section 4.
- Data usage: **No user data collected**.
  - No personal data · No web history · No authentication data · No health/financial data · No user activity/tracking · No analytics.
  - Note: AI features are **off by default**; the only outbound requests are the user's own, consent-gated AI requests (their own OpenRouter key, or none at all with the local Ollama provider). This does not constitute collection.
- Remote code: **No** — all code is bundled; the analysis worker loads bundled code from the package.
- Privacy policy URL: see `deploy-kit/privacy-policy.md` (host it — GitHub Pages, or any static host — and paste the URL).

## 8. Visual assets — already generated ✨

All assets are produced by two scripts in this repo (no design tools needed):

- `node scripts/generate-promo-tile.mjs` (or `npm run promo`) →
  `deploy-kit/promo/` — the 440×280 tile, 1400×560 marquee, and the
  1200×630 OG/social card, all matching the premium landing redesign
  (aurora gradient, Space Grotesk wordmark)
- `node scripts/capture-screenshots.mjs` (run after `npm run build`) →
  `deploy-kit/screenshots/` — captures the REAL panel connected to a styled
  sample site, with a real Design DNA scan (a `CAPTURE_WIDTH=420` run adds
  authentic side-panel-width shots)

| Asset | File | Notes |
|---|---|---|
| Extension icon | `icon/128.png` (in the ZIP) | already in the package |
| Small promo tile (440×280) | `deploy-kit/promo/promo-440x280.png` | required |
| Marquee (1400×560, optional) | `deploy-kit/promo/marquee-1400x560.png` | featured placement |
| Social / OG card (1200×630) | `deploy-kit/promo/og-1200x630.png` | landing link previews + socials |
| Screenshot — Design overview | `deploy-kit/screenshots/design-overview.png` | 1280×800, post-scan |
| Screenshot — Inspector | `deploy-kit/screenshots/inspector.png` | locked element |
| Screenshot — Assets | `deploy-kit/screenshots/assets.png` | extracted assets |
| Screenshot — Create | `deploy-kit/screenshots/create.png` | studio + export |
| Screenshot — Library | `deploy-kit/screenshots/library.png` | collections/history |
| Screenshot — Settings | `deploy-kit/screenshots/settings.png` | settings + diagnostics |
| Screenshot — Command palette | `deploy-kit/screenshots/command-palette.png` | Ctrl/⌘K |

**CWS sizes:** every screenshot ships at both accepted sizes — 1280×800
(`deploy-kit/screenshots/`) and 640×400 (`deploy-kit/screenshots/cws/`,
RGB without alpha, produced by `npm run screenshots:cws`). Upload either
set; both are exact 16:10 with no cropping.

Screenshot pick: upload 5 of the 1280×800 shots (Chrome Web Store limit). The
`@420` variants show the authentic narrow side-panel layout for your website
or socials. Resize to 640×400 only if a store asks — the 1280×800 files are
already compliant.
