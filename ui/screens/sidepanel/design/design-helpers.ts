import type { ColorRole, FontSource, TypeRole } from '../../../../shared/types';
import type { BadgeTone } from '../../../components/Badge';

export const ROLE_META: Record<ColorRole, { label: string; tone: BadgeTone }> = {
  primary: { label: 'Primary', tone: 'accent' },
  secondary: { label: 'Secondary', tone: 'accent' },
  accent: { label: 'Accent', tone: 'accent' },
  background: { label: 'Background', tone: 'neutral' },
  surface: { label: 'Surface', tone: 'neutral' },
  text: { label: 'Text', tone: 'neutral' },
  muted: { label: 'Muted', tone: 'neutral' },
  border: { label: 'Border', tone: 'neutral' },
  success: { label: 'Success', tone: 'success' },
  warning: { label: 'Warning', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
  unknown: { label: 'Unknown', tone: 'neutral' },
};

export const TYPE_ROLE_META: Record<TypeRole, { label: string; tone: BadgeTone }> = {
  display: { label: 'Display', tone: 'accent' },
  h1: { label: 'H1', tone: 'accent' },
  h2: { label: 'H2', tone: 'accent' },
  h3: { label: 'H3', tone: 'accent' },
  body: { label: 'Body', tone: 'neutral' },
  small: { label: 'Small', tone: 'neutral' },
  caption: { label: 'Caption', tone: 'neutral' },
  label: { label: 'Label', tone: 'neutral' },
  button: { label: 'Button', tone: 'info' },
};

export const FONT_SOURCE_LABEL: Record<FontSource, string> = {
  google: 'Google Fonts',
  adobe: 'Adobe Fonts',
  fontshare: 'Fontshare',
  local: 'Local / system',
  cdn: 'CDN',
  unknown: 'Unknown source',
};

/** Compress "oklch(0.578 0.234 278.3)" to "oklch(0.58 0.23 278)".
 *  Page data: a cached token without oklch must render empty, never throw. */
export function oklchShort(oklch: string | undefined | null): string {
  if (!oklch) return '';
  return oklch.replace(/\(([\d.]+) ([\d.]+) ([\d.]+)/, (_m, l: string, c: string, h: string) => {
    const round = (n: string): string => {
      const value = Number.parseFloat(n);
      return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : n;
    };
    return `(${round(l)} ${round(c)} ${round(h)}`;
  });
}

/** "1 element" / "42 elements" without the plural trap. */
export function countLabel(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Black or white — readable text on a swatch (WCAG-lite luminance). */
export function readableOn(hex: string | undefined | null): string {
  if (!hex) return '#ffffff';
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#ffffff';
  const value = match[1] ?? '000000';
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? '#1b1f27' : '#ffffff';
}

/** Field names for the multi-select summary (Section 7.7). */
export const MULTI_FIELD_LABEL: Record<string, string> = {
  fontFamily: 'Font family',
  fontSize: 'Font size',
  fontWeight: 'Font weight',
  borderRadius: 'Border radius',
  backgroundColor: 'Background',
  color: 'Text color',
  padding: 'Padding',
  height: 'Height',
};
