/**
 * Overview tab (Section 7.4) — the 3-second read. Designer mode shows
 * plain-language summaries (layout sentence, type sentence, colors, box
 * model) with a "Show CSS" toggle; Engineer mode shows the computed CSS
 * block by default. Both read the same ElementInspection.
 */
import { Eye, FileCode } from 'lucide-solid';
import type { ElementInspection } from '../../../../../shared/types';
import { Badge } from '../../../../components/Badge';
import { Button } from '../../../../components/Button';
import { colorToHex, cssBlockFor, isColorValue, layoutSummary, typographySummary } from '../format';
import { copyText } from '../inspector-client';

function SummaryCard(props: { title: string; text: string }) {
  return (
    <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2.5 py-2">
      <p class="text-[10px] font-semibold tracking-wider text-[var(--vq-fg-subtle)] uppercase">
        {props.title}
      </p>
      <p class="mt-0.5 text-[12.5px] font-medium text-[var(--vq-fg)]">{props.text}</p>
    </div>
  );
}

function ColorChip(props: { label: string; value?: string }) {
  const color = () => props.value?.trim() ?? '';
  const meaningful = () => isColorValue(color());
  return (
    <Show when={meaningful()}>
      <div class="flex min-w-0 items-center gap-1.5">
        <span
          class="size-3.5 shrink-0 rounded-[3px] ring-1 ring-[var(--vq-border-strong)]"
          style={{ background: colorToHex(color()) }}
          aria-hidden="true"
        />
        <div class="min-w-0">
          <p class="text-[10px] leading-tight text-[var(--vq-fg-subtle)]">{props.label}</p>
          <code class="vq-code block truncate text-[10.5px]">{color()}</code>
        </div>
      </div>
    </Show>
  );
}

function CssBlockView(props: {
  inspection: ElementInspection;
  groups: ('layout' | 'appearance' | 'typography' | 'advanced')[];
}) {
  const css = () =>
    props.groups
      .map((g) => cssBlockFor(props.inspection, g))
      .filter((b) => b.length > 0)
      .join('\n');

  return (
    <div class="relative">
      <pre class="vq-code max-h-64 overflow-auto rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] p-2.5 text-[11px] leading-relaxed">
        {css()}
      </pre>
      <div class="absolute right-2 top-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void copyText(css(), 'Computed CSS block')}
        >
          <FileCode class="size-3.5" />
          Copy
        </Button>
      </div>
    </div>
  );
}

export function OverviewTab(props: { inspection: ElementInspection; showCss: boolean }) {
  const designer = () => props.showCss;

  const layoutText = () => layoutSummary(props.inspection) ?? 'No layout styles detected.';
  const typeText = () => typographySummary(props.inspection) ?? 'No typography detected.';

  return (
    <div class="flex flex-col gap-2 p-2.5">
      <Show
        when={designer()}
        fallback={
          <>
            <CssBlockView
              inspection={props.inspection}
              groups={['layout', 'appearance', 'typography']}
            />
            <div class="mt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void copyText(props.inspection.html.selector, 'CSS selector')}
              >
                <Eye class="size-3.5" />
                Copy selector
              </Button>
            </div>
          </>
        }
      >
        <SummaryCard title="Layout" text={layoutText()} />
        <SummaryCard title="Typography" text={typeText()} />
        <div class="flex flex-wrap gap-x-4 gap-y-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2.5 py-2">
          <ColorChip label="Text" value={props.inspection.appearance.color} />
          <ColorChip label="Background" value={props.inspection.appearance.backgroundColor} />
          <ColorChip label="Border" value={props.inspection.appearance.borderColor} />
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">
            dims {Math.round(props.inspection.rect.width)}×
            {Math.round(props.inspection.rect.height)}
          </Badge>
          <Badge tone={props.inspection.visible ? 'success' : 'neutral'}>
            {props.inspection.visible ? 'visible' : 'hidden'}
          </Badge>
          <Badge tone="neutral">{props.inspection.html.tagName}</Badge>
        </div>
        <p class="text-[10.5px] text-[var(--vq-fg-subtle)]">
          Plain-language summaries — toggle “Show CSS” for the raw computed values. Same data,
          different presentation.
        </p>
      </Show>
    </div>
  );
}
