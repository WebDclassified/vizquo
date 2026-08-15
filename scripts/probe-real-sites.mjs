/**
 * Real-site QA probe — loads the BUILT extension in real Chrome and drives it
 * against LIVE websites (the content script is declared statically in the
 * manifest, so it injects on any http/https page without a host-permission
 * prompt — this probe is fully deterministic and CI-safe):
 *
 *   per site: connect → toggle inspect + lock a real element → right-click
 *             context target → full page scan → zero console errors
 *
 * Requires network access (GitHub Actions runners have it). A site that
 * blocks automation or times out is reported as FAIL — the probe exits 1.
 *
 * Run: node scripts/probe-real-sites.mjs   (after npm run build)
 *      VQ_PROBE_SITES=example.com,wikipedia node scripts/probe-real-sites.mjs
 */
import {
  collectConsoleErrors,
  getTabId,
  launchProbeContext,
  makeReporter,
  openPanel,
} from './probe-lib.mjs';

/**
 * Stress corpus (master spec §26–27) — tiered, with per-site diagnostics.
 * Sites behind auth walls or bot detection report BLOCKED with the reason
 * (redirect/login title), never a silent pass. VQ_PROBE_SITES selects by
 * comma-separated name, tier (tier1..tier8), `corpus15` (the core regression
 * set), or `all`. Default = the fast reliable set for CI.
 */
const SITES = [
  // Tier 1 — extreme rendering / WebGL
  { tier: 1, name: 'Three.js examples', url: 'https://threejs.org/examples/' },
  {
    tier: 1,
    name: 'Three.js GPGPU water',
    url: 'https://threejs.org/examples/webgl_gpgpu_water.html',
  },
  {
    tier: 1,
    name: 'Three.js compute points',
    url: 'https://threejs.org/examples/webgpu_compute_points.html',
  },
  { tier: 1, name: 'WebGPU stress', url: 'https://webgpustress.com/' },
  { tier: 1, name: 'OJ Amplify lab', url: 'https://ojamplify.com/lab/' },
  // Tier 2 — Awwwards / creative WebGL
  { tier: 2, name: 'Awwwards', url: 'https://www.awwwards.com/' },
  { tier: 2, name: 'Lusion', url: 'https://lusion.co/' },
  { tier: 2, name: 'Active Theory', url: 'https://activetheory.net/' },
  { tier: 2, name: '14islands', url: 'https://14islands.com/' },
  { tier: 2, name: 'Resn', url: 'https://resn.co.nz/' },
  { tier: 2, name: 'Locomotive', url: 'https://locomotive.ca/' },
  // Tier 3 — extremely complex normal websites
  { tier: 3, name: 'Google', url: 'https://www.google.com/' },
  { tier: 3, name: 'YouTube', url: 'https://www.youtube.com/' },
  { tier: 3, name: 'Facebook', url: 'https://www.facebook.com/' },
  { tier: 3, name: 'Instagram', url: 'https://www.instagram.com/' },
  { tier: 3, name: 'Amazon', url: 'https://www.amazon.com/' },
  // Tier 4 — massive e-commerce
  { tier: 4, name: 'eBay', url: 'https://www.ebay.com/' },
  { tier: 4, name: 'Walmart', url: 'https://www.walmart.com/' },
  { tier: 4, name: 'Etsy', url: 'https://www.etsy.com/' },
  { tier: 4, name: 'Nike', url: 'https://www.nike.com/' },
  { tier: 4, name: 'Adidas', url: 'https://www.adidas.com/' },
  { tier: 4, name: 'Apple', url: 'https://www.apple.com/' },
  { tier: 4, name: 'Samsung', url: 'https://www.samsung.com/' },
  // Tier 5 — design-heavy
  { tier: 5, name: 'Apple design', url: 'https://www.apple.com/design/' },
  { tier: 5, name: 'Figma', url: 'https://www.figma.com/' },
  { tier: 5, name: 'Framer', url: 'https://www.framer.com/' },
  { tier: 5, name: 'Webflow', url: 'https://webflow.com/' },
  { tier: 5, name: 'Dribbble', url: 'https://dribbble.com/' },
  { tier: 5, name: 'Behance', url: 'https://www.behance.net/' },
  // Tier 6 — SPA / framework-heavy
  { tier: 6, name: 'React', url: 'https://react.dev/' },
  { tier: 6, name: 'Next.js', url: 'https://nextjs.org/' },
  { tier: 6, name: 'Vue.js', url: 'https://vuejs.org/' },
  { tier: 6, name: 'Nuxt', url: 'https://nuxt.com/' },
  { tier: 6, name: 'Svelte', url: 'https://svelte.dev/' },
  { tier: 6, name: 'Angular', url: 'https://angular.dev/' },
  { tier: 6, name: 'GitHub', url: 'https://github.com/' },
  { tier: 6, name: 'Linear', url: 'https://linear.app/' },
  // Tier 7 — media-heavy
  { tier: 7, name: 'Twitch', url: 'https://www.twitch.tv/' },
  { tier: 7, name: 'Spotify', url: 'https://open.spotify.com/' },
  { tier: 7, name: 'Netflix', url: 'https://www.netflix.com/' },
  { tier: 7, name: 'Vimeo', url: 'https://vimeo.com/' },
  // Tier 8 — developer / technical
  { tier: 8, name: 'GitLab', url: 'https://gitlab.com/' },
  { tier: 8, name: 'Stack Overflow', url: 'https://stackoverflow.com/' },
  { tier: 8, name: 'MDN', url: 'https://developer.mozilla.org/' },
  { tier: 8, name: 'Chrome Developers', url: 'https://developer.chrome.com/' },
  { tier: 8, name: 'Vercel', url: 'https://vercel.com/' },
  { tier: 8, name: 'Cloudflare', url: 'https://www.cloudflare.com/' },
  // Fast reliable set (CI default)
  { tier: 0, name: 'example.com', url: 'https://example.com/' },
  { tier: 0, name: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Design' },
  { tier: 0, name: 'Hacker News', url: 'https://news.ycombinator.com/' },
  {
    tier: 0,
    name: 'WebGL demo',
    url: 'https://threejs.org/examples/webgl_animation_keyframes.html',
  },
  { tier: 0, name: 'WebGPU samples', url: 'https://webgpu.github.io/webgpu-samples/' },
];

/** The core 15-site regression corpus from the test brief. */
const CORE_15 = [
  'Three.js examples',
  'WebGPU stress',
  'OJ Amplify lab',
  'YouTube',
  'Amazon',
  'Facebook',
  'Instagram',
  'GitHub',
  'Figma',
  'Framer',
  'Awwwards',
  'Apple',
  'Nike',
  'Vercel',
  'huge-dom-fixture',
];

const { pass, fail, print } = makeReporter('PROBE (real sites)');

let selected = SITES.filter((s) => s.tier === 0);
const wanted =
  process.env.VQ_PROBE_SITES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
if (wanted.length > 0) {
  if (wanted.includes('all')) {
    selected = SITES;
  } else if (wanted.includes('corpus15')) {
    selected = CORE_15.map((name) => SITES.find((s) => s.name === name)).filter((s) => s != null);
  } else {
    for (const w of wanted) {
      if (/^tier[1-8]$/.test(w)) {
        const n = Number(w.slice(4));
        selected = selected.concat(SITES.filter((s) => s.tier === n));
      } else if (w === 'huge-dom-fixture') {
        selected = selected.concat({ tier: 9, name: 'huge-dom-fixture', url: 'fixture:huge-dom' });
      } else {
        const hit = SITES.find((s) => s.name === w);
        if (hit) selected = selected.concat(hit);
      }
    }
  }
  selected = selected.filter((s, i) => selected.indexOf(s) === i);
  if (selected.length === 0) {
    console.error(
      `VQ_PROBE_SITES matched no known sites (${wanted.join(', ')}). Known: tier1..tier8, corpus15, all, ${SITES.map((s) => s.name).join(', ')}`,
    );
    process.exit(2);
  }
}

const { context, worker, extensionId } = await launchProbeContext();

try {
  const panel = await openPanel(context, extensionId);
  const consoleErrors = collectConsoleErrors(panel, worker);
  pass(`extension loaded (id ${extensionId.slice(0, 8)}…)`);
  pass(`side panel renders; QA targets ${selected.map((s) => s.name).join(', ')}`);

  for (const site of selected) {
    const tag = `[${site.name}]`;
    let page;
    try {
      page = await context.newPage();

      // --- Tier-9 local worst case: the 100k+ DOM hostile fixture, served
      // deterministically (the corpus's own "huge-dom-fixture" member).
      if (site.url === 'fixture:huge-dom') {
        await serveHugeDomFixture(page, context);
        await page.bringToFront();
        await page.waitForTimeout(1200);
      } else {
        // Site scripts are NOT our errors — only panel + worker consoles count.
        await page.goto(site.url, { timeout: 60_000, waitUntil: 'load' });
        await page.bringToFront();
        await page.waitForTimeout(1200);
        // --- Blocked-site diagnostics: auth walls / bot detection redirect
        // the user away from the real content. Report BLOCKED with the
        // reason instead of a misleading PASS/FAIL chain.
        const wall = await detectLoginWall(page, site.url);
        if (wall) {
          const diag = await diagnose(panel, worker);
          fail(`${tag} content script connected — BLOCKED by site (${wall})`, diag);
          await page.close().catch(() => {});
          continue;
        }
      }
      // The previous site's flow left the panel on the Design tab — the
      // connection card (and its Inspect switch) live on the Inspect tab.
      await panel
        .getByRole('tab', { name: 'Inspect' })
        .click()
        .catch(() => {});
      await panel.waitForTimeout(300);

      // --- Connect (no grant needed: static content-script matches).
      const connected = await waitForRealSiteConnection(panel);
      if (!connected) {
        const diag = await diagnose(panel, worker);
        fail(`${tag} content script connected`, diag);
        await page.close().catch(() => {});
        continue;
      }
      pass(`${tag} connected (${site.url})`);

      const tabId = await getTabId(context, 'https://*');

      // --- Inspect mode + lock a real element.
      const locked = await lockRealElement(panel, page, worker, tabId);
      if (locked) pass(`${tag} inspect mode locked a real element`);
      else fail(`${tag} inspect mode locked a real element`);

      // --- Right-click context target (handoff without inspect mode).
      const ctxOk = await contextTargetWorks(worker, page, tabId);
      if (ctxOk) pass(`${tag} right-click context target captured`);
      else fail(`${tag} right-click context target captured`);

      // --- Full page scan (evidence: element count + extracted assets).
      const scanDone = await scanRealSite(panel);
      if (scanDone) {
        const evidence = await worker
          .evaluate(async () => {
            try {
              // The orchestrator publishes the FINAL inspection to
              // scanProgress on phase 'done' — real observed evidence.
              const stored = await chrome.storage.local.get('scanProgress');
              const insp = stored.scanProgress?.inspection;
              if (!insp) return null;
              return `scanned ${insp.scannedElementCount} els, ${(insp.assets ?? []).length} assets, truncated=${insp.truncated}`;
            } catch {
              return null;
            }
          })
          .catch(() => null);
        pass(`${tag} full page scan completed${evidence ? ` (${evidence})` : ''}`);
      } else fail(`${tag} full page scan completed`);

      await page.close().catch(() => {});
    } catch (e) {
      fail(`${tag} flow`, String(e).slice(0, 240));
      await page?.close().catch(() => {});
    }
  }

  if (consoleErrors.length === 0) pass('zero console errors across panel + worker');
  else fail('zero console errors', consoleErrors.join(' | ').slice(0, 600));
} finally {
  await context.close();
}

print();

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

/** Wait for the Inspect switch. Content scripts are declared statically in
 *  the manifest, so they inject on http/https without a host-permission
 *  prompt — the Grant button must NEVER be clicked here (its native prompt
 *  would stall automation for no benefit). Late injection is handled by the
 *  panel's own bounded silent re-checks; this just waits for them. */
/** Auth walls / bot detection: the page redirected away from the target
 *  origin or landed on a login interstitial. Returns the reason or null. */
async function detectLoginWall(page, targetUrl) {
  // Only REAL interstitials count as blocked: a host redirect, a login/bot
  // title, or a password form on a sparse page. Merely having a "Log in"
  // link in the nav (Wikipedia, HN, YouTube's Sign-in button) is NOT a wall.
  try {
    const targetHost = new URL(targetUrl).host;
    await page.waitForTimeout(2500); // let redirects settle
    const state = await page.evaluate(() => {
      const text = document.body?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return {
        href: location.href,
        title: document.title,
        text: text.slice(0, 1200),
        textLen: text.length,
        hasPassword: document.querySelector('input[type="password"]') != null,
      };
    });
    const host = new URL(state.href).host;
    const LOGIN_TITLE =
      /log ?in|sign ?in|verify you'?re human|unusual traffic|enable javascript|access denied|robot check|checking your browser/i;
    if (host !== targetHost && !host.endsWith(targetHost.split('.').slice(-2).join('.'))) {
      return `redirected ${targetHost} → ${host}`;
    }
    if (LOGIN_TITLE.test(state.title)) {
      return `login/bot wall (title: ${state.title.slice(0, 60)})`;
    }
    // A password form on a near-empty page = a real login interstitial
    // (Instagram, Facebook's sparse landing). A password input buried inside
    // a rich page is normal (e.g. an account dropdown) — not a wall.
    if (state.hasPassword && state.textLen < 800) {
      return `login wall (password form, ${state.textLen} chars)`;
    }
    return null;
  } catch {
    return null; // navigation failed earlier — the connect step reports it
  }
}

/** Serve the 100k+ DOM hostile fixture for the corpus's worst-case member. */
async function serveHugeDomFixture(page, context) {
  const html = `<!doctype html><html><head><title>Vizquo 100k fixture</title>
<style>.r { padding: 2px; border-bottom: 1px solid #eee; }</style>
</head><body><script>
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 100000; i += 1) {
    const d = document.createElement('div');
    d.className = 'r';
    d.textContent = 'row ' + i;
    frag.appendChild(d);
  }
  document.body.appendChild(frag);
  window.__NODES__ = document.querySelectorAll('*').length;
</script></body></html>`;
  await context.route('http://vizquo-corpus.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  await page.goto('http://vizquo-corpus.test/huge.html', { timeout: 60_000, waitUntil: 'load' });
}

/** Failure diagnostics: what the card shows and whether the content script
 *  actually answers the bus (used in the FAIL detail for CI debugging). */
async function diagnose(panel, worker) {
  const cardText = await panel
    .evaluate(() => document.body.textContent?.replace(/\s+/g, ' ').slice(0, 220) ?? '')
    .catch(() => 'panel text unavailable');
  const workerView = await worker
    .evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id == null) return 'no active tab';
      try {
        const r = await chrome.tabs.sendMessage(tab.id, {
          id: 77,
          type: 'PING_TAB',
          data: { nonce: 1 },
          timestamp: Date.now(),
        });
        return `ping OK → ${r?.res?.url ?? '?'}`;
      } catch (e) {
        return `ping ERR ${String(e).slice(0, 90)} (active ${tab.id} ${tab.url ?? ''})`;
      }
    })
    .catch(() => 'worker evaluate failed');
  return `card: ${cardText.slice(0, 140)} | worker: ${workerView}`;
}

async function waitForRealSiteConnection(panel, timeoutMs = 60_000) {
  const toggle = panel.getByRole('switch', { name: 'Inspect' });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await toggle.isVisible().catch(() => false)) return true;
    await panel.waitForTimeout(800);
  }
  return false;
}

/** Toggle inspect mode on and click the page's primary heading to lock it.
 *  Uses the toolbar switch (exact name — the connection card has a second
 *  "Inspect mode" switch) and verifies through the bus, force-enabling via
 *  SET_INSPECT_MODE if the panel UI ever disagrees with the content script. */
async function lockRealElement(panel, page, worker, tabId) {
  try {
    const toggle = panel.getByRole('switch', { name: 'Inspect', exact: true });
    const checked = await toggle.isChecked().catch(() => false);
    if (!checked) await toggle.click();
    await panel.waitForTimeout(500);
    if (!(await isEnabled(worker, tabId))) {
      await worker.evaluate(async (id) => {
        await chrome.tabs.sendMessage(id, {
          id: 907,
          type: 'SET_INSPECT_MODE',
          data: { enabled: true },
          timestamp: Date.now(),
        });
      }, tabId);
      await panel.waitForTimeout(400);
    }
    const box = await pickClickTarget(page);
    if (box) {
      const pt = await findNonInteractivePoint(page, box);
      if (pt) {
        await page.mouse.click(pt[0], pt[1]);
        await panel.waitForTimeout(1800);
        if (await isLocked(worker, tabId)) return true;
      }
    }
    // The first click may have hit a non-inspectable ancestor — try a plain
    // <p>/<div>/<section>/<td> as a fallback before giving up.
    const alt = await pickClickTarget(page, ['p', 'div', 'section', 'td', 'tr', 'li']);
    if (!alt) return false;
    const pt = await findNonInteractivePoint(page, alt);
    if (!pt) return false;
    await page.mouse.click(pt[0], pt[1]);
    await panel.waitForTimeout(1500);
    return await isLocked(worker, tabId);
  } catch {
    return false;
  }
}

/** A point inside the box whose topmost element is not interactive — clicking
 *  a link/button would both lock AND navigate the page (links navigate in
 *  inspect mode), losing the probe mid-flight. Samples a small grid; null if
 *  every sampled point sits on an interactive element. */
async function findNonInteractivePoint(page, box) {
  const interactive = new Set(['a', 'button', 'input', 'select', 'textarea']);
  for (let i = 1; i <= 5; i += 1) {
    for (let j = 1; j <= 3; j += 1) {
      const x = box.x + (box.width * i) / 6;
      const y = box.y + (box.height * j) / 4;
      const tag = await page
        .evaluate(
          ([px, py]) => {
            const el = document.elementFromPoint(px, py);
            return el?.tagName?.toLowerCase() ?? '';
          },
          [x, y],
        )
        .catch(() => '');
      if (!interactive.has(tag)) return [x, y];
    }
  }
  return null;
}

/** First element with a real on-screen box — layout-agnostic (Hacker News
 *  has no h1/main/article; tables carry its content). Avoids links/buttons
 *  so a click never navigates the page away mid-probe. */
async function pickClickTarget(page, selectors) {
  const candidates = selectors ?? [
    'h1',
    'h2',
    'h3',
    'main',
    'article',
    '[role="main"]',
    'p',
    'section',
    'li',
    'td',
    'tr',
    'div',
    'span',
  ];
  for (const sel of candidates) {
    const box = await page
      .locator(sel)
      .first()
      .boundingBox({ timeout: 2000 })
      .catch(() => null);
    if (box && box.width * box.height > 800 && box.x >= 0 && box.y >= 0) return box;
  }
  return null;
}

/** Is inspect mode actually on in the content script (bus-level truth)? */
async function isEnabled(worker, tabId) {
  return worker
    .evaluate(async (id) => {
      try {
        const r = await chrome.tabs.sendMessage(id, {
          id: 908,
          type: 'GET_INSPECT_STATE',
          data: undefined,
          timestamp: Date.now(),
        });
        return r?.res?.enabled === true;
      } catch {
        return false;
      }
    }, tabId)
    .catch(() => false);
}

/** Confirm through the bus that the content script reports a locked ref. */
async function isLocked(worker, tabId) {
  return worker
    .evaluate(async (id) => {
      try {
        const r = await chrome.tabs.sendMessage(id, {
          id: 906,
          type: 'GET_INSPECT_STATE',
          data: undefined,
          timestamp: Date.now(),
        });
        return Boolean(r?.res?.enabled && r?.res?.locked);
      } catch {
        return false;
      }
    }, tabId)
    .catch(() => false);
}

/** Right-click the page and confirm GET_CONTEXT_TARGET returns a ref. */
async function contextTargetWorks(worker, page, tabId) {
  try {
    await page.bringToFront();
    const box = await pickClickTarget(page);
    if (!box) return false;
    await page.mouse.click(box.x + 20, box.y + 20, { button: 'right' });
    await new Promise((r) => setTimeout(r, 500));
    const result = await worker.evaluate(async (id) => {
      try {
        const r = await chrome.tabs.sendMessage(id, {
          id: 905,
          type: 'GET_CONTEXT_TARGET',
          data: undefined,
          timestamp: Date.now(),
        });
        return Boolean(r?.res?.ref);
      } catch {
        return false;
      }
    }, tabId);
    return result;
  } catch {
    return false;
  }
}

/** Click Scan page and poll for the Re-scan state (same pattern as the E2E). */
async function scanRealSite(panel) {
  try {
    await panel.getByRole('tab', { name: 'Design' }).click();
    await panel.waitForTimeout(500);
    await panel.getByRole('button', { name: /Scan page/ }).click();
    for (let i = 0; i < 180; i += 1) {
      await panel.waitForTimeout(1000);
      if (
        await panel
          .getByRole('button', { name: /Re-scan|Scan page/ })
          .isVisible()
          .catch(() => false)
      ) {
        return true;
      }
      if (
        await panel
          .getByText('The scan failed', { exact: false })
          .isVisible()
          .catch(() => false)
      ) {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}
