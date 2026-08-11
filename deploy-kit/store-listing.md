# Vizquo — Store Listing Kit (copy-paste)

Version: 0.10.1 · Build ZIPs: `.output/vizquo-0.10.1-chrome.zip` (Chrome + Edge),
`.output/vizquo-0.10.1-firefox.zip` + `.output/vizquo-0.10.1-sources.zip` (Firefox AMO).

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

## 8. Visual assets checklist

- Extension icon: already in the ZIP (`icon/128.png`).
- Small promo tile: **440×280 PNG** — create one (logo on the near-black surface with the tagline).
- Screenshots (1280×800 or 640×400, up to 5): capture the real side panel —
  1. Design Overview on a real site
  2. Element Inspector (locked element with computed styles)
  3. Assets panel
  4. Screenshot studio
  5. Library / Design DNA
- Marquee promo tile (optional): 1400×560.
