/**
 * Compare tab (Phase 8, Section 7.25) — diff two real inspections side by
 * side: the current page against any stored scan (or two stored scans).
 * Powered by export/compare.ts (pure, unit-tested): every row is one
 * normalized value with its membership in each side.
 */
import { ArrowLeftRight, GitCompareArrows, ScanSearch, Sparkles } from 'lucide-solid';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { compareInspections, type InspectionComparison } from '../../../../../export/compare';
import { Badge } from '../../../../components/Badge';
import { Button } from '../../../../components/Button';
import { Panel } from '../../../../components/Panel';
import { openAiExplain } from '../../ai/AiExplainDialog';
import { allCandidates, useHistoryCandidates } from './candidates';

function MemberBadge(props: { present: boolean; side: 'A' | 'B' }) {
  return (
    <Badge tone={props.present ? 'success' : 'neutral'} class="shrink-0">
      {props.present ? `in ${props.side}` : `not ${props.side}`}
    </Badge>
  );
}

function ComparisonView(props: { comparison: InspectionComparison }) {
  const comparison = () => props.comparison;
  return (
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-1.5">
        <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] p-2.5">
          <p class="truncate text-[11px] font-medium text-[var(--vq-fg)]">
            A — {comparison().a.title || comparison().a.url}
          </p>
          <p class="mt-1 text-[10.5px] text-[var(--vq-fg-subtle)]">
            Consistency{' '}
            <span class="vq-nums text-[var(--vq-accent)]">{comparison().consistency.a}</span>
            /100
          </p>
        </div>
        <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] p-2.5">
          <p class="truncate text-[11px] font-medium text-[var(--vq-fg)]">
            B — {comparison().b.title || comparison().b.url}
          </p>
          <p class="mt-1 text-[10.5px] text-[var(--vq-fg-subtle)]">
            Consistency{' '}
            <span class="vq-nums text-[var(--vq-accent)]">{comparison().consistency.b}</span>
            /100
          </p>
        </div>
      </div>

      <Show
        when={comparison().differingCount > 0}
        fallback={
          <p class="rounded-[var(--vq-radius-md)] border border-[var(--vq-success-soft)] bg-[var(--vq-success-soft)] px-3 py-2 text-[11.5px] text-[var(--vq-success-fg)]">
            These scans share every detected value — no differences found.
          </p>
        }
      >
        <Badge tone="warning" class="vq-nums">
          {comparison().differingCount}{' '}
          {comparison().differingCount === 1 ? 'difference' : 'differences'}
        </Badge>
      </Show>

      <For each={comparison().sections}>
        {(section) => (
          <div class="overflow-hidden rounded-[var(--vq-radius-md)] border border-[var(--vq-border)]">
            <p class="border-b border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2.5 py-1.5 text-[10.5px] font-semibold tracking-wider text-[var(--vq-fg-muted)] uppercase">
              {section.label}
            </p>
            <div class="max-h-52 overflow-y-auto">
              <Show
                when={section.rows.length > 0}
                fallback={
                  <p class="px-3 py-3 text-[11px] text-[var(--vq-fg-subtle)]">
                    None detected on either side.
                  </p>
                }
              >
                <For each={section.rows}>
                  {(row) => (
                    <div
                      class="flex items-center gap-2 border-b border-[var(--vq-border)] px-2.5 py-1.5 last:border-b-0"
                      classList={{
                        'bg-[var(--vq-warning-soft)]': row.inA !== row.inB,
                      }}
                    >
                      {row.swatch && (
                        <span
                          class="size-4 shrink-0 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)]"
                          style={{ background: row.swatch }}
                          aria-hidden="true"
                        />
                      )}
                      <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--vq-fg)]">
                        {row.label}
                      </span>
                      <MemberBadge present={row.inA} side="A" />
                      <MemberBadge present={row.inB} side="B" />
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

export function CompareTab() {
  const history = useHistoryCandidates();
  const candidates = allCandidates(history);
  const [aId, setAId] = createSignal('');
  const [bId, setBId] = createSignal('');

  // Sensible defaults: A = live inspection, B = newest stored scan.
  createEffect(() => {
    const list = candidates();
    if (list.length === 0) return;
    if (!list.some((c) => c.id === aId())) setAId(list[0]?.id ?? '');
    const other = list.find((c) => c.id !== aId());
    if (other && !list.some((c) => c.id === bId())) setBId(other.id);
  });

  const comparison = createMemo(() => {
    const list = candidates();
    const a = list.find((c) => c.id === aId());
    const b = list.find((c) => c.id === bId());
    if (!a || !b) return null;
    return compareInspections(a.inspection, b.inspection);
  });

  function swap() {
    const a = aId();
    setAId(bId());
    setBId(a);
  }

  return (
    <div class="flex flex-col gap-3">
      <Panel
        title="Compare scans"
        subtitle="Diff the current page against any stored scan"
        actions={
          <Badge tone="neutral">
            <GitCompareArrows class="size-3" />
            {candidates().length} scans
          </Badge>
        }
      >
        <Show
          when={candidates().length >= 2}
          fallback={
            <p class="px-2 py-5 text-center text-[12px] text-[var(--vq-fg-subtle)]">
              Need two scans to compare — scan this page, and keep at least one stored scan in
              history.
            </p>
          }
        >
          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <label class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-[10px] font-semibold tracking-wider text-[var(--vq-fg-subtle)] uppercase">
                  Side A
                </span>
                <select
                  value={aId()}
                  onChange={(e) => setAId((e.target as HTMLSelectElement).value)}
                  class="h-8 w-full rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] focus:outline-none"
                >
                  <For each={candidates()}>{(c) => <option value={c.id}>{c.label}</option>}</For>
                </select>
              </label>
              <Button size="sm" variant="ghost" onClick={swap} ariaLabel="Swap sides" class="mt-4">
                <ArrowLeftRight class="size-3.5" />
              </Button>
              <label class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-[10px] font-semibold tracking-wider text-[var(--vq-fg-subtle)] uppercase">
                  Side B
                </span>
                <select
                  value={bId()}
                  onChange={(e) => setBId((e.target as HTMLSelectElement).value)}
                  class="h-8 w-full rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] focus:outline-none"
                >
                  <For each={candidates()}>{(c) => <option value={c.id}>{c.label}</option>}</For>
                </select>
              </label>
            </div>

            <Show
              when={comparison()}
              fallback={
                <p class="flex items-center gap-1.5 px-2 py-4 text-[12px] text-[var(--vq-fg-subtle)]">
                  <ScanSearch class="size-3.5" />
                  Pick two scans to see the diff.
                </p>
              }
            >
              {(result) => (
                <>
                  <ComparisonView comparison={result()} />
                  {/* Phase 9: narrate the diff — bounded diff summary via the free AI pipeline. */}
                  <div class="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        openAiExplain(
                          'compare',
                          { comparison: result() },
                          'Narrate the diff with AI',
                        )
                      }
                    >
                      <Sparkles class="size-3.5" aria-hidden="true" />
                      Narrate the diff (AI)
                    </Button>
                  </div>
                </>
              )}
            </Show>
          </div>
        </Show>
      </Panel>
    </div>
  );
}
