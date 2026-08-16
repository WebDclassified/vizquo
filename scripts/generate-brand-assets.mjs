/**
 * Brand asset generator — emits the complete V-Lens identity system.
 *
 * V-LENS CONCEPT — "See beyond the surface."
 * A bold geometric V (the instrument) whose mouth holds a precision lens ring
 * (the viewport). The V is the dominant silhouette at every size; the ring is
 * the detail discovered on a second look. One source of truth for the geometry
 * keeps every asset pixel-consistent.
 *
 * Outputs:
 *   public/brand/*.svg            — mark + lockup + wordmark variants
 *   landing/favicon.svg           — tile version (works on light + dark tabs)
 *   landing/apple-touch-icon.png  — 180px iOS home-screen icon (rendered)
 *
 * Run: `node scripts/generate-brand-assets.mjs`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BRAND_DIR = join(ROOT, 'public', 'brand');
const LANDING_DIR = join(ROOT, 'landing');

/* --------------------------------------------------------------------------
 * Geometry — canonical V-Lens (viewBox 0 0 128 128)
 * ------------------------------------------------------------------------ */

const WHITE = '#F5F5F7';
const BLACK = '#0B0B0D';
const ACCENT = '#7C5CFF';

/** The mark alone, in a given stroke color (and optional ring color). */
const mark = (color, ringColor = color) => `
  <g fill="none" stroke="${color}">
    <line x1="64" y1="118" x2="13" y2="18" stroke-width="26" stroke-linecap="round"/>
    <line x1="115" y1="18" x2="64" y2="118" stroke-width="26" stroke-linecap="round"/>
    <circle cx="64" cy="60" r="22" stroke="${ringColor}" stroke-width="6"/>
  </g>`;

const svg = (content, { width = '100%', viewBox = '0 0 128 128' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" viewBox="${viewBox}" fill="none">\n  <title>Vizquo — V-Lens</title>${content}\n</svg>\n`;

const FONT_STACK = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Lockup — mark in a 40px box + lowercase "vizquo" wordmark (viewBox 0 0 132 40). */
const lockup = (color, ringColor = color) => `
  <g transform="translate(0 0) scale(0.3125)">
    ${mark(color, ringColor)}
  </g>
  <text x="50" y="28.5" font-family="${FONT_STACK}" font-size="26" font-weight="700"
        letter-spacing="-0.9" fill="${color}">vizquo</text>`;

const wordmark = (color) =>
  `<text x="0" y="30" font-family="${FONT_STACK}" font-size="28" font-weight="700"
        letter-spacing="-1" fill="${color}">vizquo</text>`;

/** Tile version — rounded-square brand surface (also the favicon). */
const tile = `
  <rect x="2" y="2" width="124" height="124" rx="27" fill="#0B0B0D"/>
  <rect x="2.5" y="2.5" width="123" height="123" rx="26.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
  ${mark(WHITE)}`;

/* --------------------------------------------------------------------------
 * Emit SVG assets
 * ------------------------------------------------------------------------ */

mkdirSync(BRAND_DIR, { recursive: true });
mkdirSync(LANDING_DIR, { recursive: true });

const files = {
  'v-lens-mark.svg': svg(mark(WHITE)),
  'v-lens-mark-black.svg': svg(mark(BLACK)),
  'v-lens-mark-accent.svg': svg(mark(WHITE, ACCENT)),
  'vizquo-logo-horizontal.svg': svg(lockup(WHITE), { viewBox: '0 0 132 40' }),
  'vizquo-logo-horizontal-black.svg': svg(lockup(BLACK), { viewBox: '0 0 132 40' }),
  'vizquo-logo-horizontal-accent.svg': svg(lockup(WHITE, ACCENT), { viewBox: '0 0 132 40' }),
  'vizquo-wordmark.svg': svg(wordmark(WHITE), { viewBox: '0 0 118 40' }),
  'vizquo-wordmark-black.svg': svg(wordmark(BLACK), { viewBox: '0 0 118 40' }),
  'favicon.svg': svg(tile),
};

for (const [name, content] of Object.entries(files)) {
  const target = name === 'favicon.svg' ? LANDING_DIR : BRAND_DIR;
  writeFileSync(join(target, name), content);
  console.log(`wrote ${join(target, name)}`);
}

/* The PNG icon set (extension icons + apple-touch-icon) is derived from the
   user's standalone icon artwork by scripts/generate-icons.mjs. */
console.log('brand assets complete');
