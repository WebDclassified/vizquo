# Host the privacy policy on GitHub Pages (free, ~10 minutes)

All three stores need a live privacy-policy URL. GitHub Pages hosts this repo
for free — the policy lives at a permanent URL you paste into every store.

## 1. Push the repo to GitHub

The project already has a local git repo (commit `7429ece`). Create a repo at
https://github.com/new (name it `vizquo`, keep it **Public** — Pages on free
accounts needs a public repo), then push:

```sh
git remote add origin https://github.com/<your-username>/vizquo.git
git branch -M main
git push -u origin main
```

> ⚠️ Before pushing public: rotate the dev-only OpenRouter key (see the
> checklist) so the key in `ai/config.ts` isn't exposed in a public repo.

## 2. Turn on Pages

1. GitHub repo → **Settings** → **Pages** (left sidebar).
2. **Source**: "Deploy from a branch".
3. **Branch**: `main` → folder `/ (root)` → **Save**.
4. Wait ~1 minute; the page shows "Your site is live at
   `https://<your-username>.github.io/vizquo/`".

## 3. Your privacy policy URL

GitHub Pages renders `.md` files as HTML, so your policy is at:

```
https://<your-username>.github.io/vizquo/deploy-kit/privacy-policy.md
```

Test it in a browser — if it renders, paste this URL into:

- **Edge Add-ons** → privacy policy field
- **Firefox AMO** → privacy policy field
- **Chrome Web Store** → Privacy tab → Privacy policy URL

## 4. Optional: nice homepage

Add a `README.md` at the repo root (already exists) — the repo homepage
`https://<your-username>.github.io/vizquo/` will render it. You can also link
the screenshots and promo tiles there:

```
https://<your-username>.github.io/vizquo/deploy-kit/screenshots/design-overview.png
https://<your-username>.github.io/vizquo/deploy-kit/promo/promo-440x280.png
```

## 5. Keep it in sync

The policy text mirrors `PRIVACY.md` in the repo. When you update the policy,
commit + push — Pages redeploys automatically and the URL never changes (which
is exactly what the stores want: a stable policy URL).

## Deploy behavior (and the optimized option)

With "Deploy from a branch" (main / root) **every push to main redeploys the
site** — including extension-only changes. That's fine for a small repo, but
the repo also ships an optimized path (`.github/workflows/pages.yml`):

1. Settings → Pages → **Source → GitHub Actions** → Save (one time).
2. The `Pages` workflow takes over from there: it deploys only when
   `landing/`, `deploy-kit/`, `public/`, `README.md`, or `LICENSE` change,
   cancels superseded deploys, and can be triggered manually (Actions →
   **Pages** → Run workflow). Until you flip the source, that workflow's
   deploy step is soft-fail (green) and the branch-based deploy keeps
   serving the site — so switching is risk-free and reversible.

## Alternative hosts (also free)

- **GitHub Gist** — paste `deploy-kit/privacy-policy.md` into a secret gist;
  the raw URL works as a policy link.
- **Vercel / Netlify** — drag the `deploy-kit/` folder in; free static hosting.
- **Cloudflare Pages** — connect the repo, build command `echo skip`, publish
  directory `.`.

Any stable HTTPS URL that serves the policy text is accepted.
