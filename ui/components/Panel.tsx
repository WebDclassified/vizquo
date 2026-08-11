import type { JSX, ParentProps } from 'solid-js';

interface PanelProps extends ParentProps {
  /** Anchor id — metrics scroll targets (Section 7.2 clickable overview). */
  id?: string;
  title: string;
  subtitle?: string;
  actions?: JSX.Element;
  class?: string;
  bodyClass?: string;
}

export function Panel(props: PanelProps) {
  return (
    <section id={props.id} class={`vq-panel ${props.class ?? ''}`}>
      <header class="flex items-center justify-between gap-2 border-b border-[var(--vq-border)] px-3 py-2">
        <div class="min-w-0">
          <h2 class="truncate text-[11px] font-semibold tracking-wider text-[var(--vq-fg)] uppercase">
            {props.title}
          </h2>
          {props.subtitle && (
            <p class="truncate text-[11px] text-[var(--vq-fg-subtle)]">{props.subtitle}</p>
          )}
        </div>
        {props.actions && <div class="flex shrink-0 items-center gap-1">{props.actions}</div>}
      </header>
      <div class={props.bodyClass ?? 'p-3'}>{props.children}</div>
    </section>
  );
}
