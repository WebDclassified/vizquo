import { For } from 'solid-js';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  class?: string;
}

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  return (
    <fieldset
      aria-label={props.ariaLabel}
      class={`m-0 inline-flex min-w-0 items-center gap-0.5 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] p-0.5 ${props.class ?? ''}`}
    >
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            aria-pressed={props.value === option.value}
            onClick={() => props.onChange(option.value)}
            class={`h-6 rounded-[var(--vq-radius-sm)] px-2 text-[11.5px] font-medium transition-colors duration-[var(--vq-duration-fast)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)] ${
              props.value === option.value
                ? 'bg-[var(--vq-bg-raised)] text-[var(--vq-fg)] shadow-[var(--vq-shadow-sm)]'
                : 'text-[var(--vq-fg-muted)] hover:text-[var(--vq-fg)]'
            }`}
          >
            {option.label}
          </button>
        )}
      </For>
    </fieldset>
  );
}
