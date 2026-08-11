import {
  Box,
  Braces,
  CircleDot,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Move,
  Palette,
  Radius,
  Sparkles,
  SquareDashed,
  Type,
} from 'lucide-solid';
import { For, Show } from 'solid-js';
import { Badge } from '../../../components/Badge';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';

/** One clickable metric — opens the matching section on the Design panel. */
interface Metric {
  key: string;
  label: string;
  icon: typeof Palette;
  count: number;
  /** Section id to scroll to (undefined = metrics tile is static info). */
  section?: string;
}

function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function MetricTile(props: { metric: Metric }) {
  const Icon = props.metric.icon;
  const inner = (
    <>
      <Icon class="size-4 shrink-0 text-[var(--vq-fg-subtle)]" aria-hidden="true" />
      <span class="min-w-0 flex-1 text-[12px] font-medium text-[var(--vq-fg)]">
        {props.metric.label}
      </span>
      <span class="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--vq-accent)]">
        {props.metric.count}
      </span>
    </>
  );
  if (!props.metric.section) {
    return (
      <div class="flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2">
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      class="flex cursor-pointer items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2 text-left transition-colors hover:border-[var(--vq-border-strong)] hover:bg-[var(--vq-bg-hover)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]"
      onClick={() => scrollToSection(props.metric?.section ?? '')}
    >
      {inner}
    </button>
  );
}

/** Design Consistency ring — derived score with an honest breakdown (Section 7.2). */
function ConsistencyRing() {
  const score = () => analysis.inspection?.consistencyScore ?? 0;
  const angle = () => (score() / 100) * 360;
  return (
    <div class="group flex items-center gap-3 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] p-3">
      <div class="relative size-14 shrink-0">
        <svg viewBox="0 0 36 36" class="size-full -rotate-90">
          <title>Design consistency score {score()} out of 100</title>
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            stroke="var(--vq-bg-sunken)"
            stroke-width="3.6"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            stroke="var(--vq-accent)"
            stroke-width="3.6"
            stroke-linecap="round"
            stroke-dasharray={`${angle()} ${360 - angle()}`}
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        </svg>
        <span class="absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums text-[var(--vq-fg)]">
          {score()}
        </span>
      </div>
      <div class="min-w-0">
        <p class="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--vq-fg)]">
          <Sparkles class="size-3.5 text-[var(--vq-accent)]" aria-hidden="true" />
          Design consistency
        </p>
        <p class="text-[11px] leading-snug text-[var(--vq-fg-subtle)]">
          How consistently the page reuses its own system. Derived, not judged.
        </p>
        <p class="hidden text-[11px] leading-snug text-[var(--vq-fg-subtle)] group-hover:block">
          Derived from spacing-scale fit, color-role coverage, and style reuse.
        </p>
      </div>
    </div>
  );
}

export function DesignOverview() {
  const inspection = () => analysis.inspection;
  const metrics = (): Metric[] => {
    const ins = inspection();
    if (!ins) return [];
    return [
      {
        key: 'colors',
        label: 'Colors',
        icon: Palette,
        count: ins.tokens.colors.length,
        section: 'colors',
      },
      {
        key: 'type',
        label: 'Text styles',
        icon: Type,
        count: ins.typeStyles.length,
        section: 'typography',
      },
      {
        key: 'fonts',
        label: 'Fonts',
        icon: CircleDot,
        count: ins.tokens.fonts.length,
        section: 'fonts',
      },
      {
        key: 'spacing',
        label: 'Spacing values',
        icon: Move,
        count: ins.tokens.spacing.length,
        section: 'spacing',
      },
      {
        key: 'radius',
        label: 'Radius values',
        icon: Radius,
        count: ins.tokens.radius.length,
        section: 'radius',
      },
      {
        key: 'shadows',
        label: 'Shadows',
        icon: SquareDashed,
        count: ins.tokens.shadows.length,
        section: 'shadows',
      },
      {
        key: 'gradients',
        label: 'Gradients',
        icon: Braces,
        count: ins.gradients.length,
        section: 'gradients',
      },
      {
        key: 'variables',
        label: 'CSS variables',
        icon: Braces,
        count: ins.variables.length,
        section: 'variables',
      },
      {
        key: 'components',
        label: 'Components',
        icon: Box,
        count: ins.components.length,
        section: 'components',
      },
      {
        key: 'breakpoints',
        label: 'Breakpoints',
        icon: LayoutGrid,
        count: ins.breakpoints.length,
        section: 'breakpoints',
      },
      { key: 'images', label: 'Images', icon: ImageIcon, count: ins.metrics.imageCount },
      { key: 'svg', label: 'SVGs', icon: Film, count: ins.metrics.svgCount },
    ];
  };

  return (
    <Panel
      id="overview"
      title="Page overview"
      subtitle={`${inspection()?.page.title || inspection()?.page.url || 'This page'} — scanned in ${(inspection()?.scanDurationMs ?? 0) / 1000}s`}
      actions={
        <Show when={analysis.cached || analysis.stale}>
          <Badge
            tone={analysis.stale ? 'warning' : 'info'}
            title="Served from the worker memo (Section 2.3)"
          >
            {analysis.stale ? 'Refreshing…' : 'Cached'}
          </Badge>
        </Show>
      }
    >
      <div class="flex flex-col gap-2.5">
        <ConsistencyRing />
        <div class="grid grid-cols-2 gap-1.5">
          <For each={metrics()}>{(metric) => <MetricTile metric={metric} />}</For>
        </div>
      </div>
    </Panel>
  );
}
