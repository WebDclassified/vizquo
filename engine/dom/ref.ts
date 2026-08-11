/**
 * ElementRef generation — the stable handle used to address any element on the
 * inspected page across content script, side panel, and storage (Section 3).
 *
 * Strategy per field:
 * - selector: a concise, human-readable CSS selector. Prefer `#id`, then a
 *   short tag.class chain, falling back to tag:nth-of-type(n) when the element
 *   has no id/classes of its own. Never synthesizes brittle attribute hacks.
 * - xpath: absolute XPath built from tag positions (works for document.evaluate
 *   in the content script and matches what DevTools shows).
 * - domPath: child indices from the root element down to the target — the
 *   cheapest form to resolve repeatedly during one inspection session.
 */
import type { ElementRef } from '../../shared/types';

const MAX_SELECTOR_CHAIN = 8;

/** Short, safe class names only (ignores mangled/duplicated/host classes). */
function classPart(el: Element): string | null {
  const classes = Array.from(el.classList).filter(
    (c) => c.length > 0 && c.length <= 32 && !c.startsWith('_') && !c.includes(':'),
  );
  if (classes.length === 0) return null;
  return classes.slice(0, 2).join('.');
}

/** Escape a CSS identifier for use inside a selector. */
export function escapeCssIdent(name: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) return name;
  // Escape each char that is not a valid identifier character.
  let out = '';
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      ch === '-' ||
      ch === '_' ||
      code > 0x7f
    ) {
      out += ch;
    } else {
      out += `\\${code.toString(16)} `;
    }
  }
  return out;
}

/** Local selector for one element (never climbs ancestors). */
function localSelector(el: Element): string {
  const id = el.id;
  if (
    id &&
    /^[a-zA-Z_][\w.-]*$/.test(id) &&
    document.querySelectorAll(`#${escapeCssIdent(id)}`).length <= 1
  ) {
    return `#${escapeCssIdent(id)}`;
  }
  const tag = el.tagName.toLowerCase();
  const klass = classPart(el);
  if (klass) return `${tag}.${klass}`;
  // Positional fallback within its parent.
  const parent: HTMLElement | null = el.parentElement;
  if (parent) {
    let index = 1;
    for (const sibling of parent.children) {
      if (sibling === el) return `${tag}:nth-of-type(${index})`;
      if (sibling.tagName === el.tagName) index += 1;
    }
  }
  return tag;
}

/** Build a CSS selector for the element (short, unique enough for the panel). */
export function buildSelector(el: Element): string {
  const first = localSelector(el);
  // A unique id is globally unique — ancestors would be redundant noise.
  if (first.startsWith('#')) return first;
  const parts = [first];
  let node: Element | null = el.parentElement;
  while (node && parts.length < MAX_SELECTOR_CHAIN) {
    const tag = node.tagName.toLowerCase();
    // html/body are implied by the document; stop the chain at them.
    if (tag === 'html' || tag === 'body') break;
    const part = localSelector(node);
    parts.unshift(part);
    if (part.startsWith('#')) break;
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** Absolute XPath via tag-name positions (matches DevTools copy-XPath). */
export function buildXPath(el: Element): string {
  const parts: string[] = [];
  let node: Node | null = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const parent: Node | null = node.parentNode;
    if (parent?.nodeType !== Node.ELEMENT_NODE) {
      // Reached the document node — anchor the path at the root element.
      parts.unshift('html');
      break;
    }
    const elNode = node as Element;
    let index = 1;
    for (const sibling of parent.childNodes) {
      if (sibling === node) break;
      if (
        sibling.nodeType === Node.ELEMENT_NODE &&
        (sibling as Element).tagName === elNode.tagName
      ) {
        index += 1;
      }
    }
    const tag = elNode.tagName.toLowerCase();
    parts.unshift(index > 1 ? `${tag}[${index}]` : tag);
    node = parent;
  }
  return `/${parts.join('/')}`;
}

/** Child-index path from documentElement down to the element. */
export function buildDomPath(el: Element): number[] {
  const path: number[] = [];
  let node: Element | null = el;
  while (node?.parentElement && node.parentElement !== node) {
    const parent: Element | null = node.parentElement;
    let index = 0;
    for (let i = 0; i < parent.children.length; i += 1) {
      if (parent.children[i] === node) {
        index = i;
        break;
      }
    }
    path.unshift(index);
    node = parent;
  }
  return path;
}

/** Resolve a domPath back to a live element (cheap, session-local). */
export function resolveDomPath(path: number[]): Element | null {
  let node: Element = document.documentElement;
  for (const index of path) {
    const child = node.children[index];
    if (!child) return null;
    node = child;
  }
  return node;
}

/** Resolve an ElementRef back to a live element. */
export function resolveRef(ref: ElementRef): Element | null {
  if (ref.domPath.length > 0) {
    const viaPath = resolveDomPath(ref.domPath);
    if (viaPath) return viaPath;
  }
  try {
    return document.querySelector(ref.selector);
  } catch {
    return null;
  }
}

export function makeRef(el: Element): ElementRef {
  return {
    selector: buildSelector(el),
    xpath: buildXPath(el),
    domPath: buildDomPath(el),
  };
}
