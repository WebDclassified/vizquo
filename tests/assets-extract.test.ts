// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { backgroundUrls, extractAssets, parseSrcset, summarizeSvg } from '../engine/assets/extract';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  window.location.href = 'https://example.com/test';
});

describe('backgroundUrls', () => {
  it('parses url() tokens out of computed background-image values', () => {
    expect(backgroundUrls('url("https://x.com/a.png")')).toEqual(['https://x.com/a.png']);
    expect(backgroundUrls("url('/rel/b.jpg')")).toEqual(['/rel/b.jpg']);
    expect(backgroundUrls('linear-gradient(red, blue), url(hero.png)')).toEqual(['hero.png']);
  });

  it('skips data: URIs (not fetchable assets)', () => {
    expect(backgroundUrls('url(data:image/png;base64,AAAA)')).toEqual([]);
  });
});

describe('parseSrcset', () => {
  it('returns absolute deduped candidate URLs', () => {
    const out = parseSrcset('a.png 1x, b.png 2x, a.png 1x', 'https://example.com/test');
    expect(out).toEqual(['https://example.com/a.png', 'https://example.com/b.png']);
  });

  it('skips malformed candidates', () => {
    expect(parseSrcset(',,,', 'https://example.com/')).toEqual([]);
  });
});

describe('extractAssets (Section 7.10)', () => {
  it('extracts <img> with natural/rendered dims, alt, lazy state, srcset', () => {
    document.body.innerHTML = `
      <img src="hero.png" alt="Hero" loading="lazy" srcset="hero-2x.png 2x" width="400" height="300" />
    `;
    const { assets } = extractAssets();
    const img = assets.find((a) => a.type === 'image');
    expect(img).toBeDefined();
    expect(img!.url).toBe('https://example.com/hero.png');
    expect(img!.alt).toBe('Hero');
    expect(img!.loading).toBe('lazy');
    expect(img!.srcset).toContain('https://example.com/hero-2x.png');
    expect(img!.ref).toBeDefined();
    expect(img!.renderedDims).toBeDefined();
  });

  it('extracts <picture>/<source> candidates', () => {
    document.body.innerHTML = `
      <picture>
        <source srcset="wide.webp 1x, wide-2x.webp 2x" type="image/webp" />
        <img src="wide.jpg" alt="Wide" />
      </picture>
    `;
    const { assets } = extractAssets();
    const sources = assets.filter((a) => a.source === 'picture');
    expect(sources.map((s) => s.url)).toContain('https://example.com/wide.webp');
    expect(sources.map((s) => s.url)).toContain('https://example.com/wide-2x.webp');
  });

  it('summarizes inline SVGs (viewBox, path count, fills, ids)', () => {
    document.body.innerHTML = `
      <svg id="icon" viewBox="0 0 24 24">
        <path id="p1" fill="#635bff" d="M0 0h24v24H0z" />
        <circle id="c1" stroke="none" fill="#111111" cx="12" cy="12" r="4" />
      </svg>
    `;
    const { assets } = extractAssets();
    const svg = assets.find((a) => a.type === 'svg');
    expect(svg).toBeDefined();
    expect(svg!.source).toBe('inline-svg');
    expect(svg!.svg?.viewBox).toBe('0 0 24 24');
    expect(svg!.svg?.pathCount).toBe(1);
    expect(svg!.svg?.fillColors).toContain('#635bff');
    expect(svg!.svg?.ids).toEqual(['p1', 'c1']);
    expect(svg!.svg?.content).toContain('<svg');
  });

  it('base64-encodes non-Latin1 SVG content without throwing (btoa limit)', () => {
    document.body.innerHTML = `<svg><text>Héllo — 你好 🎨</text></svg>`;
    const { assets } = extractAssets();
    const svg = assets.find((a) => a.type === 'svg');
    expect(svg).toBeDefined();
    expect(svg!.url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    // Round-trips through atob → TextDecoder, so the unicode text survives.
    const binary = atob(svg!.url.slice('data:image/svg+xml;base64,'.length));
    const decoded = new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
    expect(decoded).toContain('你好');
  });

  it('tracks external <use> sprite hrefs, not #fragment refs', () => {
    document.body.innerHTML = `
      <svg><use href="#local-icon" /></svg>
      <svg><use href="/icons.svg#external" /></svg>
    `;
    const { assets } = extractAssets();
    const sprites = assets.filter((a) => a.source === 'svg-use');
    expect(sprites).toHaveLength(1);
    expect(sprites[0]!.url).toBe('https://example.com/icons.svg');
  });

  it('extracts video, audio, posters, lottie, favicon, and og:image', () => {
    document.head.innerHTML = `
      <link rel="icon" href="/favicon.ico" />
      <meta property="og:image" content="/og.png" />
    `;
    document.body.innerHTML = `
      <video src="clip.mp4" poster="poster.jpg"></video>
      <audio src="track.mp3"></audio>
      <lottie-player src="/anim.json"></lottie-player>
    `;
    const { assets } = extractAssets();
    expect(assets.some((a) => a.source === 'favicon' && a.url.endsWith('/favicon.ico'))).toBe(true);
    expect(assets.some((a) => a.source === 'og-image' && a.url.endsWith('/og.png'))).toBe(true);
    expect(assets.some((a) => a.source === 'video' && a.url.endsWith('/clip.mp4'))).toBe(true);
    expect(assets.some((a) => a.source === 'video' && a.url.endsWith('/poster.jpg'))).toBe(true);
    expect(assets.some((a) => a.source === 'audio' && a.url.endsWith('/track.mp3'))).toBe(true);
    expect(assets.some((a) => a.source === 'lottie' && a.url.endsWith('/anim.json'))).toBe(true);
  });

  it('reads CSS backgrounds from the scan samples (no second getComputedStyle pass)', () => {
    document.body.innerHTML = '<div class="bg">x</div>';
    const { assets } = extractAssets(document, {
      backgroundSamples: [
        {
          backgroundImage: 'url(/bg-1.jpg), url(/bg-2.jpg)',
          ref: { selector: '.bg', xpath: '/html/body/div[1]', domPath: [1, 1] },
        },
      ],
    });
    const backgrounds = assets.filter((a) => a.source === 'css-background');
    expect(backgrounds.map((b) => b.url)).toEqual([
      'https://example.com/bg-1.jpg',
      'https://example.com/bg-2.jpg',
    ]);
  });

  it('dedupes identical absolute URLs across sources', () => {
    document.body.innerHTML = '<img src="hero.png" />';
    const { assets } = extractAssets(document, {
      backgroundSamples: [
        {
          backgroundImage: 'url(/hero.png)',
          ref: { selector: 'body', xpath: '/html/body', domPath: [1] },
        },
      ],
    });
    const hero = assets.filter((a) => a.url.endsWith('/hero.png'));
    expect(hero).toHaveLength(1);
  });
});

describe('summarizeSvg bounds', () => {
  it('caps collected fill colors at MAX_SVG_COLLECT', () => {
    document.body.innerHTML = `<svg>${Array.from(
      { length: 60 },
      (_, i) => `<circle fill="#${(i % 10).toString(16).repeat(6)}" cx="${i}" cy="1" r="1"/>`,
    ).join('')}</svg>`;
    const svg = document.querySelector('svg')!;
    const summary = summarizeSvg(svg);
    expect(summary.fillColors.length).toBeLessThanOrEqual(40);
  });
});
