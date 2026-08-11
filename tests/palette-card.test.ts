import { describe, expect, it } from 'vitest';
import { type PaletteInput, paletteCardLayout } from '../engine/tokens/palette-card';

function palette(n: number): PaletteInput[] {
  return Array.from({ length: n }, (_, i) => ({
    hex: `#${(i + 1).toString(16).padStart(6, '0')}`,
    role: 'accent',
    usageCount: n - i, // first = most used
  }));
}

describe('paletteCardLayout (Phase 10, palette PNG)', () => {
  it('sorts swatches by usage and caps the count', () => {
    const layout = paletteCardLayout(palette(50));
    expect(layout.swatches).toHaveLength(30);
    expect(layout.swatches[0]?.usageCount).toBeGreaterThan(layout.swatches[1]?.usageCount ?? 0);
  });

  it('lays out a 3-column grid with gaps and padding', () => {
    const layout = paletteCardLayout(palette(6));
    const first = layout.swatches[0];
    const second = layout.swatches[1];
    const fourth = layout.swatches[3];
    expect(first?.x).toBe(16); // pad
    expect(first?.y).toBe(16);
    expect(second?.x).toBe(16 + 180 + 12); // pad + swatch + gap
    expect(fourth?.y).toBe(16 + (64 + 28 + 12)); // row 2
    expect(layout.width).toBe(16 * 2 + 3 * 180 + 2 * 12);
    expect(layout.height).toBe(16 * 2 + 2 * (64 + 28 + 12) - 12);
  });

  it('never overlaps swatches', () => {
    const layout = paletteCardLayout(palette(11));
    for (let i = 0; i < layout.swatches.length; i++) {
      for (let j = i + 1; j < layout.swatches.length; j++) {
        const a = layout.swatches[i];
        const b = layout.swatches[j];
        const noOverlapX = a!.x + a!.w <= b!.x || b!.x + b!.w <= a!.x;
        const noOverlapY = a!.y + a!.h <= b!.y || b!.y + b!.h <= a!.y;
        expect(noOverlapX || noOverlapY, `swatch ${i} overlaps ${j}`).toBe(true);
      }
    }
  });

  it('stays valid for an empty palette (renderer never special-cases)', () => {
    const layout = paletteCardLayout([]);
    expect(layout.swatches).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('honors custom options', () => {
    const layout = paletteCardLayout(palette(2), {
      columns: 2,
      swatchWidth: 100,
      swatchHeight: 40,
      gap: 8,
      pad: 8,
      labelHeight: 20,
    });
    expect(layout.swatches[1]?.x).toBe(8 + 100 + 8);
    expect(layout.width).toBe(8 * 2 + 2 * 100 + 8);
  });
});
