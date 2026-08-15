// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSelector, buildXPath, makeRef, resolveDomPath, resolveRef } from '../engine/dom/ref';
import { buildDomTree } from '../engine/dom/tree';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('ElementRef generation', () => {
  it('prefers ids for selectors', () => {
    document.body.innerHTML = '<button id="submit" class="btn">Go</button>';
    const el = document.getElementById('submit')!;
    expect(buildSelector(el)).toBe('#submit');
  });

  it('falls back to tag.class then positional selectors (chain stops at body)', () => {
    document.body.innerHTML = '<ul><li>A</li><li>B</li></ul>';
    const first = document.querySelectorAll('li')[0]!;
    const second = document.querySelectorAll('li')[1]!;
    expect(buildSelector(first)).toBe('ul:nth-of-type(1) > li:nth-of-type(1)');
    expect(buildSelector(second)).toBe('ul:nth-of-type(1) > li:nth-of-type(2)');
  });

  it('builds XPath from tag positions', () => {
    document.body.innerHTML = '<div id="app"><section><p>Hi</p></section></div>';
    const p = document.querySelector('p')!;
    expect(buildXPath(p)).toBe('/html/body/div/section/p');
  });

  it('round-trips through domPath', () => {
    document.body.innerHTML = '<div><div class="a"><span class="b">x</span></div></div>';
    const span = document.querySelector('span')!;
    const ref = makeRef(span);
    expect(ref.domPath.length).toBeGreaterThan(0);
    expect(resolveDomPath(ref.domPath)).toBe(span);
    expect(resolveRef(ref)).toBe(span);
  });

  it('returns null for stale paths', () => {
    expect(resolveDomPath([999, 0, 0])).toBeNull();
  });

  it('disambiguates identical siblings so the selector never resolves to a different element', () => {
    document.body.innerHTML =
      '<div id="list"><div class="card"><h2>One</h2></div><div class="card"><h2>Two</h2></div><div class="card"><h2>Three</h2></div></div>';
    const cards = document.querySelectorAll('.card');
    const second = cards[1]!;
    const selector = buildSelector(second);
    // The bare chain `#list > div.card` matches all three cards — the built
    // selector must be positionally disambiguated and document-unique.
    expect(selector).toBe('#list > div:nth-of-type(2)');
    expect(document.querySelectorAll(selector).length).toBe(1);
    expect(document.querySelector(selector)).toBe(second);
    // The first and third cards get their own unique selectors too.
    expect(document.querySelectorAll(buildSelector(cards[0]!)).length).toBe(1);
    expect(document.querySelectorAll(buildSelector(cards[2]!)).length).toBe(1);
  });

  it('disambiguates identical subtrees (chain collision) via the document query', () => {
    document.body.innerHTML =
      '<main><section><div class="cell"><b>A</b></div><div class="cell"><b>B</b></div></section><section><div class="cell"><b>C</b></div><div class="cell"><b>D</b></div></section></main>';
    const cells = document.querySelectorAll('.cell');
    for (const cell of Array.from(cells)) {
      const selector = buildSelector(cell);
      expect(document.querySelectorAll(selector).length).toBe(1);
      expect(document.querySelector(selector)).toBe(cell);
    }
  });

  it('makeRef round-trips for identical siblings and survives class changes', () => {
    document.body.innerHTML =
      '<ul><li class="item">A</li><li class="item">B</li><li class="item">C</li></ul>';
    const second = document.querySelectorAll('li')[1]!;
    const ref = makeRef(second);
    expect(resolveRef(ref)).toBe(second);
    // A class change on a sibling must not redirect the identity.
    document.querySelectorAll('li')[0]!.classList.add('active');
    expect(resolveRef(ref)).toBe(second);
    // Removing the original and replacing it with a different element at the
    // same path must be detected as STALE (path/selector disagree), never a
    // silent wrong-element handoff.
    const replacement = document.createElement('span');
    replacement.textContent = 'replacement';
    second.replaceWith(replacement);
    expect(resolveRef(ref)).toBeNull();
  });

  it('resolveRef accepts the selector when the DOM shifted but the identity is intact', () => {
    document.body.innerHTML = '<div id="list"><div class="card">One</div><div class="card">Two</div></div>';
    const second = document.querySelectorAll('.card')[1]!;
    const ref = makeRef(second);
    // A sibling gains a class — the path still resolves and the selector
    // (positional) still matches the same element.
    document.querySelectorAll('.card')[0]!.classList.add('highlighted');
    expect(resolveRef(ref)).toBe(second);
  });
});

describe('buildDomTree', () => {
  it('is bounded by maxNodes and reports truncation', () => {
    document.body.innerHTML = '<div></div>'.repeat(200);
    const { nodes, truncated } = buildDomTree(document, { maxNodes: 10 });
    expect(truncated).toBe(true);
    expect(nodes.length).toBe(1);
    expect(nodes[0]?.tagName).toBe('html');
  });

  it('captures ids, classes, and text nodes', () => {
    document.body.innerHTML =
      '<main><h1 id="title" class="hero-title">Hello <strong>world</strong></h1></main>';
    const { nodes } = buildDomTree(document, { maxDepth: 4 });
    const main = nodes[0]?.children
      .find((n) => n.tagName === 'body')
      ?.children.find((n) => n.tagName === 'main');
    expect(main).toBeDefined();
    const h1 = main!.children.find((n) => n.tagName === 'h1')!;
    expect(h1.id).toBe('title');
    expect(h1.classes).toEqual(['hero-title']);
    expect(h1.children.some((n) => !n.isElement && n.text?.includes('Hello'))).toBe(true);
  });
});
