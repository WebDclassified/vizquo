/**
 * Timeline tab (Phase 10) — every stored scan of a page as a version history.
 * The History tab keeps one entry per URL (newest wins); this tab surfaces the
 * full version trail from the inspections table, with a compact diff summary
 * between adjacent versions (reuses compare.ts) so you can see a page's
 * design evolve at a glance.
 */
import { Clock3, Eye, History as HistoryIcon } from 'lucide-solid';
import { createSignal, For, onMount, Show } from 'solid-js';
import { groupInspectionsByUrl, type TimelineGroup } from '../../../../../engine/timeline/timeline';
import { compareInspections, summarizeComparison } from '../../../../../export/compare';
import type { Inspection } from '../../../../../shared/types';
import { Badge } from '../../../../components/Badge';
import { Button } from '../../../../components/Button';
import { Panel } from '../../../../components/Panel';
import { setAnalysis } from '../../../../stores/analysis-store';
import { setActivePanel } from '../../../../stores/ui-store';
import { listInspections } from '../library-client';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function consistencyTone(score: number): string {
  if (score >= 80) return 'text-[var(--vq-success-fg)]';
  if (score >= 50) return 'text-[var(--vq-warning-fg)]';
  return 'text-[var(--vq-danger-fg)]';
}

/** Diff summary of newer vs older — compact \"what changed\" chips. */
function diffLines(newer: Inspection, older: Inspection): string[] {
  return summarizeComparison(compareInspections(newer, older)).lines.slice(0, 4);
}

export function TimelineTab(props: { query?: () => string }) {
  const [groups, setGroups] = createSignal<TimelineGroup[]>([]);
  const [selectedUrl, setSelectedUrl] = createSignal<string | null>(null);

  // Loads full inspections (assets + usedBy refs included) rather than a
  // metadata projection — fine for a local tool, and grouping caps the rows
  // this tab renders; revisit with a metadata-only query if the library ever
  // grows past thousands of scans.
  onMount(() => {
    void listInspections().then((inspections) => {
      const grouped = groupInspectionsByUrl(inspections);
      setGroups(grouped);
      setSelectedUrl(grouped[0]?.url ?? null);
    });
  });

  const filtered = () => {
    const q = props.query?.()?.trim().toLowerCase();
    if (!q) return groups();
    return groups().filter(
      (group) => group.title.toLowerCase().includes(q) || group.url.toLowerCase().includes(q),
    );
  };

  function open(version: Inspection) {
    // Recall the stored scan into the Design panel (the page is untouched).
    setAnalysis('inspection', version);
    setAnalysis('cached', true);
    setAnalysis('stale', false);
    setActivePanel('design');
  }

  return (
    <Panel
      title="Version timeline"
      subtitle="Every scan of each page — see the design evolve"
      actions={
        <Badge tone="neutral" class="vq-nums">
          <HistoryIcon class="size-3" />
          {groups().length} pages
        </Badge>
      }
    >
      <Show
        when={filtered().length > 0}
        fallback={
          <p class="px-2 py-5 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            {groups().length === 0
              ? 'No scans yet — each Design scan adds a version here.'
              : 'No pages match your search.'}
          </p>
        }
      >
        <div class="flex flex-col gap-1.5">
          <For each={filtered()}>
            {(group) => (
              <div
                class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] transition-colors"
                classList={{
                  'border-[var(--vq-accent-soft)] bg-[var(--vq-accent-soft)]':
                    selectedUrl() === group.url,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedUrl(group.url)}
                  class="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                  aria-expanded={selectedUrl() === group.url}
                >
                  <Clock3 class="size-3.5 shrink-0 text-[var(--vq-fg-subtle)]" aria-hidden="true" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[12.5px] font-medium text-[var(--vq-fg)]">
                      {group.title}
                    </span>
                    <span class="block truncate text-[10.5px] text-[var(--vq-fg-subtle)]">
                      {group.url}
                    </span>
                  </span>
                  <Badge tone="neutral" class="shrink-0 text-[9px]">
                    {group.versions.length} version{group.versions.length === 1 ? '' : 's'}
                  </Badge>
                </button>

                <Show when={selectedUrl() === group.url}>
                  <div class="flex flex-col gap-1 border-t border-[var(--vq-border)] px-2 py-1.5">
                    <For each={group.versions}>
                      {(version, index) => {
                        const older = group.versions[index() + 1];
                        const summary = older ? diffLines(version, older) : null;
                        return (
                          <div class="flex items-center gap-2 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 py-1.5">
                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-2">
                                <span class="text-[11px] font-medium text-[var(--vq-fg)]">
                                  {formatDate(version.createdAt)}
                                </span>
                                <span
                                  class={`vq-nums text-[11px] font-semibold ${consistencyTone(version.consistencyScore)}`}
                                >
                                  {version.consistencyScore}
                                </span>
                                <span class="text-[10px] text-[var(--vq-fg-subtle)]">
                                  {version.scannedElementCount} elements
                                </span>
                              </div>
                              <p class="mt-0.5 truncate text-[10px] text-[var(--vq-fg-subtle)]">
                                {summary && summary.length > 0
                                  ? summary.join(' · ')
                                  : older
                                    ? 'No design change detected'
                                    : 'First recorded scan'}
                              </p>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => open(version)}>
                              <Eye class="size-3" aria-hidden="true" />
                              Open
                            </Button>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Panel>
  );
}
