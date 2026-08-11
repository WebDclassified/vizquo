/**
 * Palette card renderer (Phase 10) — draws the design-DNA palette as a PNG.
 * All geometry comes from the pure `paletteCardLayout` (engine/tokens), so
 * this file only paints. Dark surface, mono labels, swatches sorted by usage
 * — a shareable card for Figma boards / thumbnails.
 */
import { type PaletteInput, paletteCardLayout } from '../../../../engine/tokens/palette-card';

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

/** Render the palette card onto a fresh canvas. */
export function renderPaletteCard(colors: PaletteInput[]): HTMLCanvasElement {
  const layout = paletteCardLayout(colors);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Near-black surface (brand system §6.1).
  ctx.fillStyle = '#101217';
  ctx.fillRect(0, 0, layout.width, layout.height);

  // Brand line — instrumentation tone, never competing with the swatches.
  ctx.fillStyle = '#555c67';
  ctx.font = `600 9px ${MONO}`;
  ctx.fillText('VIZQUO - DESIGN DNA PALETTE', 16, 11);

  for (const swatch of layout.swatches) {
    roundRectPath(ctx, swatch.x, swatch.y, swatch.w, swatch.h, 8);
    ctx.fillStyle = swatch.hex;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f5f7fa';
    ctx.font = `600 12px ${MONO}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(swatch.hex.toUpperCase(), swatch.x + 2, swatch.y + swatch.h + 17);

    ctx.fillStyle = '#747b87';
    ctx.font = `10px ${MONO}`;
    const detail = swatch.role
      ? `${swatch.role} · ${swatch.usageCount} uses`
      : `${swatch.usageCount} uses`;
    ctx.fillText(detail, swatch.x + 2, swatch.y + swatch.h + 29);
  }
  return canvas;
}

/** Render and download the palette card as a PNG. */
export function downloadPalettePng(colors: PaletteInput[], filename = 'vizquo-palette.png'): void {
  const canvas = renderPaletteCard(colors);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, 'image/png');
}
