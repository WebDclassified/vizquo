import { describe, expect, it } from 'vitest';
import {
  codegenExtension,
  componentName,
  elementToCode,
  elementToHtml,
  elementToReact,
  elementToSvelte,
  elementToTailwind,
  elementToVue,
  sidesShorthand,
  styleMap,
} from '../export/codegen';
import { codegenInputOf } from '../export/export-center';
import { buttonInspection } from './helpers/element-fixture';

const input = codegenInputOf(buttonInspection());

describe('styleMap (dedupe + defaults)', () => {
  it('emits meaningful computed styles and skips browser defaults', () => {
    const styles = styleMap(input);
    expect(styles.display).toBe('inline-flex');
    expect(styles['background-color']).toBe('#635bff');
    expect(styles.padding).toBe('8px 16px');
    expect(styles['border-radius']).toBe('8px');
    expect(styles['font-weight']).toBe('600');
    // Defaults never leak in.
    expect(styles.opacity).toBeUndefined();
    expect(styles.position).toBe('relative'); // meaningful — kept
    expect(styles['z-index']).toBeUndefined();
    expect(styles['text-transform']).toBeUndefined();
  });

  it('never emits a bare var() chain as a literal value', () => {
    const styles = styleMap({
      ...input,
      appearance: { ...input.appearance, color: 'var(--primary, #fff)' },
    });
    expect(styles.color).toBeUndefined();
  });

  it('collapses Sides into a CSS shorthand', () => {
    expect(sidesShorthand({ top: '8px', right: '16px', bottom: '8px', left: '16px' })).toBe(
      '8px 16px',
    );
    expect(sidesShorthand({ top: '4px', right: '4px', bottom: '4px', left: '4px' })).toBe('4px');
  });
});

describe('componentName', () => {
  it('pascal-cases tags', () => {
    expect(componentName('BUTTON')).toBe('ButtonComponent');
    expect(componentName('div')).toBe('DivComponent');
  });
});

describe('elementToReact (7.18 DoD)', () => {
  it('produces accessible, faithful, non-duplicated code', () => {
    const code = elementToReact(input);
    expect(code).toContain('export function ButtonComponent');
    expect(code).toContain('<button');
    expect(code).toContain('type="submit"'); // preserved behavior attribute
    expect(code).toContain('backgroundColor'); // camelCase style prop
    expect(code).toContain('#635bff');
    expect(code).toContain('padding');
    expect(code).toContain('Get started'); // text preserved
    // No duplicate declarations.
    expect(code.match(/backgroundColor/g)).toHaveLength(1);
    // Accessible: ReactNode children typed.
    expect(code).toContain('children?: ReactNode');
  });
});

describe('elementToTailwind', () => {
  it('maps computed values to utility classes with arbitrary fallbacks', () => {
    const code = elementToTailwind(input);
    expect(code).toContain('inline-flex');
    expect(code).toContain('bg-[#635bff]');
    expect(code).toContain('text-[#ffffff]');
    expect(code).toContain('rounded-[8px]');
    expect(code).toContain('font-semibold');
    expect(code).toContain('gap-[8px]');
  });

  it('keeps unmapped computed styles as inline styles — never drops them', () => {
    // position is not a utility mapping — it must survive as inline style.
    const code = elementToTailwind(input);
    expect(code).toContain('style={{');
    expect(code).toContain('position');
    expect(code).toContain('relative');
    expect(code).toContain('cursor');
    expect(code).toContain('pointer');
  });
});

describe('elementToHtml', () => {
  it('emits inline styles and preserved attributes', () => {
    const html = elementToHtml(input);
    expect(html).toContain('<button');
    expect(html).toContain('type="submit"');
    expect(html).toContain('style="');
    expect(html).toContain('background-color: #635bff');
    expect(html).toContain('>Get started</button>');
  });
});

describe('elementToVue / elementToSvelte', () => {
  it('Vue uses a bound style object and keeps the element text', () => {
    const code = elementToVue(input);
    expect(code).toContain('<script setup>');
    expect(code).toContain(':style="{');
    expect(code).toContain('Get started'); // non-empty text is kept
    expect(code).toContain('<button');
  });

  it('Svelte uses a style attribute and keeps the element text', () => {
    const code = elementToSvelte(input);
    expect(code).toContain('<script>');
    expect(code).toContain('style="{');
    expect(code).toContain('Get started');
  });

  it('Vue/Svelte use a slot when the element has no text', () => {
    const empty = { ...input, text: undefined };
    expect(elementToVue(empty)).toContain('<slot />');
    expect(elementToSvelte(empty)).toContain('<slot />');
  });
});

describe('elementToCode dispatch + extensions', () => {
  it('routes every format', () => {
    expect(elementToCode(input, 'react')).toContain('export function');
    expect(elementToCode(input, 'vue')).toContain('<template>');
    expect(elementToCode(input, 'svelte')).toContain('<script>');
    expect(elementToCode(input, 'html')).toContain('<button');
    expect(elementToCode(input, 'tailwind')).toContain('inline-flex');
  });

  it('reports the right file extensions', () => {
    expect(codegenExtension('react')).toBe('.tsx');
    expect(codegenExtension('vue')).toBe('.vue');
    expect(codegenExtension('svelte')).toBe('.svelte');
    expect(codegenExtension('html')).toBe('.html');
    expect(codegenExtension('tailwind')).toBe('.tsx');
  });
});
