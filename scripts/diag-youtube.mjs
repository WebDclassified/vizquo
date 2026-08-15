/**
 * YouTube realistic-flow diagnostic — panel opens first, YouTube becomes the
 * active tab (as in real usage), then: connection state, inspect + lock,
 * overlay presence, and a TIMED full page scan (the heavy op on big sites).
 *
 * Run: node scripts/diag-youtube.mjs   (after npm run build)
 */
import { chromium } from '@playwright/test';
import { EXTENSION_PATH, openPanel } from './probe-lib.mjs';

const SITE = process.env.VQ_DIAG_URL ?? 'https://www.youtube.com/';

const args = [
  `--disable-extensions-except=${EXTENSION_PATH}`,
  `--load-extension=${EXTENSION_PATH}`,
];
if (process.env.CI) args.push('--no-sandbox', '--disable-dev-shm-usage');

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: false,
  args,
});
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker');
const extensionId = new URL(worker.url()).host;

try {
  const panel = await openPanel(context, extensionId);
  const page = context.newPage();
  const pageErrors = [];
  page.then((p) => {
    p.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(`[page] ${msg.text().slice(0, 180)}`);
    });
    p.on('pageerror', (err) => pageErrors.push(`[pageerror] ${String(err).slice(0, 180)}`));
  });

  const youTubePage = await page;
  await youTubePage.goto(SITE, { timeout: 60_000, waitUntil: 'load' }).catch((e) => {
    console.log(`goto error: ${String(e).slice(0, 200)}`);
  });
  await youTubePage.waitForTimeout(3000);
  await youTubePage.bringToFront(); // make YouTube the active tab, as a real user would
  await panel.waitForTimeout(5000); // panel's tabs.onActivated → connection check

  const card = await panel
    .evaluate(() => document.body.textContent?.replace(/\s+/g, ' ').slice(0, 400) ?? '')
    .catch(() => '?');
  console.log(`\n=== PANEL CARD after YouTube active ===\n${card}\n`);

  const tabId = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? null;
  });
  console.log(`active tab: ${tabId} (${youTubePage.url()})`);

  const bus = (_id, type, data) =>
    worker.evaluate(
      async ([tabId, type, data]) => {
        try {
          const r = await chrome.tabs.sendMessage(tabId, {
            id: Math.floor(Math.random() * 1e6),
            type,
            data,
            timestamp: Date.now(),
          });
          return { ok: true, res: r?.res ?? null };
        } catch (e) {
          return { ok: false, err: String(e).slice(0, 200) };
        }
      },
      [tabId, type, data],
    );

  // Inspect + lock.
  await bus(tabId, 'SET_INSPECT_MODE', { enabled: true });
  await youTubePage.bringToFront();
  await youTubePage.mouse.click(500, 400);
  await panel.waitForTimeout(1200);
  const state = await bus(tabId, 'GET_INSPECT_STATE', undefined);
  console.log(`\n=== locked ===\n${JSON.stringify(state.res ?? state, null, 2)}`);

  // Overlay host present on the page?
  const overlay = await youTubePage.evaluate(() => {
    const host = Array.from(document.documentElement.children).find(
      (el) => el instanceof HTMLElement && el.style.zIndex === '2147483646',
    );
    return host ? { found: true, shadow: host.shadowRoot != null } : { found: false };
  });
  console.log(`\n=== overlay host ===\n${JSON.stringify(overlay)}`);

  // TIMED full scan.
  console.log(`\n=== SCAN (timed) ===`);
  const t0 = Date.now();
  const scan = await bus(tabId, 'SCAN_PAGE', undefined);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (scan.ok) {
    const r = scan.res;
    console.log(
      `ok=${r?.ok} elapsed=${elapsed}s scannedElements=${r?.inspection?.scannedElementCount} truncated=${r?.inspection?.truncated} durationMs=${r?.inspection?.scanDurationMs}`,
    );
    if (r?.ok === false) console.log(`scan error: ${r?.error}`);
  } else {
    console.log(`bus error after ${elapsed}s: ${JSON.stringify(scan).slice(0, 300)}`);
  }

  // Panel console errors too.
  const panelErrors = [];
  panel.on('console', (msg) => {
    if (msg.type() === 'error') panelErrors.push(`[panel] ${msg.text().slice(0, 180)}`);
  });
  await panel.waitForTimeout(2000);
  console.log(`\n=== PANEL CONSOLE ERRORS (${panelErrors.length}) ===`);
  for (const e of panelErrors.slice(0, 10)) console.log(e);
  console.log(`\n=== PAGE CONSOLE ERRORS (${pageErrors.length}) ===`);
  for (const e of pageErrors.slice(0, 10)) console.log(e);
} finally {
  await context.close();
}
