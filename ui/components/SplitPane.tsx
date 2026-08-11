/**
 * SplitPane — a resizable two-pane layout (Phase 8).
 *
 * Drag the divider to resize; when a `persistKey` is given the size is loaded
 * from and saved to the repository (SETTING_KEYS.splitInspector), so the
 * user's layout survives reopening the panel. Pointer events handle mouse,
 * touch, and pen input; the divider is a real keyboard-focusable element with
 * arrow-key adjustment for accessibility.
 */

import type { JSX, ParentProps } from 'solid-js';
import { createSignal, onCleanup, onMount, Show, splitProps } from 'solid-js';
import { repository } from '../../storage';

const DEFAULT_SIZE = 240;
const MIN_SIZE = 140;
const MAX_SIZE = 640;

interface SplitPaneProps extends ParentProps {
  /** The pane that owns the divider (resized by dragging). */
  first: JSX.Element;
  /** The pane that takes the remaining space. */
  second: JSX.Element;
  /** 'horizontal' = side-by-side (default), 'vertical' = stacked. */
  orientation?: 'horizontal' | 'vertical';
  initialSize?: number;
  minSize?: number;
  maxSize?: number;
  /** Repository setting key — size is persisted on drag end. */
  persistKey?: string;
  class?: string;
  dividerLabel?: string;
}

export function SplitPane(props: SplitPaneProps) {
  const [local] = splitProps(props, [
    'first',
    'second',
    'orientation',
    'initialSize',
    'minSize',
    'maxSize',
    'persistKey',
    'class',
    'dividerLabel',
    'children',
  ]);
  const orientation = local.orientation ?? 'horizontal';
  const minSize = local.minSize ?? MIN_SIZE;
  const maxSize = local.maxSize ?? MAX_SIZE;

  const [size, setSize] = createSignal(local.initialSize ?? DEFAULT_SIZE);
  const [dragging, setDragging] = createSignal(false);

  // Load the persisted size once (best-effort — defaults apply on first run).
  onMount(() => {
    if (!local.persistKey) return;
    void repository
      .getSetting<number>(local.persistKey)
      .then((stored) => {
        if (typeof stored === 'number' && stored >= minSize && stored <= maxSize) {
          setSize(stored);
        }
      })
      .catch(() => {
        // Defaults are fine.
      });
  });

  let containerRef: HTMLDivElement | undefined;

  function clamp(value: number): number {
    return Math.min(Math.max(value, minSize), maxSize);
  }

  function resizeFromPointer(clientX: number, clientY: number): void {
    const container = containerRef;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const value = orientation === 'horizontal' ? clientX - rect.left : clientY - rect.top;
    setSize(clamp(value));
  }

  function onPointerMove(event: PointerEvent): void {
    resizeFromPointer(event.clientX, event.clientY);
  }

  function onPointerUp(): void {
    setDragging(false);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (local.persistKey) {
      void repository.setSetting(local.persistKey, Math.round(size())).catch(() => {
        // Non-fatal — the layout just won't persist.
      });
    }
  }

  function onDividerPointerDown(event: PointerEvent): void {
    event.preventDefault();
    setDragging(true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  // Keyboard accessibility: focus the divider and nudge with arrows.
  function onDividerKeyDown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 20 : 5;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSize(clamp(size() - step));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      setSize(clamp(size() + step));
    }
  }

  onCleanup(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  });

  const containerClass =
    orientation === 'horizontal' ? 'flex flex-row items-stretch' : 'flex flex-col items-stretch';
  const dividerClass =
    orientation === 'horizontal' ? 'w-[6px] cursor-col-resize' : 'h-[6px] cursor-row-resize';

  return (
    <div ref={containerRef} class={`min-h-0 min-w-0 group ${containerClass} ${local.class ?? ''}`}>
      <div
        class="shrink-0 overflow-hidden"
        style={orientation === 'horizontal' ? { width: `${size()}px` } : { height: `${size()}px` }}
      >
        {local.first}
      </div>
      <div class={`relative shrink-0 ${dividerClass}`} onPointerDown={onDividerPointerDown}>
        {/* Hit area wider than the visible line for easy grabbing. */}
        <div class="absolute inset-0 z-10" aria-hidden="true" />
        {/* The divider is a focusable separator with arrow-key sizing. */}
        <hr
          aria-orientation={orientation}
          aria-label={local.dividerLabel ?? 'Resize panels'}
          aria-valuemin={minSize}
          aria-valuemax={maxSize}
          aria-valuenow={Math.round(size())}
          tabIndex={0}
          onKeyDown={onDividerKeyDown}
          class={`absolute m-0 border-0 transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)] group-hover:bg-[var(--vq-accent)] ${
            dragging() ? 'bg-[var(--vq-accent)]' : 'bg-[var(--vq-border)]'
          } ${orientation === 'horizontal' ? 'inset-y-0 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px -translate-y-1/2'}`}
        />
        <Show when={dragging()}>
          <div class="sr-only" role="status">
            Resizing
          </div>
        </Show>
      </div>
      <div class="min-h-0 min-w-0 flex-1 overflow-hidden">{local.second}</div>
    </div>
  );
}
