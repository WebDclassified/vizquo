/**
 * Selector specificity computation (Section 7.5).
 *
 * css-tree v3 no longer ships a `specificity` helper, so we compute the
 * standard (inline, id, class, type) tuple ourselves from the selector AST.
 * Handles the modern pseudo-classes correctly: `:where()` contributes 0,
 * `:is()`/`:not()`/`:has()` contribute the maximum of their arguments, and
 * `:nth-child(of S)` contributes S's maximum — collapsing class+type counts
 * silently mis-orders cascades, so the full 4-tuple is used throughout.
 */
import { type CssNode, parse } from 'css-tree';

export type Specificity = [number, number, number, number];

function isGreaterOrEqual(a: Specificity, b: Specificity): boolean {
  for (let i = 0; i < 4; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return true;
}

function childrenOf(node: CssNode): CssNode[] {
  const children = node.children;
  return children ? children.toArray() : [];
}

function addSpecificity(a: Specificity, b: Specificity): Specificity {
  return [
    (a[0] ?? 0) + (b[0] ?? 0),
    (a[1] ?? 0) + (b[1] ?? 0),
    (a[2] ?? 0) + (b[2] ?? 0),
    (a[3] ?? 0) + (b[3] ?? 0),
  ];
}

/** Max specificity of a selector-list node (for :is()/:not()/:has()). */
function maxOfSelectorList(node: CssNode): Specificity {
  let max: Specificity = [0, 0, 0, 0];
  for (const child of childrenOf(node)) {
    const spec = ofSelector(child);
    if (isGreaterOrEqual(spec, max)) max = spec;
  }
  return max;
}

/** Specificity contribution of one top-level selector part. */
function ofNode(node: CssNode): Specificity {
  switch (node.type) {
    case 'IdSelector':
      return [0, 1, 0, 0];
    case 'ClassSelector':
    case 'AttributeSelector':
      return [0, 0, 1, 0];
    case 'TypeSelector':
    case 'PseudoElementSelector':
      return [0, 0, 0, 1];
    case 'PseudoClassSelector': {
      const name = (node as { name?: string }).name ?? '';
      if (name === 'where') return [0, 0, 0, 0];
      // css-tree v3 stores the arguments of :is()/:not()/:has()/:matches() in
      // the pseudo's `children` as a SelectorList; :nth-child(of S) keeps S
      // inside an Nth node. See engine/css/specificity.ts tests.
      if (name === 'is' || name === 'not' || name === 'has' || name === 'matches') {
        return maxOfPseudoChildren(node);
      }
      if (name === 'nth-child' || name === 'nth-last-child') {
        const inner = nthOfSelector(node);
        if (inner) {
          inner[2] += 1;
          return inner;
        }
      }
      return [0, 0, 1, 0];
    }
    default:
      return [0, 0, 0, 0];
  }
}

/** Max specificity among the argument shapes css-tree may nest under a pseudo. */
function maxOfPseudoChildren(node: CssNode): Specificity {
  let max: Specificity = [0, 0, 0, 0];
  for (const child of childrenOf(node)) {
    let candidate: Specificity;
    if (child.type === 'SelectorList') {
      candidate = maxOfSelectorList(child);
    } else if (child.type === 'Selector') {
      candidate = ofSelector(child);
    } else {
      candidate = [0, 0, 0, 0];
    }
    if (isGreaterOrEqual(candidate, max)) max = candidate;
  }
  return max;
}

/** The `of S` selector of :nth-child(An+B of S), when present. */
function nthOfSelector(node: CssNode): Specificity | null {
  for (const child of childrenOf(node)) {
    if (child.type === 'Nth') {
      const selector = (child as CssNode & { selector?: CssNode }).selector;
      return selector ? maxOfSelectorList(selector) : null;
    }
  }
  return null;
}

/** Specificity of one Selector node — iterates top-level parts only. */
function ofSelector(node: CssNode): Specificity {
  let result: Specificity = [0, 0, 0, 0];
  for (const child of childrenOf(node)) {
    result = addSpecificity(result, ofNode(child));
  }
  return result;
}

/**
 * Compute the specificity of a selector (or selector list — the maximum of
 * its selectors is returned, matching how `el.matches(list)` behaves).
 */
export function selectorSpecificity(selectorText: string): Specificity {
  try {
    const ast = parse(selectorText, { context: 'selectorList' });
    return maxOfSelectorList(ast);
  } catch {
    return [0, 0, 0, 0];
  }
}

export function specificityToLabel(spec: Specificity): string {
  return `(${spec[0]}, ${spec[1]}, ${spec[2]}, ${spec[3]})`;
}

/** Compare two specificities — positive when a wins, 0 on tie. */
export function compareSpecificity(a: Specificity, b: Specificity): number {
  for (let i = 0; i < 4; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}
