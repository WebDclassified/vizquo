/**
 * SVG sanitization (Section 4: page content is untrusted input).
 *
 * Inline SVG extracted from an inspected page can carry event-handler
 * attributes (`onerror`, `onbegin`, `onload`, …). Shadow DOM provides style
 * and DOM encapsulation, but NOT script isolation — the HTML fragment parser
 * activates event-handler content attributes, so a hostile
 * `<image onerror=…>` or `<animate onbegin=…>` executes in whichever
 * document the shadow root lives in (here: the side panel, which holds
 * extension privileges). Verified against real Chromium: `animate-onbegin`,
 * `set-onbegin`, and `image-onerror` all fire from `shadow.innerHTML`.
 *
 * Every SVG string must therefore pass through `sanitizeSvgContent` before
 * it is assigned via innerHTML:
 *
 * - parsed with DOMParser (image/svg+xml) and re-serialized — never
 *   string-regex surgery on raw markup;
 * - dangerous elements removed: script, iframe, object, embed,
 *   foreignObject (can contain arbitrary HTML), and metadata/head-ish tags;
 * - every `on*` event-handler attribute stripped from every element;
 * - `javascript:` / `vbscript:` URLs stripped from href/xlink:href/src;
 * - fails closed: anything unparsable becomes '' (renders nothing).
 */
const DANGEROUS_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'FOREIGNOBJECT',
  'BASE',
  'META',
  'LINK',
]);

/**
 * True when a URL value resolves to a script scheme. URL parsing strips
 * ASCII tabs/newlines, so `java\nscript:alert(1)` is caught even though the
 * literal regex would miss it; malformed values are inert (not scripts).
 */
function isScriptUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  try {
    const protocol = new URL(v, 'https://vizquo.invalid').protocol.toLowerCase();
    return protocol === 'javascript:' || protocol === 'vbscript:';
  } catch {
    // Unparsable — cannot be a script scheme.
    return false;
  }
}

/** Strip event handlers + script URLs + dangerous elements from an SVG string. */
export function sanitizeSvgContent(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('<')) return '';

  let doc: Document;
  try {
    // image/svg+xml keeps elements in the SVG namespace and decodes entities
    // in attribute values (so `java&#x73;cript:` is caught by the regex).
    doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  } catch {
    return '';
  }

  const svg = doc.querySelector('svg');
  if (!svg) return '';

  // A parse error in XML mode produces a <parsererror> document — fail closed.
  if (doc.querySelector('parsererror')) return '';

  // The root <svg> itself is included — its own on* attributes (e.g. a
  // click handler on the preview) would otherwise survive the walk.
  const all = [svg, ...Array.from(svg.querySelectorAll('*'))];
  for (const el of all) {
    const tag = el.tagName.toUpperCase();
    if (DANGEROUS_TAGS.has(tag)) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      } // Any namespace prefix bound to the XLink namespace works (`xlink:href`,
      // `xl:href`, …) — match on the local name, not the literal prefix.
      const localName = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
      const hrefLike = localName === 'href' || localName === 'src' || localName === 'formaction';
      if (hrefLike && isScriptUrl(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }

  // The sanitized tree re-serialized — safe to assign via innerHTML.
  return svg.outerHTML;
}
