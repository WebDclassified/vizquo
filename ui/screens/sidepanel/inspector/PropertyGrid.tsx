/**
 * Property grid — the shared row renderer for Layout / Appearance / Typography
 * / Advanced tabs. Every value is a copy target (copy `name: value;`), and
 * color values get a swatch. Empty rows (none / 0px / normal) are omitted —
 * unknown values render as "Unknown", never as fabricated numbers (law 5).
 */
import { For } from 'solid-js';
import { PropertyRow } from '../../../components/PropertyRow';
import { colorToHex, isColorValue, propertyLabel } from './format';

export interface PropertyEntry {
  name: string;
  value: string;
}

export function PropertyGrid(props: { entries: PropertyEntry[]; showEmpty?: boolean }) {
  const visible = () =>
    props.entries.filter(
      (e) =>
        e.value.trim() !== '' &&
        (props.showEmpty ||
          (e.value !== 'none' && e.value !== '0px' && e.value !== 'normal' && e.value !== '0')),
    );

  return (
    <div class="flex flex-col">
      <For each={visible()}>
        {(entry) => (
          <PropertyRow
            label={propertyLabel(entry.name)}
            copy={`${entry.name}: ${entry.value};`}
            copyLabel={`${entry.name}: ${entry.value}`}
            actions={
              isColorValue(entry.value) ? (
                <span
                  role="img"
                  aria-label={`Color ${entry.value}`}
                  class="size-3.5 shrink-0 rounded-[3px] ring-1 ring-[var(--vq-border-strong)]"
                  style={{ background: colorToHex(entry.value) }}
                  title={entry.value}
                />
              ) : undefined
            }
          >
            <code class="vq-code min-w-0 truncate">{entry.value}</code>
          </PropertyRow>
        )}
      </For>
      <Show when={visible().length === 0}>
        <p class="px-2 py-4 text-center text-[11.5px] text-[var(--vq-fg-subtle)]">
          No values — this element has no {props.entries[0]?.name.split('-')[0]} styles.
        </p>
      </Show>
    </div>
  );
}
