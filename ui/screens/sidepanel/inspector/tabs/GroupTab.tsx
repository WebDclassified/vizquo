/**
 * Group tabs — Layout / Appearance / Typography / Advanced. One component,
 * parameterized by the property group: Designer mode curates the rows and
 * offers "Show CSS"; Engineer mode shows the full computed block up front.
 */
import { FileCode } from 'lucide-solid';
import type { ElementInspection } from '../../../../../shared/types';
import { Button } from '../../../../components/Button';
import { cssBlockFor, type PropertyGroup } from '../format';
import { copyText } from '../inspector-client';
import { type PropertyEntry, PropertyGrid } from '../PropertyGrid';

function entriesFor(inspection: ElementInspection, group: PropertyGroup): PropertyEntry[] {
  const info =
    group === 'layout'
      ? inspection.layout
      : group === 'appearance'
        ? inspection.appearance
        : group === 'typography'
          ? inspection.typography
          : inspection.advanced;
  return Object.entries(info as unknown as Record<string, string>).map(([name, value]) => ({
    name,
    value: value ?? '',
  }));
}

export function GroupTab(props: {
  inspection: ElementInspection;
  group: PropertyGroup;
  showCss: boolean;
}) {
  return (
    <div class="flex flex-col gap-2 p-2.5">
      <Show
        when={props.showCss}
        fallback={<PropertyGrid entries={entriesFor(props.inspection, props.group)} />}
      >
        <div class="relative">
          <pre class="vq-code max-h-[420px] overflow-auto rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] p-2.5 text-[11px] leading-relaxed">
            {cssBlockFor(props.inspection, props.group)}
          </pre>
          <div class="absolute right-2 top-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void copyText(cssBlockFor(props.inspection, props.group), `${props.group} CSS`)
              }
            >
              <FileCode class="size-3.5" />
              Copy
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
