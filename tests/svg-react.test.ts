import { describe, expect, it } from 'vitest';
import { svgToReact } from '../export/svg-react';

describe('svgToReact (Section 7.10 SVG → React component)', () => {
  it('converts camelCase attributes and class → className', () => {
    const out = svgToReact(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon" fill="none" stroke-width="2"><path d="M0 0h24v24H0z"/></svg>',
    );
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('className="icon"');
    expect(out).toContain('strokeWidth="2"');
    expect(out).not.toContain('xmlns');
    expect(out).not.toContain('stroke-width');
    expect(out).toMatch(/export function Icon\(props\)/);
  });

  it('self-closes presentational elements', () => {
    const out = svgToReact('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>');
    expect(out).toContain('<circle cx="5" cy="5" r="5" />');
    expect(out).not.toContain('</circle>');
  });

  it('converts style strings into React style objects', () => {
    const out = svgToReact(
      '<svg viewBox="0 0 10 10"><rect style="fill: red; stroke-width: 2"/></svg>',
    );
    expect(out).toContain('style={{ "fill": "red", "strokeWidth": "2" }}');
  });

  it('preserves already-escaped text content without double-escaping', () => {
    const out = svgToReact('<svg viewBox="0 0 10 10"><text>Hello &amp; world</text></svg>');
    expect(out).toContain('Hello &amp; world');
    expect(out).not.toContain('&amp;amp;');
  });

  it('emits attribute entities verbatim (JSX uses the same escaping)', () => {
    const out = svgToReact('<svg viewBox="0 0 10 10"><path fill="url(#a&quot;b)"/></svg>');
    expect(out).toContain('url(#a&quot;b)');
    expect(out).not.toContain('&amp;amp;');
  });

  it('keeps value attributes like fill-rule intact (not bare boolean props)', () => {
    const out = svgToReact(
      '<svg viewBox="0 0 10 10"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 0h1v1H0z"/></svg>',
    );
    expect(out).toContain('fillRule="evenodd"');
    expect(out).toContain('clipRule="evenodd"');
  });

  it('throws on non-SVG input', () => {
    expect(() => svgToReact('<div>nope</div>')).toThrow(/not an <svg>/);
  });

  it('rejects malformed (unclosed) documents', () => {
    expect(() => svgToReact('<svg viewBox="0 0 1 1"><path d="M0"/></svg>')).not.toThrow();
    expect(() => svgToReact('<svg><g></svg>')).toThrow(/Could not parse/);
  });
});
