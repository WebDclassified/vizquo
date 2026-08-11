// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { computePageFingerprint } from '../engine/scan/fingerprint';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  window.location.href = 'https://example.com/test';
  document.title = 'Test page';
  const happyDom = (
    window as unknown as { happyDOM?: { settings?: { disableCSSFileLoading?: boolean } } }
  ).happyDOM;
  if (happyDom?.settings) happyDom.settings.disableCSSFileLoading = true;
});

describe('computePageFingerprint (L3 cache key, Section 2.3)', () => {
  it('is stable for an unchanged page', () => {
    document.body.innerHTML = '<div class="card"><p>Hello</p></div>';
    const first = computePageFingerprint(document);
    const second = computePageFingerprint(document);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}$/);
  });

  it('changes when the styles change', () => {
    const before = computePageFingerprint(document);
    const style = document.createElement('style');
    style.textContent = '.card { border-radius: 8px; }';
    document.head.appendChild(style);
    expect(computePageFingerprint(document)).not.toBe(before);
  });

  it('changes when the structure changes', () => {
    const before = computePageFingerprint(document);
    const div = document.createElement('div');
    div.innerHTML = '<button>Go</button>';
    document.body.appendChild(div);
    expect(computePageFingerprint(document)).not.toBe(before);
  });

  it('changes when the title changes', () => {
    const before = computePageFingerprint(document);
    document.title = 'Renamed page';
    expect(computePageFingerprint(document)).not.toBe(before);
  });

  it('is cheap: bounded stylesheet sampling on a large page', () => {
    document.head.innerHTML = '';
    for (let i = 0; i < 30; i += 1) {
      const style = document.createElement('style');
      style.textContent = `.s${i} { color: #${(0x111111 + i).toString(16).padStart(6, '0')}; }`;
      document.head.appendChild(style);
    }
    // Should not throw and stay a fixed-length hash.
    expect(computePageFingerprint(document)).toMatch(/^[0-9a-f]{8}$/);
  });
});
