# Vizquo — Microsoft Edge Add-ons Submission Kit

**Everything you need to submit Vizquo to the Microsoft Edge Add-ons store — copy-paste ready.**

- Store: **Edge Add-ons** (free, no developer fee)
- Package: **`.output/vizquo-0.10.2-chrome.zip`** (Edge is Chromium — accepts the Chrome build)
- Review time: up to **3 business days** officially (real-world: ~3–7 days)
- Version: **0.10.2**

---

## 0. Before you start (5 minutes)

1. Create a **Microsoft account** at `account.microsoft.com` — use a dedicated publishing email (you can't easily change it later).
2. Go to **`partner.microsoft.com/dashboard/microsoftedge`** → **Sign in** → accept the **publisher agreement** (free, no fee).
3. Have these files ready on disk:

| File | Purpose |
|---|---|
| `.output/vizquo-0.10.2-chrome.zip` | the package you upload |
| `deploy-kit/promo/edge-logo-300.png` | **300×300 extension logo** (required, 1:1) |
| `deploy-kit/promo/promo-440x280.png` | small promotional tile (440×280, optional) |
| `deploy-kit/promo/marquee-1400x560.png` | large promotional tile (1400×560, optional) |
| 5 of the `deploy-kit/screenshots/*.png` (1280×800) | screenshots (up to 6 allowed) |
| `https://webdclassified.github.io/vizquo/deploy-kit/privacy-policy.md` | privacy policy URL |

---

## 1. Submit the package

1. In the Partner Center dashboard click **+ New** → **Add new** → **Extension**.
2. **Upload** `.output/vizquo-0.10.2-chrome.zip`.
3. Fill in the wizard sections below, then **Save draft** and **Submit for review**.

---

## 2. Store listing (per language)

### Name
Read-only — pulled from the manifest (`Vizquo`).

### Short description
> Inspect any webpage and extract its design system — colors, typography, spacing, components, assets — in seconds.

### Detailed description (minimum 250 characters; paste all of this)

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

### Category
**Developer Tools**

### Search terms (up to 7)
```
design, design-system, css, inspector, design-tokens, figma, developer-tools
```

### Website (optional but recommended)
`https://webdclassified.github.io/vizquo/landing/`

### Support contact (optional)
`https://github.com/WebDclassified/vizquo/issues`

---

## 3. Privacy & permissions page

### State the extension's purpose (single purpose)
> Inspect and extract visual design information (colors, typography, spacing, components, assets) from web pages, entirely locally.

### Permission justifications (paste each)

- **storage** — persists settings, collections, history and the local scan cache (all on-device, never transmitted).
- **sidePanel** — opens the side panel, Vizquo's primary interface.
- **downloads** — saves exported asset ZIPs and screenshots.
- **contextMenus** — adds the "Inspect with Vizquo" right-click action.
- **activeTab** — the most conservative permission in Chrome/Edge: active only while you invoke the extension (toolbar click, context menu, or shortcut) so the screenshot studio and context-menu hand-off work without any prior site grant.
- **Optional host permissions** (`<all_urls>`, `https://openrouter.ai/*`, `http://localhost/*`) — requested **on demand** only: per-site inspection access when you click "Grant access to this tab", OpenRouter when you enable cloud AI, and localhost when you choose the local Ollama provider. Never granted at install.

### Remote code?
**No** — all code is bundled; the analysis worker loads bundled code from the package.

### Data usage practices
- **No user data collected.**
- No personal data · No web history · No authentication data · No health/financial data · No user activity/tracking · No analytics.
- Note: AI features are **off by default**; the only outbound requests are the user's own, consent-gated AI requests (their own OpenRouter key, or none at all with the local Ollama provider). This does not constitute collection.

### Privacy policy URL
```
https://webdclassified.github.io/vizquo/deploy-kit/privacy-policy.md
```

---

## 4. Visual assets (upload in the listing step)

| Slot | File | Size |
|---|---|---|
| Extension logo | `deploy-kit/promo/edge-logo-300.png` | 300×300 (required) |
| Small promotional tile | `deploy-kit/promo/promo-440x280.png` | 440×280 |
| Large promotional tile (optional) | `deploy-kit/promo/marquee-1400x560.png` | 1400×560 |
| Screenshot 1 | `deploy-kit/screenshots/design-overview.png` | 1280×800 |
| Screenshot 2 | `deploy-kit/screenshots/inspector.png` | 1280×800 |
| Screenshot 3 | `deploy-kit/screenshots/assets.png` | 1280×800 |
| Screenshot 4 | `deploy-kit/screenshots/create.png` | 1280×800 |
| Screenshot 5 | `deploy-kit/screenshots/library.png` | 1280×800 |

---

## 5. Submit checklist (final pass)

- [ ] Package uploads without errors (no `manifest.json` warnings)
- [ ] Name shows **Vizquo**
- [ ] Description pasted (≥ 250 chars — it is)
- [ ] Category = **Developer Tools**
- [ ] 300×300 logo uploaded
- [ ] 5 screenshots uploaded
- [ ] Privacy policy URL pasted and loads in a private window
- [ ] All 6 permission justifications pasted
- [ ] Remote code = **No**
- [ ] Data usage = **No user data collected**
- [ ] Click **Submit for review** → confirm the confirmation email

---

## 6. What happens next

1. **Automated certification** runs immediately (package format, manifest MV3, policy scan).
2. **Manual review** by Microsoft (up to 3 business days; real-world ~3–7).
3. Watch the **Microsoft account email** for the result; fixes (if any) are usually specific and quick to resubmit.
4. Once **Published**, your one-click install link is
   `https://microsoftedge.microsoft.com/addons/detail/<your-id>` — add it to the landing page's store section and replace the manual-download note.

### Related docs
- Full listing copy (Chrome + Firefox versions): `deploy-kit/store-listing.md`
- Firefox + Chrome paths: `deploy-kit/publish-checklist.md`
- Safari port (macOS required): `deploy-kit/safari-port.md`
