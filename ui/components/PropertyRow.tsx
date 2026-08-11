import { Check, Copy } from 'lucide-solid';
import { createSignal, type JSX } from 'solid-js';
import { notify } from '../stores/toast';

interface PropertyRowProps {
  label: string;
  /** Mono value (measurements use tabular numerals). */
  value?: string;
  /** Custom value area, overrides `value`. */
  children?: JSX.Element;
  /** Text copied by the copy action. */
  copy?: string;
  copyLabel?: string;
  confidence?: JSX.Element;
  actions?: JSX.Element;
}

export function PropertyRow(props: PropertyRowProps) {
  const [copied, setCopied] = createSignal(false);

  async function copyValue() {
    const text = props.copy;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify({
        title: 'Copied to clipboard',
        description: props.copyLabel ?? props.label,
        tone: 'success',
      });
      setTimeout(() => setCopied(false), 1400);
    } catch {
      notify({
        title: 'Could not copy',
        description: 'Clipboard access is unavailable in this context.',
        tone: 'error',
      });
    }
  }

  return (
    <div class="group flex min-h-[26px] items-center gap-2 rounded-[var(--vq-radius-sm)] px-1.5 py-0.5 transition-colors hover:bg-[var(--vq-bg-hover)]">
      <span class="w-[38%] shrink-0 truncate text-[12px] text-[var(--vq-fg-muted)]">
        {props.label}
      </span>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        {props.children ??
          (props.value != null && <code class="vq-code min-w-0 truncate">{props.value}</code>)}
        {props.confidence}
      </div>
      {props.actions}
      {props.copy && (
        <button
          type="button"
          aria-label={`Copy ${props.label}`}
          title={`Copy ${props.label}`}
          onClick={copyValue}
          class="vq-icon-btn h-6 w-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          {copied() ? (
            <Check class="size-3.5 text-[var(--vq-success)]" />
          ) : (
            <Copy class="size-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
