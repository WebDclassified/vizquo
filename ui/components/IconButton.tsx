import { Tooltip as KTooltip } from '@kobalte/core';
import type { Component } from 'solid-js';

interface IconButtonProps {
  icon: Component<{ class?: string }>;
  /** Accessible name; also the default tooltip text. */
  label: string;
  tooltip?: string;
  onClick?: (e: MouseEvent) => void;
  class?: string;
  disabled?: boolean;
  selected?: boolean;
  id?: string;
}

/**
 * Icon button with a tooltip. Note: the Trigger must be created *inside* the
 * Tooltip.Root subtree — a JSX element hoisted into a variable loses Solid's
 * context chain and Kobalte throws "useTooltipContext must be used within a
 * Tooltip component".
 */
export function IconButton(props: IconButtonProps) {
  const Icon = props.icon;

  return (
    <KTooltip.Root openDelay={400}>
      <KTooltip.Trigger
        as="button"
        type="button"
        id={props.id}
        aria-label={props.label}
        disabled={props.disabled}
        data-selected={props.selected || undefined}
        onClick={props.onClick}
        class={`vq-icon-btn ${props.class ?? ''}`}
      >
        <Icon class="size-4" />
      </KTooltip.Trigger>
      <KTooltip.Portal>
        <KTooltip.Content class="vq-tooltip">{props.tooltip ?? props.label}</KTooltip.Content>
      </KTooltip.Portal>
    </KTooltip.Root>
  );
}
