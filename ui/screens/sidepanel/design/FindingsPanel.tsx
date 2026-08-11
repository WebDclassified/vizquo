import { CircleCheck, Info, TriangleAlert } from 'lucide-solid';
import { For, Show } from 'solid-js';
import type { Finding, FindingSeverity } from '../../../../shared/types';
import { Badge, type BadgeTone } from '../../../components/Badge';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';

const SEVERITY_META: Record<
  FindingSeverity,
  { tone: BadgeTone; icon: typeof Info; label: string; iconClass: string }
> = {
  error: {
    tone: 'danger',
    icon: TriangleAlert,
    label: 'Error',
    iconClass: 'text-[var(--vq-danger-fg)]',
  },
  warning: {
    tone: 'warning',
    icon: TriangleAlert,
    label: 'Warning',
    iconClass: 'text-[var(--vq-warning-fg)]',
  },
  info: { tone: 'info', icon: Info, label: 'Info', iconClass: 'text-[var(--vq-info-fg)]' },
};

const CATEGORY_LABEL: Record<Finding['category'], string> = {
  accessibility: 'Accessibility',
  consistency: 'Consistency',
  performance: 'Performance',
};

function FindingRow({ finding }: { finding: Finding }) {
  const meta = SEVERITY_META[finding.severity];
  const Icon = meta.icon;
  return (
    <div class="flex items-start gap-2 rounded-[var(--vq-radius-md)] px-1.5 py-1.5 transition-colors hover:bg-[var(--vq-bg-hover)]">
      <Icon class={`mt-0.5 size-3.5 shrink-0 ${meta.iconClass}`} aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="text-[11.5px] leading-snug text-[var(--vq-fg)]">{finding.message}</p>
        <p class="mt-0.5 text-[10px] text-[var(--vq-fg-subtle)]">
          {CATEGORY_LABEL[finding.category]}
          {finding.element ? ` · ${finding.element.selector}` : ''}
        </p>
      </div>
      <Badge tone={meta.tone} class="shrink-0 text-[9.5px]">
        {meta.label}
      </Badge>
    </div>
  );
}

export function FindingsPanel() {
  const findings = () => analysis.inspection?.findings ?? [];
  const sorted = () =>
    [...findings()].sort((a, b) => {
      const rank = { error: 0, warning: 1, info: 2 } as const;
      return rank[a.severity] - rank[b.severity];
    });
  return (
    <Panel
      id="findings"
      title="Findings"
      subtitle="Consistency issues the scan could honestly detect"
      actions={
        <Show when={findings().length === 0}>
          <Badge tone="success">
            <CircleCheck class="size-3" /> Clean
          </Badge>
        </Show>
      }
    >
      <Show
        when={findings().length > 0}
        fallback={
          <p class="px-3 py-4 text-[12px] text-[var(--vq-fg-subtle)]">
            No consistency findings. The page reuses its spacing and radius values coherently — or
            the sample was too small to judge.
          </p>
        }
      >
        <div class="flex flex-col gap-0.5">
          <For each={sorted()}>{(finding) => <FindingRow finding={finding} />}</For>
        </div>
      </Show>
    </Panel>
  );
}
