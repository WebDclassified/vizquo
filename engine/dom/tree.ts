/**
 * DOM tree building (Section 7.17) — a bounded, shallow-first snapshot of the
 * page's element structure for the panel's tree view. Depth/nodes capped so a
 * 10k-node page never serializes fully (Section 4: never a synchronous
 * full-DOM walk; virtualization happens in the UI).
 */
import type { DomNode, DomTreeRequest, ElementRef } from '../../shared/types';
import { makeRef } from './ref';

const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_NODES = 1500;
const MAX_TEXT_NODE = 80;

/**
 * Style-based visibility check. Deliberately avoids `offsetParent` (which
 * forces a synchronous layout pass per node — O(n) layout thrash on huge
 * pages) and is budgeted: once the budget is spent the remaining nodes are
 * assumed visible, because the tree view caps at ~1500 nodes anyway and the
 * `visible` flag is a convenience hint, not an audit verdict.
 */
function isVisible(el: Element, budget: { visibilityBudget: number }): boolean {
  if (budget.visibilityBudget <= 0) return true;
  budget.visibilityBudget -= 1;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function textSnippet(node: Text): string | undefined {
  const text = node.textContent ?? '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_TEXT_NODE ? `${trimmed.slice(0, MAX_TEXT_NODE)}…` : trimmed;
}

interface BuildState {
  count: number;
  maxNodes: number;
  truncated: boolean;
  /** Remaining getComputedStyle budget for the `visible` hint (BUG-011). */
  visibilityBudget: number;
}

export function buildDomTree(
  root: Element | Document = document,
  options: DomTreeRequest = {},
): { nodes: DomNode[]; truncated: boolean } {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  // Bounded visibility hint: at most 250 computed styles per tree build.
  const state: BuildState = { count: 0, maxNodes, truncated: false, visibilityBudget: 250 };

  // nodeType check — `instanceof Document` fails across vm/global boundaries.
  const rootElement: Element =
    root.nodeType === Node.DOCUMENT_NODE ? (root as Document).documentElement : (root as Element);

  const walk = (el: Element, depth: number): DomNode | null => {
    if (state.count >= state.maxNodes) {
      state.truncated = true;
      return null;
    }
    state.count += 1;

    const children: DomNode[] = [];
    if (depth < maxDepth) {
      for (const child of el.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (state.count >= state.maxNodes) {
            state.truncated = true;
            break;
          }
          const node = walk(child as Element, depth + 1);
          if (node) children.push(node);
        } else if (child.nodeType === Node.TEXT_NODE) {
          const text = textSnippet(child as Text);
          if (text) {
            children.push({
              tagName: '#text',
              id: undefined,
              classes: [],
              isElement: false,
              nodeType: 'text',
              text,
              depth: depth + 1,
              childCount: 0,
              visible: true,
              children: [],
            });
          }
        }
      }
    }

    const ref: ElementRef = makeRef(el);
    const classes = Array.from(el.classList).slice(0, 8);
    const id = el.id || undefined;

    return {
      tagName: el.tagName.toLowerCase(),
      id,
      classes,
      isElement: true,
      nodeType: el.tagName.toLowerCase(),
      depth,
      childCount: el.children.length,
      visible: isVisible(el, state),
      ref,
      children,
    };
  };

  const top = walk(rootElement, 0);
  return { nodes: top ? [top] : [], truncated: state.truncated };
}
