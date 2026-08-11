/**
 * DOM tree view (Section 7.17) — a bounded, expandable tree of the page's
 * element structure. Clicking a node locks it in the inspector (SELECT_ELEMENT
 * round-trip). Hidden/invisible nodes are dimmed so layout structure reads at
 * a glance. Truncated subtrees get an explicit "… more nodes" marker rather
 * than a silent omission.
 */
import { ChevronDown, ChevronRight, Dot } from 'lucide-solid';
import { createMemo, createSignal, For } from 'solid-js';
import type { DomNode } from '../../../../shared/types';
import { Badge } from '../../../components/Badge';
import { selectElement } from './inspector-client';
import { sameRef, setStore, store } from './inspector-store';

function nodeLabel(node: DomNode): string {
  if (!node.isElement) return node.text ?? '#text';
  let label = node.tagName;
  if (node.id) label += `#${node.id}`;
  if (node.classes.length > 0) label += `.${node.classes.slice(0, 2).join('.')}`;
  return label;
}

function nodeMatches(node: DomNode, query: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  return (
    nodeLabel(node).toLowerCase().includes(q) ||
    node.tagName.toLowerCase().includes(q) ||
    node.id?.toLowerCase().includes(q) ||
    node.classes.some((c) => c.toLowerCase().includes(q))
  );
}

function TreeRow(props: { node: DomNode }) {
  const [expanded, setExpanded] = createSignal(false);
  const hasChildren = () => props.node.children.length > 0;
  const isLocked = () => sameRef(props.node.ref ?? null, store.lockedRef);

  function toggle() {
    if (hasChildren()) setExpanded((e) => !e);
  }

  function lock() {
    if (props.node.ref) void selectElement(props.node.ref);
  }

  return (
    <li class="list-none">
      <button
        type="button"
        onClick={lock}
        onDblClick={toggle}
        aria-expanded={expanded()}
        aria-label={nodeLabel(props.node)}
        class={`group flex w-full min-w-0 items-center gap-1 rounded-[var(--vq-radius-sm)] px-1 py-[3px] text-left text-[11.5px] transition-colors hover:bg-[var(--vq-bg-hover)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)] ${
          isLocked() ? 'bg-[var(--vq-accent-soft)]' : ''
        } ${!props.node.visible ? 'opacity-45' : ''}`}
        title={props.node.ref ? 'Click to inspect · double-click to expand' : undefined}
      >
        <span
          aria-hidden="true"
          class="flex size-4 shrink-0 items-center justify-center rounded-[2px] text-[var(--vq-fg-subtle)]"
        >
          {hasChildren() ? (
            expanded() ? (
              <ChevronDown class="size-3" />
            ) : (
              <ChevronRight class="size-3" />
            )
          ) : (
            <Dot class="size-3 opacity-0" />
          )}
        </span>
        <code class={`vq-code min-w-0 truncate ${isLocked() ? 'text-[var(--vq-accent)]' : ''}`}>
          {nodeLabel(props.node)}
        </code>
        {!props.node.isElement && (
          <Badge tone="neutral" class="shrink-0 px-1 py-0 text-[9px]">
            text
          </Badge>
        )}
      </button>

      <Show when={expanded() && hasChildren()}>
        <ul class="ml-[11px] border-l border-[var(--vq-border)] pl-1.5">
          <For each={props.node.children}>{(child) => <TreeRow node={child} />}</For>
        </ul>
      </Show>
    </li>
  );
}

export function DomTree(props: { truncated: boolean }) {
  const filtered = createMemo(() => {
    const q = store.domFilter.trim().toLowerCase();
    const filterNodes = (nodes: DomNode[]): DomNode[] => {
      const out: DomNode[] = [];
      for (const node of nodes) {
        if (!nodeMatches(node, q)) continue;
        if (q) {
          // In filter mode, keep matching descendants expanded-flat.
          out.push({ ...node, children: filterNodes(node.children) });
        } else {
          out.push(node);
        }
      }
      return out;
    };
    return filterNodes(store.domTree ?? []);
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="shrink-0 border-b border-[var(--vq-border)] p-1.5">
        <input
          type="search"
          value={store.domFilter}
          onInput={(e) => setDomFilter(e.currentTarget.value)}
          placeholder="Filter tags, ids, classes…"
          aria-label="Filter DOM tree"
          class="vq-input h-7 w-full text-[11.5px]"
        />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
        <Show
          when={filtered().length > 0}
          fallback={
            <p class="px-2 py-6 text-center text-[11.5px] text-[var(--vq-fg-subtle)]">
              No matching nodes.
            </p>
          }
        >
          <ul class="flex flex-col">
            <For each={filtered()}>{(node) => <TreeRow node={node} />}</For>
          </ul>
        </Show>
        {props.truncated && (
          <p class="px-2 pt-1 text-center text-[10px] text-[var(--vq-fg-subtle)]">
            … tree truncated — this page has many nodes
          </p>
        )}
      </div>
    </div>
  );
}

function setDomFilter(value: string) {
  setStore('domFilter', value);
}
