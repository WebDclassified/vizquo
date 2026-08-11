# Vizquo — Publish Checklist (free paths first)

Everything below is **$0** except the Chrome Web Store, which charges a one-time
**$5** developer fee (Google's rule — there is no free tier). Edge + Firefox
reach most users for free.

---

## ✅ Zero-cost path A — Microsoft Edge Add-ons (free, ~15 min)

Edge is Chromium and accepts the Chrome build almost unchanged. The store is
free with no developer fee.

1. Create a free Microsoft account at https://account.microsoft.com (use a
   dedicated one for publishing).
2. Go to https://partner.microsoft.com/dashboard/microsoftedge → **Sign in** →
   accept the publisher agreement (free, no fee).
3. **Add new** → upload `.output/vizquo-0.10.2-chrome.zip`.
4. Fill the listing using `deploy-kit/store-listing.md`:
   - Name, summary, detailed description, category: Developer Tools.
   - Upload your 440×280 promo tile and screenshots.
   - Privacy: paste the URL of your hosted `deploy-kit/privacy-policy.md`.
5. Submit. Edge typically approves Chrome-compatible extensions quickly
   (hours–days).

## ✅ Zero-cost path B — Firefox Add-ons (AMO, free)

1. Create a free Mozilla account at https://accounts.firefox.com.
2. Go to https://addons.mozilla.org/developers/ → **Submit a new add-on** →
   choose "On your own" (self-distribution) or "Listed" (public store listing).
   **Listed** = visible to everyone.
3. Upload `.output/vizquo-0.10.2-firefox.zip` AND
   `.output/vizquo-0.10.2-sources.zip` (AMO requires source code for MV3).
4. Fill the listing (same text as `deploy-kit/store-listing.md`; the manifest
   already declares `data_collection_permissions: none`).
5. **Caveat:** Firefox was not runtime-tested in the audit — do a manual smoke
   pass (grant access → inspect → scan → assets) in Firefox first.
6. Submit; first review by Mozilla takes a few days to a few weeks.

## 💰 Optional path C — Chrome Web Store ($5 one-time, ~30 min)

1. Use a **dedicated Google account** (the account email can't be changed
   later). Enable **2-Step Verification** (required to publish).
2. Go to https://chrome.google.com/webstore/devconsole → accept the Developer
   Agreement → pay the **one-time $5** registration fee.
3. **Add new item** → upload `.output/vizquo-0.10.2-chrome.zip`.
4. Before publishing, in the item's package area use **"Set your own extension
   ID"** and download the generated PEM upload key. **Store it in a password
   manager — never in the repo.** Losing it prevents future updates under the
   same ID.
5. Store listing tab: name, summary, description, category (Developer Tools),
   promo tile 440×280, 1–5 screenshots (1280×800 or 640×400).
6. Privacy tab: single purpose + answers from `deploy-kit/store-listing.md`
   section 7, plus the URL of your hosted privacy policy.
7. Distribution tab: start **Unlisted**, publish, then **install the
   store-served build yourself** and run a full smoke pass before flipping to
   **Public**.
8. Review takes a few days to ~2 weeks for new developers. Watch the dedicated
   Google account email.

---

## Hosting the privacy policy (free)

Push this repo to GitHub → enable **Settings → Pages** (deploy from the repo
root) → your privacy policy lives at
`https://<user>.github.io/<repo>/deploy-kit/privacy-policy.md`. Use that URL in
all three stores.

## Release checklist (repeat for every update)

1. Bump `package.json` version + `shared/constants.ts` `APP_VERSION` + a new
   `## x.y.z` entry in `CHANGELOG.md`.
2. `npm run compile && npm run lint && npm run test`
3. `npm run build && npm run zip` (Chrome) and
   `npx wxt zip -b firefox --mv3` (Firefox)
4. Verify keyless: `grep -ro 'sk-or-[a-zA-Z0-9]\{8,\}' .output/chrome-mv3 .output/firefox-mv3 | wc -l` → **0**
5. Upload the new ZIP to each store item (same ID preserved via the PEM key).
