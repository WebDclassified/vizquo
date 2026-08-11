/**
 * Element detail — the inspector's main view. Identity header (tag#id.class,
 * dimensions, visibility), the six tabs, and in Designer mode the "Show CSS"
 * toggle that reveals raw values under the plain-language summary.
 */
import { Crosshair, RotateCcw, Sparkles, Star } from 'lucide-solid';
import { createSignal, For, onMount, Show } from 'solid-js';
import type { ElementInspection } from '../../../../shared/types';
import { Badge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { notify } from '../../../stores/toast';
import { ui } from '../../../stores/ui-store';
import { openAiExplain } from '../ai/AiExplainDialog';
import { favoriteKey, listFavoriteKeys, toggleFavorite } from '../library/favorites-client';
import { BoxModelDiagram } from './BoxModelDiagram';
import { PropertyRowsSkeleton } from './InspectorSkeleton';
import { copyText, fetchInspection, setInspectMode } from './inspector-client';
import { type InspectTabId, setInspectorTab, setShowRawCss, store } from './inspector-store';
import { GroupTab } from './tabs/GroupTab';
import { OverviewTab } from './tabs/OverviewTab';
import { SourceTab } from './tabs/SourceTab';

const TABS: { id: InspectTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'layout', label: 'Layout' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'typography', label: 'Typography' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'source', label: 'Source' },
];

function IdentityHeader(props: { inspection: ElementInspection }) {
  const html = () => props.inspection.html;
  const [favorite, setFavorite] = createSignal(false);
  const label = () => {
    let out = html().tagName;
    if (html().id) out += `#${html().id}`;
    if (html().classes.length > 0) out += `.${html().classes.slice(0, 3).join('.')}`;
    return out;
  };
  const item = () => ({
    kind: 'element' as const,
    element: props.inspection.ref,
    label: html().tagName,
  });

  onMount(() => {
    void listFavoriteKeys().then((keys) => setFavorite(keys.has(favoriteKey(item()))));
  });

  async function toggle() {
    const now = await toggleFavorite(item());
    setFavorite(now);
    notify({
      title: now ? 'Added to Favorites' : 'Removed from Favorites',
      description: now ? 'See it in Library → Collections.' : '',
      tone: 'success',
    });
  }

  return (
    <div class="flex items-center gap-2 border-b border-[var(--vq-border)] px-2.5 py-2">
      <code class="vq-code min-w-0 flex-1 truncate text-[12.5px] font-semibold">{label()}</code>
      <button
        type="button"
        class="vq-icon-btn h-6 w-6 shrink-0"
        aria-label={favorite() ? 'Remove element from favorites' : 'Add element to favorites'}
        title="Add to Favorites collection"
        onClick={() => void toggle()}
      >
        <Star
          class={`size-3.5 ${favorite() ? 'fill-[var(--vq-accent)] text-[var(--vq-accent)]' : ''}`}
        />
      </button>
      <Button
        size="sm"
        variant="ghost"
        class="shrink-0"
        title="Why does this look like this? (AI)"
        onClick={() =>
          openAiExplain(
            'element',
            { inspection: props.inspection },
            'Why does this look like this?',
          )
        }
      >
        <Sparkles class="size-3.5" aria-hidden="true" />
        Why?
      </Button>
      <Badge tone="neutral" class="vq-nums">
        {Math.round(props.inspection.rect.width)}×{Math.round(props.inspection.rect.height)}
      </Badge>
      <Badge tone={props.inspection.visible ? 'success' : 'neutral'}>
        {props.inspection.visible ? 'visible' : 'hidden'}
      </Badge>
    </div>
  );
}

function TabList() {
  return (
    <div
      role="tablist"
      aria-label="Element details"
      class="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[var(--vq-border)] px-1.5 py-1"
    >
      <For each={TABS}>
        {(tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={store.activeTab === tab.id}
            onClick={() => setInspectorTab(tab.id)}
            class={`shrink-0 rounded-[var(--vq-radius-sm)] px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)] ${
              store.activeTab === tab.id
                ? 'bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]'
                : 'text-[var(--vq-fg-muted)] hover:bg-[var(--vq-bg-hover)] hover:text-[var(--vq-fg)]'
            }`}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}

function ShowCssToggle() {
  if (ui.uiMode === 'engineer') return null;
  return (
    <div class="flex items-center gap-1.5 px-2.5 pt-2">
      <button
        type="button"
        role="switch"
        aria-checked={store.showRawCss}
        aria-label="Show raw CSS values"
        onClick={() => setShowRawCss(!store.showRawCss)}
        class={`relative h-4.5 w-8 rounded-full transition-colors ${
          store.showRawCss ? 'bg-[var(--vq-accent)]' : 'bg-[var(--vq-border-strong)]'
        }`}
      >
        <span
          class={`absolute top-0.5 size-3.5 rounded-full bg-white transition-transform ${
            store.showRawCss ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span class="text-[11px] text-[var(--vq-fg-muted)]">Show CSS</span>
    </div>
  );
}

function TabContent(props: { inspection: ElementInspection }) {
  const showCss = () => ui.uiMode === 'engineer' || store.showRawCss;

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <Show when={store.activeTab === 'overview'}>
        <OverviewTab inspection={props.inspection} showCss={showCss()} />
      </Show>
      <Show when={store.activeTab === 'layout'}>
        <GroupTab inspection={props.inspection} group="layout" showCss={showCss()} />
        <Show when={!showCss()}>
          <div class="flex justify-center pb-2">
            <BoxModelDiagram box={props.inspection.boxModel} />
          </div>
        </Show>
      </Show>
      <Show when={store.activeTab === 'appearance'}>
        <GroupTab inspection={props.inspection} group="appearance" showCss={showCss()} />
      </Show>
      <Show when={store.activeTab === 'typography'}>
        <GroupTab inspection={props.inspection} group="typography" showCss={showCss()} />
      </Show>
      <Show when={store.activeTab === 'advanced'}>
        <GroupTab inspection={props.inspection} group="advanced" showCss={showCss()} />
      </Show>
      <Show when={store.activeTab === 'source'}>
        <SourceTab inspection={props.inspection} />
      </Show>
    </div>
  );
}

export function ElementDetail() {
  const hasSelection = () => store.lockedRef != null;

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Show when={hasSelection()} fallback={<NoSelectionHint />}>
        <Show
          when={store.inspection}
          fallback={
            <Show when={store.loading} fallback={<InspectionError />}>
              <div class="flex items-center gap-2 border-b border-[var(--vq-border)] px-2.5 py-2">
                <code class="vq-code min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                  {store.lockedRef?.selector}
                </code>
              </div>
              <PropertyRowsSkeleton />
            </Show>
          }
        >
          {(inspection) => (
            <>
              <IdentityHeader inspection={inspection()} />
              <TabList />
              <ShowCssToggle />
              <TabContent inspection={inspection()} />
            </>
          )}
        </Show>
      </Show>
    </div>
  );
}

function NoSelectionHint() {
  return (
    <div class="vq-grid relative flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      {/* Precision inspection frame — crosshair in a dashed, corner-marked box (brand §14/§32). */}
      <div class="relative">
        <div class="flex size-12 items-center justify-center rounded-[var(--vq-radius-md)] border border-dashed border-[var(--vq-accent-border)] bg-[var(--vq-accent-soft)]">
          <Crosshair class="size-5 text-[var(--vq-accent)]" aria-hidden="true" />
        </div>
        <span class="absolute -left-0.5 -top-0.5 size-2 border-l-2 border-t-2 border-[var(--vq-accent)]" />
        <span class="absolute -right-0.5 -top-0.5 size-2 border-r-2 border-t-2 border-[var(--vq-accent)]" />
        <span class="absolute -bottom-0.5 -left-0.5 size-2 border-b-2 border-l-2 border-[var(--vq-accent)]" />
        <span class="absolute -bottom-0.5 -right-0.5 size-2 border-b-2 border-r-2 border-[var(--vq-accent)]" />
      </div>
      <div>
        <p class="vq-meta">No element selected</p>
        <p class="mx-auto mt-1.5 max-w-[240px] text-[11.5px] leading-relaxed text-[var(--vq-fg-muted)]">
          Select any element on the page to inspect its visual DNA.
        </p>
      </div>
      <Show when={store.enabled === false}>
        <Button size="sm" variant="primary" onClick={() => void setInspectMode(true)}>
          Turn on inspect mode
        </Button>
      </Show>
      <Show when={store.hoveredRef && !store.lockedRef}>
        <p class="text-[11px] text-[var(--vq-fg-subtle)]">
          Hovering <code class="vq-code">{store.hoveredRef?.selector}</code> — click it to lock.
        </p>
      </Show>
    </div>
  );
}

function InspectionError() {
  return (
    <Show when={store.error}>
      <div class="mx-3 mt-3 flex flex-col gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-danger-soft)] bg-[var(--vq-danger-soft)] p-3">
        <p class="text-[11.5px] font-medium text-[var(--vq-danger-fg)]">
          Could not analyze this element
        </p>
        <p class="text-[11px] leading-relaxed text-[var(--vq-danger-fg)]">{store.error}</p>
        <div class="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void fetchInspection(store.lockedRef)}
          >
            <RotateCcw class="size-3.5" />
            Retry
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copyText(store.lockedRef?.selector ?? '', 'CSS selector')}
          >
            Copy selector
          </Button>
        </div>
      </div>
    </Show>
  );
}
