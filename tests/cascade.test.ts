// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { computeCascade } from '../engine/css/cascade';
import { collectStylesheets, STYLESHEET_CAPS } from '../engine/css/sources';
import { StyleCache } from '../engine/css/style-cache';
import { makeRef } from '../engine/dom/ref';

function setup(styleText: string, bodyHtml: string): Element {
  document.head.innerHTML = `<style>${styleText}</style>`;
  document.body.innerHTML = bodyHtml;
  return document.body.firstElementChild as Element;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  // happy-dom only parses declarations with file loading disabled (as in
  // scan.test.ts); without this the cssRules fallback sees empty styles.
  const happyDom = (
    window as unknown as { happyDOM?: { settings?: { disableCSSFileLoading?: boolean } } }
  ).happyDOM;
  if (happyDom?.settings) happyDom.settings.disableCSSFileLoading = true;
});

describe('computeCascade', () => {
  it('picks the winner by importance, then specificity, then order', async () => {
    const el = setup(
      `.btn { color: red; }
       #submit { color: blue; }
       .btn.primary { color: green; }`,
      '<button id="submit" class="btn primary">Go</button>',
    );
    const cache = new StyleCache();
    const result = await computeCascade(el, cache, { ref: makeRef(el) });
    const color = result.traces.find((t) => t.property === 'color');

    // Cascade ordering: an id (0,1,0,0) beats any class count (0,0,2,0),
    // so #submit wins over .btn.primary; both losers are reported.
    expect(color?.declaredValue).toBe('blue');
    expect(color?.matchedRule?.selectorText).toBe('#submit');
    // Both losers are reported as overridden.
    expect(color?.overriddenDeclarations?.map((d) => d.value)).toEqual(
      expect.arrayContaining(['red', 'green']),
    );
  });

  it('honors !important over higher specificity', async () => {
    const el = setup(
      `#submit { color: blue; }
       .btn { color: red !important; }`,
      '<button id="submit" class="btn">Go</button>',
    );
    const cache = new StyleCache();
    const color = (await computeCascade(el, cache, { ref: makeRef(el) })).traces.find(
      (t) => t.property === 'color',
    );
    expect(color?.declaredValue).toBe('red');
    expect(color?.matchedRule?.selectorText).toBe('.btn');
    expect(color?.matchedRule?.important).toBe(true);
  });

  it('resolves CSS variables to their defining rule', async () => {
    const el = setup(
      `:root { --brand: #635bff; }
       .accent { color: var(--brand); }`,
      '<span class="accent">Hi</span>',
    );
    const cache = new StyleCache();
    const result = await computeCascade(el, cache, { ref: makeRef(el) });
    const color = result.traces.find((t) => t.property === 'color');

    expect(color?.declaredValue).toBe('var(--brand)');
    expect(color?.variableChain?.length).toBe(1);
    expect(color?.variableChain?.[0]?.variable).toBe('--brand');
    expect(color?.variableChain?.[0]?.definedBy?.selectorText).toBe(':root');
    // The element sees the :root variable in its visible variables list.
    expect(result.variables.some((v) => v.variable === '--brand')).toBe(true);
  });

  it('excludes rules from non-matching media queries', async () => {
    const el = setup(
      `.btn { color: red; }
       @media (max-width: 1px) { .btn { color: black; } }`,
      '<button class="btn">Go</button>',
    );
    const cache = new StyleCache();
    const color = (await computeCascade(el, cache, { ref: makeRef(el) })).traces.find(
      (t) => t.property === 'color',
    );
    expect(color?.declaredValue).toBe('red');
    expect(color?.overriddenDeclarations ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'black' })]),
    );
  });

  it('reports inline styles as the winner over normal author rules', async () => {
    const el = setup(
      '.btn { color: red; }',
      '<button class="btn" style="color: purple">Go</button>',
    );
    const cache = new StyleCache();
    const color = (await computeCascade(el, cache, { ref: makeRef(el) })).traces.find(
      (t) => t.property === 'color',
    );
    expect(color?.kind).toBe('inline');
    expect(color?.declaredValue).toBe('purple');
    expect(color?.overriddenDeclarations?.[0]?.value).toBe('red');
  });

  it('author !important beats a normal inline style (CSS cascade)', async () => {
    const el = setup(
      '.btn { color: red !important; }',
      '<button class="btn" style="color: purple">Go</button>',
    );
    const cache = new StyleCache();
    const color = (await computeCascade(el, cache, { ref: makeRef(el) })).traces.find(
      (t) => t.property === 'color',
    );
    expect(color?.kind).toBe('stylesheet');
    expect(color?.declaredValue).toBe('red');
    expect(color?.matchedRule?.important).toBe(true);
    expect(color?.overriddenDeclarations?.[0]?.value).toBe('purple');
  });

  it('marks inherited properties with their ancestor source', async () => {
    setup('body { color: rgb(30, 30, 30); }', '<div><p>text</p></div>');
    const p = document.querySelector('p')!;
    const cache = new StyleCache();
    const result = await computeCascade(p, cache, { ref: makeRef(p) });
    const color = result.traces.find((t) => t.property === 'color');
    expect(color?.kind).toBe('inherited');
    expect(color?.inheritedFrom).toBeDefined();
    expect(result.inherited.some((i) => i.property === 'color')).toBe(true);
  });
});

describe('collectStylesheets', () => {
  it('collects and parses style tags (rules fall back to cssRules without text)', async () => {
    // happy-dom exposes no stylesheet text or ownerNode, so the cssRules
    // fallback path is exercised: rules with null source locations.
    setup('.a { color: red; }\n.b { margin: 0; }', '<div class="a">x</div>');
    const sheets = await collectStylesheets();
    expect(sheets.length).toBe(1);
    expect(sheets[0]?.blocked).toBe(false);
    const rules = sheets[0]?.rules ?? [];
    expect(rules.map((r) => r.selectorText)).toEqual(['.a', '.b']);
    expect(rules[0]?.declarations[0]).toMatchObject({ name: 'color', value: 'red' });
  });

  it('returns a sane shape when no stylesheets exist', async () => {
    const sheets = await collectStylesheets();
    expect(Array.isArray(sheets)).toBe(true);
  });

  it('survives hostile CSS values without throwing or executing', async () => {
    // Every value below is attacker-controlled page content. javascript: URLs
    // and injection attempts must parse as inert data — never crash the
    // parser and never become executable. Values use valid properties
    // (background-image / cursor) so the declaration survives the parser.
    setup(
      `.evil { background-image: url("javascript:alert(1)");
              cursor: url("javascript:alert(2)"), auto;
              font-family: "; } .pwn { color: red; }";
              --x: var(--y, var(--z, rgb(0 0 0 / 100%))); }
       .broken { ;;; }
       { .oops }
       @media not all { .never { display: grid; } }`,
      '<div class="evil">x</div>',
    );
    const sheets = await collectStylesheets();
    const rules = sheets[0]?.rules ?? [];
    // Malformed constructs are dropped; valid hostile values are kept as data.
    expect(rules.some((r) => r.selectorText.includes('.evil'))).toBe(true);
    const evil = rules.find((r) => r.selectorText.includes('.evil'));
    expect(evil?.declarations.some((d) => d.value.includes('javascript'))).toBe(true);
  });

  it('caps per-rule declarations (hostile fat rules)', async () => {
    const decls = Array.from({ length: 300 }, (_, i) => `--v${i}: ${i}px`).join('; ');
    setup(`.fat { ${decls}; color: red; }`, '<div class="fat">x</div>');
    const sheets = await collectStylesheets();
    const fat = (sheets[0]?.rules ?? []).find((r) => r.selectorText === '.fat');
    expect(fat).toBeDefined();
    expect(fat!.declarations.length).toBeLessThanOrEqual(200);
  });

  it('bounded rule collection on hostile huge stylesheets', async () => {
    // 8200 rules ≫ the 8000-per-sheet cap. The safety property under test:
    // collection must never blow up (no throw, no unbounded serialization).
    // (happy-dom cannot faithfully expose >8k-rule sheets, so the exact
    // `truncated` flag is exercised in the real-browser hostile-page E2E.)
    let css = '';
    for (let i = 0; i < 8200; i += 1) css += `.r${i} { color: #${(i % 16).toString(16)}; }\n`;
    setup(css, '<div class="r0">x</div>');
    const sheets = await collectStylesheets();
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    const rules = sheets[0]?.rules ?? [];
    expect(rules.length).toBeLessThanOrEqual(STYLESHEET_CAPS.maxRulesPerSheet);
    // The sheet's rules are never silently mislabeled.
    expect(sheets[0]?.blocked).toBe(false);
  });
});
