/**
 * Chrome Web Store screenshot resize.
 *
 * The capture script (capture-screenshots.mjs) writes the real panel at
 * 1280×800 — CWS's largest accepted size. This script additionally produces
 * exact 640×400 copies (CWS's smaller accepted size) into
 * deploy-kit/screenshots/cws/, so store submissions can pick either. Both
 * sizes share the 16:10 ratio, so the downscale is a pure uniform shrink —
 * no cropping, no distortion.
 *
 * Run: `npm run screenshots:cws` (after `npm run screenshots`)
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'deploy-kit', 'screenshots');
const OUT_DIR = join(SRC_DIR, 'cws');
const W = 640;
const H = 400;

mkdirSync(OUT_DIR, { recursive: true });

const sources = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.png') && !f.includes('@420') && !f.startsWith('cws-'))
  .sort();

if (!sources.length) {
  console.error('no 1280×800 sources found — run `npm run screenshots` first');
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const name of sources) {
    const png = readFileSync(join(SRC_DIR, name));
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
    // Render the source image at exactly 640×400 on the dark panel
    // background. `omitBackground: false` keeps an opaque PNG (CWS rejects
    // alpha channels), and the 1:1 image:viewport mapping guarantees exact
    // output dimensions.
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#0b0d16;overflow:hidden">` +
        `<img src="${dataUrl}" alt="" style="display:block;width:${W}px;height:${H}px">` +
        `</body></html>`,
    );
    await page.waitForTimeout(120); // let the decode + paint settle
    const out = join(OUT_DIR, name.replace(/\.png$/, `-${W}x${H}.png`));
    await page.screenshot({ path: out, omitBackground: false });
    console.log(`wrote ${out}`);
  }
  await page.close();
} finally {
  await browser.close();
}
console.log('done — CWS 640×400 variants ready in deploy-kit/screenshots/cws/');
