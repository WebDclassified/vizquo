/**
 * History tab (Phase 8) — every past scan, one entry per URL (newest replaces
 * the previous entry for the same page). Pin keeps an entry past the 50-entry
 * cap; Open recalls the stored inspection into the Design panel.
 */
import { History as HistoryIcon, Pin, PinOff, Trash2 } from 'lucide-solid';
import { createSignal, For, onMount, Show } from 'solid-js';
import type { HistoryEntry } from '../../../../../shared/types';
import { Badge } from '../../../../components/Badge';
import { Button } from '../../../../components/Button';
import { Panel } from '../../../../components/Panel';
import { setAnalysis } from '../../../../stores/analysis-store';
import { notify } from '../../../../stores/toast';
import { setActivePanel } from '../../../../stores/ui-store';
import { deleteHistory, getInspection, listHistory, setHistoryPinned } from '../library-client';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryTab(props: { query?: () => string }) {
  const [entries, setEntries] = createSignal<HistoryEntry[]>([]);

  const filtered = () => {
    const q = props.query?.()?.trim().toLowerCase();
    if (!q) return entries();
    return entries().filter(
      (entry) =>
        entry.page.title.toLowerCase().includes(q) || entry.page.url.toLowerCase().includes(q),
    );
  };

  async function reload() {
    setEntries(await listHistory());
  }

  onMount(() => void reload());

  async function open(entry: HistoryEntry) {
    try {
      const inspection = await getInspection(entry.inspectionId);
      if (!inspection) {
        notify({ title: 'This scan is no longer stored', tone: 'warning' });
        return;
      }
      // Recall the stored scan into the Design panel — it replaces the live
      // in-memory result with the saved one (the page itself is untouched).
      setAnalysis('inspection', inspection);
      setAnalysis('cached', true);
      setAnalysis('stale', false);
      setActivePanel('design');
    } catch {
      notify({ title: 'Could not open this scan', tone: 'error' });
    }
  }

  async function togglePinned(entry: HistoryEntry) {
    await setHistoryPinned(entry.id, !entry.pinned);
    await reload();
  }

  async function remove(entry: HistoryEntry) {
    await deleteHistory(entry.id);
    await reload();
  }

  return (
    <Panel
      title="Scan history"
      subtitle="Every page you've scanned — newest first, one per URL"
      actions={
        <Badge tone="neutral" class="vq-nums">
          <HistoryIcon class="size-3" />
          {entries().length}
        </Badge>
      }
    >
      <Show
        when={entries().length > 0}
        fallback={
          <p class="px-2 py-5 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            Nothing scanned yet — run a Design scan on any page and it lands here.
          </p>
        }
      >
        <Show
          when={filtered().length > 0}
          fallback={
            <p class="px-2 py-5 text-center text-[12px] text-[var(--vq-fg-subtle)]">
              No history entries match your search.
            </p>
          }
        >
          <div class="flex flex-col gap-1.5">
            <For each={filtered()}>
              {(entry) => (
                <div
                  class="flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2"
                  classList={{
                    'border-[var(--vq-accent-soft)] bg-[var(--vq-accent-soft)]': entry.pinned,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void togglePinned(entry)}
                    title={entry.pinned ? 'Unpin' : 'Pin — keeps this entry past the 50 cap'}
                    class="vq-icon-btn h-6 w-6 shrink-0"
                    aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
                  >
                    <Show when={entry.pinned} fallback={<Pin class="size-3.5" />}>
                      <PinOff class="size-3.5" />
                    </Show>
                  </button>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[12.5px] font-medium text-[var(--vq-fg)]">
                      {entry.page.title || entry.page.url}
                    </p>
                    <p class="truncate text-[10.5px] text-[var(--vq-fg-subtle)]">
                      {entry.page.url} · {formatDate(entry.scannedAt)}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void open(entry)}>
                    Open
                  </Button>
                  <button
                    type="button"
                    onClick={() => void remove(entry)}
                    aria-label="Delete from history"
                    title="Delete from history"
                    class="vq-icon-btn h-6 w-6 shrink-0"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </Panel>
  );
}
