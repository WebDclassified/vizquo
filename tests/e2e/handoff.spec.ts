/**
 * Context-menu handoff E2E ("Inspect with Vizquo", Section 7.26).
 *
 * The native context menu cannot be clicked by automation (it is browser
 * chrome), so these tests drive the handoff's OBSERVABLE contract instead:
 * the background stores the pending selection in storage and the panel
 * consumes it — select + flash the element on the page, switch to the
 * inspector, and toast the result (or warn when the element is gone).
 * The flash lives in the overlay's shadow root, which Playwright's CSS
 * engine pierces automatically.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/chrome-mv3');
const ORIGIN = 'http://vizquo-handoff.test';

const PAGE_HTML = `<!doctype html>
<html><head><title>Handoff probe</title><style>
  body { margin: 0; font-family: system-ui; }
  .hero { background: #635bff; color: white; padding: 32px; }
  .card { border: 1px solid #ddd; padding: 16px; margin: 16px; }
</style></head><body>
  <div class="hero"><h1>Handoff probe</h1></div>
  <div class="card"><p>Some content.</p></div>
</body></html>`;

let context: BrowserContext;
let extensionId: string;

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

/** Dismiss the first-run onboarding dialog if it appears. */
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

/** Open the side panel + the probe page, and wait until the content script
 *  connects (static content-script matches inject without a host grant; the
 *  panel's bounded silent re-checks absorb the document_idle race). */
async function connectProbePage(panel: import('@playwright/test').Page) {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForLoadState('load');
  await page.bringToFront();

  const toggle = panel.getByRole('switch', { name: 'Inspect', exact: true });
  await expect(toggle).toBeVisible({ timeout: 45_000 });
  return page;
}

/** The background-side handoff: store a pending selection for the tab. */
async function storeHandoff(ref: { selector: string; xpath: string; domPath: number[] } | null) {
  const worker = context.serviceWorkers()[0];
  await worker!.evaluate(
    async ({ ref }) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.storage.local.set({
        'vizquo:pending-selection': { ref, tabId: tab?.id },
      });
    },
    { ref },
  );
}

// documentElement.children = [head, body] → .hero is body's first child.
const HERO_REF = {
  selector: '.hero',
  xpath: '/html/body/div[1]',
  domPath: [1, 0],
};

test('handoff selects the right-clicked element, flashes it on the page, and toasts', async () => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await dismissOnboarding(panel);
  const probePage = await connectProbePage(panel);

  // The background writes the pending selection (exactly what the context-menu
  // click handler does) — the panel must consume it.
  await storeHandoff(HERO_REF);

  // The panel switches to the inspector and confirms with a toast.
  await expect(
    panel.getByText('Element selected from the context menu', { exact: true }),
  ).toBeVisible();

  // The element is actually locked in the content script.
  const worker = context.serviceWorkers()[0];
  const state = await worker!.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const r = await chrome.tabs.sendMessage(tab!.id!, {
      id: 80,
      type: 'GET_INSPECT_STATE',
      data: undefined,
      timestamp: Date.now(),
    });
    return r?.res ?? {};
  });
  expect(state.enabled).toBe(true);
  // The content script generates its own selector (tag.class — no id here).
  expect(state.locked?.selector).toBe('div.hero');

  // The flash pulses on the page (shadow-root overlay — auto-clears).
  const flash = probePage.locator('.vq-flash');
  await expect(flash).toBeVisible({ timeout: 5000 });
  await expect(flash).toBeHidden({ timeout: 6000 });
  await expect(probePage.locator('.vq-flash-chip')).toHaveText('Inspect with Vizquo');
});

test('handoff with a vanished element warns instead of silently doing nothing', async () => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await dismissOnboarding(panel);
  await connectProbePage(panel);

  // The right-clicked element is gone (SPA navigation) → ref is null.
  await storeHandoff(null);

  await expect(
    panel.getByText('The element you right-clicked is gone', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/click any element to select it/)).toBeVisible();
});
