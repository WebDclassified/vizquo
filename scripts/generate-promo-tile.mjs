/**
 * Store promo tile + OG social card generator — matches the landing page's
 * liquid-glass design (brand system v4): dark glass base, ambient radial
 * color fields, Space Grotesk wordmark, Instrument Serif italic accents,
 * edge-lit glass feature chips, translucent panel mock, gradient accent
 * line. Single theme by design — the product's glass language is dark-only;
 * there is no light variant.
 *
 * Outputs (into deploy-kit/promo/):
 *   - promo-440x280.png     Chrome Web Store small promotional tile (required)
 *   - marquee-1400x560.png  Chrome Web Store marquee tile (featured placement)
 *   - og-1200x630.png       Open Graph / Twitter social card for the landing page
 *
 * Uses Playwright (already a devDependency) with the locally installed
 * Chromium, and loads the same Google Fonts the landing page uses.
 *
 * Run: `node scripts/generate-promo-tile.mjs`
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'deploy-kit', 'promo');

// Version badge always tracks the current release — never hardcode it here.
const APP_VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version;

const FONTS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">`;

/** Brand mark: the inspection lens (champagne ring, emerald core, champagne tail). */
const BRAND_MARK = `
<svg width="100%" height="100%" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5FB98C"/>
      <stop offset="100%" stop-color="#3E8E67"/>
    </linearGradient>
  </defs>
  <circle cx="56" cy="56" r="30" fill="none" stroke="url(#ring)" stroke-width="9"/>
  <circle cx="56" cy="56" r="10" fill="#6FCF97"/>
  <line x1="79" y1="79" x2="104" y2="104" stroke="#3E8E67" stroke-width="9" stroke-linecap="round"/>
</svg>`;

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #08090e; }
  /* Ambient environment (v4): dark glass base + violet/teal/indigo color
     fields + a soft top-left beam — same scene the landing + panel use. */
  body {
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #f5f7fa; -webkit-font-smoothing: antialiased;
    background-image:
      radial-gradient(940px 640px at 6% -10%, rgba(201,169,110,.17), transparent 70%),
      radial-gradient(780px 560px at 104% 106%, rgba(84,201,155,.12), transparent 70%),
      radial-gradient(600px 460px at 84% -12%, rgba(222,190,130,.10), transparent 72%),
      radial-gradient(560px 380px at 10% -4%, rgba(255,255,255,.05), transparent 78%);
  }
  .aurora { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .orb { position: absolute; border-radius: 50%; filter: blur(90px); }
  .o1 { width: 660px; height: 660px; left: -280px; top: -340px; background: radial-gradient(circle, rgba(201,169,110,.3), transparent 65%); }
  .o2 { width: 580px; height: 580px; right: -240px; top: -280px; background: radial-gradient(circle, rgba(84,201,155,.24), transparent 65%); }
  .o3 { width: 500px; height: 500px; left: 30%; bottom: -360px; background: radial-gradient(circle, rgba(230,207,154,.26), transparent 65%); }
  .o4 { width: 360px; height: 360px; right: 6%; bottom: -200px; background: radial-gradient(circle, rgba(231,183,91,.1), transparent 60%); }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 56px 56px;
          -webkit-mask-image: radial-gradient(ellipse 82% 72% at 50% 6%, #000 18%, transparent 72%);
          mask-image: radial-gradient(ellipse 82% 72% at 50% 6%, #000 18%, transparent 72%); }
  .serif { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; }
  .grad-text { background: linear-gradient(120deg, #5FB98C, #63B98C 45%, #6FCF97 90%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  /* Glass chip: translucent fill + hairline border + top edge light. */
  .chip { display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.07); color: rgba(255,255,255,.84); border-radius: 999px; padding: 8px 15px; font-size: 11.5px; font-weight: 600; white-space: nowrap; box-shadow: inset 0 1px 0 rgba(255,255,255,.1); }
  .chip .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .accent-line { position: absolute; left: 0; right: 0; bottom: 0; height: 3.5px; background: linear-gradient(90deg, #3E8E67, #63B98C, #6FCF97); }
`;

const SHELL = (body) =>
  `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}</style></head><body>${body}</body></html>`;

/** 440×280 — required small promotional tile. */
const SMALL_TILE = `
<div style="width:440px;height:280px;border-radius:22px;overflow:hidden;position:relative;border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;padding:0 30px;gap:20px;">
  <div class="aurora"><div class="orb o1"></div><div class="orb o2"></div><div class="orb o4"></div></div>
  <div class="grid"></div>
  <div style="width:104px;height:104px;flex:0 0 auto;position:relative;">${BRAND_MARK}</div>
  <div style="display:flex;flex-direction:column;gap:11px;min-width:0;position:relative;">
    <div style="font-family:'Space Grotesk','Inter',sans-serif;font-size:42px;font-weight:700;letter-spacing:-0.025em;line-height:1;">Vizquo</div>
    <div style="font-size:12.5px;line-height:1.55;color:rgba(255,255,255,.68);">
      Inspect any webpage.<br/>Extract its <span class="serif grad-text" style="font-size:15px;">design system</span>.
    </div>
    <div style="display:flex;gap:6px;margin-top:3px;flex-wrap:wrap;">
      <span class="chip" style="color:#8FD4B0;border-color:rgba(201,169,110,.45);background:rgba(201,169,110,.14);padding:6px 12px;font-size:10.5px;"><span class="dot" style="background:#3E8E67;"></span>Colors</span>
      <span class="chip" style="color:#8FE0B4;border-color:rgba(84,201,155,.4);background:rgba(84,201,155,.12);padding:6px 12px;font-size:10.5px;"><span class="dot" style="background:#6FCF97;"></span>Type</span>
      <span class="chip" style="padding:6px 12px;font-size:10.5px;"><span class="dot" style="background:#63B98C;"></span>Assets</span>
    </div>
  </div>
  <div class="accent-line"></div>
</div>`;

/** 1400×560 — marquee promotional tile. */
const MARQUEE = `
<div style="width:1400px;height:560px;border-radius:32px;overflow:hidden;position:relative;border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;padding:0 78px;gap:64px;">
  <div class="aurora"><div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div><div class="orb o4"></div></div>
  <div class="grid"></div>
  <div style="width:200px;height:200px;flex:0 0 auto;position:relative;">${BRAND_MARK}</div>
  <div style="display:flex;flex-direction:column;gap:16px;min-width:0;position:relative;">
    <div style="font-family:'Space Grotesk','Inter',sans-serif;font-size:98px;font-weight:700;letter-spacing:-0.035em;line-height:1;">Vizquo</div>
    <div style="font-size:27px;line-height:1.45;color:rgba(255,255,255,.7);">
      Inspect any webpage. Extract its <span class="serif grad-text" style="font-size:32px;">design system</span>.
    </div>
    <div style="display:flex;gap:12px;margin-top:14px;flex-wrap:wrap;">
      ${[
        ['Design DNA', '#8FD4B0', 'rgba(201,169,110,.14)', 'rgba(201,169,110,.4)', '#3E8E67'],
        ['Element inspector', '#8FE0B4', 'rgba(84,201,155,.12)', 'rgba(84,201,155,.4)', '#6FCF97'],
        ['Assets & SVG', '#f4f6fb', 'rgba(255,255,255,.05)', 'rgba(255,255,255,.16)', '#63B98C'],
        ['WCAG audits', '#f4f6fb', 'rgba(255,255,255,.05)', 'rgba(255,255,255,.16)', '#63B98C'],
        ['Code generation', '#f4f6fb', 'rgba(255,255,255,.05)', 'rgba(255,255,255,.16)', '#e7b75b'],
        ['Free forever', '#f4f6fb', 'rgba(255,255,255,.05)', 'rgba(255,255,255,.16)', '#63B98C'],
      ]
        .map(
          ([label, color, bg, border, dot]) =>
            `<span class="chip" style="color:${color};border-color:${border};background:${bg};font-size:19px;padding:12px 22px;"><span class="dot" style="background:${dot};"></span>${label}</span>`,
        )
        .join('')}
    </div>
    <div style="margin-top:20px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:14px;color:rgba(255,255,255,.4);">v${APP_VERSION} · by Prabhat Teotia</div>
  </div>
  <div class="accent-line" style="height:5px;"></div>
</div>`;

/** 1200×630 — Open Graph / Twitter social card. */
const OG_CARD = `
<div style="width:1200px;height:630px;position:relative;overflow:hidden;display:flex;align-items:center;gap:64px;padding:0 88px;">
  <div class="aurora"><div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div></div>
  <div class="grid"></div>
  <div style="display:flex;flex-direction:column;gap:18px;min-width:0;position:relative;flex:0 0 auto;max-width:560px;">
    <div style="width:118px;height:118px;">${BRAND_MARK}</div>
    <div style="font-family:'Space Grotesk','Inter',sans-serif;font-size:78px;font-weight:700;letter-spacing:-0.035em;line-height:1;">Vizquo</div>
    <div style="font-size:26px;line-height:1.5;color:rgba(255,255,255,.72);">
      Inspect any webpage. Extract its <span class="serif grad-text" style="font-size:31px;">design system</span>.<br/>
      Free, local-first, private by default.
    </div>
    <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;max-width:540px;">
      ${[
        ['Design DNA', '#8FD4B0', 'rgba(201,169,110,.14)', 'rgba(201,169,110,.4)', '#3E8E67'],
        ['Inspector', '#8FE0B4', 'rgba(84,201,155,.12)', 'rgba(84,201,155,.4)', '#6FCF97'],
        ['Assets & SVG', '#f4f6fb', 'rgba(255,255,255,.05)', 'rgba(255,255,255,.16)', '#63B98C'],
        ['WCAG audits', '#f4f6fb', 'rgba(255,255,255,.05)', 'rgba(255,255,255,.16)', '#63B98C'],
        ['Optional AI', '#f4f6fb', 'rgba(255,255,255,.05)', 'rgba(255,255,255,.16)', '#e7b75b'],
        ['Free forever', '#f4f6fb', 'rgba(255,255,255,.05)', 'rgba(255,255,255,.16)', '#63B98C'],
      ]
        .map(
          ([label, color, bg, border, dot]) =>
            `<span class="chip" style="color:${color};border-color:${border};background:${bg};"><span class="dot" style="background:${dot};"></span>${label}</span>`,
        )
        .join('')}
    </div>
  </div>
  <!-- Mini Vizquo panel mock — standard glass material (translucent + edge light). -->
  <div style="width:430px;flex:0 0 auto;border-radius:20px;border:1px solid rgba(255,255,255,.16);background:rgba(20,23,32,.5);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 30px 80px rgba(0,0,0,.55);overflow:hidden;position:relative;">
    <div style="display:flex;align-items:center;gap:8px;padding:14px 18px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08);">
      <span style="width:11px;height:11px;border-radius:50%;background:#ff5f57;"></span>
      <span style="width:11px;height:11px;border-radius:50%;background:#febc2e;"></span>
      <span style="width:11px;height:11px;border-radius:50%;background:#5FB98C;"></span>
      <span style="flex:1;margin-left:6px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;color:rgba(255,255,255,.5);background:rgba(255,255,255,.06);border-radius:7px;padding:5px 12px;">example.com</span>
    </div>
    <div style="padding:20px 20px 18px;display:flex;flex-direction:column;gap:0;">
      <div style="display:flex;align-items:center;gap:9px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.07);">
        <span style="width:20px;height:20px;border-radius:6px;background:linear-gradient(120deg,#3E8E67,#6FCF97);"></span>
        <span style="font-size:13px;font-weight:700;">Vizquo — Design DNA</span>
        <span style="margin-left:auto;width:7px;height:7px;border-radius:50%;background:#6FCF97;box-shadow:0 0 10px rgba(84,201,155,.9);"></span>
      </div>
      <div style="padding:16px 2px 14px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,.6);margin-bottom:7px;">Consistency score <b style="color:#f4f6fb;font-family:'JetBrains Mono',ui-monospace,monospace;">92/100</b></div>
        <div style="height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;">
          <div style="height:100%;width:92%;border-radius:99px;background:linear-gradient(90deg,#3E8E67,#63B98C,#6FCF97);box-shadow:0 0 14px rgba(201,169,110,.8);"></div>
        </div>
      </div>
      ${[
        ['Primary', '#3E8E67'],
        ['Accent', '#6FCF97'],
        ['Font', '#63B98C'],
      ]
        .map(
          ([k, sw]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 10px;font-size:12.5px;color:rgba(255,255,255,.62);">
        <span style="display:flex;align-items:center;gap:9px;"><span style="width:11px;height:11px;border-radius:4px;background:${sw};border:1px solid rgba(255,255,255,.25);"></span>${k}</span>
        <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;color:#6FCF97;">${sw}</span>
      </div>`,
        )
        .join('')}
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);font-size:12px;color:rgba(255,255,255,.5);">
        <span style="background:rgba(84,201,155,.12);color:#6FCF97;border:1px solid rgba(84,201,155,.35);border-radius:99px;padding:4px 11px;font-weight:700;font-size:11px;">✓ Cohesive</span>
        <span style="margin-left:auto;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;color:rgba(255,255,255,.4);">v${APP_VERSION} · by Prabhat Teotia · local-first</span>
      </div>
    </div>
  </div>
  <div class="accent-line" style="height:4px;"></div>
</div>`;

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  // Chrome Web Store requires the promo tiles at EXACT pixel dimensions, so
  // those render at 1x. The OG card keeps 2x (2400×1260 physical, 1200×630
  // logical) — social platforms downscale fine and it stays retina-sharp.
  const jobs = [
    { name: 'promo-440x280.png', body: SMALL_TILE, w: 440, h: 280, vw: 900, vh: 600, dpr: 1 },
    { name: 'marquee-1400x560.png', body: MARQUEE, w: 1400, h: 560, vw: 1600, vh: 700, dpr: 1 },
    { name: 'og-1200x630.png', body: OG_CARD, w: 1200, h: 630, vw: 1280, vh: 720, dpr: 2 },
  ];
  for (const job of jobs) {
    const page = await browser.newPage({
      viewport: { width: job.vw, height: job.vh },
      deviceScaleFactor: job.dpr,
    });
    await page.setContent(SHELL(job.body));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const out = join(OUT_DIR, job.name);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: job.w, height: job.h } });
    console.log(`wrote ${out}`);
    await page.close();
  }
} finally {
  await browser.close();
}
