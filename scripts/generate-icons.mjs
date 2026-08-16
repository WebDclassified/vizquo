/**
 * Icon generator — produces the browser-extension icon set from the brand's
 * standalone icon artwork (deploy-kit/brand/artwork/standalone-icon.png, the
 * user's design: the V-Lens mark, light-on-near-black).
 *
 * Outputs:
 *   public/icon/{16,32,48,128}.png   — extension + Chrome Web Store icons
 *   public/icon/horizontal-logo.png  — downscaled lockup for the panel header
 *   landing/apple-touch-icon.png     — 180px iOS home-screen icon
 *
 * Uses Playwright (already a devDependency) with the locally installed
 * Chromium — no new dependencies, no network. Run: `node scripts/generate-icons.mjs`
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICON_DIR = join(ROOT, 'public', 'icon');
const LANDING_DIR = join(ROOT, 'landing');
const ARTWORK = join(ROOT, 'deploy-kit', 'brand', 'artwork');
const SOURCE = join(ARTWORK, 'standalone-icon.png');
const LOCKUP = join(ARTWORK, 'horizontal-logo.png');
// Embed as a data URL — file:// subresources are blocked inside setContent pages.
const SRC_URL =
  'data:image/png;base64,' + readFileSync(SOURCE).toString('base64');

const SIZES = [16, 32, 48, 128];
const APPLE_TOUCH = 180;
// Panel-header lockup: 300×150 (2:1) is ample for a 21px display at DPR 2
// and keeps the installed extension lean (the 518KB artwork never ships).
const LOCKUP_W = 300;
const LOCKUP_H = 150;

mkdirSync(ICON_DIR, { recursive: true });
mkdirSync(LANDING_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of SIZES) {
    await page.setContent(
      `<html><body style="margin:0;padding:0"><img id="i" src="${SRC_URL}" width="${size}" height="${size}"></body></html>`,
    );
    await page.evaluate(() => document.querySelector('#i').decode());
    await page.screenshot({
      path: join(ICON_DIR, `${size}.png`),
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(`wrote ${join(ICON_DIR, `${size}.png`)}`);
  }
  await page.setContent(
    `<html><body style="margin:0;padding:0"><img id="i" src="${SRC_URL}" width="${APPLE_TOUCH}" height="${APPLE_TOUCH}"></body></html>`,
  );
  await page.evaluate(() => document.querySelector('#i').decode());
  await page.screenshot({
    path: join(LANDING_DIR, 'apple-touch-icon.png'),
    clip: { x: 0, y: 0, width: APPLE_TOUCH, height: APPLE_TOUCH },
  });
  console.log(`wrote ${join(LANDING_DIR, 'apple-touch-icon.png')}`);
  const lockupUrl =
    'data:image/png;base64,' + readFileSync(LOCKUP).toString('base64');
  await page.setContent(
    `<html><body style="margin:0;padding:0"><img id="i" src="${lockupUrl}" width="${LOCKUP_W}" height="${LOCKUP_H}"></body></html>`,
  );
  await page.evaluate(() => document.querySelector('#i').decode());
  await page.screenshot({
    path: join(ICON_DIR, 'horizontal-logo.png'),
    clip: { x: 0, y: 0, width: LOCKUP_W, height: LOCKUP_H },
  });
  console.log(`wrote ${join(ICON_DIR, 'horizontal-logo.png')}`);
} finally {
  await browser.close();
}
