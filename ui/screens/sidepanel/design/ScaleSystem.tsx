import { For, Show } from 'solid-js';
import type { Token } from '../../../../shared/types';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';
import { countLabel } from './design-helpers';

function UsageBar({ token, max }: { token: Token<unknown>; max: number }) {
  return (
    <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] px-1.5 py-1 transition-colors hover:bg-[var(--vq-bg-hover)]">
      <code class="w-16 shrink-0 text-right font-mono text-[11.5px] text-[var(--vq-fg)]">
        {String(token.value)}
      </code>
      <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--vq-bg-sunken)]">
        <div
          class="h-full rounded-full bg-[var(--vq-accent)] opacity-70"
          style={{ width: `${Math.max(4, (token.usageCount / Math.max(1, max)) * 100)}%` }}
        />
      </div>
      <span class="w-10 shrink-0 text-right text-[10.5px] tabular-nums text-[var(--vq-fg-subtle)]">
        {token.usageCount}
      </span>
    </div>
  );
}

export function ScaleSystem() {
  const spacing = () => analysis.inspection?.tokens.spacing ?? [];
  const radius = () => analysis.inspection?.tokens.radius ?? [];
  const shadows = () => analysis.inspection?.tokens.shadows ?? [];
  const gradients = () => analysis.inspection?.gradients ?? [];
  const spacingScale = () => analysis.inspection?.tokens.spacing ?? [];

  const maxUsage = (list: Token<unknown>[]): number =>
    Math.max(1, ...list.map((t) => t.usageCount));

  return (
    <>
      <Panel id="spacing" title="Spacing scale" subtitle="Recurring margin / padding / gap values">
        <Show when={spacing().length > 0} fallback={<Empty>No spacing values detected.</Empty>}>
          <div class="flex flex-col gap-1">
            <For each={[...spacing()].sort((a, b) => a.value - b.value)}>
              {(token) => <UsageBar token={token} max={maxUsage(spacing())} />}
            </For>
          </div>
          <p class="mt-2 px-1 text-[10.5px] text-[var(--vq-fg-subtle)]">
            {countLabel(spacingScale().length, 'distinct value')} — a consistent 4/8/12/16-style
            scale scores higher on Design Consistency.
          </p>
        </Show>
      </Panel>

      <Panel id="radius" title="Border radius" subtitle="Recurring corner values">
        <Show
          when={radius().length > 0}
          fallback={<Empty>No border radius values detected.</Empty>}
        >
          <div class="flex flex-col gap-1">
            <For each={[...radius()].sort((a, b) => a.value - b.value)}>
              {(token) => <UsageBar token={token} max={maxUsage(radius())} />}
            </For>
          </div>
        </Show>
      </Panel>

      <Panel id="shadows" title="Shadows" subtitle="Deduped box-shadow values">
        <Show when={shadows().length > 0} fallback={<Empty>No shadows detected.</Empty>}>
          <div class="flex flex-col gap-1">
            <For each={shadows()}>
              {(token) => <UsageBar token={token} max={maxUsage(shadows())} />}
            </For>
          </div>
        </Show>
      </Panel>

      <Panel id="gradients" title="Gradients" subtitle="Deduped gradient backgrounds">
        <Show when={gradients().length > 0} fallback={<Empty>No gradients detected.</Empty>}>
          <div class="flex flex-col gap-1">
            <For each={gradients()}>
              {(token) => (
                <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] px-1.5 py-1 transition-colors hover:bg-[var(--vq-bg-hover)]">
                  <div
                    class="h-6 w-16 shrink-0 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)]"
                    style={{ background: token.value }}
                    title={token.value}
                  />
                  <code class="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[var(--vq-fg-muted)]">
                    {token.value}
                  </code>
                  <span class="shrink-0 text-[10.5px] tabular-nums text-[var(--vq-fg-subtle)]">
                    {token.usageCount}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Panel>
    </>
  );
}

function Empty(props: { children?: string }) {
  return <p class="px-3 py-4 text-[12px] text-[var(--vq-fg-subtle)]">{props.children}</p>;
}
