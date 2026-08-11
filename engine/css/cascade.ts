/**
 * Cascade resolution (Section 7.5) — the source-of-truth engine.
 *
 * For a given element and property it determines, in order:
 *   1. every author rule that declares the property and matches the element;
 *   2. the winning declaration (important > specificity > source order, with
 *      inline styles inserted at (1,0,0,0) per the CSS cascade);
 *   3. everything it overrode (losers, shown struck-through in the UI);
 *   4. the CSS variable chain when the value uses var();
 *   5. the inherited source when no author rule applies and the property is
 *      inherited.
 *
 * The final computed value always comes from getComputedStyle (ground truth);
 * the cascade output explains *how* that value was produced. Stylesheet
 * collection is async (link sheets are fetched for source text), so the whole
 * cascade is async — the L1 cache keeps it a one-time cost per element.
 */
import type {
  CSSPropertyTrace,
  ElementRef,
  OverriddenDeclaration,
  RuleSource,
  VariableTrace,
} from '../../shared/types';
import type { FlattenedDeclaration, FlattenedRule } from './sources';
import { toRuleSource } from './sources';
import { compareSpecificity, type Specificity } from './specificity';
import type { StyleCache } from './style-cache';

export const INLINE_SPECIFICITY: Specificity = [1, 0, 0, 0];

/** Properties that inherit by default (subset that the inspector surfaces). */
export const INHERITED_PROPS = new Set([
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-variant-numeric',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-indent',
  'text-transform',
  'text-decoration',
  'text-rendering',
  'white-space',
  'word-break',
  'overflow-wrap',
  'direction',
  'visibility',
  'cursor',
  'list-style',
  'quotes',
  'tab-size',
  'text-overflow',
  'text-shadow',
]);

const MAX_ANCESTOR_WALK = 12;
const MAX_VARIABLES = 80;
const MAX_MATCHED_RULES = 50;

interface Candidate {
  rule: FlattenedRule | null;
  inline?: { value: string; important: boolean };
}

/** CSS var() usages inside a declared value. */
function extractVarNames(value: string): string[] {
  const names: string[] = [];
  const re = /var\(\s*(--[\w-]+)/g;
  while (true) {
    const match = re.exec(value);
    if (!match) break;
    const name = match[1];
    if (name) names.push(name);
  }
  return names;
}

export interface CascadeResult {
  traces: CSSPropertyTrace[];
  variables: VariableTrace[];
  variablesTruncated: boolean;
  inherited: { property: string; value: string; from: string }[];
  matchedRules: RuleSource[];
  matchedRulesTruncated: boolean;
  blockedStylesheets: string[];
  declarationCount: number;
}

export interface CascadeOptions {
  /** Properties to produce full traces for (defaults to the inspector set). */
  traceProps?: string[];
  /** The element's own ref (used by consumers; not read by the engine). */
  ref: ElementRef;
}

/** The property set surfaced across the inspector tabs. */
export const INSPECTOR_TRACE_PROPS = [
  'display',
  'position',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'box-sizing',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'row-gap',
  'column-gap',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-content',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'order',
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'overflow',
  'overflow-x',
  'overflow-y',
  'z-index',
  'float',
  'clear',
  'color',
  'background-color',
  'background-image',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-radius',
  'box-shadow',
  'opacity',
  'filter',
  'backdrop-filter',
  'mix-blend-mode',
  'clip-path',
  'mask-image',
  'isolation',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-decoration',
  'text-align',
  'white-space',
  'text-overflow',
  'font-variant-numeric',
  'transform',
  'transform-origin',
  'transition',
  'animation',
  'perspective',
  'backface-visibility',
  'contain',
  'content-visibility',
  'container-type',
  'container-name',
  'aspect-ratio',
  'will-change',
  'cursor',
  'user-select',
];

export async function computeCascade(
  el: Element,
  cache: StyleCache,
  options: CascadeOptions,
): Promise<CascadeResult> {
  const computed = cache.computedFor(el);
  const matched = await cache.matchedRulesFor(el);
  const sheets = await cache.getSheets();
  const htmlEl = el as HTMLElement;

  const traceProps = options.traceProps ?? INSPECTOR_TRACE_PROPS;
  const traces: CSSPropertyTrace[] = [];

  const candidateOf = (rule: FlattenedRule, name: string): FlattenedDeclaration | null =>
    rule.declarations.find((d) => d.name === name) ?? null;

  for (const prop of traceProps) {
    const candidates: Candidate[] = [];
    for (const rule of matched) {
      if (candidateOf(rule, prop)) candidates.push({ rule });
    }

    const inlineValue = htmlEl.style.getPropertyValue(prop);
    const inlineImportant = htmlEl.style.getPropertyPriority(prop) === 'important';
    if (inlineValue) {
      candidates.push({ rule: null, inline: { value: inlineValue, important: inlineImportant } });
    }

    if (candidates.length === 0) {
      // No author declaration — inherited or browser default.
      if (INHERITED_PROPS.has(prop)) {
        let from: Element | null = el.parentElement;
        let found = false;
        let fromRef: string | null = null;
        let inheritedDeclared: FlattenedDeclaration | null = null;
        let inheritedRule: FlattenedRule | null = null;
        for (let i = 0; from && i < MAX_ANCESTOR_WALK; i += 1) {
          const ancestorMatched = await cache.matchedRulesFor(from);
          for (const rule of ancestorMatched) {
            const decl = candidateOf(rule, prop);
            if (decl) {
              found = true;
              fromRef = makeAncestorRef(from);
              inheritedDeclared = decl;
              inheritedRule = rule;
              break;
            }
          }
          if (found) break;
          from = from.parentElement;
        }
        if (found) {
          const trace: CSSPropertyTrace = {
            property: prop,
            computedValue: computed.getPropertyValue(prop),
            declaredValue: inheritedDeclared?.value,
            kind: 'inherited',
            matchedRule: inheritedRule ? toRuleSource(inheritedRule) : undefined,
            overriddenDeclarations: [],
            inheritedFrom: fromRef ?? undefined,
          };
          traces.push(trace);
        } else {
          traces.push({
            property: prop,
            computedValue: computed.getPropertyValue(prop),
            kind: 'browser-default',
          });
        }
        continue;
      }
      traces.push({
        property: prop,
        computedValue: computed.getPropertyValue(prop),
        kind: 'browser-default',
      });
      continue;
    }

    // Pick the winner: important first, then specificity, then source order.
    let winner: Candidate | null = null;
    let winnerScore: { important: number; specificity: Specificity; order: number } | null = null;
    for (const candidate of candidates) {
      const score = scoreOf(candidate);
      if (!winner || !winnerScore || compareScores(score, winnerScore) > 0) {
        winner = candidate;
        winnerScore = score;
      }
    }
    if (!winner) continue;

    const winnerDecl = winner.inline
      ? null
      : (candidateOf(winner.rule as FlattenedRule, prop) as FlattenedDeclaration);
    const declaredValue = winner.inline ? winner.inline.value : (winnerDecl?.value ?? '');

    const overriddenDeclarations: OverriddenDeclaration[] = [];
    for (const c of candidates) {
      if (c === winner) continue;
      const value = c.inline
        ? c.inline.value
        : (candidateOf(c.rule as FlattenedRule, prop) as FlattenedDeclaration).value;
      overriddenDeclarations.push({
        value,
        rule: c.inline
          ? {
              selectorText: 'inline style',
              specificity: INLINE_SPECIFICITY,
              source: null,
              styleSheetIndex: -1,
              ruleIndex: -1,
              important: c.inline.important,
            }
          : toRuleSource(c.rule as FlattenedRule),
      });
    }

    const variableChain = await Promise.all(
      extractVarNames(declaredValue).map((name) => resolveVariable(el, name, cache, computed)),
    );

    const trace: CSSPropertyTrace = {
      property: prop,
      computedValue: computed.getPropertyValue(prop),
      declaredValue,
      kind: winner.inline ? 'inline' : 'stylesheet',
      variableChain: variableChain.length > 0 ? variableChain : undefined,
      matchedRule: winner.inline
        ? {
            selectorText: 'inline style',
            specificity: INLINE_SPECIFICITY,
            source: null,
            styleSheetIndex: -1,
            ruleIndex: -1,
            important: winner.inline.important,
          }
        : toRuleSource(winner.rule as FlattenedRule),
      overriddenDeclarations:
        overriddenDeclarations.length > 0 ? overriddenDeclarations : undefined,
    };
    traces.push(trace);
  }

  // CSS variables visible to this element.
  const variables = await collectVariables(el, cache, computed);

  // Inherited properties with an explicit ancestor source (Source tab).
  const inherited: { property: string; value: string; from: string }[] = [];
  for (const prop of INHERITED_PROPS) {
    const trace = traces.find((t) => t.property === prop);
    if (trace?.kind === 'inherited' && trace.inheritedFrom) {
      inherited.push({ property: prop, value: trace.computedValue, from: trace.inheritedFrom });
    }
  }

  const matchedRules = matched.slice(0, MAX_MATCHED_RULES).map(toRuleSource);
  const declarationCount = matched.reduce((sum, r) => sum + r.declarations.length, 0);

  return {
    traces,
    variables,
    variablesTruncated: variables.length > MAX_VARIABLES,
    inherited,
    matchedRules,
    matchedRulesTruncated: matched.length > MAX_MATCHED_RULES,
    blockedStylesheets: sheets.filter((s) => s.blocked).map((s) => s.label),
    declarationCount,
  };
}

function scoreOf(candidate: Candidate): {
  important: number;
  specificity: Specificity;
  order: number;
} {
  if (candidate.inline) {
    return {
      important: candidate.inline.important ? 2 : 1,
      specificity: INLINE_SPECIFICITY,
      order: -1,
    };
  }
  const rule = candidate.rule as FlattenedRule;
  return {
    important: rule.declarations.some((d) => d.important) ? 2 : 1,
    specificity: rule.specificity,
    order: rule.styleSheetIndex * 1_000_000 + rule.ruleIndex,
  };
}

function compareScores(
  a: { important: number; specificity: Specificity; order: number },
  b: { important: number; specificity: Specificity; order: number },
): number {
  if (a.important !== b.important) return a.important - b.important;
  const spec = compareSpecificity(a.specificity, b.specificity);
  if (spec !== 0) return spec;
  return a.order - b.order;
}

function makeAncestorRef(el: Element): string {
  const id = el.id;
  if (id) return `#${id}`;
  const klass = Array.from(el.classList).slice(0, 2).join('.');
  if (klass) return `${el.tagName.toLowerCase()}.${klass}`;
  return el.tagName.toLowerCase();
}

/** Resolve a single CSS variable: final value + where it is defined. */
async function resolveVariable(
  el: Element,
  name: string,
  cache: StyleCache,
  computed: CSSStyleDeclaration,
): Promise<VariableTrace> {
  const value = computed.getPropertyValue(name);

  // Find the winning declaration of the variable across el + ancestors.
  let current: Element | null = el;
  let declaringRule: FlattenedRule | null = null;
  for (let i = 0; current && i < MAX_ANCESTOR_WALK; i += 1) {
    const matched = await cache.matchedRulesFor(current);
    for (const rule of matched) {
      const decl = rule.declarations.find((d) => d.name === name);
      if (decl && (!declaringRule || isBetterDeclaration(rule, declaringRule))) {
        declaringRule = rule;
      }
    }
    current = current.parentElement;
  }

  return {
    variable: name,
    value,
    definedBy: declaringRule ? toRuleSource(declaringRule) : null,
  };
}

function isBetterDeclaration(a: FlattenedRule, b: FlattenedRule): boolean {
  const aImportant = a.declarations.some((d) => d.important);
  const bImportant = b.declarations.some((d) => d.important);
  if (aImportant !== bImportant) return aImportant;
  const spec = compareSpecificity(a.specificity, b.specificity);
  if (spec !== 0) return spec > 0;
  return a.styleSheetIndex * 1_000_000 + a.ruleIndex > b.styleSheetIndex * 1_000_000 + b.ruleIndex;
}

async function collectVariables(
  el: Element,
  cache: StyleCache,
  computed: CSSStyleDeclaration,
): Promise<VariableTrace[]> {
  const names = new Set<string>();
  const consider = (rules: FlattenedRule[]) => {
    for (const rule of rules) {
      for (const decl of rule.declarations) {
        if (decl.name.startsWith('--')) names.add(decl.name);
      }
    }
  };
  consider(await cache.matchedRulesFor(el));
  let current: Element | null = el.parentElement;
  for (let i = 0; current && i < MAX_ANCESTOR_WALK; i += 1) {
    consider(await cache.matchedRulesFor(current));
    current = current.parentElement;
  }

  // Also pull variables defined on :root / universal selectors even when the
  // element is not nested under a matching ancestor (e.g. body-level pages).
  const sheets = await cache.getSheets();
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      if (rule.selectorText === ':root' || rule.selectorText === 'html') {
        for (const decl of rule.declarations) {
          if (decl.name.startsWith('--')) names.add(decl.name);
        }
      }
    }
  }

  const result: VariableTrace[] = [];
  for (const name of names) {
    if (result.length >= MAX_VARIABLES) break;
    result.push(await resolveVariable(el, name, cache, computed));
  }
  return result.sort((a, b) => a.variable.localeCompare(b.variable));
}
