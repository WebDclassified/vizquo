import { Check, Layers, X } from 'lucide-solid';
import { For, Show } from 'solid-js';
import { Button } from '../../../components/Button';
import { analysis } from '../../../stores/analysis-store';
import { MULTI_FIELD_LABEL } from './design-helpers';
import { clearMultiSelection } from './scan-client';

/**
 * Multi-element selection summary (Section 7.7): shift-click in Inspect mode.
 * Shows what the selection has in common and what differs — never guesses.
 */
export function MultiSelectBanner() {
  const refs = () => analysis.multiRefs;
  const summary = () => analysis.multiSummary;

  return (
    <Show when={refs().length >= 2}>
      <section
        class="rounded-[var(--vq-radius-lg)] border border-[var(--vq-accent-border)] bg-[var(--vq-accent-soft)] p-3"
        aria-label={`${refs().length} elements selected`}
      >
        <div class="flex items-center gap-2">
          <Layers class="size-4 shrink-0 text-[var(--vq-accent)]" aria-hidden="true" />
          <p class="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--vq-fg)]">
            {refs().length} elements selected
          </p>
          <Button
            variant="ghost"
            size="sm"
            ariaLabel="Clear multi-selection"
            onClick={() => void clearMultiSelection()}
          >
            <X class="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        </div>

        <Show when={summary()}>
          {(data) => (
            <div class="mt-2 flex flex-col gap-1.5">
              <Show when={Object.keys(data().common).length > 0}>
                <div>
                  <p class="text-[10px] font-semibold tracking-wider text-[var(--vq-fg-muted)] uppercase">
                    Common
                  </p>
                  <ul class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <For each={Object.entries(data().common)}>
                      {([field, value]) => (
                        <li class="flex items-center gap-1 text-[11px] text-[var(--vq-fg)]">
                          <Check class="size-3 text-[var(--vq-success-fg)]" aria-hidden="true" />
                          <span class="text-[var(--vq-fg-subtle)]">
                            {MULTI_FIELD_LABEL[field] ?? field}
                          </span>
                          <span class="truncate font-mono">{value}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>
              <Show when={data().differing.length > 0}>
                <p class="text-[11px] text-[var(--vq-fg-subtle)]">
                  Differing:{' '}
                  {data()
                    .differing.map((f) => MULTI_FIELD_LABEL[f] ?? f)
                    .join(', ')}
                </p>
              </Show>
            </div>
          )}
        </Show>
      </section>
    </Show>
  );
}
