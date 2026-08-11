/**
 * Store promo tile generator — renders the Vizquo brand mark + wordmark at the
 * Chrome Web Store promotional sizes into deploy-kit/promo/*.png.
 *
 * Sizes:
 *   - 440×280  small promotional tile (required)
 *   - 1400×560 marquee promotional tile (optional, featured placement)
 *
 * Uses Playwright (already a devDependency) with the locally installed
 * Chromium — no new dependencies, no network, no external fonts.
 *
 * Run: `node scripts/generate-promo-tile.mjs`
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'deploy-kit', 'promo');

/** Brand mark: the inspection lens (indigo ring, teal core, indigo tail). */
const BRAND_MARK = `
<svg width="100%" height="100%" viewBox="0 0 128 128">
  <circle cx="56" cy="56" r="30" fill="none" stroke="#6E7BFF" stroke-width="9"/>
  <circle cx="56" cy="56" r="10" fill="#3FE0C8"/>
  <line x1="79" y1="79" x2="104" y2="104" stroke="#6E7BFF" stroke-width="9" stroke-linecap="round"/>
</svg>`;

const SHELL = `
<html><head><style>
  html, body { margin: 0; padding: 0; background: #101217; }
  * { box-sizing: border-box; }
</style></head><body>{BODY}</body></html>`;

/** 440×280 — required small promotional tile. */
const SMALL_TILE = `
<div style="width:440px;height:280px;background:#101217;border-radius:24px;overflow:hidden;position:relative;
            border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;padding:0 28px;gap:20px;font-family:system-ui,sans-serif;">
  <div style="width:112px;height:112px;flex:0 0 auto;">${BRAND_MARK}</div>
  <div style="display:flex;flex-direction:column;gap:8px;min-width:0;">
    <div style="color:#fff;font-size:34px;font-weight:800;letter-spacing:-0.02em;line-height:1;">Vizquo</div>
    <div style="color:rgba(255,255,255,0.72);font-size:13px;line-height:1.45;">
      Inspect anything.<br/>Understand everything.<br/>Build faster.
    </div>
    <div style="display:flex;gap:6px;margin-top:4px;">
      <span style="background:rgba(110,123,255,0.16);border:1px solid rgba(110,123,255,0.4);color:#aeb6ff;font-size:10px;font-weight:600;border-radius:999px;padding:3px 8px;">Colors</span>
      <span style="background:rgba(63,224,200,0.12);border:1px solid rgba(63,224,200,0.35);color:#6fe8d2;font-size:10px;font-weight:600;border-radius:999px;padding:3px 8px;">Typography</span>
      <span style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.8);font-size:10px;font-weight:600;border-radius:999px;padding:3px 8px;">Assets</span>
    </div>
  </div>
  <div style="position:absolute;right:-46px;top:-46px;width:150px;height:150px;border-radius:50%;
              background:radial-gradient(circle at 30% 30%, rgba(110,123,255,0.28), rgba(110,123,255,0.03) 65%);
              pointer-events:none;"></div>
</div>`;

/** 1400×560 — optional marquee promotional tile. */
const MARQUEE = `
<div style="width:1400px;height:560px;background:#101217;border-radius:32px;overflow:hidden;position:relative;
            border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;padding:0 72px;gap:56px;font-family:system-ui,sans-serif;">
  <div style="width:200px;height:200px;flex:0 0 auto;">${BRAND_MARK}</div>
  <div style="display:flex;flex-direction:column;gap:14px;min-width:0;z-index:1;">
    <div style="color:#fff;font-size:88px;font-weight:800;letter-spacing:-0.03em;line-height:1;">Vizquo</div>
    <div style="color:rgba(255,255,255,0.72);font-size:26px;line-height:1.4;max-width:640px;">
      Inspect anything. Understand everything. Build faster.<br/>
      The design-intelligence layer for the web.
    </div>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">
      ${[
        ['Design DNA', '#aeb6ff', 'rgba(110,123,255,0.16)', 'rgba(110,123,255,0.4)'],
        ['Element inspector', '#6fe8d2', 'rgba(63,224,200,0.12)', 'rgba(63,224,200,0.35)'],
        ['Assets & SVG', '#fff', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.18)'],
        ['Screenshots', '#fff', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.18)'],
        ['Code generation', '#fff', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.18)'],
        ['WCAG audits', '#fff', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.18)'],
      ]
        .map(
          ([label, color, bg, border]) =>
            `<span style="background:${bg};border:1px solid ${border};color:${color};font-size:20px;font-weight:600;border-radius:999px;padding:10px 20px;">${label}</span>`,
        )
        .join('')}
    </div>
  </div>
  <div style="position:absolute;right:-90px;top:-90px;width:330px;height:330px;border-radius:50%;
              background:radial-gradient(circle at 30% 30%, rgba(110,123,255,0.3), rgba(110,123,255,0.03) 65%);
              pointer-events:none;"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,#6E7BFF,#3FE0C8);opacity:0.9;"></div>
</div>`;

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 620 } });

  const tile = SHELL.replace('{BODY}', SMALL_TILE);
  await page.setContent(tile);
  const tilePath = join(OUT_DIR, 'promo-440x280.png');
  await page.screenshot({
    path: tilePath,
    omitBackground: true,
    clip: { x: 0, y: 0, width: 440, height: 280 },
  });
  console.log(`wrote ${tilePath}`);

  const marquee = SHELL.replace('{BODY}', MARQUEE);
  await page.setContent(marquee);
  const marqueePath = join(OUT_DIR, 'marquee-1400x560.png');
  await page.screenshot({
    path: marqueePath,
    omitBackground: true,
    clip: { x: 0, y: 0, width: 1400, height: 560 },
  });
  console.log(`wrote ${marqueePath}`);
} finally {
  await browser.close();
}
