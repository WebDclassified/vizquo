import { Copy } from 'lucide-solid';
import { For, Show } from 'solid-js';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';
import { notify } from '../../../stores/toast';

async function copyVariable(name: string, value: string) {
  try {
    await navigator.clipboard.writeText(`--${name}: ${value};`);
    notify({ title: 'Copied CSS variable', description: `--${name}`, tone: 'success' });
  } catch {
    notify({ title: 'Could not copy', tone: 'error' });
  }
}

export function VariablesPanel() {
  const variables = () => analysis.inspection?.variables ?? [];
  return (
    <Panel
      id="variables"
      title="CSS variables"
      subtitle="Defined on :root — the page's design tokens"
    >
      <Show
        when={variables().length > 0}
        fallback={
          <p class="px-3 py-4 text-[12px] text-[var(--vq-fg-subtle)]">
            No CSS variables detected. The page may inline its values instead.
          </p>
        }
      >
        <div class="flex flex-col gap-0.5">
          <For each={variables()}>
            {(variable) => (
              <div class="group flex items-center gap-2 rounded-[var(--vq-radius-md)] px-1.5 py-1 transition-colors hover:bg-[var(--vq-bg-hover)]">
                <code class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--vq-fg)]">
                  <span class="text-[var(--vq-fg-subtle)]">--</span>
                  {variable.name}
                </code>
                <code class="max-w-[40%] shrink-0 truncate font-mono text-[11px] text-[var(--vq-fg-muted)]">
                  {variable.value}
                </code>
                <Show when={variable.usageCount > 0}>
                  <span class="shrink-0 text-[10.5px] tabular-nums text-[var(--vq-fg-subtle)]">
                    {variable.usageCount}×
                  </span>
                </Show>
                <button
                  type="button"
                  class="vq-icon-btn h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Copy variable --${variable.name}`}
                  title="Copy declaration"
                  onClick={() => void copyVariable(variable.name, variable.value)}
                >
                  <Copy class="size-3.5" />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Panel>
  );
}
