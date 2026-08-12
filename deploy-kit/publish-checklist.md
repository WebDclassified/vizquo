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
3. **Add new** → upload `.output/release/vizquo-0.10.8/vizquo-0.10.8-chrome.zip`.
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
3. Upload
   `.output/release/vizquo-0.10.8/vizquo-0.10.8-firefox.zip` AND
   `.output/release/vizquo-0.10.8/vizquo-0.10.8-sources.zip` (AMO requires
   source code for MV3).
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
3. **Add new item** → upload `.output/release/vizquo-0.10.8/vizquo-0.10.8-chrome.zip`.
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

1. Write the new `## x.y.z` entry at the top of `CHANGELOG.md` (the release
   script adds a placeholder if you forget).
2. Run the one-command release pipeline:
   `npm run release -- <old> <new>` (add `--screenshots` to also regenerate
   the promo tile + store screenshots; `--dry-run` previews the full plan
   without changing anything). After screenshots regenerate, run
   `npm run screenshots:cws` to produce the exact 640×400 Chrome Web Store
   variants into `deploy-kit/screenshots/cws/`. It bumps every release file, restores the
   renamed old CHANGELOG heading, runs compile/lint/unit, builds Chrome +
   Firefox, produces the three store ZIPs, runs the keyless scan (must be
   **0**), and assembles `.output/release/vizquo-<new>/` with the ZIPs,
   listing kit, and a `RELEASE.md` upload summary.
3. Sync the landing page to the new version (the version is hardcoded there,
   so `bump-version.mjs` does NOT touch it):
   - Copy the new ZIPs into `landing/downloads/`
     (`cp .output/release/vizquo-<new>/*-chrome.zip .output/release/vizquo-<new>/*-firefox.zip landing/downloads/`)
     and remove the previous version's ZIPs from that folder.
   - Update the `downloads/vizquo-<new>-*.zip` hrefs in `landing/index.html`
     (6 download buttons) and the footer `v<new>` badge.
   - Run `npm run promo` to regenerate the promo tiles + OG card to match.
   - Run `npm run check:landing` to verify the page in Chromium, Firefox,
     and WebKit — including that every Download link resolves 200.
4. Commit the bump + changelog + landing sync, tag `v<new>`, and push.
5. Upload the new ZIPs to each store item (same ID preserved via the PEM
   key): Edge → Firefox AMO → Chrome Web Store (see paths above).
6. Optional final smoke pass after upload:
   `node scripts/probe-extension.mjs`,
   `node scripts/probe-extension-advanced.mjs`,
   `node scripts/probe-real-sites.mjs`.
