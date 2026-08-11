/**
 * Library panel (Phase 8) — everything Vizquo has saved, in one screen.
 *
 * Six tabs: Collections (curated sets of artifacts), History (past scans),
 * Notes (local observations), Timeline (per-page version history), Compare
 * (diff two inspections), and Reports (standalone design report HTML). All
 * data is local — nothing leaves the browser.
 */
import { Tabs as KTabs } from '@kobalte/core';
import { Search } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import { CollectionsTab } from './tabs/CollectionsTab';
import { CompareTab } from './tabs/CompareTab';
import { HistoryTab } from './tabs/HistoryTab';
import { NotesTab } from './tabs/NotesTab';
import { ReportsTab } from './tabs/ReportsTab';
import { TimelineTab } from './tabs/TimelineTab';

type LibraryTabId = 'collections' | 'history' | 'notes' | 'timeline' | 'compare' | 'reports';

const TABS: { id: LibraryTabId; label: string }[] = [
  { id: 'collections', label: 'Collections' },
  { id: 'history', label: 'History' },
  { id: 'notes', label: 'Notes' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Compare' },
  { id: 'reports', label: 'Reports' },
];

const TAB_CLASS =
  'rounded-[var(--vq-radius-md)] px-2.5 py-1 text-[12px] font-medium text-[var(--vq-fg-muted)] transition-colors duration-[var(--vq-duration-fast)] hover:bg-[var(--vq-bg-hover)] hover:text-[var(--vq-fg)] data-[selected]:bg-[var(--vq-accent-soft)] data-[selected]:text-[var(--vq-accent)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]';

export function LibraryPanel() {
  const [tab, setTab] = createSignal<LibraryTabId>('collections');
  // Phase 9 power-up: search across the list tabs (collections/history/notes).
  const [query, setQuery] = createSignal('');

  return (
    <div class="flex h-full flex-col">
      <KTabs.Root value={tab()} onChange={(v) => setTab(v as LibraryTabId)}>
        <div class="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-[var(--vq-border)] px-2 py-1.5">
          <KTabs.List class="flex items-center gap-0.5">
            <For each={TABS}>
              {(item) => (
                <KTabs.Trigger value={item.id} class={TAB_CLASS}>
                  {item.label}
                </KTabs.Trigger>
              )}
            </For>
          </KTabs.List>
          <div class="ml-auto flex min-w-0 items-center gap-1.5 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2">
            <Search class="size-3 shrink-0 text-[var(--vq-fg-subtle)]" aria-hidden="true" />
            <input
              type="search"
              value={query()}
              placeholder="Search library…"
              aria-label="Search collections, history, and notes"
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              class="h-7 w-28 min-w-0 bg-transparent text-[11.5px] text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] focus:outline-none sm:w-36"
            />
          </div>
        </div>
      </KTabs.Root>

      <main class="min-h-0 flex-1 overflow-y-auto p-3">
        <Show when={tab() === 'collections'}>
          <CollectionsTab query={query} />
        </Show>
        <Show when={tab() === 'history'}>
          <HistoryTab query={query} />
        </Show>
        <Show when={tab() === 'notes'}>
          <NotesTab query={query} />
        </Show>
        <Show when={tab() === 'timeline'}>
          <TimelineTab query={query} />
        </Show>
        <Show when={tab() === 'compare'}>
          <CompareTab />
        </Show>
        <Show when={tab() === 'reports'}>
          <ReportsTab />
        </Show>
      </main>
    </div>
  );
}
