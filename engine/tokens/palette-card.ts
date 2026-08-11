/**
 * Palette card layout (Phase 10) — pure geometry for the downloadable
 * design-DNA palette PNG: how many swatches fit per row, where each swatch
 * lands, and the total canvas size. The canvas renderer (UI layer) only
 * applies these rectangles — no layout math lives in the DOM code.
 *
 * Pure — unit-testable without a browser.
 */

export interface PaletteInput {
  /** Hex color, e.g. `#635bff`. */
  hex: string;
  /** Design-DNA role, e.g. `primary`. */
  role?: string;
  /** How many times the token was used (drives sort order). */
  usageCount: number;
}

export interface PaletteSwatch {
  hex: string;
  role?: string;
  usageCount: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaletteCardLayout {
  width: number;
  height: number;
  swatches: PaletteSwatch[];
}

export interface PaletteCardOptions {
  /** Swatches per row. */
  columns?: number;
  /** Swatch width in px. */
  swatchWidth?: number;
  /** Swatch height in px. */
  swatchHeight?: number;
  /** Outer padding in px. */
  pad?: number;
  /** Gap between swatches in px. */
  gap?: number;
  /** Row height reserved under each swatch for the hex/role label. */
  labelHeight?: number;
  /** Maximum number of swatches drawn. */
  maxSwatches?: number;
}

export const DEFAULT_PALETTE_OPTIONS: Required<PaletteCardOptions> = {
  columns: 3,
  swatchWidth: 180,
  swatchHeight: 64,
  pad: 16,
  gap: 12,
  labelHeight: 28,
  maxSwatches: 30,
};

/**
 * Compute the swatch grid for a palette. Most-used colors come first; empty
 * palettes still produce a valid (small) layout so the renderer never has to
 * special-case zero colors.
 */
export function paletteCardLayout(
  colors: PaletteInput[],
  options: PaletteCardOptions = {},
): PaletteCardLayout {
  const opts = { ...DEFAULT_PALETTE_OPTIONS, ...options };
  const sorted = [...colors].sort((a, b) => b.usageCount - a.usageCount).slice(0, opts.maxSwatches);

  const rowH = opts.swatchHeight + opts.labelHeight + opts.gap;
  const columns = Math.max(1, opts.columns);
  const rows = Math.max(1, Math.ceil(sorted.length / columns));
  const width = opts.pad * 2 + columns * opts.swatchWidth + (columns - 1) * opts.gap;
  const height = opts.pad * 2 + rows * rowH - opts.gap;

  const swatches: PaletteSwatch[] = sorted.map((color, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      hex: color.hex,
      role: color.role,
      usageCount: color.usageCount,
      x: opts.pad + col * (opts.swatchWidth + opts.gap),
      y: opts.pad + row * rowH,
      w: opts.swatchWidth,
      h: opts.swatchHeight,
    };
  });

  return { width, height, swatches };
}
