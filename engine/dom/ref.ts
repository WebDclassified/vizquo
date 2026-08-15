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

/** 1-based index of the element among its same-tag siblings. */
function nthOfTypeIndex(el: Element): number {
  const tag = el.tagName;
  let index = 1;
  const parent = el.parentElement;
  if (!parent) return index;
  for (let i = 0; i < parent.children.length; i += 1) {
    const sibling = parent.children[i];
    if (!sibling) continue;
    if (sibling === el) return index;
    if (sibling.tagName === tag) index += 1;
  }
  return index;
}

/** True when a sibling shares the element's tag AND its exact class string
 *  (the cheapest reliable collision signal — identical siblings). */
function hasIdenticalSibling(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  const tag = el.tagName;
  const className = el.className;
  // Iterate the live HTMLCollection directly (no Array.from copy — huge
  // parents are exactly the pages where this must stay cheap) and stop at
  // the first match (identical siblings cluster together in practice).
  for (let i = 0; i < parent.children.length; i += 1) {
    const sibling = parent.children[i];
    if (!sibling || sibling === el) continue;
    if (sibling.tagName === tag && sibling.className === className) return true;
  }
  return false;
}

/**
 * Build a CSS selector for the element — short when the document allows,
 * UNIQUE always. An ambiguous selector (e.g. `#list > div.card` matching
 * every card) silently resolves to the wrong element on re-resolution, which
 * is worse than a longer one; identical siblings therefore disambiguate
 * positionally (cheap, local), and a rare identical-ancestor collision falls
 * back to a document query that climbs from the leaf until unique.
 */
export function buildSelector(el: Element): string {
  const first = localSelector(el);
  // A unique id is globally unique — ancestors would be redundant noise.
  if (first.startsWith('#')) return first;
  const steps: { part: string; node: Element }[] = [{ part: first, node: el }];
  let node: Element | null = el.parentElement;
  while (node && steps.length < MAX_SELECTOR_CHAIN) {
    const tag = node.tagName.toLowerCase();
    // html/body are implied by the document; stop the chain at them.
    if (tag === 'html' || tag === 'body') break;
    const part = localSelector(node);
    steps.unshift({ part, node });
    if (part.startsWith('#')) break;
    node = node.parentElement;
  }

  // Identical-sibling collision: make the leaf positional — no document
  // query, so huge flat DOMs (250k rows) cost nothing extra per sample.
  const leaf = steps[steps.length - 1];
  if (leaf && !leaf.part.startsWith('#') && hasIdenticalSibling(leaf.node)) {
    steps[steps.length - 1] = {
      part: `${leaf.node.tagName.toLowerCase()}:nth-of-type(${nthOfTypeIndex(leaf.node)})`,
      node: leaf.node,
    };
  }

  let selector = steps.map((s) => s.part).join(' > ');

  // Rare identical-ANCESTOR collision (two same-structured subtrees): only a
  // document query can prove it. Skip when every part is already positional
  // or id-anchored — such chains are unique by construction. The scan cost is
  // acceptable here because this path runs only on structured (non-flat) DOMs.
  const needsQuery = steps.some((s) => !s.part.startsWith('#') && !s.part.includes(':nth-of-type'));
  if (needsQuery) {
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      if (document.querySelectorAll(selector).length <= 1) break;
      const step = steps[i];
      if (!step || step.part.startsWith('#') || step.part.includes(':nth-of-type')) continue;
      steps[i] = {
        part: `${step.node.tagName.toLowerCase()}:nth-of-type(${nthOfTypeIndex(step.node)})`,
        node: step.node,
      };
      selector = steps.map((s) => s.part).join(' > ');
    }
  }
  return selector;
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

/**
 * Resolve an ElementRef back to a live element — WITHOUT silently selecting a
 * different element (master spec §6). The domPath is the primary identity;
 * before returning it, the element at that path must still match the stored
 * selector (a cheap element-vs-selector test, no document walk). When the
 * DOM shifted and the path now lands on a different element, the selector is
 * tried instead — and it is only accepted when IT lands on the element at
 * the stored path. If the two disagree, the identity is genuinely ambiguous
 * and null (STALE) is returned rather than a wrong element.
 */
export function resolveRef(ref: ElementRef): Element | null {
  if (ref.domPath.length > 0) {
    const viaPath = resolveDomPath(ref.domPath);
    if (viaPath) {
      if (ref.selector) {
        try {
          // Element-to-selector test only — O(selector), not a document scan.
          if (viaPath.matches(ref.selector)) return viaPath;
        } catch {
          // Unparsable selector — the path is the best identity we have.
          return viaPath;
        }
        // The path element no longer matches the selector: the DOM moved it
        // or replaced it. Accept the selector's element only when it sits at
        // the stored path (same identity, updated class chain); otherwise the
        // identity is ambiguous — surface STALE instead of a wrong element.
        try {
          const viaSelector = document.querySelector(ref.selector);
          if (viaSelector && buildDomPath(viaSelector).join() === ref.domPath.join()) {
            return viaSelector;
          }
        } catch {
          // Unparsable selector — fall through to null (no safe identity).
        }
        return null;
      }
      return viaPath;
    }
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
