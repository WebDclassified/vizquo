/**
 * Inspector toolbar — the one-click controls that shape the overlay
 * (Section 7.4): inspect mode, smart measurements, click-through, and the
 * box-model layers. All options are pushed to the content script so the
 * overlay updates instantly.
 */
import {
  type LucideIcon,
  MousePointer2,
  MousePointerClick,
  Move,
  PanelTopOpen,
  RefreshCw,
  Ruler,
  Square,
} from 'lucide-solid';
import { createSignal } from 'solid-js';
import { sendMessage } from '../../../../shared/messages';
import { IconButton } from '../../../components/IconButton';
import { fetchDomTree, pushOverlayOptions, setInspectMode } from './inspector-client';
import { store } from './inspector-store';

interface ToolToggleProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  icon: LucideIcon;
}

function ToolToggle(props: ToolToggleProps) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      title={props.title}
      onClick={() => props.onChange(!props.checked)}
      class={`flex h-7 items-center gap-1 rounded-[var(--vq-radius-sm)] border px-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)] ${
        props.checked
          ? 'border-[var(--vq-accent)] bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]'
          : 'border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] text-[var(--vq-fg-muted)] hover:text-[var(--vq-fg)]'
      }`}
    >
      <Icon class="size-3.5" />
      {props.label}
    </button>
  );
}

export function InspectorToolbar() {
  const [refreshing, setRefreshing] = createSignal(false);

  async function refreshDom() {
    setRefreshing(true);
    await fetchDomTree();
    setTimeout(() => setRefreshing(false), 400);
  }

  return (
    <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--vq-border)] px-2 py-1.5">
      <ToolToggle
        label="Inspect"
        checked={store.enabled}
        onChange={(v) => void setInspectMode(v)}
        title="Toggle hover inspection on the page"
        icon={MousePointer2}
      />
      <ToolToggle
        label="Measure"
        checked={store.overlay.measurements}
        onChange={(v) => void pushOverlayOptions({ measurements: v })}
        title="Show distances to parent, siblings, and viewport"
        icon={Ruler}
      />
      <ToolToggle
        label="Click-through"
        checked={store.overlay.clickThrough}
        onChange={(v) => void pushOverlayOptions({ clickThrough: v })}
        title="Don't lock on click — interact with the page freely"
        icon={MousePointerClick}
      />
      <ToolToggle
        label="Ruler"
        checked={store.overlay.measureMode}
        onChange={(v) => {
          // The ruler needs the inspector's document listeners to draw.
          if (v && !store.enabled) void setInspectMode(true);
          void pushOverlayOptions({ measureMode: v });
        }}
        title="Click-drag to measure distances — Esc clears, scroll resets"
        icon={Move}
      />

      <div class="mx-0.5 h-5 w-px bg-[var(--vq-border)]" aria-hidden="true" />

      <fieldset class="m-0 flex items-center gap-1 border-0 p-0" aria-label="Box model layers">
        <legend class="sr-only">Box model layers</legend>
        <span class="flex items-center gap-1 text-[10.5px] text-[var(--vq-fg-subtle)]">
          <Square class="size-3" />
          Box
        </span>
        {(
          [
            ['margin', 'Margin'],
            ['border', 'Border'],
            ['padding', 'Padding'],
            ['content', 'Content'],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            aria-pressed={store.overlay.boxModel[key]}
            aria-label={`Show ${label} box model layer`}
            onClick={() =>
              void pushOverlayOptions({
                boxModel: { ...store.overlay.boxModel, [key]: !store.overlay.boxModel[key] },
              })
            }
            class={`h-6 rounded-[var(--vq-radius-sm)] border px-1.5 text-[10.5px] transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)] ${
              store.overlay.boxModel[key]
                ? 'border-[var(--vq-accent)] bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]'
                : 'border-[var(--vq-border)] bg-transparent text-[var(--vq-fg-subtle)] hover:text-[var(--vq-fg)]'
            }`}
          >
            {label[0]}
          </button>
        ))}
      </fieldset>

      <IconButton
        icon={RefreshCw}
        label="Refresh DOM tree"
        tooltip="Refresh DOM tree"
        onClick={() => void refreshDom()}
        class={refreshing() ? 'animate-spin' : ''}
      />

      <div class="mx-0.5 h-5 w-px bg-[var(--vq-border)]" aria-hidden="true" />

      <IconButton
        icon={PanelTopOpen}
        label="Detach inspector window"
        tooltip="Open the inspector in its own window"
        onClick={() => {
          void sendMessage('OPEN_INSPECTOR_WINDOW', undefined).catch(() => {
            // Background unreachable — the panel keeps working.
          });
        }}
      />
    </div>
  );
}
