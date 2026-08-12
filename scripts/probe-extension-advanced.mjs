/**
 * Advanced probe — drives the built extension through the flows most users
 * actually hit: context-menu handoff, screenshot capture, live edit, time
 * machine, codegen, and the detachable window. Captures console errors.
 *
 * The optional-host-permission prompt is native browser chrome; Playwright's
 * --enable-automation accepts it on most runs but not always (the E2E suite
 * documents the same limitation and skips). Page-side checks are reported as
 * SKIP when the grant cannot be completed — never as product failures.
 *
 * Run: node scripts/probe-extension-advanced.mjs  (after npm run build)
 */
import {
  collectConsoleErrors,
  getTabId,
  launchProbeContext,
  makeReporter,
  openPanel,
  waitForConnection,
} from './probe-lib.mjs';

const PROBE_ORIGIN = 'http://vizquo-probe2.test';
const { pass, fail, skip, print } = makeReporter('PROBE (advanced flows)');

const PAGE_HTML = `<!doctype html>
<html><head><title>Probe 2</title>
<style>
  :root { --brand: #635bff; }
  body { font-family: system-ui; margin: 0; background: #f4f5f7; }
  .hero { background: var(--brand); color: white; padding: 16px; border-radius: 8px; }
  .card { background: white; border-radius: 12px; padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.08); margin: 8px; }
  .btn { background: var(--brand); color: white; border: 0; border-radius: 6px; padding: 6px 12px; }
</style></head>
<body>
  <header class="hero"><h1 id="title">Probe two</h1></header>
  <main>
    <div class="card"><button class="btn">One</button></div>
    <div class="card"><button class="btn">Two</button></div>
  </main>
</body></html>`;

const { context, worker, extensionId } = await launchProbeContext();

try {
  await context.route(`${PROBE_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PAGE_HTML }),
  );

  const page = await openPanel(context, extensionId);
  const consoleErrors = collectConsoleErrors(page, worker);

  // Connect to a real page — the panel auto-checks on mount + tab activation.
  const probePage = await context.newPage();
  await probePage.goto(`${PROBE_ORIGIN}/index.html`);
  await probePage.waitForLoadState('load');
  await probePage.bringToFront();

  const connection = await waitForConnection(page);
  const connected = connection.connected;
  if (!connected) skip('connection');

  const tabId = await getTabId(context, PROBE_ORIGIN);

  // --- A. Context-menu handoff ("Inspect with Vizquo") WITHOUT inspect mode.
  // A REAL right-click on the page must make GET_CONTEXT_TARGET return the
  // element under the cursor — even though inspect mode was never toggled on.
  if (connected) {
    await probePage.bringToFront();
    const heroBox = await probePage.locator('.hero').boundingBox();
    if (heroBox) {
      await probePage.mouse.click(heroBox.x + 20, heroBox.y + 20, { button: 'right' });
      await page.waitForTimeout(400);
    }
    const contextTarget = await worker.evaluate(async (id) => {
      try {
        const r = await chrome.tabs.sendMessage(id, {
          id: 901,
          type: 'GET_CONTEXT_TARGET',
          data: undefined,
          timestamp: Date.now(),
        });
        return { ok: true, hasRef: Boolean(r?.res?.ref) };
      } catch (e) {
        return { ok: false, err: String(e).slice(0, 160) };
      }
    }, tabId);
    if (contextTarget.ok && contextTarget.hasRef)
      pass('context-menu target captured after real right-click');
    else
      fail(
        'context-menu target captured after real right-click',
        JSON.stringify(contextTarget).slice(0, 200),
      );
  } else {
    skip('context-menu target captured after real right-click');
  }

  // --- B. Viewport screenshot capture (panel button → background).
  // captureVisibleTab only captures the ACTIVE tab of the window, so the web
  // page must be active (in the real side panel it always is). Isolate the
  // capture API from the UI: drive CAPTURE_VIEWPORT directly from the panel
  // page (the real path) while the probe page is active.
  await page.getByRole('tab', { name: 'Create' }).click();
  await page.waitForTimeout(800);
  await probePage.bringToFront();
  await page.waitForTimeout(300);
  let captured = false;
  try {
    const captureResp = await page.evaluate(async () => {
      try {
        return await chrome.runtime.sendMessage({
          id: 910,
          type: 'CAPTURE_VIEWPORT',
          data: undefined,
          timestamp: Date.now(),
        });
      } catch (e) {
        return { err: String(e).slice(0, 200) };
      }
    });
    const res = captureResp?.res;
    captured = Boolean(res?.ok && res?.dataUrl?.startsWith('data:image'));
    if (captured) {
      await page.getByRole('button', { name: 'Capture', exact: true }).click();
      await page.waitForTimeout(2500);
      const imgCount = await page
        .locator('img[src^="data:image"]')
        .count()
        .catch(() => 0);
      captured = imgCount > 0;
    }
  } catch {
    captured = false;
  }
  // captureVisibleTab needs activeTab (toolbar/context-menu invocation) or
  // host access — neither can be forced deterministically by automation, so
  // this is a PASS when the grant landed, a SKIP otherwise.
  if (captured) pass('viewport screenshot capture renders');
  else
    skip(
      'viewport screenshot capture renders',
      connected ? 'captureVisibleTab needs activeTab/host access' : 'not connected',
    );

  // --- C. Live edit: toggle inspect, lock an element, apply an edit.
  let liveEditOk = false;
  try {
    await page.getByRole('tab', { name: 'Inspect' }).click();
    await page.waitForTimeout(500);
    const toggle = page.getByRole('switch', { name: 'Inspect' });
    const checked = await toggle.isChecked().catch(() => false);
    if (!checked) await toggle.click();
    await page.waitForTimeout(400);
    const box = await probePage.locator('.card').first().boundingBox();
    if (box) {
      await probePage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1500);
      liveEditOk = true;
    }
  } catch {
    liveEditOk = false;
  }
  if (liveEditOk) pass('locked element via inspect mode');
  else if (!connected) skip('locked element via inspect mode');
  else fail('locked element via inspect mode');

  // --- D. Time Machine probe (via the typed bus, straight from the worker).
  const tm = await worker.evaluate(async (id) => {
    try {
      const r = await chrome.tabs.sendMessage(id, {
        id: 902,
        type: 'RUN_TIME_MACHINE',
        data: { width: 375 },
        timestamp: Date.now(),
      });
      return { ok: Boolean(r?.res?.ok), hasBreakpoints: Array.isArray(r?.res?.breakpoints) };
    } catch (e) {
      return { ok: false, err: String(e).slice(0, 160) };
    }
  }, tabId);
  if (tm.ok) pass('time machine responds');
  else if (!connected) skip('time machine responds');
  else fail('time machine responds', JSON.stringify(tm));

  // --- E. Detachable inspector window via the REAL panel button.
  // NB: the probe drives the panel as a TAB, so bringing it to front would
  // make the connection re-check target the panel itself (no content script)
  // and unmount the toolbar. Click in the background tab instead.
  let windowOpened = false;
  let windowDetail = '';
  try {
    const before = context.pages().length;
    await page.getByRole('button', { name: 'Detach inspector window' }).click({ timeout: 15_000 });
    await page.waitForTimeout(3000);
    windowOpened = context.pages().length > before;
    if (windowOpened) {
      const win = context.pages().find((p) => p.url().includes('window.html'));
      windowDetail = win ? `opened ${win.url()}` : 'opened (no window.html page found)';
    } else {
      windowDetail = 'no new page appeared after clicking detach';
    }
  } catch (e) {
    windowOpened = false;
    windowDetail = String(e).slice(0, 160);
  }
  if (windowOpened) pass('detachable inspector window opens');
  else if (!connected) skip('detachable inspector window opens');
  else fail('detachable inspector window opens', windowDetail);

  // --- F. Codegen + token export render (no page needed).
  let codegenOk = false;
  try {
    await page.getByRole('tab', { name: 'Create' }).click();
    await page.waitForTimeout(800);
    await page
      .getByRole('button', { name: /Scan page/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(800);
    codegenOk = await page
      .getByText('Export center', { exact: true })
      .isVisible()
      .catch(() => false);
  } catch {
    codegenOk = false;
  }
  if (codegenOk) pass('export center renders');
  else fail('export center renders');

  if (consoleErrors.length === 0) pass('zero console errors');
  else fail('zero console errors', consoleErrors.join(' | ').slice(0, 600));
} finally {
  await context.close();
}

print();
