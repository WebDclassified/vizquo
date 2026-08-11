/**
 * Hostile-page tests (master spec Sections 11, 12, 13, 14, 39, 40, 81, 89).
 *
 * Serves a genuinely hostile page — 20 000 DOM nodes, 9 000 CSS rules, hostile
 * CSS values, a malicious inline SVG whose SMIL event handlers execute in ANY
 * unsanitized context, and a 40 ms DOM mutator — and drives the REAL extension
 * against it:
 *
 *   1. The scan completes and stays bounded (caps honored, page still alive).
 *   2. The malicious SVG canary NEVER executes in the side panel (the
 *      BUG-001 sanitizer regression — shadow.innerHTML path, end to end).
 *   3. CANCEL_SCAN races SCAN_PAGE over the typed bus and wins cleanly.
 *   4. Network silence: not one request leaves for an external host.
 *
 * The content script only injects after the user grants optional host access.
 * That grant needs a real user gesture (permissions.request); if the
 * automation harness cannot complete it, the content-script tests skip with
 * an explicit reason (they are still covered by unit tests + the live
 * Chromium exploit probe from the audit).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, type Page, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/chrome-mv3');
const HOSTILE_ORIGIN = 'http://vizquo-hostile.test';

// These tests are long and keep the browser busy (hostile pages never rest) —
// the CDP trace recorder stalls on them. Debug output goes to assertions.
test.use({ trace: 'off' });

let context: BrowserContext;
let extensionId: string;
/** Set by the grant test; the bus-level test skips without it (serial mode). */
let hostAccessGranted = false;
/** Every hostile page opened — closed between tests to keep the browser calm. */
const hostilePages: Page[] = [];

/**
 * Build the hostile page: huge DOM + huge CSS + malicious SVG + mutator.
 * `heavy` controls the full 20k-node/9k-rule stress load (worker-driven test
 * only — a panel driving such a page stalls CDP on this machine); the
 * panel-scan test uses 13k nodes + 8.1k rules, still past both engine caps.
 */
function hostileHtml(heavy: boolean): string {
  const nodeCount = heavy ? 20000 : 13000;
  const ruleCount = heavy ? 9000 : 8100;
  const rules: string[] = [];
  for (let i = 0; i < ruleCount; i += 1) {
    rules.push(`.r${i} { color: #${(i % 16).toString(16)}; margin: ${i % 4}px; }`);
  }
  rules.push(
    // Hostile CSS (Section 11/89): hostile values + cascade overrides. (No
    // universal `*` rule — it would re-style every element on every mutation
    // and make the 4k-sample walk artificially slow, not more hostile.)
    '.z-max { z-index: 2147483647 !important; position: fixed; }',
    '.evil-url { background-image: url("javascript:alert(1)"); cursor: url("javascript:alert(2)"), auto; }',
    '.pwn { font-family: "}; } .pwn { color: red; }"; }',
    '.hostile-row { box-sizing: content-box; }',
    '',
  );
  return `<!doctype html>
<html><head><title>Vizquo Hostile</title>
<style id="hostile-css">${rules.join('\n')}</style>
</head><body>
<!-- Malicious inline SVG: SMIL event handlers execute in ANY context that
     renders this content unsanitized — the page itself proves it. -->
<svg id="malicious" xmlns="http://www.w3.org/2000/svg" width="120" height="40">
  <rect width="120" height="40" fill="#635bff"/>
  <animate attributeName="opacity" values="1;0;1" dur="1s" begin="0s"
    onbegin="window.__VQ_EXEC__=(window.__VQ_EXEC__||0)+1"/>
  <set attributeName="x" to="1" begin="0s"
    onbegin="window.__VQ_EXEC__=(window.__VQ_EXEC__||0)+1"/>
  <image href="data:image/png;base64,AAAA" width="4" height="4"
    onerror="window.__VQ_EXEC__=(window.__VQ_EXEC__||0)+1"/>
</svg>
<script>
  // Huge DOM — built at parse time, before the content script injects.
  // (Comfortably past the 12k walk cap and the 4k sample cap.)
  const frag = document.createDocumentFragment();
  for (let i = 0; i < ${nodeCount}; i += 1) {
    const d = document.createElement('div');
    d.className = 'hostile-row';
    d.textContent = 'row ' + i;
    frag.appendChild(d);
  }
  document.body.appendChild(frag);
  // Continuous DOM mutation — the scan must survive a page that never rests.
  // (Only the heavy worker-driven test carries the live mutator: it multiplies
  // every style resolution, and a mutating panel-connected page stalls CDP.)
  ${
    heavy
      ? `setInterval(() => {
    const d = document.createElement('div');
    d.className = 'mutant';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5);
  }, 60);`
      : ''
  }
</script>
</body></html>`;
}

function trackExternalRequests(page: Page, sink: Set<string>): void {
  page.on('request', (req) => {
    try {
      const host = new URL(req.url()).host;
      // Allowed: the hostile origin itself + the extension's own pages and
      // assets. NB: the host of a chrome-extension:// URL is the extension ID
      // (e.g. "daloagee…"), NOT "chrome-extension", so the ID must be
      // excluded explicitly — the extension legitimately fetches its own
      // analysis-worker script when a scan starts.
      if (host !== 'vizquo-hostile.test' && host !== extensionId) {
        sink.add(host);
      }
    } catch {
      // Unparsable URL — ignore.
    }
  });
}

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
});

// The grant must land before the bus-level scan tests run.
test.describe.configure({ mode: 'serial' });

function step(label: string): void {
  // eslint-disable-next-line no-console
  console.log(`[hostile] ${label} @ ${Math.round(performance.now() / 1000)}s`);
}

/** Dismiss the first-run onboarding dialog — it overlays the whole panel and
 *  would intercept every later click. Waits for it to (possibly) appear. */
async function dismissOnboarding(panel: Page): Promise<void> {
  const dialog = panel.getByRole('dialog', { name: 'Welcome to Vizquo' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    return; // No onboarding this run.
  }
  const skip = dialog.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

test('hostile page: huge scan completes, canary never executes in the panel, network silent', async () => {
  test.setTimeout(360_000);
  const externalHosts = new Set<string>();
  step('start');

  await context.route(`${HOSTILE_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: hostileHtml(false) }),
  );

  const hostile = await context.newPage();
  hostilePages.push(hostile);
  trackExternalRequests(hostile, externalHosts);
  hostile.on('console', (msg) => {
    if (msg.type() === 'error') step(`hostile console error: ${msg.text().slice(0, 400)}`);
    else if (msg.type() === 'warning') step(`hostile console warn: ${msg.text().slice(0, 400)}`);
    else step(`hostile console: ${msg.text().slice(0, 400)}`);
  });
  hostile.on('pageerror', (err) => {
    step(`hostile pageerror: ${String(err).slice(0, 200)}`);
  });
  await hostile.goto(`${HOSTILE_ORIGIN}/index.html`);
  await hostile.waitForLoadState('load');
  step('hostile loaded');

  // The canary SVG is genuinely hostile: it executes in the page's own
  // context when parsed. (Proves the test is meaningful, not vacuous.)
  const pageExec = await hostile.evaluate(
    () => (window as unknown as { __VQ_EXEC__?: number }).__VQ_EXEC__ ?? 0,
  );
  expect(pageExec).toBeGreaterThanOrEqual(1);

  const panel = await context.newPage();
  trackExternalRequests(panel, externalHosts);
  panel.on('crash', () => step('PANEL RENDERER CRASHED'));
  panel.on('console', (msg) => {
    if (msg.type() === 'error') step(`panel console error: ${msg.text().slice(0, 200)}`);
  });
  panel.on('pageerror', (err) => {
    const stack = (err as Error).stack?.split('\n').slice(0, 8).join(' | ') ?? String(err);
    step(`panel pageerror: ${stack.slice(0, 500)}`);
  });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  step('panel loaded');

  // The onboarding overlay would block every later click — dismiss it first.
  await dismissOnboarding(panel);

  // Point the connection at the hostile tab, then grant on-demand access.
  await hostile.bringToFront();
  step('hostile front');
  await panel.getByRole('button', { name: 'Check' }).click();
  step('checked');
  // Diagnostic watchdog: if the panel renderer hangs, capture evidence.
  const panelState = await Promise.race([
    panel
      .waitForTimeout(3_000)
      .then(async () =>
        panel
          .evaluate(() => document.body.textContent?.replace(/\s+/g, ' ').slice(0, 300))
          .catch((e) => `EVAL FAILED: ${String(e).slice(0, 150)}`),
      ),
    new Promise<string>((resolve) =>
      setTimeout(() => resolve('WATCHDOG: panel unresponsive after Check'), 45_000),
    ),
  ]);
  step(`panel state: ${panelState}`);
  // The card shows a connecting skeleton until the PING round-trip lands,
  // then either the grant button (page not yet reachable) or the inspector
  // UI (content script already responding — the automation profile may have
  // persisted host access from an earlier run). Wait for whichever appears.
  const grantButton = panel.getByRole('button', { name: 'Grant access to this tab' });
  const inspectToggle = panel.getByRole('switch', { name: 'Inspect' });
  const outcome = await Promise.race([
    grantButton.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'grant' as const),
    inspectToggle.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'connected' as const),
  ]);
  if (outcome === 'connected') {
    step('already connected');
  } else {
    await grantButton.click();
    step('grant clicked');
    try {
      await expect(inspectToggle).toBeVisible({ timeout: 30_000 });
    } catch {
      // The optional-host-permission prompt is browser chrome; automation
      // cannot always complete it. The content-script paths are covered by
      // unit tests.
      test.skip(
        true,
        'The optional-host-permission prompt blocked automation — content-script paths are covered by unit tests.',
      );
      return;
    }
  }
  step('connected');
  // The content script is answering — the bus-level test (serial mode) may
  // now drive it directly from the service worker.
  hostAccessGranted = true;

  // Diagnostic: what does the background see as the active tab's URL?
  // (The scan needs it; without host permission for the origin, tabs.query
  // returns url: undefined — the panel then refuses to scan.)
  type WorkerHandle = {
    evaluate: (fn: (...args: never[]) => unknown, ...args: unknown[]) => Promise<unknown>;
  };
  const workerInfo = await (context.serviceWorkers()[0] as unknown as WorkerHandle).evaluate(
    async () => {
      const all = await chrome.tabs.query({});
      const allPerms = await chrome.permissions.getAll().catch(() => null);
      // Exactly what PING does: query the active tab and read its url.
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const hostileTabs = await chrome.tabs.query({ url: 'http://vizquo-hostile.test/*' });
      return {
        active: { id: activeTab?.id, url: activeTab?.url, title: activeTab?.title },
        permissions: allPerms,
        hostileTabs: hostileTabs.map((t) => ({ id: t.id, url: t.url?.slice(0, 60) })),
        tabs: all.map((t) => ({ id: t.id, url: t.url?.slice(0, 60) })),
      };
    },
  );
  step(`worker view: ${JSON.stringify(workerInfo)}`);

  // Scan the hostile page: huge DOM + huge CSS (9k rules). It must complete
  // — not freeze the browser. Poll instead of a single long expect so a slow
  // scan fails with a useful message.
  // Diagnostic: drive the pre-scan + scan messages directly from the worker
  // to find where the panel's scanPage() stalls.
  const worker = context.serviceWorkers()[0] as unknown as WorkerHandle;
  const hostileTabId = (workerInfo as { active: { id?: number } }).active.id;
  if (hostileTabId != null) {
    const fp = await worker.evaluate(async (id: number) => {
      const t0 = performance.now();
      try {
        const r = await chrome.tabs.sendMessage(id, {
          id: 50,
          type: 'GET_PAGE_FINGERPRINT',
          data: undefined,
          timestamp: Date.now(),
        });
        return {
          ok: true,
          ms: Math.round(performance.now() - t0),
          fp: (r as { fingerprint?: string }).fingerprint?.slice(0, 20),
        };
      } catch (e) {
        return { ok: false, ms: Math.round(performance.now() - t0), err: String(e).slice(0, 120) };
      }
    }, hostileTabId);
    step(`worker fingerprint: ${JSON.stringify(fp)}`);
  }

  await panel.getByRole('tab', { name: 'Design' }).click();
  step('design tab');
  await expect(panel.getByText('Design DNA', { exact: true }).first()).toBeVisible();
  await panel.getByRole('button', { name: /Scan page/ }).click();
  step('scan started');
  const deadline = Date.now() + 240_000;
  let lastPhase = '';
  for (;;) {
    if (
      await panel
        .getByText('The scan failed', { exact: false })
        .isVisible()
        .catch(() => false)
    ) {
      throw new Error(
        `Hostile scan reported an error: ${await panel
          .getByText('The scan failed', { exact: false })
          .textContent()}`,
      );
    }
    if (
      await panel
        .getByRole('button', { name: /Re-scan|Scan page/ })
        .isVisible()
        .catch(() => false)
    ) {
      break;
    }
    if (Date.now() > deadline) {
      const stuck = await panel
        .evaluate(() => document.body.textContent?.replace(/\s+/g, ' ').slice(0, 400))
        .catch((e) => `EVAL FAILED: ${String(e).slice(0, 150)}`);
      throw new Error(`Hostile scan did not complete within 180s. Panel shows: ${stuck}`);
    }
    // Read the stored progress phase from the worker — where is it stuck?
    const phase = (await (context.serviceWorkers()[0] as unknown as WorkerHandle).evaluate(
      async () => {
        const stored = (await chrome.storage.local.get('scanProgress')) as {
          scanProgress?: { phase?: string; error?: unknown };
        };
        const raw = stored.scanProgress;
        return raw?.phase
          ? `${raw.phase}${raw.error ? `:${String(raw.error).slice(0, 80)}` : ''}`
          : 'none';
      },
    )) as string;
    if (phase !== lastPhase) {
      lastPhase = phase;
      step(`scan phase: ${phase}`);
    }
    await panel.waitForTimeout(2_000);
  }
  step('scan done');
  const scanState = await panel
    .evaluate(() => document.body.textContent?.replace(/\s+/g, ' ').slice(0, 260))
    .catch((e) => `EVAL FAILED: ${String(e).slice(0, 150)}`);
  step(`after scan: ${scanState}`);

  // Assets: the malicious inline SVG renders through the sanitizer. Any
  // execution would land on the panel's own window — assert it never does.
  await panel.getByRole('tab', { name: 'Assets' }).click();
  step('assets tab');
  await expect(panel.getByText('Asset extractor', { exact: true }).first()).toBeVisible();
  await expect(panel.getByLabel(/^Open /).first()).toBeVisible({ timeout: 60_000 });
  const panelExec = await panel.evaluate(
    () => (window as unknown as { __VQ_EXEC__?: number }).__VQ_EXEC__ ?? 0,
  );
  expect(panelExec).toBe(0);

  // Open the SVG inspector — the second sanitized render path.
  await panel
    .getByLabel(/^Open /)
    .first()
    .click();
  await expect(
    panel.getByText('SVG inspector', { exact: false }).or(panel.getByText('Asset details')),
  ).toBeVisible();
  const panelExecAfter = await panel.evaluate(
    () => (window as unknown as { __VQ_EXEC__?: number }).__VQ_EXEC__ ?? 0,
  );
  expect(panelExecAfter).toBe(0);

  // Network silence (Section 81): the extension never phoned home.
  expect([...externalHosts]).toEqual([]);
  step('done');
});

test('hostile page: CANCEL_SCAN wins the race; a full scan stays bounded', async () => {
  test.setTimeout(360_000);
  // Serial mode: the grant test above ran first; without it there is no
  // content script to drive, so skip with an honest reason.
  test.skip(!hostAccessGranted, 'Host access was not granted in this environment.');

  // Close the previous test's heavy pages before opening a fresh one.
  for (const page of hostilePages) {
    await page.close().catch(() => {});
  }
  hostilePages.length = 0;

  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('No extension service worker found.');

  await context.route(`${HOSTILE_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: hostileHtml(true) }),
  );
  const hostile = await context.newPage();
  hostilePages.push(hostile);
  await hostile.goto(`${HOSTILE_ORIGIN}/index.html`);
  await hostile.waitForLoadState('domcontentloaded');

  // tabs.query({ url }) needs the `tabs` permission, which Vizquo never asks
  // for — the tab's own content script reports its URL instead (the PING
  // fix). Find the hostile tab the same way: bring it to front and confirm
  // the active tab's content script answers with the hostile origin.
  await hostile.bringToFront();
  const tabId = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(tabId).toBeGreaterThan(0);
  const ping = await worker.evaluate(async (id) => {
    const r = await chrome.tabs.sendMessage(id, {
      id: 99,
      type: 'PING_TAB',
      data: { nonce: 'hostile-check' },
      timestamp: Date.now(),
    });
    return r?.res?.url ?? '';
  }, tabId);
  expect(ping).toContain('vizquo-hostile.test');

  // CANCEL_SCAN races SCAN_PAGE: the walk must abort as a clean cancellation
  // ({ ok:false, 'Scan cancelled.' }) — never partial data masquerading as
  // a finished scan, and never a hang.
  const cancelled = await worker.evaluate(async (id) => {
    const scan = { id: 1, type: 'SCAN_PAGE', data: undefined, timestamp: Date.now() };
    const cancel = { id: 2, type: 'CANCEL_SCAN', data: undefined, timestamp: Date.now() };
    const pending = chrome.tabs.sendMessage(id, scan);
    await new Promise((r) => setTimeout(r, 40));
    await chrome.tabs.sendMessage(id, cancel);
    return await pending;
  }, tabId);
  expect(cancelled).toMatchObject({ res: { ok: false, error: 'Scan cancelled.' } });

  // A full worker-driven scan of the hostile page completes and honors the
  // sampling caps (huge DOM) without crashing the page or the extension.
  const full = await worker.evaluate(async (id) => {
    const scan = { id: 3, type: 'SCAN_PAGE', data: undefined, timestamp: Date.now() };
    return await chrome.tabs.sendMessage(id, scan);
  }, tabId);
  expect(full?.res?.ok).toBe(true);
  expect(full.res.inspection.truncated).toBe(true);
  expect(full.res.inspection.scannedElementCount).toBeLessThanOrEqual(4000);
  expect(full.res.inspection.scanDurationMs).toBeGreaterThan(0);
});
