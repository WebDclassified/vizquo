/**
 * Collections tab (Phase 8) — curate sets of page artifacts (colors,
 * components, assets, screenshots, elements) that survive the page. Items are
 * added from the current inspection or the saved screenshot library; every
 * item renders with its confidence/type and, where meaningful, a "Locate"
 * action that highlights the real elements on the page.
 */
import {
  ArrowLeft,
  Box,
  CirclePlus,
  FolderPlus,
  Layers,
  Palette,
  Plus,
  Trash2,
  X,
} from 'lucide-solid';
import { createSignal, For, onMount, Show } from 'solid-js';
import type { Collection, CollectionItem, Screenshot } from '../../../../../shared/types';
import { Badge } from '../../../../components/Badge';
import { Button } from '../../../../components/Button';
import { Panel } from '../../../../components/Panel';
import { analysis } from '../../../../stores/analysis-store';
import { notify } from '../../../../stores/toast';
import { highlightRefs } from '../../design/scan-client';
import {
  addCollectionItems,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  listScreenshots,
  removeCollectionItem,
} from '../library-client';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ItemCard(props: {
  item: CollectionItem;
  screenshots: Map<string, Screenshot>;
  onRemove?: () => void;
}) {
  const { item } = props;
  if (item.kind === 'color') {
    return (
      <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-1.5">
        <span
          class="size-5 shrink-0 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)]"
          style={{ background: item.token.value.hex }}
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--vq-fg)]">
          {item.token.value.hex}
        </span>
        <span class="text-[10px] text-[var(--vq-fg-subtle)]">{item.token.usageCount} uses</span>
        {props.onRemove && <RemoveButton onClick={props.onRemove} />}
      </div>
    );
  }
  if (item.kind === 'component') {
    return (
      <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-1.5">
        <Box class="size-3.5 shrink-0 text-[var(--vq-fg-subtle)]" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--vq-fg)]">
          {item.component.type}
        </span>
        <span class="text-[10px] text-[var(--vq-fg-subtle)]">
          {item.component.instances.length} instances
        </span>
        <button
          type="button"
          onClick={() => void highlightRefs(item.component.instances, item.component.type)}
          title="Highlight instances on the page"
          class="vq-icon-btn h-6 w-6 shrink-0"
        >
          <Layers class="size-3.5" />
        </button>
        {props.onRemove && <RemoveButton onClick={props.onRemove} />}
      </div>
    );
  }
  if (item.kind === 'font') {
    return (
      <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-1.5">
        <span class="size-5 shrink-0 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] text-center font-mono text-[10px] leading-5 text-[var(--vq-fg-subtle)]">
          Aa
        </span>
        <span class="min-w-0 flex-1 truncate text-[11px] text-[var(--vq-fg)]">
          {item.token.value.family}
        </span>
        <span class="text-[10px] text-[var(--vq-fg-subtle)]">
          {item.token.value.weight} · {item.token.usageCount} uses
        </span>
        {props.onRemove && <RemoveButton onClick={props.onRemove} />}
      </div>
    );
  }
  if (item.kind === 'asset') {
    return (
      <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-1.5">
        <span
          class="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)]"
          aria-hidden="true"
        >
          {item.asset.type === 'image' || item.asset.type === 'svg' ? (
            <img
              src={item.asset.url}
              alt=""
              class="size-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <Palette class="size-3 text-[var(--vq-fg-subtle)]" />
          )}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[11px] text-[var(--vq-fg)]">{item.asset.url}</span>
          <span class="block text-[10px] text-[var(--vq-fg-subtle)]">{item.asset.type}</span>
        </span>
        {props.onRemove && <RemoveButton onClick={props.onRemove} />}
      </div>
    );
  }
  if (item.kind === 'screenshot') {
    const screenshot = props.screenshots.get(item.id);
    return (
      <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-1.5">
        <Show
          when={screenshot}
          fallback={
            <span
              class="size-7 shrink-0 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)]"
              aria-hidden="true"
            />
          }
        >
          {(shot) => (
            <img
              src={shot().dataUrl}
              alt=""
              class="size-7 shrink-0 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)] object-cover"
            />
          )}
        </Show>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[11px] text-[var(--vq-fg)]">
            {screenshot?.pageUrl ?? 'Screenshot'}
          </span>
          <span class="block text-[10px] text-[var(--vq-fg-subtle)]">
            {screenshot
              ? `${screenshot.region} · ${screenshot.width}×${screenshot.height}`
              : 'missing'}
          </span>
        </span>
        {props.onRemove && <RemoveButton onClick={props.onRemove} />}
      </div>
    );
  }
  // kind: 'element'
  return (
    <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-1.5">
      <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--vq-fg)]">
        {item.label ?? item.element.selector}
      </span>
      <button
        type="button"
        onClick={() => void highlightRefs([item.element], item.label ?? 'element')}
        title="Highlight on the page"
        class="vq-icon-btn h-6 w-6 shrink-0"
      >
        <Layers class="size-3.5" />
      </button>
      {props.onRemove && <RemoveButton onClick={props.onRemove} />}
    </div>
  );
}

function RemoveButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label="Remove from collection"
      title="Remove from collection"
      class="vq-icon-btn h-6 w-6 shrink-0"
    >
      <X class="size-3.5" />
    </button>
  );
}

function CollectionDetail(props: { id: string; onBack: () => void }) {
  const [collection, setCollection] = createSignal<Collection | null>(null);
  const [screenshots, setScreenshots] = createSignal<Map<string, Screenshot>>(new Map());

  async function reload(): Promise<void> {
    const loaded = await getCollection(props.id);
    setCollection(loaded);
    const shots = await listScreenshots();
    setScreenshots(new Map(shots.map((s) => [s.id, s])));
  }

  onMount(() => void reload());

  const ins = () => analysis.inspection;

  async function add(kind: 'colors' | 'components' | 'assets') {
    const current = collection();
    const inspection = ins();
    if (!current || !inspection) {
      notify({ title: 'Scan the page first', tone: 'warning' });
      return;
    }
    const items: CollectionItem[] =
      kind === 'colors'
        ? inspection.tokens.colors.map((token) => ({ kind: 'color', token }))
        : kind === 'components'
          ? inspection.components.map((component) => ({ kind: 'component', component }))
          : inspection.assets.map((asset) => ({ kind: 'asset', asset }));
    if (items.length === 0) {
      notify({ title: 'Nothing to add for this kind', tone: 'neutral' });
      return;
    }
    const updated = await addCollectionItems(current, items);
    if (updated) setCollection(updated);
    notify({
      title: `${items.length} ${kind} added`,
      description: `to “${current.name}”`,
      tone: 'success',
    });
    await reload();
  }

  async function removeItem(index: number) {
    const current = collection();
    if (!current) return;
    const updated = await removeCollectionItem(current, index);
    if (updated) setCollection(updated);
  }

  async function remove() {
    await deleteCollection(props.id);
    notify({ title: 'Collection deleted', tone: 'neutral' });
    props.onBack();
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={props.onBack} ariaLabel="Back to collections">
          <ArrowLeft class="size-3.5" />
        </Button>
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] font-semibold text-[var(--vq-fg)]">
            {collection()?.name ?? 'Collection'}
          </p>
          <p class="text-[11px] text-[var(--vq-fg-subtle)]">
            {collection()?.items.length ?? 0} items · created{' '}
            {collection() ? formatDate(collection()?.createdAt ?? 0) : ''}
          </p>
        </div>
        <Button size="sm" variant="danger" onClick={() => void remove()}>
          <Trash2 class="size-3.5" />
          Delete
        </Button>
      </div>

      <Show when={ins()}>
        <Panel title="Add from this page" bodyClass="p-2.5">
          <p class="mb-2 text-[11px] text-[var(--vq-fg-subtle)]">
            Add the current scan's artifacts to “{collection()?.name}”.
          </p>
          <div class="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => void add('colors')}>
              <CirclePlus class="size-3.5" />
              Colors ({ins()?.tokens.colors.length ?? 0})
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void add('components')}>
              <CirclePlus class="size-3.5" />
              Components ({ins()?.components.length ?? 0})
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void add('assets')}>
              <CirclePlus class="size-3.5" />
              Assets ({ins()?.assets.length ?? 0})
            </Button>
          </div>
        </Panel>
      </Show>

      <Show
        when={(collection()?.items.length ?? 0) > 0}
        fallback={
          <p class="px-2 py-6 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            No items yet — scan a page and add its colors, components, or assets.
          </p>
        }
      >
        <div class="flex flex-col gap-1.5">
          <For each={collection()?.items ?? []}>
            {(item, i) => (
              <ItemCard
                item={item}
                screenshots={screenshots()}
                onRemove={() => void removeItem(i())}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function CollectionsTab(props: { query?: () => string }) {
  const [collections, setCollections] = createSignal<Collection[]>([]);
  const [name, setName] = createSignal('');
  const [openId, setOpenId] = createSignal<string | null>(null);

  const filtered = () => {
    const q = props.query?.()?.trim().toLowerCase();
    if (!q) return collections();
    return collections().filter((c) => c.name.toLowerCase().includes(q));
  };

  async function reload() {
    setCollections(await listCollections());
  }

  onMount(() => void reload());

  async function create() {
    const created = await createCollection(name());
    if (!created) {
      notify({ title: 'Enter a name first', tone: 'warning' });
      return;
    }
    setName('');
    await reload();
    setOpenId(created.id);
  }

  return (
    <Show
      when={!openId()}
      fallback={<CollectionDetail id={openId() as string} onBack={() => setOpenId(null)} />}
    >
      <div class="flex flex-col gap-3">
        <Panel
          title="Collections"
          subtitle="Curate colors, components, assets, and screenshots — saved locally"
          actions={
            <Badge tone="neutral" class="vq-nums">
              <FolderPlus class="size-3" />
              {collections().length}
            </Badge>
          }
        >
          <div class="mb-3 flex gap-1.5">
            <input
              type="text"
              value={name()}
              placeholder="Collection name…"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
              class="h-8 min-w-0 flex-1 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] focus:border-[var(--vq-accent)] focus:outline-none"
            />
            <Button size="sm" variant="primary" onClick={() => void create()}>
              <Plus class="size-3.5" />
              New
            </Button>
          </div>

          <Show
            when={collections().length > 0}
            fallback={
              <p class="px-2 py-5 text-center text-[12px] text-[var(--vq-fg-subtle)]">
                No collections yet — create one, then scan a page to add its artifacts.
              </p>
            }
          >
            <Show
              when={filtered().length > 0}
              fallback={
                <p class="px-2 py-5 text-center text-[12px] text-[var(--vq-fg-subtle)]">
                  No collections match your search.
                </p>
              }
            >
              <div class="flex flex-col gap-1.5">
                <For each={filtered()}>
                  {(collection) => (
                    <button
                      type="button"
                      onClick={() => setOpenId(collection.id)}
                      class="flex cursor-pointer items-center justify-between gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2 text-left transition-colors hover:border-[var(--vq-border-strong)] hover:bg-[var(--vq-bg-hover)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[12.5px] font-medium text-[var(--vq-fg)]">
                          {collection.name}
                        </span>
                        <span class="block text-[10.5px] text-[var(--vq-fg-subtle)]">
                          {collection.items.length} items · updated{' '}
                          {formatDate(collection.updatedAt)}
                        </span>
                      </span>
                      <span class="shrink-0 text-[11px] text-[var(--vq-accent)]">Open →</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Panel>
      </div>
    </Show>
  );
}
