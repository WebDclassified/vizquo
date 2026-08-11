/**
 * SVG sanitizer tests — pins the P0 fix for script execution via page-owned
 * SVG rendered through shadow.innerHTML (verified in real Chromium:
 * `animate-onbegin`, `set-onbegin`, and `image-onerror` all fire).
 */
import { Window } from 'happy-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { sanitizeSvgContent } from '../engine/dom/svg';

beforeAll(() => {
  // The Node test environment has no DOMParser; happy-dom's implements the
  // same parse semantics the sanitizer relies on in the browser.
  (globalThis as Record<string, unknown>).DOMParser = new Window().DOMParser;
});

describe('sanitizeSvgContent', () => {
  it('keeps a plain SVG intact', () => {
    const out = sanitizeSvgContent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#635bff"/></svg>',
    );
    expect(out).toContain('<path');
    expect(out).toContain('#635bff');
    expect(out).toMatch(/^<svg/);
  });

  it('strips every event-handler attribute (onerror/onbegin/onload/onclick)', () => {
    const out = sanitizeSvgContent(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
        '<image href="x.png" onerror="alert(1)"/>' +
        '<animate attributeName="x" onbegin="alert(1)"/>' +
        '<set attributeName="y" onbegin="alert(1)"/>' +
        '<path onclick="alert(1)" d="M0 0"/>' +
        '</svg>',
    );
    expect(out).not.toMatch(/\son(load|error|begin|click|mouseover|focus|start|end|repeat)\s*=/i);
    expect(out).toContain('x.png');
    expect(out).toContain('<animate');
    expect(out).toContain('<path');
  });

  it('removes script, foreignObject, and script-URL hrefs (incl. encoded)', () => {
    const out = sanitizeSvgContent(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<script>alert(1)</script>' +
        '<a href="javascript:alert(1)"><text>hi</text></a>' +
        '<a xlink:href="java&#x73;cript:alert(1)"><text>decoded</text></a>' +
        '<foreignObject><img src="x" onerror="alert(1)"/></foreignObject>' +
        '</svg>',
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).not.toMatch(/\sonerror\s*=/i);
  });

  it('strips obfuscated and namespace-prefixed script URLs', () => {
    const out = sanitizeSvgContent(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        // `java&#x0A;script:` decodes to `java\nscript:` — URL parsing strips
        // the newline, so the href would resolve to a javascript: scheme.
        '<a href="java&#x0A;script:alert(1)"><text>nl</text></a>' +
        // Any prefix bound to the XLink namespace works, not just `xlink:`.
        '<a xl:href="javascript:alert(1)" xmlns:xl="http://www.w3.org/1999/xlink"><text>pfx</text></a>' +
        '</svg>',
    );
    expect(out).not.toMatch(/javascript/i);
  });

  it('fails closed on empty, garbage, and non-SVG input', () => {
    expect(sanitizeSvgContent('')).toBe('');
    expect(sanitizeSvgContent('   ')).toBe('');
    expect(sanitizeSvgContent(null)).toBe('');
    expect(sanitizeSvgContent(undefined)).toBe('');
    expect(sanitizeSvgContent('plain text, not svg')).toBe('');
    expect(sanitizeSvgContent('<div><p>html, not svg</p></div>')).toBe('');
    // Malformed XML → parse error → fail closed (nothing renders).
    expect(sanitizeSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><path></svg>')).toBe('');
  });
});
