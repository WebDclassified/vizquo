/**
 * End-to-end typography panel verification — loads the BUILT extension
 * (.output/chrome-mv3), connects to a real site (openrouter.ai by default),
 * runs a genuine scan through the full pipeline, and screenshots the
 * Typography + Fonts sections so alignment/data can be inspected.
 *
 * Usage: node scripts/verify-typography-panel.mjs [url]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../.output/chrome-mv3');
const url = process.argv[2] ?? 'https://openrouter.ai/';
const OUT = '/tmp/vizquo-typography-verify.png';

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--no-sandbox',
  ],
});

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30_000 });
  const extensionId = new URL(worker.url()).host;
  console.log('extension id:', extensionId);

  // Open the real site.
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${String(err)}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => {
    console.log('goto warn:', e.message.split('\n')[0]);
  });
  await page.waitForTimeout(4000);
  console.log('page title:', await page.title());

  // Open the side panel page in the extension context.
  const panel = await context.newPage();
  panel.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`panel console: ${msg.text()}`);
  });
  panel.on('pageerror', (err) => errors.push(`panel pageerror: ${String(err)}`));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
    waitUntil: 'domcontentloaded',
  });
  await panel.waitForTimeout(1500);

  // Skip onboarding if present.
  const skipTour = panel.getByRole('button', { name: 'Skip tour' });
  if (await skipTour.isVisible().catch(() => false)) await skipTour.click();

  // The panel PING targets the ACTIVE tab of the focused window. In headless,
  // the freshly opened panel page is active — bring the real site to front so
  // PING_TAB resolves against openrouter.ai, then re-check the connection.
  await page.bringToFront();
  await panel.waitForTimeout(600);
  await panel
    .getByRole('button', { name: /Check/ })
    .click()
    .catch(() => {});
  await panel.waitForTimeout(1500);

  // Design tab.
  await panel.getByRole('tab', { name: 'Design' }).click();
  await panel.waitForTimeout(800);

  // Check connection state.
  const connText = await panel
    .locator('body')
    .innerText()
    .then((t) => t.slice(0, 200))
    .catch(() => '(unreadable)');
  console.log('panel snippet:', JSON.stringify(connText.slice(0, 150)));

  // If not connected, try clicking Grant access (permissions.request may be
  // auto-accepted in headless via the extension's own request path, or the
  // content script may already answer because content_scripts auto-injects).
  const scanBtn = panel.getByRole('button', { name: /Scan page/ });
  if (await scanBtn.isVisible().catch(() => false)) {
    await scanBtn.click();
    console.log('clicked Scan page');
  }
  // Wait for scan progress / results (openrouter is a heavy SPA — give it time).
  for (let i = 0; i < 12; i += 1) {
    await panel.waitForTimeout(5000);
    const t = await panel
      .locator('body')
      .innerText()
      .catch(() => '');
    if (/Typography/i.test(t) && /Fonts/i.test(t)) break;
    if (i === 1 || i === 5 || i === 11) {
      console.log(`[t+${(i + 1) * 5}s] design panel text:`, JSON.stringify(t.slice(0, 400)));
    }
  }

  const bodyText = await panel
    .locator('body')
    .innerText()
    .catch(() => '');
  const hasTypography = /Typography|Fonts/i.test(bodyText);
  const hasStyles = /Text styles|Display|Body|Small/i.test(bodyText);
  console.log('typography section visible:', hasTypography, '| style rows:', hasStyles);
  const errorIdx = bodyText.toLowerCase().indexOf('error');
  console.log(
    'scan error?',
    errorIdx >= 0
      ? JSON.stringify(bodyText.slice(Math.max(0, errorIdx - 60), errorIdx + 80))
      : 'no',
  );
  const typoIdx = bodyText.indexOf('Typography');
  console.log(
    'typography text snippet:',
    JSON.stringify(typoIdx >= 0 ? bodyText.slice(typoIdx, typoIdx + 700) : bodyText.slice(0, 700)),
  );

  // Scroll to the typography panel and screenshot.
  try {
    await panel.locator('#typography').scrollIntoViewIfNeeded({ timeout: 5000 });
  } catch {
    console.log('warn: #typography not found (connection/scan may have failed)');
  }
  await panel.waitForTimeout(600);
  await panel.screenshot({ path: OUT, fullPage: false });
  console.log('screenshot:', OUT);

  // Dump the rendered typography + fonts panels so alignment can be checked.
  const typoHTML = await panel
    .locator('#typography')
    .evaluate((el) => el.outerHTML.slice(0, 3000))
    .catch(() => '(not found)');
  const fontsHTML = await panel
    .locator('#fonts')
    .evaluate((el) => el.outerHTML.slice(0, 2500))
    .catch(() => '(not found)');
  console.log(`\n=== #typography panel HTML ===\n${typoHTML}\n`);
  console.log(`\n=== #fonts panel HTML ===\n${fontsHTML}\n`);

  // Alignment check: does the confidence badge fit its 84px column?
  const badgeMetrics = await panel
    .locator('#typography .vq-badge')
    .first()
    .evaluate((el) => {
      const col = el.closest('div[class*=w-]');
      const rect = el.getBoundingClientRect();
      const colRect = col?.getBoundingClientRect();
      return {
        badgeWidth: Math.round(rect.width),
        colWidth: colRect ? Math.round(colRect.width) : null,
        overflow: colRect ? rect.right > colRect.right + 0.5 : false,
      };
    })
    .catch(() => null);
  console.log('badge fit check:', JSON.stringify(badgeMetrics));

  console.log('\n--- console errors ---');
  console.log(errors.length === 0 ? '(none)' : errors.join('\n'));
} finally {
  await context.close();
}
