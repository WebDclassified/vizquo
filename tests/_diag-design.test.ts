/**
 * Design diagnostic engine run — consumes the samples collected by
 * scripts/diag-design.mjs and runs the REAL clusterColors / analyzeScales /
 * analyzeTypography engines on them, printing what the panel would show.
 *
 * Diagnostic-only: skips when the sampler hasn't run (CI / fresh clones).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clusterColors, normalizeColorValue } from '../engine/tokens/color';
import { classifyColorRoles } from '../engine/tokens/roles';
import { analyzeScales } from '../engine/tokens/scales';
import { analyzeTypography } from '../engine/tokens/typography';
import type { ElementSample } from '../shared/types';

// Path differs between git-bash (/tmp → Windows temp) and node (/tmp → D:\\tmp);
// the sampler writes where node reads, so the test honors an explicit path.
const SAMPLES_PATH = process.env.VIZQUO_SAMPLES ?? '/tmp/vizquo-design-samples.json';

if (!existsSync(SAMPLES_PATH)) {
  describe('design diagnostic', () => {
    it.skip('run scripts/diag-design.mjs first to generate samples', () => {});
  });
} else {
  const raw = JSON.parse(readFileSync(SAMPLES_PATH, 'utf8'));

  const samples: ElementSample[] = raw.samples.map(
    (s: Record<string, unknown>, i: number) =>
      ({
        ref: { selector: `#diag-${i}`, xpath: `/diag/${i}`, domPath: [i] },
        tag: s.tag,
        classes: s.classes,
        id: s.id,
        role: s.role,
        textLength: s.textLength,
        depth: 3,
        parentTag: 'main',
        childTags: [],
        sectionKey: 'main',
        display: s.display,
        color: s.color,
        backgroundColor: s.backgroundColor,
        borderColor: s.borderColor,
        borderTopWidth: s.borderTopWidth ?? '0px',
        borderBottomWidth: s.borderBottomWidth ?? '0px',
        borderRadius: s.borderRadius,
        boxShadow: s.boxShadow,
        backgroundImage: s.backgroundImage,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        textTransform: s.textTransform,
        margin: s.margin,
        padding: s.padding,
        gap: s.gap,
        opacity: s.opacity,
        position: 'static',
        isButton: s.isButton,
        isLink: s.isLink,
        isFormControl: s.isFormControl,
      }) as unknown as ElementSample,
  );

  describe('design diagnostic output', () => {
    it(`samples ${raw.title} and prints color + spacing + type panel data`, () => {
      const colors = classifyColorRoles(clusterColors(samples), samples);
      const scales = analyzeScales(samples);
      const { typeStyles, fonts } = analyzeTypography(samples, []);
      const withText = samples.filter((s) => s.textLength > 0);

      console.log(`\n=== ${raw.title} ===`);
      console.log(`samples: ${samples.length}, text elements: ${withText.length}`);

      console.log('\n--- colors (as the panel shows, by role) ---');
      for (const c of [...colors].sort((a, b) => b.usageCount - a.usageCount).slice(0, 25)) {
        const n = normalizeColorValue(c.value.hex);
        console.log(
          `[${String(c.value.role).padEnd(10)}] ${c.value.hex.padEnd(9)} ${(n?.oklch ?? '').padEnd(24)} x${String(c.usageCount).padEnd(5)}`,
        );
      }
      console.log(`color tokens: ${colors.length}`);

      console.log('\n--- spacing (top 15) ---');
      for (const t of [...scales.spacing]
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 15)) {
        console.log(`  ${String(t.value).padEnd(8)}px x${String(t.usageCount).padEnd(5)}`);
      }
      console.log(`distinct spacing values: ${scales.spacing.length}`);

      console.log('\n--- radius (top 10) ---');
      for (const t of [...scales.radius].sort((a, b) => b.usageCount - a.usageCount).slice(0, 10)) {
        console.log(`  ${String(t.value).padEnd(8)}px x${String(t.usageCount).padEnd(5)}`);
      }
      console.log(`distinct radius values: ${scales.radius.length}`);

      console.log('\n--- shadows (top 6) ---');
      for (const t of scales.shadows.slice(0, 6)) {
        console.log(`  x${String(t.usageCount).padEnd(4)} ${t.value.slice(0, 80)}`);
      }
      console.log('\n--- gradients (top 5) ---');
      for (const t of scales.gradients.slice(0, 5)) {
        console.log(`  x${String(t.usageCount).padEnd(4)} ${t.value.slice(0, 80)}`);
      }
      console.log(`\nspacing outliers: ${scales.outliers.length}`);

      console.log('\n--- typeStyles (as the panel shows) ---');
      for (const t of [...typeStyles].sort((a, b) => b.usageCount - a.usageCount).slice(0, 20)) {
        console.log(
          `[${t.role.padEnd(8)}] ${t.size.padEnd(8)} w${t.weight.padEnd(4)} x${String(t.usageCount).padEnd(5)} ${t.family}`,
        );
      }
      console.log(`\nfont tokens: ${fonts.length}`);
      expect(colors.length + scales.spacing.length + typeStyles.length).toBeGreaterThan(0);
    });
  });
}
