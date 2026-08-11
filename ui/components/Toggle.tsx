interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle(props: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      class="group flex w-full items-center justify-between gap-3 rounded-[var(--vq-radius-md)] px-2 py-2 text-left transition-colors hover:bg-[var(--vq-bg-hover)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]"
    >
      <span class="min-w-0">
        <span class="block text-[13px] font-medium text-[var(--vq-fg)]">{props.label}</span>
        {props.description && (
          <span class="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--vq-fg-muted)]">
            {props.description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        class={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-[var(--vq-duration-base)] ${
          props.checked ? 'bg-[var(--vq-accent)]' : 'bg-[var(--vq-border-strong)]'
        }`}
      >
        <span
          class={`absolute top-0.5 size-4 rounded-full bg-white shadow-[var(--vq-shadow-sm)] transition-transform duration-[var(--vq-duration-base)] ${
            props.checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
