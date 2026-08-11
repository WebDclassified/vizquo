/**
 * L1 in-memory style cache (Section 2.3) — lives in the content script.
 *
 * Enforces the hard rule from Section 4: never call getComputedStyle twice for
 * the same node in one scan pass, and never re-walk the stylesheet cascade
 * twice for the same node. WeakMaps keyed by the live element mean entries
 * disappear with the element itself (GC) or on navigation.
 *
 * The stylesheet collection is cached per document and invalidated explicitly
 * (controller debounces a MutationObserver on <link>/<style> changes and on
 * SPA navigation).
 */
import type { CollectedStyleSheet, FlattenedRule } from './sources';
import { collectStylesheets } from './sources';

export class StyleCache {
  private readonly computed = new WeakMap<Element, CSSStyleDeclaration>();
  private readonly matched = new WeakMap<Element, FlattenedRule[]>();
  private sheetsPromise: Promise<CollectedStyleSheet[]> | null = null;
  private sheetsDocument: Document | null = null;

  /** Computed style for an element — memoized per element per cache lifetime. */
  computedFor(el: Element): CSSStyleDeclaration {
    let style = this.computed.get(el);
    if (!style) {
      style = getComputedStyle(el);
      this.computed.set(el, style);
    }
    return style;
  }

  /** All author rules that match the element — memoized per element. */
  async matchedRulesFor(el: Element): Promise<FlattenedRule[]> {
    let matched = this.matched.get(el);
    if (matched) return matched;
    matched = [];
    const sheets = await this.getSheets();
    for (const sheet of sheets) {
      for (const rule of sheet.rules) {
        let matches = false;
        try {
          matches = el.matches(rule.selectorText);
        } catch {
          matches = false;
        }
        if (matches) matched.push(rule);
      }
    }
    this.matched.set(el, matched);
    return matched;
  }

  /** Parsed author stylesheets for the current document (cached promise). */
  getSheets(): Promise<CollectedStyleSheet[]> {
    if (!this.sheetsPromise || this.sheetsDocument !== document) {
      this.sheetsPromise = collectStylesheets();
      this.sheetsDocument = document;
    }
    return this.sheetsPromise;
  }

  /** Drop everything — called on SPA navigation / stylesheet mutation. */
  invalidate(): void {
    this.sheetsPromise = null;
    this.sheetsDocument = null;
  }
}

/** The shared L1 cache instance for the content script session. */
export const styleCache = new StyleCache();
