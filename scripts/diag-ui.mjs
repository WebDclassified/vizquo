/**
 * UI redesign verification — loads the BUILT extension, opens the side panel,
 * and verifies the glass system actually renders: ambient scene on <body>,
 * translucent glass surfaces, glass chrome bars, blurred floating layers, and
 * solid high-contrast fallbacks. Also captures light/dark/palette screenshots
 * to the OS temp dir for a human look.
 *
 * Run: node scripts/diag-ui.mjs   (after npm run build)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchProbeContext, openPanel } from './probe-lib.mjs';

const { context, extensionId } = await launchProbeContext();
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vizquo-ui-'));
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

try {
  const panel = await openPanel(context, extensionId);
  const consoleErrors = [];
  panel.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160));
  });
  panel.on('pageerror', (err) => consoleErrors.push(String(err).slice(0, 160)));

  await panel.waitForTimeout(800);

  // --- Ambient scene on <body> (radial light fields + grain) ---
  const bodyBg = await panel.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { images: s.backgroundImage, color: s.backgroundColor };
  });
  check(
    'ambient scene on body',
    bodyBg.images.includes('radial-gradient') && bodyBg.images.includes('svg'),
    `layers=${(bodyBg.images.match(/radial-gradient/g) ?? []).length}`,
  );

  // --- Glass surface: a vq-panel must be translucent (alpha < 1) ---
  const panelBg = await panel.evaluate(() => {
    const el = document.querySelector('.vq-panel');
    if (!el) return null;
    return getComputedStyle(el).backgroundColor;
  });
  check(
    'glass panel translucent',
    panelBg != null && /rgba?\([^)]*,\s*(0(\.\d+)?|\.\d+)\)/.test(panelBg),
    panelBg ?? 'no .vq-panel',
  );

  // --- Chrome bars carry the glass frame ---
  const chromeOk = await panel.evaluate(() => {
    const header = document.querySelector('header');
    return Boolean(header?.classList.contains('vq-chrome'));
  });
  check('header is glass chrome', chromeOk);

  // --- Floating layer: open the command palette (Ctrl/⌘K) ---
  await panel.keyboard.press('ControlOrMeta+k');
  await panel.waitForTimeout(500);
  const float = await panel.evaluate(() => {
    const el = [...document.querySelectorAll('[role="dialog"]')].pop();
    if (!el) return null;
    const s = getComputedStyle(el);
    return { blur: s.backdropFilter || s.webkitBackdropFilter, bg: s.backgroundColor };
  });
  check(
    'palette is a blurred float',
    float != null &&
      (float.blur.includes('blur') || float.blur.includes('blur(')) &&
      /rgba?\(/.test(float.bg),
    float ? `blur=${float.blur.slice(0, 40)} bg=${float.bg}` : 'no dialog',
  );
  await panel.keyboard.press('Escape');
  await panel.waitForTimeout(300);

  // --- High-contrast falls back to solid surfaces ---
  await panel.evaluate(() => {
    document.documentElement.dataset.highContrast = 'true';
  });
  const hcBg = await panel.evaluate(() => {
    const el = document.querySelector('.vq-panel');
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  check(
    'high contrast → solid panel',
    hcBg != null && (hcBg === 'rgb(255, 255, 255)' || /,\s*1\)$/.test(hcBg)),
    hcBg ?? 'no panel',
  );
  await panel.evaluate(() => {
    delete document.documentElement.dataset.highContrast;
  });

  // --- Screenshots: light, dark, palette ---
  await panel.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await panel.waitForTimeout(300);
  await panel.screenshot({ path: path.join(outDir, 'light.png') });

  await panel.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await panel.waitForTimeout(300);
  await panel.screenshot({ path: path.join(outDir, 'dark.png') });

  await panel.keyboard.press('ControlOrMeta+k');
  await panel.waitForTimeout(500);
  await panel.screenshot({ path: path.join(outDir, 'palette.png') });
  await panel.keyboard.press('Escape');

  await panel.waitForTimeout(400);
  check(
    'zero panel console errors',
    consoleErrors.length === 0,
    consoleErrors.join(' | ').slice(0, 300),
  );
  console.log(`\nscreenshots → ${outDir}`);
  console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} FAILURES`);
} finally {
  await context.close();
}
