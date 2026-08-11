import { For, Show } from 'solid-js';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';

export function BreakpointsPanel() {
  const breakpoints = () => analysis.inspection?.breakpoints ?? [];
  const raw = () => [...new Set(breakpoints().map((bp) => bp.raw))];
  return (
    <Panel
      id="breakpoints"
      title="Breakpoints"
      subtitle="Media queries reachable from page stylesheets"
    >
      <Show
        when={breakpoints().length > 0}
        fallback={
          <p class="px-3 py-4 text-[12px] text-[var(--vq-fg-subtle)]">
            No media queries detected. This page may be single-layout or styles may be blocked by
            CORS.
          </p>
        }
      >
        <div class="flex flex-col gap-0.5">
          <For each={raw()}>
            {(bp) => (
              <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] px-1.5 py-1 transition-colors hover:bg-[var(--vq-bg-hover)]">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--vq-accent)]" />
                <code class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--vq-fg)]">
                  {bp}
                </code>
              </div>
            )}
          </For>
        </div>
        <p class="mt-2 px-1 text-[10.5px] text-[var(--vq-fg-subtle)]">
          {breakpoints().length} parsed breakpoint{breakpoints().length === 1 ? '' : 's'} across
          reachable stylesheets.
        </p>
      </Show>
    </Panel>
  );
}
