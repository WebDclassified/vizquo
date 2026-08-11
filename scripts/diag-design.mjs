/**
 * Color + spacing diagnostic — samples a real website exactly like the
 * content-script scan and writes the full samples JSON for the engine test
 * to consume (colors, spacing, radius, shadows, gradients, typography).
 *
 * Usage: node scripts/diag-design.mjs https://example.com/ [out.json]
 */

import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'https://openrouter.ai/';
const OUT = process.argv[3] ?? '/tmp/vizquo-design-samples.json';

function sampler() {
  const SKIP = new Set([
    'SCRIPT',
    'STYLE',
    'LINK',
    'META',
    'TEMPLATE',
    'NOSCRIPT',
    'BASE',
    'TITLE',
    'HEAD',
  ]);
  const BUTTON_HINT = /(^|[-_])(btn|button)([-_]|$)/i;
  const isButton = (el, display) => {
    const tag = el.tagName;
    const role = el.getAttribute('role');
    if (tag === 'BUTTON') return true;
    if (role === 'button') return true;
    if (tag === 'A' && BUTTON_HINT.test(String(el.className))) return true;
    if (tag === 'INPUT') {
      const type = el.getAttribute('type') ?? 'text';
      return type === 'button' || type === 'submit' || type === 'reset';
    }
    return BUTTON_HINT.test(String(el.className)) && display !== 'contents';
  };
  const isLink = (el) => el.tagName === 'A' && el.hasAttribute('href');
  const isFormControl = (el) => ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName);
  const textLengthOf = (el) => {
    if (el.children.length > 0) return 0;
    return Math.min(200, (el.textContent ?? '').trim().length);
  };
  const out = [];
  const els = document.querySelectorAll('*');
  let textEls = 0;
  for (let i = 0; i < els.length && out.length < 4000; i++) {
    const el = els[i];
    if (!el || SKIP.has(el.tagName)) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const display = style.display;
    out.push({
      tag: el.tagName.toLowerCase(),
      classes: Array.from(el.classList).slice(0, 8),
      id: el.id || undefined,
      role: el.getAttribute('role') ?? undefined,
      textLength: textLengthOf(el),
      display,
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderTopWidth: style.borderTopWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      backgroundImage: style.backgroundImage,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
      margin: style.margin,
      padding: style.padding,
      gap: style.gap,
      opacity: style.opacity,
      isButton: isButton(el, display),
      isLink: isLink(el),
      isFormControl: isFormControl(el),
    });
    if (style.fontSize && textLengthOf(el) > 0) textEls++;
  }
  return { samples: out, total: els.length, textEls, title: document.title };
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  console.log(`Loading ${url} …`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => {
    console.log(`goto warn: ${e.message.split('\n')[0]}`);
  });
  await page.waitForTimeout(3000);
  console.log('final URL:', page.url());
  const result = await page.evaluate(sampler).catch((e) => {
    console.error('evaluate failed:', e.message);
    process.exit(1);
  });
  if (!result?.samples) {
    console.error('evaluate returned nothing useful:', JSON.stringify(result)?.slice(0, 300));
    process.exit(1);
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(
    `total DOM elements: ${result.total}\ntext elements: ${result.textEls}\nsamples: ${result.samples.length}\npage: ${result.title}\nwrote ${OUT}`,
  );
} finally {
  await browser.close();
}
