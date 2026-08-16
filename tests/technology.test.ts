// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { detectTechnologies } from '../engine/technology/detect';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-wf-page');
  document.documentElement.removeAttribute('data-wf-site');
});

describe('detectTechnologies (Section 7.14)', () => {
  it('detects React from data-reactroot and DOM markers', () => {
    document.body.innerHTML = '<div data-reactroot><button>Hi</button></div>';
    const tech = detectTechnologies(document);
    expect(tech.find((t) => t.name === 'React')).toMatchObject({
      category: 'frontend',
      confidence: 'detected',
    });
  });

  it('detects Next.js from #__NEXT_DATA__ and marks React probable (React 18 has no data-reactroot)', () => {
    document.body.innerHTML = '<script id="__NEXT_DATA__" type="application/json">{}</script>';
    const tech = detectTechnologies(document);
    expect(tech.find((t) => t.name === 'Next.js')?.confidence).toBe('detected');
    expect(tech.find((t) => t.name === 'React')?.confidence).toBe('probable');
  });

  it('detects Vue from data-v- scoped-style attributes', () => {
    document.body.innerHTML = '<div data-v-abc123><p>hi</p></div>';
    expect(detectTechnologies(document).find((t) => t.name === 'Vue')?.confidence).toBe('detected');
  });

  it('detects Angular from ng-version', () => {
    document.body.innerHTML = '<app-root ng-version="17.0.0"><p>x</p></app-root>';
    expect(detectTechnologies(document).find((t) => t.name === 'Angular')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Tailwind from its stylesheet and marks probable on classes alone', () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css">';
    document.body.innerHTML =
      '<div class="flex items-center justify-between p-4 mx-auto text-center"><span>a</span><span>b</span><span>c</span></div>';
    const tech = detectTechnologies(document);
    expect(tech.find((t) => t.name === 'Tailwind CSS')?.confidence).toBe('detected');
  });

  it('labels class-only heuristics as probable, not detected', () => {
    document.body.innerHTML =
      '<div class="flex p-4 mt-2 mb-3 text-xl bg-white w-full h-10"><span>a</span></div>';
    const tech = detectTechnologies(document);
    expect(tech.find((t) => t.name === 'Tailwind CSS')?.confidence).toBe('probable');
  });

  it('detects jQuery, GSAP, and Three.js from script srcs', () => {
    document.head.innerHTML = `
      <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    `;
    const tech = detectTechnologies(document);
    expect(tech.find((t) => t.name === 'jQuery')?.confidence).toBe('detected');
    expect(tech.find((t) => t.name === 'GSAP')?.confidence).toBe('detected');
    expect(tech.find((t) => t.name === 'Three.js')?.confidence).toBe('detected');
  });

  it('detects WordPress from wp-content assets', () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="https://x.com/wp-content/themes/theme/style.css">';
    expect(detectTechnologies(document).find((t) => t.name === 'WordPress')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Shopify from its CDN', () => {
    document.head.innerHTML =
      '<script src="https://cdn.shopify.com/s/files/1/0000/main.js"></script>';
    expect(detectTechnologies(document).find((t) => t.name === 'Shopify')?.confidence).toBe(
      'detected',
    );
  });

  it('returns an empty stack for plain HTML (never fabricated)', () => {
    document.body.innerHTML = '<main><h1>Plain</h1><p>No framework.</p></main>';
    expect(detectTechnologies(document)).toHaveLength(0);
  });

  it('detects a Svelte component via data-svelte-h', () => {
    document.body.innerHTML = '<div data-svelte-h="abc123"><p>hi</p></div>';
    expect(detectTechnologies(document).find((t) => t.name === 'Svelte')?.confidence).toBe(
      'detected',
    );
  });

  it('does not flag a PWA manifest script as Remix', () => {
    document.head.innerHTML =
      '<script src="/manifest.webmanifest"></script><script src="/manifest-123.js"></script>';
    expect(detectTechnologies(document).find((t) => t.name === 'Remix')).toBeUndefined();
  });

  it('detects Vite from the dev client or /src module scripts', () => {
    document.head.innerHTML = '<script type="module" src="/@vite/client"></script>';
    expect(detectTechnologies(document).find((t) => t.name === 'Vite')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Next.js App Router from _next/static chunks', () => {
    document.body.innerHTML = '<script src="/_next/static/chunks/main-abc123.js" async></script>';
    expect(detectTechnologies(document).find((t) => t.name === 'Next.js')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Gatsby from its root node', () => {
    document.body.innerHTML = '<div id="___gatsby"><div>content</div></div>';
    expect(detectTechnologies(document).find((t) => t.name === 'Gatsby')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Webflow from its data attributes', () => {
    document.documentElement.setAttribute('data-wf-page', 'abc');
    document.body.innerHTML = '<script src="https://assets.webflow.com/js/webflow.js"></script>';
    expect(detectTechnologies(document).find((t) => t.name === 'Webflow')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Squarespace from its static CDN', () => {
    document.head.innerHTML =
      '<script src="https://static1.squarespace.com/static/ta/abc/0/scripts/script.js"></script>';
    expect(detectTechnologies(document).find((t) => t.name === 'Squarespace')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Emotion from data-emotion style tags', () => {
    document.head.innerHTML = '<style data-emotion="css">.css-abc123{color:red}</style>';
    expect(detectTechnologies(document).find((t) => t.name === 'Emotion')?.confidence).toBe(
      'detected',
    );
  });

  it('detects styled-components from data-styled style tags', () => {
    document.head.innerHTML = '<style data-styled="true">.sc-bd1{color:red}</style>';
    expect(
      detectTechnologies(document).find((t) => t.name === 'styled-components')?.confidence,
    ).toBe('detected');
  });

  it('detects Docusaurus from its assets', () => {
    document.head.innerHTML = '<script src="/assets/js/docusaurus.abc.min.js"></script>';
    expect(detectTechnologies(document).find((t) => t.name === 'Docusaurus')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Preact from its script', () => {
    document.head.innerHTML = '<script src="/assets/preact.abc.js"></script>';
    expect(detectTechnologies(document).find((t) => t.name === 'Preact')?.confidence).toBe(
      'detected',
    );
  });

  it('detects Sass from .scss stylesheets', () => {
    document.head.innerHTML = '<link rel="stylesheet" href="/assets/main.scss">';
    expect(detectTechnologies(document).find((t) => t.name === 'Sass / SCSS')?.confidence).toBe(
      'detected',
    );
  });

  it('still returns an empty stack for plain HTML after the marker additions', () => {
    document.body.innerHTML = '<main><h1>Plain</h1><p>No framework.</p></main>';
    expect(detectTechnologies(document)).toHaveLength(0);
  });
});
