/**
 * Icon generator — renders the Vizquo brand mark at Chrome Web Store sizes
 * (16/32/48/128) into public/icon/*.png, where WXT auto-discovers them for
 * the manifest (`icon/{size}.png`).
 *
 * Uses Playwright (already a devDependency) with the locally installed
 * Chromium — no new dependencies, no network. Run: `node scripts/generate-icons.mjs`
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icon');

/**
 * Brand mark on the near-black brand surface. The wordmark is intentionally
 * absent — it is not legible below 48px, and the store icon should read as
 * the inspection lens (brand system §5.2: icon only for small UI contexts).
 */
const ICON_SVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect x="2" y="2" width="124" height="124" rx="26" fill="#101217"/>
  <rect x="2.5" y="2.5" width="123" height="123" rx="25.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
  <circle cx="56" cy="56" r="30" fill="none" stroke="#6E7BFF" stroke-width="9"/>
  <circle cx="56" cy="56" r="10" fill="#3FE0C8"/>
  <line x1="79" y1="79" x2="104" y2="104" stroke="#6E7BFF" stroke-width="9" stroke-linecap="round"/>
</svg>`;

const SIZES = [16, 32, 48, 128];

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of SIZES) {
    await page.setContent(`
      <html><body style="margin:0;padding:0">
        ${ICON_SVG(size)}
      </body></html>
    `);
    const path = join(OUT_DIR, `${size}.png`);
    await page.screenshot({
      path,
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(`wrote ${path}`);
  }
} finally {
  await browser.close();
}
