import { Button as KButton } from '@kobalte/core';
import { type ParentProps, splitProps } from 'solid-js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ParentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  onClick?: (e: MouseEvent) => void;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'vq-btn-primary',
  secondary: 'vq-btn-secondary',
  ghost: 'vq-btn-ghost',
  danger: 'vq-btn-danger',
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    'variant',
    'size',
    'class',
    'disabled',
    'title',
    'ariaLabel',
    'onClick',
  ]);
  const sizeClass = local.size === 'sm' ? 'vq-btn-sm' : 'vq-btn-md';

  return (
    <KButton.Root
      type="button"
      class={`${VARIANT_CLASS[local.variant ?? 'secondary']} ${sizeClass} ${local.class ?? ''}`}
      disabled={local.disabled}
      title={local.title}
      aria-label={local.ariaLabel}
      onClick={local.onClick}
    >
      {rest.children}
    </KButton.Root>
  );
}
