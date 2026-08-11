// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { detectTechnologies } from '../engine/technology/detect';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
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

  it('detects Next.js from #__NEXT_DATA__', () => {
    document.body.innerHTML = '<script id="__NEXT_DATA__" type="application/json">{}</script>';
    const tech = detectTechnologies(document);
    expect(tech.find((t) => t.name === 'Next.js')?.confidence).toBe('detected');
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
});
