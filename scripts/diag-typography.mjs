/**
 * Typography diagnostic — samples a real website exactly like the content
 * script scan (same walk, same computed-style fields) and writes the samples
 * to /tmp/vizquo-typography-samples.json for the engine test to consume.
 *
 * Usage: node scripts/diag-typography.mjs https://openrouter.ai/
 */

import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'https://openrouter.ai/';
const OUT = '/tmp/vizquo-typography-samples.json';

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
      textLength: textLengthOf(el),
      display,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
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
    console.log(`goto error: ${e.message.split('\n')[0]}`);
  });
  await page.waitForTimeout(3000);
  console.log('final URL:', page.url());
  const title = await page.title().catch(() => '?');
  console.log('title:', title);
  const body = await page
    .evaluate(() => document.body?.innerText?.slice(0, 120) ?? '(no body)')
    .catch(() => '(eval failed)');
  console.log('body preview:', JSON.stringify(body));
  await page.waitForTimeout(1000);
  const result = await page.evaluate(sampler).catch((e) => {
    console.error('evaluate failed:', e.message);
    process.exit(1);
  });
  if (!result?.samples) {
    console.error('evaluate returned nothing useful:', JSON.stringify(result)?.slice(0, 600));
    process.exit(1);
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(
    `total DOM elements: ${result.total}\ntext elements: ${result.textEls}\nsamples: ${result.samples.length}\npage: ${result.title}\nwrote ${OUT}`,
  );
} finally {
  await browser.close();
}
