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
