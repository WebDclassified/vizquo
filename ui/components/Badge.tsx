import type { ParentProps } from 'solid-js';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

// Glass pills: translucent tinted fill + hairline rim (the vq-badge shortcut
// supplies the neutral border + sunken base; tones override fill/text and
// give the accent its tinted rim).
const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--vq-bg-sunken)] text-[var(--vq-fg-muted)]',
  accent: 'border-[var(--vq-accent-border)] bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]',
  success: 'bg-[var(--vq-success-soft)] text-[var(--vq-success-fg)]',
  warning: 'bg-[var(--vq-warning-soft)] text-[var(--vq-warning-fg)]',
  danger: 'bg-[var(--vq-danger-soft)] text-[var(--vq-danger-fg)]',
  info: 'bg-[var(--vq-info-soft)] text-[var(--vq-info-fg)]',
};

interface BadgeProps extends ParentProps {
  tone?: BadgeTone;
  class?: string;
  title?: string;
}

export function Badge(props: BadgeProps) {
  return (
    <span
      class={`vq-badge ${TONE_CLASS[props.tone ?? 'neutral']} ${props.class ?? ''}`}
      title={props.title}
    >
      {props.children}
    </span>
  );
}
