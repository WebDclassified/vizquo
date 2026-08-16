/**
 * Cross-browser landing smoke test.
 *
 * Loads landing/index.html in Chromium, Firefox, and WebKit (Playwright) and
 * verifies the page works for every browser:
 *   - zero console/page errors (desktop + mobile)
 *   - hero renders
 *   - no horizontal overflow (1280px desktop and 390px mobile)
 *   - animated counters reach their targets (100%, 7)
 *   - live-demo hover populates the inspector rows
 *   - download overlay opens and closes on Escape
 *   - burger menu opens on mobile and closes on link tap
 *   - back-to-top button appears after scrolling
 *   - prefers-reduced-motion still reveals all content
 *
 * Requires Playwright browsers: `npx playwright install chromium firefox webkit`
 *
 * Run: `node scripts/check-landing-browsers.mjs`
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

function startServer() {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (path === '/favicon.ico') {
      // Browsers probe for a favicon even when the page declares one.
      res.writeHead(204);
      res.end();
      return;
    }
    const file = join(ROOT, path);
    try {
      const body = readFileSync(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      console.log(`404: ${path}`);
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function runEngine(browserType, url) {
  const problems = [];
  const browser = await browserType.launch();
  const isFontHost = (url) => {
    try {
      return /fonts\.(googleapis|gstatic)\.com/.test(new URL(url).host);
    } catch {
      return false;
    }
  };
  // Console errors alone can't attribute generic "Failed to load resource"
  // messages (WebKit logs transient Google Fonts 404s with no URL). Real
  // resource failures are caught deterministically by the response handler
  // below, so generic load errors are ignored here.
  const isRealError = (m) => {
    if (m.type() !== 'error') return false;
    const text = m.text();
    if (/downloadable font|font-family|woff2?/.test(text)) return false;
    if (/Failed to load resource/.test(text)) return false;
    return true;
  };
  const watchNetwork = (page) => {
    page.on('response', (res) => {
      if (res.status() >= 400 && !isFontHost(res.url())) {
        problems.push(`HTTP ${res.status()} for ${new URL(res.url()).pathname}`);
      }
    });
  };
  try {
    // ---- Desktop ----
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watchNetwork(page);
    page.on('console', (m) => {
      if (isRealError(m)) problems.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    // Neutralize CSS smooth-scrolling so programmatic scrolls are deterministic.
    await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' });
    if (!(await page.locator('.hero h1').isVisible())) problems.push('hero h1 not visible');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 0) problems.push(`desktop horizontal overflow ${overflow}px`);

    // Counters animate to targets. WebKit's headless IntersectionObserver is
    // lazy, so poll with scroll-into-view retries instead of a fixed sleep.
    await page.evaluate(() => window.scrollTo(0, 700));
    await page
      .waitForFunction(
        () => {
          const c100 = document.querySelector('.stat .counter[data-count="100"]');
          const c7 = document.querySelector('.stat .counter[data-count="7"]');
          const done = c100?.textContent.trim() === '100%' && c7?.textContent.trim() === '7';
          if (!done) c100?.scrollIntoView({ block: 'center' });
          return done;
        },
        { timeout: 15000 },
      )
      .catch(() => {});
    const c100 = (await page.locator('.stat .counter[data-count="100"]').textContent())?.trim();
    const c7 = (await page.locator('.stat .counter[data-count="7"]').textContent())?.trim();
    if (c100 !== '100%') problems.push(`counter[100] = ${c100}`);
    if (c7 !== '7') problems.push(`counter[7] = ${c7}`);

    // Live demo: hovering a mock element fills the inspector.
    await page.evaluate(() => document.getElementById('demo')?.scrollIntoView());
    await page.waitForTimeout(600);
    const firstItem = page.locator('.i-item').first();
    await firstItem.hover();
    await page.waitForTimeout(350);
    let rows = await page.locator('.insp-row').count();
    if (rows < 3) {
      // Some engines synthesize hover differently; verify the wiring directly.
      await firstItem.evaluate((el) =>
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false })),
      );
      await page.waitForTimeout(200);
      rows = await page.locator('.insp-row').count();
    }
    if (rows < 3) problems.push(`demo hover produced ${rows} rows`);

    // Every Download ZIP button must point at a real local file. External
    // buttons (e.g. the Safari "vote" link) are destinations, not ZIPs —
    // skipping them keeps this check hermetic (no outbound network, which
    // flaked CI/sandboxed runs when the remote host was slow or blocked).
    const dlHrefs = await page
      .locator('.btn-dl')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    for (const href of dlHrefs) {
      if (!href?.startsWith('downloads/')) continue;
      const res = await page.request.get(new URL(href, url).toString());
      if (res.status() !== 200) problems.push(`download link 404: ${href}`);
    }

    // Download overlay opens, Escape closes.
    await page.locator('.btn-dl').first().click();
    await page.waitForTimeout(250);
    const open = await page.locator('#dlOverlay').evaluate((el) => el.classList.contains('show'));
    if (!open) problems.push('download overlay did not open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const closed = await page.locator('#dlOverlay').evaluate((el) => el.classList.contains('show'));
    if (closed) problems.push('download overlay did not close on Escape');
    await page.close();

    // ---- Mobile ----
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    watchNetwork(mob);
    mob.on('console', (m) => {
      if (isRealError(m)) problems.push(`mobile console.error: ${m.text()}`);
    });
    mob.on('pageerror', (e) => problems.push(`mobile pageerror: ${e.message}`));
    await mob.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await mob.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' });
    const mobOverflow = await mob.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (mobOverflow > 0) problems.push(`mobile horizontal overflow ${mobOverflow}px`);
    await mob.locator('#navBurger').click();
    const navOpen = await mob.locator('#navLinks').evaluate((el) => el.classList.contains('open'));
    if (!navOpen) problems.push('burger did not open nav');
    await mob.locator('#navLinks a').first().click();
    await mob.waitForTimeout(200);
    const navClosed = await mob
      .locator('#navLinks')
      .evaluate((el) => el.classList.contains('open'));
    if (navClosed) problems.push('burger nav did not close on link tap');
    await mob.evaluate(() => {
      document.documentElement.scrollTop = 1400;
      document.body.scrollTop = 1400;
    });
    await mob.waitForTimeout(400);
    const backTop = await mob.locator('#backTop').evaluate((el) => el.classList.contains('show'));
    if (!backTop) problems.push('back-to-top did not appear');
    await mob.close();

    // ---- Reduced motion ----
    const rm = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    rm.on('pageerror', (e) => problems.push(`reduced-motion pageerror: ${e.message}`));
    await rm.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await rm.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await rm.waitForTimeout(500);
    const hiddenReveals = await rm.evaluate(
      () =>
        Array.from(document.querySelectorAll('.reveal, .reveal-scale')).filter(
          (el) => getComputedStyle(el).opacity === '0',
        ).length,
    );
    if (hiddenReveals > 0)
      problems.push(`${hiddenReveals} reveal elements still invisible under reduced motion`);
    await rm.close();
  } finally {
    await browser.close();
  }
  return { problems };
}

const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/landing/`;
console.log(`serving ${url}`);
let failed = 0;
for (const [engine, name] of [
  [chromium, 'chromium'],
  [firefox, 'firefox'],
  [webkit, 'webkit'],
]) {
  try {
    const { problems } = await runEngine(engine, url);
    if (problems.length) {
      failed += 1;
      console.log(`✗ ${name}: ${problems.length} issue(s)`);
      problems.forEach((p) => {
        console.log(`    - ${p}`);
      });
    } else {
      console.log(`✓ ${name}: all checks passed`);
    }
  } catch (err) {
    failed += 1;
    console.log(`✗ ${name}: threw ${String(err.message ?? err).split('\n')[0]}`);
  }
}
server.close();
console.log(failed ? `FAILED (${failed} engine(s))` : 'ALL ENGINES PASSED');
process.exit(failed ? 1 : 0);
