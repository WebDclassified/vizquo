/**
 * Element HTML extraction (Section 7.17) — tag, attributes, ARIA, data-*,
 * serialized HTML with truncation so the side panel never holds megabytes of
 * markup. All extracted markup is treated as untrusted input (Section 4).
 */
import type { ElementHtmlInfo, ElementRef } from '../../shared/types';
import { makeRef } from './ref';

const MAX_OUTER_HTML = 20000;
const MAX_INNER_HTML = 50000;
const MAX_TEXT = 2000;

function truncate(value: string, max: number): { text: string; truncated: boolean } {
  if (value.length <= max) return { text: value, truncated: false };
  return {
    text: `${value.slice(0, max)}\n… truncated (${value.length - max} chars)`,
    truncated: true,
  };
}

function collectPrefixed(attrs: NamedNodeMap, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of attrs) {
    if (attr.name.startsWith(prefix)) {
      out[attr.name] = attr.value;
    }
  }
  return out;
}

export function extractElementHtml(el: Element, ref?: ElementRef): ElementHtmlInfo {
  const attributes: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (!attr.name.startsWith('aria-') && !attr.name.startsWith('data-')) {
      attributes[attr.name] = attr.value;
    }
  }

  const outer = truncate(el.outerHTML, MAX_OUTER_HTML);
  const inner = truncate(el.innerHTML, MAX_INNER_HTML);
  const text = truncate((el.textContent ?? '').replace(/\s+/g, ' ').trim(), MAX_TEXT);

  const effectiveRef = ref ?? makeRef(el);

  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: Array.from(el.classList),
    attributes,
    aria: collectPrefixed(el.attributes, 'aria-'),
    data: collectPrefixed(el.attributes, 'data-'),
    outerHTML: outer.text,
    outerHTMLTruncated: outer.truncated,
    innerHTML: inner.text,
    innerHTMLTruncated: inner.truncated,
    textContent: text.text,
    selector: effectiveRef.selector,
    xpath: effectiveRef.xpath,
    domPath: effectiveRef.domPath,
  };
}

/** Sanitize page-provided markup for display inside Vizquo's own UI. */
export function sanitizeForDisplay(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
