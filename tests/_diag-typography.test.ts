/**
 * Typography diagnostic engine run — consumes the samples collected by
 * scripts/diag-typography.mjs and runs the REAL analyzeTypography engine on
 * them, printing the exact typeStyles/fonts the panel would show.
 *
 * Diagnostic-only: skips when the sampler hasn't run (CI / fresh clones).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeTypography } from '../engine/tokens/typography';
import type { ElementSample } from '../shared/types';

const SAMPLES_PATH = '/tmp/vizquo-typography-samples.json';

if (!existsSync(SAMPLES_PATH)) {
  describe('typography diagnostic', () => {
    it.skip('run scripts/diag-typography.mjs first to generate samples', () => {});
  });
} else {
  const raw = JSON.parse(readFileSync(SAMPLES_PATH, 'utf8'));

  const samples: ElementSample[] = raw.samples.map(
    (s: Record<string, unknown>, i: number) =>
      ({
        ref: { selector: `#diag-${i}`, xpath: `/diag/${i}`, domPath: [i] },
        tag: s.tag,
        classes: [],
        textLength: s.textLength,
        depth: 3,
        parentTag: 'main',
        childTags: [],
        sectionKey: 'main',
        display: s.display,
        color: '',
        backgroundColor: '',
        borderColor: '',
        borderRadius: '',
        boxShadow: '',
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        textTransform: s.textTransform,
        margin: '',
        padding: '',
        gap: '',
        backgroundImage: '',
        opacity: '1',
        position: 'static',
        isButton: s.isButton,
        isLink: s.isLink,
        isFormControl: s.isFormControl,
      }) as ElementSample,
  );

  const { typeStyles, fonts } = analyzeTypography(samples, []);
  const withText = samples.filter((s) => s.textLength > 0 && s.fontSize && s.fontFamily);

  describe('typography diagnostic output', () => {
    it(`samples ${raw.title} and prints the panel data`, () => {
      console.log(`\n=== ${raw.title} ===`);
      console.log(`samples: ${samples.length}, text elements: ${withText.length}`);
      console.log(`distinct typeStyles produced: ${typeStyles.length}`);
      console.log(`font tokens: ${fonts.length}`);

      console.log('\n--- typeStyles (as the panel shows, sorted by usage) ---');
      for (const t of [...typeStyles].sort((a, b) => b.usageCount - a.usageCount).slice(0, 40)) {
        console.log(
          `[${t.role.padEnd(8)}] ${t.size.padEnd(8)} w${t.weight.padEnd(4)} x${String(t.usageCount).padEnd(5)} ${t.family}`,
        );
      }

      console.log('\n--- font tokens ---');
      for (const f of fonts) {
        console.log(`  ${f.value.family} (${f.value.source}, ${f.value.weight}) x${f.usageCount}`);
      }

      console.log('\n--- size histogram of text elements (top 20) ---');
      const sizes = new Map<string, number>();
      for (const s of withText) {
        const sz = s.fontSize;
        sizes.set(sz, (sizes.get(sz) ?? 0) + 1);
      }
      for (const [sz, n] of [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
        console.log(`  ${sz.padEnd(8)} x${String(n).padEnd(5)}`);
      }

      console.log('\n--- family histogram (top 10) ---');
      const fams = new Map<string, number>();
      for (const s of withText) {
        const f =
          s.fontFamily
            .split(',')[0]
            ?.trim()
            .replace(/^['"]|['"]$/g, '') ?? '?';
        fams.set(f, (fams.get(f) ?? 0) + 1);
      }
      for (const [f, n] of [...fams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`  ${f.padEnd(28)} x${String(n).padEnd(5)}`);
      }
      expect(typeStyles.length).toBeGreaterThan(0);
    });
  });
}
