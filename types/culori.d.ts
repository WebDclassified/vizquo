/**
 * Ambient declarations for culori — the package ships no TypeScript types.
 * Covers only the surface Vizquo uses (see DECISIONS.md). Keep in sync with
 * the imports in engine/tokens/color.ts.
 */
declare module 'culori' {
  export interface RgbColor {
    mode: 'rgb';
    r: number;
    g: number;
    b: number;
    alpha?: number;
  }
  export interface OklchColor {
    mode: 'oklch';
    l: number;
    c: number;
    h: number;
    alpha?: number;
  }
  export type Color = RgbColor | OklchColor | { mode: string; [key: string]: unknown };

  export function parse(color: string): RgbColor | null | undefined;
  export function formatHex(color: Color | string): string;
  /** 8-digit hex (preserves alpha) — exists at runtime, missing from types. */
  export function formatHex8(color: Color | string): string;
  export function converter(mode: 'oklch'): (color: Color | string) => OklchColor;
  export function converter(mode: 'rgb'): (color: Color | string) => RgbColor;
  export function differenceEuclidean(
    mode?: string,
  ): (a: Color | string, b: Color | string) => number;
}
