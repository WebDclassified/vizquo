/**
 * Minimal ambient declarations for css-tree v3 (which ships no TypeScript
 * types). Only the surface Vizquo uses is declared: parse / generate / walk
 * and the AST node shape we read (children lists, names, properties,
 * important flags, loc). Declaration `value` nodes are read via the index
 * signature and cast to CssNode when generated — see engine/css/sources.ts.
 */
declare module 'css-tree' {
  export interface CssNode {
    type: string;
    name?: string;
    property?: string;
    important?: boolean;
    prelude?: CssNode;
    block?: CssNode;
    selector?: CssNode;
    children?: {
      toArray(): CssNode[];
    };
    loc?: {
      start?: { line: number; column: number };
      end?: { line: number; column: number };
    };
    [key: string]: unknown;
  }

  export function parse(css: string, options?: { context?: string; positions?: boolean }): CssNode;

  export function generate(node: CssNode, options?: unknown): string;

  export function walk(node: CssNode, callback: (node: CssNode) => void): void;
}
