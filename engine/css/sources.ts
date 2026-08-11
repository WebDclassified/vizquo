/**
 * Author stylesheet collection (Section 7.5 source-of-truth chain).
 *
 * Every reachable stylesheet (link, <style>, and the page's own constructed
 * sheets) is parsed once with css-tree so each rule carries its flattened
 * declarations plus a source location (stylesheet label + line/column).
 *
 * Media/supports scoping: rules inside @media are only kept when the query
 * currently matches (window.matchMedia) and @supports only when
 * CSS.supports() passes — otherwise the matched-rule list would show rules
 * that are not actually in the cascade for the current viewport. Container
 * queries cannot be evaluated without layout context; those rules are kept
 * and flagged `containerScope` so the UI can label them honestly.
 *
 * Cross-origin sheets: cssRules access throws SecurityError, so those sheets
 * are kept as `blocked` entries and the inspector explains rather than
 * silently omits. Same-origin link sheets are fetched (extension context,
 * force-cached) to recover exact source text; inline <style> tags read their
 * owner node directly. Source line numbers therefore come from css-tree's
 * `loc` positions on the real sheet text.
 */
import { type CssNode, generate, parse } from 'css-tree';
import type { RuleSource, SourceLocation } from '../../shared/types';
import { selectorSpecificity } from './specificity';

export interface FlattenedDeclaration {
  name: string;
  value: string;
  important: boolean;
}

export interface FlattenedRule {
  selectorText: string;
  specificity: [number, number, number, number];
  declarations: FlattenedDeclaration[];
  source: SourceLocation | null;
  styleSheetIndex: number;
  ruleIndex: number;
  containerScope: boolean;
  /** @media / @supports / @container scope chain, innermost last. */
  scope: string[];
}

export interface CollectedStyleSheet {
  index: number;
  label: string;
  url: string | null;
  /** True when the browser blocked cssRules/cssText access (cross-origin). */
  blocked: boolean;
  blockedReason?: string;
  rules: FlattenedRule[];
  /** True when this sheet's rules were capped (hostile/huge stylesheets). */
  truncated?: boolean;
}

/**
 * Hostile-page bounds (Section 5): a page with 50 000 CSS rules must never
 * make inspection or the scan parse unbounded work. Sheets beyond the count
 * cap are dropped entirely; rule/declaration caps truncate the sheet with an
 * honest `truncated` flag.
 */
export const STYLESHEET_CAPS = {
  maxSheets: 80,
  maxRulesPerSheet: 8000,
  maxDeclarationsPerRule: 200,
} as const;

interface ScopeInfo {
  media: string[];
  supports: string[];
  container: string[];
}

function sourceOf(node: CssNode): SourceLocation | null {
  const loc = (node as { loc?: { start?: { line: number; column: number } } }).loc;
  if (!loc?.start) return null;
  return { stylesheet: '', line: loc.start.line, column: loc.start.column };
}

/** Flatten a parsed stylesheet AST into rules, tracking scope and order. */
function flattenAst(
  ast: CssNode,
  styleSheetIndex: number,
  label: string,
  scopes: ScopeInfo,
  rules: FlattenedRule[],
): void {
  const children = ast.children ? ast.children.toArray() : [];
  for (const child of children) {
    // Per-sheet rule budget — stop flattening once the cap is hit; the caller
    // marks the sheet truncated so consumers can show it honestly.
    if (rules.length >= STYLESHEET_CAPS.maxRulesPerSheet) return;
    switch (child.type) {
      case 'Rule': {
        if (!child.prelude || !child.block) continue;
        const mediaPasses = scopes.media.every((q) => {
          try {
            return window.matchMedia(q).matches;
          } catch {
            return true;
          }
        });
        const supportsPasses = scopes.supports.every((q) => {
          try {
            return CSS.supports(q);
          } catch {
            return true;
          }
        });
        if (!mediaPasses || !supportsPasses) continue;

        const selectorText = generate(child.prelude).trim();
        if (!selectorText || selectorText.includes('@')) continue;

        const declarations: FlattenedDeclaration[] = [];
        const blockChildren = child.block.children ? child.block.children.toArray() : [];
        for (const decl of blockChildren) {
          if (decl.type !== 'Declaration') continue;
          if (declarations.length >= STYLESHEET_CAPS.maxDeclarationsPerRule) break;
          const name = decl.property;
          const rawValue = (decl as CssNode & { value?: CssNode }).value;
          if (!name || !rawValue) continue;
          let value: string;
          try {
            value = generate(rawValue).trim();
          } catch {
            continue;
          }
          if (!value) continue;
          declarations.push({ name, value, important: decl.important === true });
        }
        if (declarations.length === 0) continue;

        const source = sourceOf(child);
        if (source) source.stylesheet = label;

        rules.push({
          selectorText,
          specificity: selectorSpecificity(selectorText),
          declarations,
          source,
          styleSheetIndex,
          ruleIndex: rules.length,
          containerScope: scopes.container.length > 0,
          scope: [...scopes.media, ...scopes.supports, ...scopes.container],
        });
        break;
      }
      case 'Atrule': {
        const name = child.name ?? '';
        if (name === 'media' || name === 'supports' || name === 'container') {
          if (!child.block) continue;
          const inner: ScopeInfo = { ...scopes };
          let condition = '';
          if (child.prelude) {
            try {
              condition = generate(child.prelude).trim();
            } catch {
              condition = '';
            }
          }
          if (name === 'media') inner.media = [...inner.media, condition];
          else if (name === 'supports') inner.supports = [...inner.supports, condition];
          else inner.container = [...inner.container, condition];
          flattenAst(child.block, styleSheetIndex, label, inner, rules);
        } else if (name === 'layer') {
          // @layer blocks behave like nesting — keep rules inside.
          if (child.block) flattenAst(child.block, styleSheetIndex, label, scopes, rules);
        }
        break;
      }
      default:
        break;
    }
  }
}

/** Media/supports filtering shared by the cssRules fallback. */
function scopePasses(scopes: ScopeInfo): boolean {
  try {
    if (!scopes.media.every((q) => window.matchMedia(q).matches)) return false;
    if (!scopes.supports.every((q) => CSS.supports(q))) return false;
  } catch {
    // Environment without matchMedia/CSS.supports — keep the rules.
  }
  return true;
}

/** Serialize a sheet's live cssRules when its text isn't readable. */
function rulesFromCssRules(sheet: CSSStyleSheet, styleSheetIndex: number): FlattenedRule[] {
  const out: FlattenedRule[] = [];
  const walk = (list: CSSRuleList, scopes: ScopeInfo): void => {
    for (const rule of Array.from(list)) {
      if (out.length >= STYLESHEET_CAPS.maxRulesPerSheet) return;
      if (rule instanceof CSSStyleRule) {
        if (!scopePasses(scopes)) continue;
        const selectorText = rule.selectorText;
        if (!selectorText || selectorText.includes('@')) continue;
        const declarations: FlattenedDeclaration[] = [];
        const style = rule.style;
        for (let i = 0; i < style.length; i += 1) {
          if (declarations.length >= STYLESHEET_CAPS.maxDeclarationsPerRule) break;
          const name = style.item(i);
          const value = style.getPropertyValue(name);
          if (!name || !value) continue;
          declarations.push({
            name,
            value,
            important: style.getPropertyPriority(name) === 'important',
          });
        }
        if (declarations.length === 0) continue;
        out.push({
          selectorText,
          specificity: selectorSpecificity(selectorText),
          declarations,
          source: null,
          styleSheetIndex,
          ruleIndex: out.length,
          containerScope: scopes.container.length > 0,
          scope: [...scopes.media, ...scopes.supports, ...scopes.container],
        });
      } else {
        const grouping = rule as CSSGroupingRule;
        if (!grouping.cssRules) continue;
        const inner: ScopeInfo = { ...scopes };
        if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
          if (!window.matchMedia(rule.conditionText).matches) continue;
          inner.media = [...inner.media, rule.conditionText];
        } else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule) {
          if (!CSS.supports(rule.conditionText)) continue;
          inner.supports = [...inner.supports, rule.conditionText];
        } else if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule) {
          inner.container = [...inner.container, rule.conditionText];
        }
        walk(grouping.cssRules, inner);
      }
    }
  };
  walk(sheet.cssRules, { media: [], supports: [], container: [] });
  return out;
}

function sheetLabel(sheet: CSSStyleSheet, index: number): string {
  if (sheet.href) {
    try {
      return new URL(sheet.href).pathname.split('/').pop() || sheet.href;
    } catch {
      return sheet.href;
    }
  }
  return `<style> #${index}`;
}

/** Collect all author stylesheets reachable from the document (async fetch for link sheets). */
export async function collectStylesheets(doc: Document = document): Promise<CollectedStyleSheet[]> {
  const allSheets = Array.from(doc.styleSheets) as CSSStyleSheet[];
  // Hostile-page bound: never process more than maxSheets stylesheets.
  const sheets = allSheets.slice(0, STYLESHEET_CAPS.maxSheets);
  const result: CollectedStyleSheet[] = [];

  for (const [index, sheet] of sheets.entries()) {
    const label = sheetLabel(sheet, index);
    const url = sheet.href;

    // Accessing cssRules is what throws for cross-origin sheets — the gate
    // that tells us whether the browser will let us see this sheet at all.
    try {
      void sheet.cssRules;
    } catch {
      result.push({
        index,
        label,
        url,
        blocked: true,
        blockedReason:
          'Cross-origin stylesheet — its rules are hidden by the browser’s same-origin policy.',
        rules: [],
      });
      continue;
    }

    let cssText: string | null = null;
    if (sheet.ownerNode instanceof HTMLStyleElement) {
      cssText = sheet.ownerNode.textContent ?? '';
    } else if (sheet.href) {
      try {
        const response = await fetch(sheet.href, { cache: 'force-cache' });
        cssText = response.ok ? await response.text() : null;
      } catch {
        cssText = null;
      }
      if (cssText == null) {
        result.push({
          index,
          label,
          url,
          blocked: true,
          blockedReason: 'Stylesheet could not be read (CORS or CSP blocked the fetch).',
          rules: [],
        });
        continue;
      }
    }

    let rules: FlattenedRule[] = [];
    let truncated = false;
    if (cssText?.trim()) {
      try {
        const ast = parse(cssText, { positions: true });
        flattenAst(ast, index, label, { media: [], supports: [], container: [] }, rules);
        truncated = rules.length >= STYLESHEET_CAPS.maxRulesPerSheet;
      } catch {
        rules = [];
      }
    }

    // Fallback when no readable text (e.g. happy-dom, constructed sheets):
    // walk the live cssRules — authoritative but without source lines.
    if (rules.length === 0 && sheet.cssRules) {
      try {
        rules = rulesFromCssRules(sheet, index);
        truncated = rules.length >= STYLESHEET_CAPS.maxRulesPerSheet;
      } catch {
        rules = [];
      }
    }

    result.push({ index, label, url, blocked: false, rules, truncated: truncated || undefined });
  }

  return result;
}

export interface CascadeInput {
  sheets: CollectedStyleSheet[];
  styleSheetIndex: number;
  ruleIndex: number;
}

/** Build a RuleSource from a flattened rule for the trace/UI model. */
export function toRuleSource(rule: FlattenedRule): RuleSource {
  return {
    selectorText: rule.selectorText,
    specificity: rule.specificity,
    source: rule.source,
    styleSheetIndex: rule.styleSheetIndex,
    ruleIndex: rule.ruleIndex,
    important: rule.declarations.some((d) => d.important),
  };
}
