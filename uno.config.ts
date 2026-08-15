import { defineConfig, presetUno } from 'unocss';

/**
 * Vizquo's OWN UI styling (Section 6) — UnoCSS with token-backed shortcuts.
 * Tailwind-conversion output for inspected pages (Phase 6) is a separate
 * feature about other sites and has nothing to do with this file.
 *
 * Every color/size here reads a CSS custom property from ui/theme.css, so
 * theming is a token swap, never a component rewrite.
 *
 * Surface material mapping (liquid glass, brand system v4 — see theme.css):
 *   standard material → vq-panel / vq-card / vq-btn-secondary
 *   elevated material → vq-tooltip
 *   thin material     → vq-input
 *   floating material → .vq-float / .vq-overlay (literal classes in theme.css)
 *
 * UnoCSS shortcuts CANNOT reference plain CSS classes (unknown names are
 * dropped), so each shortcut inlines its material recipe: translucent fill
 * token + hairline border + edge-light shadow. Performance rule from the
 * design system: backdrop blur is applied ONLY where it is visible — floating
 * surfaces over real content (tooltips, dialogs, toasts). Inline surfaces
 * (panels, cards, buttons) sit on the soft ambient scene, so blurring it
 * would be invisible; they express glass through translucency + edge light
 * alone. High-contrast mode forces solid fills and removes blur globally.
 */
export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    // ---- Buttons ----
    // Buttons are compact technical controls: 4px radius, hairline borders,
    // accent for the one primary action (brand system §4.3/§18.1). Primary
    // stays solid accent (one strong action per view); secondary is a
    // standard-glass surface; ghost is a quiet translucent hover.
    vqBtn:
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--vq-radius-sm)] font-medium select-none transition-colors duration-[var(--vq-duration-fast)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]',
    'vq-btn-sm': 'vqBtn h-7 px-2.5 text-xs',
    'vq-btn-md': 'vqBtn h-8 px-3 text-[13px]',
    'vq-btn-primary':
      'vq-btn-md bg-[var(--vq-accent)] text-[var(--vq-accent-fg)] shadow-[0_1px_2px_rgb(0_0_0/0.25)] hover:bg-[var(--vq-accent-hover)] active:bg-[var(--vq-accent-active)]',
    'vq-btn-secondary':
      'vq-btn-md border border-[var(--vq-border)] bg-[var(--vq-mat-standard-bg)] text-[var(--vq-fg)] shadow-[var(--vq-edge-light),var(--vq-shadow-sm)] hover:bg-[var(--vq-bg-hover)] hover:border-[var(--vq-border-strong)]',
    'vq-btn-ghost':
      'vq-btn-md text-[var(--vq-fg-muted)] hover:bg-[var(--vq-bg-hover)] hover:text-[var(--vq-fg)]',
    'vq-btn-danger':
      'vq-btn-md bg-[var(--vq-danger)] text-[#fff] shadow-[0_1px_2px_rgb(0_0_0/0.25)] hover:bg-[var(--vq-danger-hover)]',
    'vq-icon-btn':
      'vqBtn size-7 shrink-0 text-[var(--vq-fg-muted)] hover:bg-[var(--vq-bg-hover)] hover:text-[var(--vq-fg)] data-[selected]:bg-[var(--vq-accent-soft)] data-[selected]:text-[var(--vq-accent)]',
    // ---- Inputs (thin material) ----
    'vq-input':
      'h-8 w-full rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-mat-thin-bg)] px-2.5 text-[13px] text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] transition-colors duration-[var(--vq-duration-fast)] focus:border-transparent focus:outline-2 focus:outline-solid focus:outline-[var(--vq-ring)]',
    // ---- Surfaces (standard material) ----
    // Inline recipe — UnoCSS shortcuts drop unknown class names, so the
    // standard-material declarations live here instead of a .vq-mat-* class.
    'vq-panel':
      'rounded-[var(--vq-radius-lg)] border border-[var(--vq-border)] bg-[var(--vq-mat-standard-bg)] shadow-[var(--vq-edge-light),var(--vq-shadow-sm)]',
    'vq-card':
      'rounded-[var(--vq-radius-lg)] border border-[var(--vq-border)] bg-[var(--vq-mat-standard-bg)] shadow-[var(--vq-edge-light),var(--vq-shadow-md)]',
    'vq-code':
      'rounded-[var(--vq-radius-sm)] bg-[var(--vq-code-bg)] px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-[var(--vq-fg)]',
    'vq-kbd':
      'inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-1.5 font-mono text-[11px] text-[var(--vq-fg-muted)] tabular-nums',
    // ---- Tooltip (elevated material — real backdrop blur: it floats over
    // panel content, so the blur is visible and worth the composite) ----
    'vq-tooltip':
      'z-[100] rounded-[var(--vq-radius-md)] border border-[var(--vq-border-strong)] bg-[var(--vq-mat-elevated-bg)] px-2 py-1 text-[12px] text-[var(--vq-fg)] shadow-[var(--vq-edge-light),var(--vq-shadow-md)] backdrop-blur-[var(--vq-blur-elevated)] backdrop-saturate-[var(--vq-saturate)]',
    'vq-badge':
      'inline-flex h-5 items-center gap-1 rounded-full border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2 text-[11px] font-medium tabular-nums',
  },
});
