/**
 * Icon generator — produces the browser-extension icon set from the brand's
 * standalone icon artwork (public/icon/standalone-icon.png, the user's design:
 * the V-Lens mark, light-on-near-black).
 *
 * Outputs:
 *   public/icon/{16,32,48,128}.png   — extension + Chrome Web Store icons
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
const SOURCE = join(ICON_DIR, 'standalone-icon.png');
// Embed as a data URL — file:// subresources are blocked inside setContent pages.
const SRC_URL =
  'data:image/png;base64,' + readFileSync(SOURCE).toString('base64');

const SIZES = [16, 32, 48, 128];
const APPLE_TOUCH = 180;

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
} finally {
  await browser.close();
}
