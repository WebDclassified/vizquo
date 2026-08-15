/**
 * Store screenshot capture — drives the BUILT extension (.output/chrome-mv3)
 * exactly like the Playwright E2E harness, connects the side panel to a
 * styled sample site, runs a real Design DNA scan, and captures screenshots
 * of the actual UI into deploy-kit/screenshots/*.png.
 *
 * Requirements: `npm run build` first. Run: `node scripts/capture-screenshots.mjs`
 *
 * Notes:
 *   - Unpacked (--load-extension) extensions auto-accept optional host
 *     permissions in this harness, so the on-demand site grant completes
 *     without manual clicks (same flow as tests/e2e/hostile.spec.ts).
 *   - The panel is pinned to the dark glass theme (`colorScheme: 'dark'` +
 *     the default auto setting) — the product has one glass language, and
 *     store screenshots must never come out light-themed.
 *   - Screenshots land at the panel's natural layout. Resize/crop to
 *     1280×800 or 640×400 before uploading to a store if needed.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXTENSION_PATH = join(ROOT, '.output', 'chrome-mv3');
const OUT_DIR = join(ROOT, 'deploy-kit', 'screenshots');
const SAMPLE_ORIGIN = 'http://vizquo-sample.test';
// Render width: 1280 (full-width, store-compliant) or 420 (authentic
// side-panel look). `CAPTURE_WIDTH=420 node scripts/capture-screenshots.mjs`
const WIDTH = Number(process.env.CAPTURE_WIDTH ?? 1280);
const TAG = WIDTH === 1280 ? '' : `@${WIDTH}`;

function step(label) {
  console.log(`[capture] ${label}`);
}

/** A deliberately well-designed sample site: consistent 8px spacing, a 3-color
 *  system, one radius, repeated components — a fast, clean Design DNA scan. */
const SAMPLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Nimbus — Analytics for modern teams</title>
<style>
  :root {
    --brand: #6e7bff;
    --brand-strong: #5563f0;
    --accent: #3fe0c8;
    --ink: #14161c;
    --muted: #5b6472;
    --bg: #f7f8fb;
    --card: #ffffff;
    --line: #e6e8ee;
    --radius: 10px;
    --shadow: 0 1px 2px rgba(20, 22, 28, 0.05), 0 8px 24px rgba(20, 22, 28, 0.06);
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--bg); }
  .nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px; background: var(--card); border-bottom: 1px solid var(--line); position: sticky; top: 0; }
  .nav .logo { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 18px; }
  .nav .logo .dot { width: 20px; height: 20px; border-radius: 6px; background: linear-gradient(135deg, var(--brand), var(--accent)); }
  .nav .links { display: flex; gap: 24px; color: var(--muted); font-size: 14px; font-weight: 500; }
  .btn { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: var(--radius); padding: 10px 16px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; }
  .btn-primary { background: var(--brand); color: #fff; }
  .btn-secondary { background: var(--card); color: var(--ink); border: 1px solid var(--line); }
  .hero { padding: 72px 32px 56px; text-align: center; background: linear-gradient(180deg, #eef0ff, var(--bg)); }
  .hero h1 { font-size: 44px; line-height: 1.1; letter-spacing: -0.03em; margin: 0 0 16px; }
  .hero p { color: var(--muted); font-size: 18px; max-width: 560px; margin: 0 auto 28px; line-height: 1.55; }
  .hero .actions { display: flex; justify-content: center; gap: 12px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(110, 123, 255, 0.1); color: var(--brand-strong); border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
  .section { padding: 48px 32px; max-width: 1080px; margin: 0 auto; }
  .section h2 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 8px; }
  .section .sub { color: var(--muted); margin: 0 0 32px; font-size: 15px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; box-shadow: var(--shadow); }
  .card .icon { width: 40px; height: 40px; border-radius: var(--radius); display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 16px; }
  .card h3 { font-size: 16px; margin: 0 0 6px; }
  .card p { font-size: 13.5px; color: var(--muted); margin: 0; line-height: 1.5; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 40px 32px; max-width: 1080px; margin: 0 auto; }
  .stat { text-align: center; }
  .stat .num { font-size: 36px; font-weight: 800; color: var(--brand); letter-spacing: -0.02em; }
  .stat .label { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .cta { background: var(--ink); color: #fff; border-radius: 24px; padding: 56px 32px; text-align: center; max-width: 1080px; margin: 24px auto 48px; }
  .cta h2 { font-size: 32px; margin: 0 0 12px; letter-spacing: -0.02em; }
  .cta p { color: rgba(255, 255, 255, 0.7); margin: 0 0 24px; }
  .footer { border-top: 1px solid var(--line); padding: 24px 32px; color: var(--muted); font-size: 13px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <nav class="nav">
    <div class="logo"><span class="dot"></span>Nimbus</div>
    <div class="links"><span>Product</span><span>Pricing</span><span>Docs</span><span>Blog</span></div>
    <button class="btn btn-secondary">Sign in</button>
  </nav>

  <header class="hero">
    <span class="badge">✦ New: AI anomaly detection</span>
    <h1>Analytics for modern teams</h1>
    <p>Understand your product, your users, and your numbers — in real time, without the busywork.</p>
    <div class="actions">
      <button class="btn btn-primary" id="cta">Start free trial</button>
      <button class="btn btn-secondary">Book a demo</button>
    </div>
  </header>

  <section class="section">
    <h2>Everything your team needs</h2>
    <p class="sub">One platform for dashboards, funnels, and live product metrics.</p>
    <div class="grid">
      <div class="card"><div class="icon" style="background:#eef0ff">📊</div><h3>Real-time dashboards</h3><p>Live charts that update as your data streams in — no refresh, no lag.</p></div>
      <div class="card"><div class="icon" style="background:#e6fbf7">🔍</div><h3>Funnel analysis</h3><p>Find where users drop off with visual, drag-and-drop funnels.</p></div>
      <div class="card"><div class="icon" style="background:#fff3e6">🚀</div><h3>Event tracking</h3><p>Instrument product events in minutes with our SDK or no-code mode.</p></div>
      <div class="card"><div class="icon" style="background:#f3eefc">🧩</div><h3>Integrations</h3><p>Connect 80+ tools — Slack, Segment, Stripe — with one click.</p></div>
      <div class="card"><div class="icon" style="background:#eef0ff">🔔</div><h3>Smart alerts</h3><p>Get pinged before small problems become big ones.</p></div>
      <div class="card"><div class="icon" style="background:#e6fbf7">🔐</div><h3>Enterprise-grade security</h3><p>SOC 2 Type II, SSO, and granular role-based permissions.</p></div>
    </div>
  </section>

  <div class="stats">
    <div class="stat"><div class="num">12k+</div><div class="label">Teams on Nimbus</div></div>
    <div class="stat"><div class="num">99.99%</div><div class="label">Uptime SLA</div></div>
    <div class="stat"><div class="num">4.9★</div><div class="label">Average rating</div></div>
  </div>

  <div class="cta">
    <h2>Start building better products</h2>
    <p>Free for 14 days. No credit card required.</p>
    <button class="btn btn-primary" style="background:#6e7bff">Get started</button>
  </div>

  <footer class="footer">
    <span>© 2026 Nimbus Analytics, Inc.</span>
    <span>Privacy · Terms · Security</span>
  </footer>
</body>
</html>`;

mkdirSync(OUT_DIR, { recursive: true });

/** Dismiss the first-run onboarding dialog — it overlays the whole panel. */
async function dismissOnboarding(panel) {
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

/** Wait until no "Scanning…" indicator remains and the Scan button is usable. */
async function waitForScanDone(panel, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const scanning = await panel
      .getByText(/scanning/i)
      .count()
      .catch(() => 0);
    if (scanning === 0) {
      await panel.waitForTimeout(2_500);
      step('scan done — panel settled');
      return;
    }
    await panel.waitForTimeout(2_000);
  }
  step('WARN: scan did not settle within timeout — capturing anyway');
}

/** Measure the panel UI column (the App root's bounding box) once, so
 *  screenshots clip to the side-panel column instead of the empty viewport. */
async function panelColumn(panel) {
  try {
    const rect = await panel.evaluate(() => {
      const root = document.querySelector('#root > div');
      if (!root) return null;
      const r = root.getBoundingClientRect();
      return { x: Math.max(0, r.x), width: Math.min(r.width, window.innerWidth - r.x) };
    });
    if (rect && rect.width > 100) return rect;
  } catch {
    // fall through to full viewport
  }
  return { x: 0, width: 1280 };
}

async function capture(panel, name, column) {
  const path = join(OUT_DIR, `${name.replace(/\.png$/, '')}${TAG}.png`);
  await panel.screenshot({
    path,
    fullPage: false,
    clip: { x: column.x, y: 0, width: column.width, height: 800 },
  });
  step(`wrote ${path} (${Math.round(column.width)}px column)`);
}

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: false,
  // Force the OS dark scheme so the panel's auto theme resolves to the dark
  // glass UI — screenshots must be single-theme (no light variant).
  colorScheme: 'dark',
  args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
});

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  step(`extension ${extensionId}`);

  await context.route(`${SAMPLE_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: SAMPLE_HTML }),
  );

  // Sample site (the page being inspected).
  const sample = await context.newPage();
  await sample.goto(`${SAMPLE_ORIGIN}/index.html`);
  await sample.waitForLoadState('load');
  step('sample site loaded');

  // Panel (the extension's own page).
  const panel = await context.newPage({ viewport: { width: 1280, height: 800 } });
  panel.on('console', (msg) => {
    if (msg.type() === 'error') step(`panel console error: ${msg.text().slice(0, 200)}`);
  });
  panel.on('pageerror', (err) => step(`panel pageerror: ${String(err).slice(0, 200)}`));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  step('panel loaded');
  await dismissOnboarding(panel);
  await panel.setViewportSize({ width: WIDTH, height: 800 });
  await panel.waitForTimeout(400);
  const column = await panelColumn(panel);
  step(`panel column: x=${column.x} w=${Math.round(column.width)}`);

  // Connect: bringing the sample tab to front triggers the panel's active-tab
  // re-check (watchActiveTab) — the connection card settles on its own, so no
  // manual Check click is needed (the button can be swapped by a re-render
  // mid-click). Complete the on-demand grant if the content script isn't live.
  await sample.bringToFront();
  const grantBtn = panel.getByRole('button', { name: 'Grant access to this tab' });
  const inspectSwitch = panel.getByRole('switch', { name: 'Inspect' });
  const outcome = await Promise.race([
    grantBtn.waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'grant'),
    inspectSwitch.waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'connected'),
  ]);
  if (outcome === 'grant') {
    // The harness auto-accepts optional host permissions, so the card can
    // flip to connected the instant the grant lands — the button may detach
    // mid-click. Race the click against the switch appearing instead of
    // failing on a stale element.
    step('grant visible — clicking (or connection may already be landing)');
    await Promise.race([
      grantBtn.click({ timeout: 5_000 }).catch(() => {}),
      inspectSwitch.waitFor({ state: 'visible', timeout: 45_000 }),
    ]);
  }
  await inspectSwitch.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {
    step('WARN: connection not confirmed — continuing anyway');
  });
  step('connected');

  // 1. Design overview (real scan).
  await panel.getByRole('tab', { name: 'Design' }).click();
  await panel.getByRole('button', { name: /Scan page/ }).click();
  step('scan started');
  await waitForScanDone(panel);
  await capture(panel, 'design-overview.png', column);

  // 2. Element inspector (lock the hero CTA on the page, then show the
  //    Inspect tab with the element's details).
  try {
    const toggle = panel.getByRole('switch', { name: 'Inspect' });
    if (await toggle.isVisible().catch(() => false)) {
      const checked = await toggle.getAttribute('aria-checked');
      if (checked !== 'true') await toggle.click();
    }
    await sample.click('#cta', { timeout: 10_000 });
    await panel.getByRole('tab', { name: 'Inspect' }).click();
    await panel.waitForTimeout(1_500);
    await capture(panel, 'inspector.png', column);
  } catch (err) {
    step(`inspector capture skipped: ${String(err).slice(0, 140)}`);
  }

  // 3. Assets (populated by the scan).
  try {
    await panel.getByRole('tab', { name: 'Assets' }).click();
    await panel.waitForTimeout(1_500);
    await capture(panel, 'assets.png', column);
  } catch (err) {
    step(`assets capture skipped: ${String(err).slice(0, 140)}`);
  }

  // 4. Create (screenshot studio + live editing + export center).
  try {
    await panel.getByRole('tab', { name: 'Create' }).click();
    await panel.waitForTimeout(800);
    await capture(panel, 'create.png', column);
  } catch (err) {
    step(`create capture skipped: ${String(err).slice(0, 140)}`);
  }

  // 5. Library.
  try {
    await panel.getByRole('tab', { name: 'Library' }).click();
    await panel.waitForTimeout(800);
    await capture(panel, 'library.png', column);
  } catch (err) {
    step(`library capture skipped: ${String(err).slice(0, 140)}`);
  }

  // 6. Settings.
  try {
    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.waitForTimeout(800);
    await capture(panel, 'settings.png', column);
  } catch (err) {
    step(`settings capture skipped: ${String(err).slice(0, 140)}`);
  }

  // 7. Command palette.
  try {
    await panel.keyboard.press('Control+k');
    await panel.waitForTimeout(600);
    await capture(panel, 'command-palette.png', column);
    await panel.keyboard.press('Escape');
    await panel.keyboard.press('Escape');
  } catch (err) {
    step(`palette capture skipped: ${String(err).slice(0, 140)}`);
  }

  step('done');
} finally {
  await context.close();
}
