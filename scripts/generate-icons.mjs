/**
 * Icon generator — renders the Vizquo "V-Lens" brand mark at Chrome Web Store
 * sizes (16/32/48/128) into public/icon/*.png, where WXT auto-discovers them
 * for the manifest (`icon/{size}.png`).
 *
 * V-LENS CONCEPT — "See beyond the surface."
 * A bold geometric V whose mouth holds a precision lens ring. The V is the
 * dominant silhouette at every size; on a second look the ring reads as an
 * inspection lens / viewport. The negative space between the arms keeps the
 * lens "held" by the instrument rather than drawn as a separate icon.
 *
 * Geometry (viewBox 0 0 128 128):
 *   - Arms: two strokes, width 26, round caps, apex (64,118), 27° from vertical
 *   - Lens ring: circle (64,60), radius 22, stroke 6 — a ~1.3px gap from the
 *     arms' inner edges, so the lens floats inside the V's mouth
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
 * the V-Lens (brand system: icon only for small UI contexts).
 *
 * Monochrome-first: white V + white ring on the dark tile, so the icon works
 * on any browser chrome (light or dark). The brand-accent (violet) variation
 * lives in public/brand/ for marketing contexts.
 */
const ICON_SVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <title>Vizquo — V-Lens</title>
  <rect x="2" y="2" width="124" height="124" rx="27" fill="#0B0B0D"/>
  <rect x="2.5" y="2.5" width="123" height="123" rx="26.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
  <g fill="none" stroke="#F5F5F7">
    <line x1="64" y1="118" x2="13" y2="18" stroke-width="26" stroke-linecap="round"/>
    <line x1="115" y1="18" x2="64" y2="118" stroke-width="26" stroke-linecap="round"/>
    <circle cx="64" cy="60" r="22" stroke-width="6"/>
  </g>
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
