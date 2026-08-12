/**
 * Screenshot capture flow E2E (Section 7.20).
 *
 * The capture studio needs `activeTab` or host access for the active tab.
 * Granting it requires the native permission prompt, which automation cannot
 * always complete — so this spec has two tests, run in serial:
 *
 *   1. WITHOUT access: the studio must show the designed, honest error (no
 *      image, no crash) — fully deterministic.
 *   2. WITH access (grant prompt auto-accepted): the capture renders — skipped
 *      honestly when the environment cannot complete the native prompt (same
 *      pattern as the hostile-page spec).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/chrome-mv3');
const ORIGIN = 'http://vizquo-capture.test';

const PAGE_HTML = `<!doctype html>
<html><head><title>Capture probe</title><style>
  body { margin: 0; font-family: system-ui; background: #f4f5f7; }
  .hero { background: #635bff; color: white; padding: 40px; }
  .card { background: white; padding: 24px; margin: 16px; border-radius: 12px; }
</style></head><body>
  <div class="hero"><h1>Capture probe</h1></div>
  <div class="card"><p>Something to photograph.</p></div>
  <div class="card"><p>More content down here.</p></div>
</body></html>`;

let context: BrowserContext;
let extensionId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  await context.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PAGE_HTML }),
  );
});

test.afterAll(async () => {
  await context.close();
});

async function dismissOnboarding(panel: import('@playwright/test').Page): Promise<void> {
  const dialog = panel.getByRole('dialog', { name: 'Welcome to Vizquo' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    return;
  }
  const skip = dialog.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

/** Open the panel + probe page; wait for the content script to connect. */
async function openConnected(panel: import('@playwright/test').Page) {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForLoadState('load');
  await page.bringToFront();
  const toggle = panel.getByRole('switch', { name: 'Inspect', exact: true });
  await expect(toggle).toBeVisible({ timeout: 45_000 });
  return page;
}

test('capture without site access shows the designed error — no image, no crash', async () => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await dismissOnboarding(panel);
  await openConnected(panel);

  await panel.getByRole('tab', { name: 'Create' }).click();
  await panel.getByRole('button', { name: 'Capture', exact: true }).click();

  // The studio must report the honest failure…
  await expect(panel.getByText('Capture failed', { exact: true })).toBeVisible();
  await expect(panel.getByText(/Grant site access|not granted|refused/i).first()).toBeVisible();
  // …and never a broken image or a crash.
  await expect(panel.locator('img[src^="data:image"]')).toHaveCount(0);
});

test('capture renders once host access is granted (skips when the prompt blocks automation)', async () => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await dismissOnboarding(panel);

  // The probe page starts loading while the panel is still on its mount
  // check — the content script injects at document_idle, so the card shows
  // "Grant access" in that window. That click is the ONLY way automation can
  // obtain real host permission (connected ≠ host access here).
  const probePage = await context.newPage();
  await probePage.goto(`${ORIGIN}/index.html`);
  await probePage.waitForLoadState('load');
  await probePage.bringToFront();

  const grantButton = panel.getByRole('button', { name: 'Grant access to this tab' });
  let granted = false;
  if (await grantButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await grantButton.click();
    try {
      await expect(panel.getByRole('switch', { name: 'Inspect', exact: true })).toBeVisible({
        timeout: 45_000,
      });
    } catch {
      test.skip(
        true,
        'The optional-host-permission prompt blocked automation — capture success is covered by unit tests + the live probe.',
      );
      return;
    }
    // The toggle can appear via auto-injected content scripts WITHOUT host
    // access — verify the permission actually landed before capturing.
    granted = await context
      .serviceWorkers()[0]!
      .evaluate(async () =>
        chrome.permissions.contains({ origins: ['http://vizquo-capture.test/*'] }),
      );
    if (!granted) {
      test.skip(true, 'Host access was not granted in this environment.');
      return;
    }
  } else {
    test.skip(true, 'No grant window appeared — host access cannot be obtained here.');
    return;
  }

  // Web page stays the ACTIVE tab; CDP input reaches the inactive panel tab,
  // so captureVisibleTab photographs the page, not the panel.
  await probePage.bringToFront();
  await panel.getByRole('tab', { name: 'Create' }).click();
  await panel.getByRole('button', { name: 'Capture', exact: true }).click();

  await expect(panel.locator('img[src^="data:image"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel.getByText('Capture failed', { exact: true })).toHaveCount(0);
});
