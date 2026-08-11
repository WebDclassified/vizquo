/**
 * Notes tab (Phase 8) — free-form notes attached to a target (the current
 * inspection, a collection, or a free-standing note). Stored locally only.
 */
import { NotebookPen, StickyNote, Trash2 } from 'lucide-solid';
import { createSignal, For, onMount, Show } from 'solid-js';
import type { Note } from '../../../../../shared/types';
import { Badge } from '../../../../components/Badge';
import { Button } from '../../../../components/Button';
import { Panel } from '../../../../components/Panel';
import { analysis } from '../../../../stores/analysis-store';
import { notify } from '../../../../stores/toast';
import { deleteNote, listCollections, listNotes, saveNote } from '../library-client';

const TARGET_LABEL: Record<Note['targetType'], string> = {
  element: 'Element',
  asset: 'Asset',
  screenshot: 'Screenshot',
  color: 'Color',
  font: 'Font',
  inspection: 'Page scan',
  collection: 'Collection',
};

export function NotesTab(props: { query?: () => string }) {
  const [notes, setNotes] = createSignal<Note[]>([]);
  const [text, setText] = createSignal('');
  const [target, setTarget] = createSignal<'inspection' | 'collection' | 'general'>('general');
  const [collectionId, setCollectionId] = createSignal('');
  const [collections, setCollections] = createSignal<{ id: string; name: string }[]>([]);

  async function reload() {
    setNotes(await listNotes());
    setCollections((await listCollections()).map((c) => ({ id: c.id, name: c.name })));
  }

  onMount(() => void reload());

  async function save() {
    const value = text();
    if (!value.trim()) {
      notify({ title: 'Write the note first', tone: 'warning' });
      return;
    }
    if (target() === 'collection' && !collectionId()) {
      notify({ title: 'Pick a collection to attach to', tone: 'warning' });
      return;
    }
    const created =
      target() === 'inspection' && analysis.inspection
        ? await saveNote(value, 'inspection', analysis.inspection.id)
        : target() === 'collection'
          ? await saveNote(value, 'collection', collectionId())
          : await saveNote(value, 'inspection', '');
    if (!created) {
      notify({ title: 'Could not save the note', tone: 'error' });
      return;
    }
    setText('');
    notify({ title: 'Note saved', tone: 'success' });
    await reload();
  }

  async function remove(id: string) {
    await deleteNote(id);
    await reload();
  }

  const sorted = () => {
    const q = props.query?.()?.trim().toLowerCase();
    const ordered = [...notes()].sort((a, b) => b.createdAt - a.createdAt);
    if (!q) return ordered;
    return ordered.filter((note) => note.text.toLowerCase().includes(q));
  };

  return (
    <Panel
      title="Notes"
      subtitle="Thoughts pinned to a page scan or collection — local only"
      actions={
        <Badge tone="neutral" class="vq-nums">
          <StickyNote class="size-3" />
          {notes().length}
        </Badge>
      }
    >
      <div class="mb-3 flex flex-col gap-1.5">
        <textarea
          value={text()}
          placeholder="e.g. The hero buttons use a rounded pill while cards are squared — worth unifying?"
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          rows={3}
          class="w-full resize-y rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] focus:border-[var(--vq-accent)] focus:outline-none"
        />
        <div class="flex flex-wrap items-center gap-1.5">
          <select
            value={target()}
            onChange={(e) =>
              setTarget(
                (e.target as HTMLSelectElement).value as 'inspection' | 'collection' | 'general',
              )
            }
            class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[11.5px] text-[var(--vq-fg)] focus:outline-none"
            aria-label="Note target"
          >
            <option value="general">General note</option>
            <option value="inspection">Attach to current page scan</option>
            <option value="collection">Attach to a collection</option>
          </select>
          <Show when={target() === 'collection'}>
            <select
              value={collectionId()}
              onChange={(e) => setCollectionId((e.target as HTMLSelectElement).value)}
              class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[11.5px] text-[var(--vq-fg)] focus:outline-none"
              aria-label="Collection"
            >
              <option value="">Pick a collection…</option>
              <For each={collections()}>{(c) => <option value={c.id}>{c.name}</option>}</For>
            </select>
          </Show>
          <Button size="sm" variant="primary" onClick={() => void save()}>
            <NotebookPen class="size-3.5" />
            Save note
          </Button>
        </div>
      </div>

      <Show
        when={sorted().length > 0}
        fallback={
          <p class="px-2 py-5 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            {props.query?.()?.trim()
              ? 'No notes match your search.'
              : 'No notes yet — capture observations as you inspect.'}
          </p>
        }
      >
        <div class="flex flex-col gap-1.5">
          <For each={sorted()}>
            {(note) => (
              <div class="flex items-start gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2">
                <div class="min-w-0 flex-1">
                  <p class="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--vq-fg)]">
                    {note.text}
                  </p>
                  <p class="mt-0.5 text-[10px] text-[var(--vq-fg-subtle)]">
                    {note.targetId ? TARGET_LABEL[note.targetType] : 'General'}
                    {note.targetId && note.targetType === 'collection' ? ` · ${note.targetId}` : ''}{' '}
                    · {new Date(note.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(note.id)}
                  aria-label="Delete note"
                  title="Delete note"
                  class="vq-icon-btn h-6 w-6 shrink-0"
                >
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Panel>
  );
}
