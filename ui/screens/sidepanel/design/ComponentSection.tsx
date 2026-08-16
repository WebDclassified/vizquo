/**
 * ComponentSection (Phase 8) — the component explorer.
 *
 * The scan's structure unit detects recurring component types (≥3 instances,
 * Section 7.6). This section lists every detected component with its
 * confidence, instance count, expandable instance selectors, and variants —
 * and a one-click "Locate" that highlights the real elements on the page.
 */
import { Boxes, ChevronDown, Locate } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import type { Component } from '../../../../shared/types';
import { Badge } from '../../../components/Badge';
import { ConfidenceBadge } from '../../../components/ConfidenceBadge';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';
import { highlightRefs } from './scan-client';

function ComponentRow(props: { component: Component }) {
  const [expanded, setExpanded] = createSignal(false);
  const component = () => props.component;
  const instances = () => component().instances;
  const variantEntries = () => Object.entries(component().variants);

  function locate(): void {
    void highlightRefs(instances(), `${instances().length}× ${component().type}`);
  }

  return (
    <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] transition-colors hover:border-[var(--vq-border-strong)]">
      <div class="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          aria-expanded={expanded()}
          aria-label={`${component().type} details`}
          onClick={() => setExpanded((v) => !v)}
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]"
        >
          <ChevronDown
            class={`size-3.5 shrink-0 text-[var(--vq-fg-subtle)] transition-transform ${
              expanded() ? '' : '-rotate-90'
            }`}
            aria-hidden="true"
          />
          <span class="truncate font-mono text-[12px] font-medium text-[var(--vq-fg)]">
            {component().type}
          </span>
        </button>
        <ConfidenceBadge
          level={component().confidence?.level}
          score={component().confidence?.score}
        />
        <Badge tone="neutral" class="vq-nums shrink-0">
          {instances().length} {instances().length === 1 ? 'instance' : 'instances'}
        </Badge>
        <button
          type="button"
          onClick={locate}
          title="Highlight every instance on the page"
          class="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)] px-1.5 text-[10.5px] font-medium text-[var(--vq-fg-muted)] transition-colors hover:border-[var(--vq-accent)] hover:bg-[var(--vq-accent-soft)] hover:text-[var(--vq-accent)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]"
        >
          <Locate class="size-3" aria-hidden="true" />
          Locate
        </button>
      </div>

      <Show when={expanded()}>
        <div class="flex flex-col gap-2 border-t border-[var(--vq-border)] px-2.5 py-2">
          <Show when={variantEntries().length > 0}>
            <div>
              <p class="mb-1 text-[10px] font-semibold tracking-wider text-[var(--vq-fg-subtle)] uppercase">
                Variants
              </p>
              <div class="flex flex-wrap gap-1">
                <For each={variantEntries()}>
                  {([name, refs]) => (
                    <button
                      type="button"
                      onClick={() => void highlightRefs(refs, `${component().type} — ${name}`)}
                      title={`${refs.length} instance${refs.length === 1 ? '' : 's'} — highlight on page`}
                      class="cursor-pointer rounded-full border border-[var(--vq-border)] px-2 py-0.5 text-[10.5px] text-[var(--vq-fg-muted)] transition-colors hover:border-[var(--vq-accent)] hover:text-[var(--vq-accent)]"
                    >
                      {name} · {refs.length}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div>
            <p class="mb-1 text-[10px] font-semibold tracking-wider text-[var(--vq-fg-subtle)] uppercase">
              Instances
            </p>
            <ul class="flex flex-col gap-0.5">
              <For each={instances()}>
                {(ref) => (
                  <li class="truncate rounded-[var(--vq-radius-sm)] bg-[var(--vq-bg-sunken)] px-1.5 py-1 font-mono text-[10px] text-[var(--vq-fg-subtle)]">
                    {ref.selector}
                  </li>
                )}
              </For>
            </ul>
          </div>
        </div>
      </Show>
    </div>
  );
}

export function ComponentSection() {
  const components = () => analysis.inspection?.components ?? [];
  return (
    <Panel
      id="components"
      title="Components"
      subtitle="Recurring structures — detected, not inferred as fact"
      actions={
        <Badge tone="neutral" class="vq-nums">
          <Boxes class="size-3" />
          {components().length}
        </Badge>
      }
    >
      <Show
        when={components().length > 0}
        fallback={
          <p class="px-2 py-4 text-[12px] leading-relaxed text-[var(--vq-fg-subtle)]">
            No recurring components detected — the page may not reuse structures (≥3 similar
            instances), or the sample was too small to judge.
          </p>
        }
      >
        <div class="flex flex-col gap-1.5">
          <For each={components()}>{(component) => <ComponentRow component={component} />}</For>
        </div>
      </Show>
    </Panel>
  );
}
