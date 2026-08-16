/**
 * Shared harness for the live probes (scripts/probe-*.mjs). Each probe loads
 * the BUILT extension (.output/chrome-mv3) in real Chrome and drives real
 * user flows; this module owns the pieces they all share: launching the
 * browser, opening the side panel, dismissing the first-run onboarding,
 * waiting for the connection card to settle, collecting console errors, and
 * the pass/fail/skip reporter.
 *
 * Run after `npm run build`. CI-safe: adds --no-sandbox under GitHub Actions
 * (xvfb + root-less Chromium), and grant-dependent checks report SKIP — never
 * product failures — because the optional-host-permission prompt is native
 * browser chrome that automation cannot always complete.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export const EXTENSION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.output/chrome-mv3',
);

/** Launch Chrome with the built extension loaded. */
export async function launchProbeContext(profileDir = '') {
  const args = [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
  ];
  // GitHub Actions runners run headed under xvfb; Chromium needs --no-sandbox
  // there (and --disable-dev-shm-usage for the small /dev/shm on runners).
  if (process.env.CI) args.push('--no-sandbox', '--disable-dev-shm-usage');

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless: false,
    args,
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  return { context, worker, extensionId };
}

/** Attach console/pageerror capture to the panel page and the worker. */
export function collectConsoleErrors(page, worker) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[panel] ${msg.text().slice(0, 300)}`);
  });
  page.on('pageerror', (err) => errors.push(`[panel pageerror] ${String(err).slice(0, 300)}`));
  worker.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[worker] ${msg.text().slice(0, 300)}`);
  });
  worker.on('pageerror', (err) => errors.push(`[worker pageerror] ${String(err).slice(0, 300)}`));
  return errors;
}

/** Open the side panel page and dismiss the first-run onboarding dialog. */
export async function openPanel(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.waitForSelector('text=Vizquo', { timeout: 15_000 });
  await dismissOnboarding(page);
  return page;
}

/** Dismiss the first-run onboarding dialog if it appears (same pattern as
 *  the E2E suite — the overlay intercepts every later click otherwise). */
export async function dismissOnboarding(page) {
  const dialog = page.getByRole('dialog', { name: 'Welcome to Vizquo' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    return; // No onboarding this run.
  }
  const skip = dialog.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

/**
 * Wait for the connection card to settle into one of its two terminal
 * states: connected (Inspect switch) or needs-grant (Grant button). When the
 * grant button shows, click it; the native prompt is accepted by
 * --enable-automation on most runs but not always — a blocked prompt reports
 * `connected: false` with reason 'grant-blocked', never a throw.
 */
export async function waitForConnection(panel, opts = {}) {
  const grantButton = panel.getByRole('button', { name: 'Grant access to this tab' });
  const inspectToggle = panel.getByRole('switch', { name: 'Inspect' });
  const outcome = await Promise.race([
    grantButton.waitFor({ state: 'visible', timeout: opts.timeout ?? 25_000 }).then(() => 'grant'),
    inspectToggle
      .waitFor({ state: 'visible', timeout: opts.timeout ?? 25_000 })
      .then(() => 'connected'),
  ]);
  if (outcome === 'connected') return { connected: true, via: 'existing' };
  await grantButton.click();
  try {
    await inspectToggle.waitFor({ state: 'visible', timeout: opts.grantTimeout ?? 45_000 });
    return { connected: true, via: 'grant' };
  } catch {
    return { connected: false, via: 'grant-blocked' };
  }
}

/** Resolve a tab id by origin from the worker (tabs.query needs no
 *  permission to return ids; the content script reports the URL instead). */
export async function getTabId(context, origin) {
  const worker = context.serviceWorkers()[0];
  if (!worker) return -1;
  return worker
    .evaluate(async (o) => {
      const tabs = await chrome.tabs.query({ url: `${o}/*` });
      if (tabs.length > 0) return tabs[0]?.id ?? -1;
      const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return active?.id ?? -1;
    }, origin)
    .catch(() => -1);
}

/** Pass/fail/skip/blocked reporter with a CI-friendly exit code.
 *
 * FAIL lines fail the run. BLOCK lines are recorded visibly but do NOT fail
 * the run — they describe an environment artifact (e.g. a site blocking a
 * datacenter IP, or a network path unavailable to the CI runner), never a
 * product regression. Callers enable blocked() explicitly (e.g. under
 * VQ_PROBE_CI) so local runs stay strict. */
export function makeReporter(name) {
  const results = [];
  const fail = (label, detail) => results.push(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  const pass = (label) => results.push(`PASS  ${label}`);
  const skip = (label, reason = '') =>
    results.push(`SKIP  ${label}${reason ? ` — ${reason}` : ''}`);
  const blocked = (label, reason = '') =>
    results.push(`BLOCK  ${label}${reason ? ` — ${reason}` : ''}`);
  const print = () => {
    console.log(`\n==== ${name} ====`);
    for (const line of results) console.log(line);
    const failures = results.filter((r) => r.startsWith('FAIL'));
    const blockedCount = results.filter((r) => r.startsWith('BLOCK')).length;
    const passed = results.length - failures.length;
    console.log(
      `\n${passed}/${results.length} checks passed` +
        (blockedCount > 0
          ? ` · ${blockedCount} BLOCKED by environment (reported, not failures)`
          : ''),
    );
    process.exit(failures.length === 0 ? 0 : 1);
  };
  return { results, fail, pass, skip, blocked, print };
}
