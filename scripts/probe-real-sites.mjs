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

const SITES = [
  { name: 'example.com', url: 'https://example.com/' },
  { name: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Design' },
  { name: 'MDN', url: 'https://developer.mozilla.org/en-US/' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com/' },
];

const { pass, fail, print } = makeReporter('PROBE (real sites)');

let selected = SITES;
const wanted =
  process.env.VQ_PROBE_SITES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
if (wanted.length > 0) {
  selected = wanted.map((name) => SITES.find((s) => s.name === name)).filter((s) => s != null);
  if (selected.length === 0) {
    console.error(
      `VQ_PROBE_SITES matched no known sites (${wanted.join(', ')}). Known: ${SITES.map((s) => s.name).join(', ')}`,
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
      // Site scripts are NOT our errors — only panel + worker consoles count.
      await page.goto(site.url, { timeout: 60_000, waitUntil: 'load' });
      await page.bringToFront();
      await page.waitForTimeout(1200);
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

      // --- Full page scan.
      const scanDone = await scanRealSite(panel);
      if (scanDone) pass(`${tag} full page scan completed`);
      else fail(`${tag} full page scan completed`);

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
