import {
  Accessibility,
  Cpu,
  Gauge,
  MonitorSmartphone,
  MousePointerClick,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Square,
  TriangleAlert,
} from 'lucide-solid';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Finding, Technology } from '../../../../shared/types';
import { Badge, type BadgeTone } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';
import { openAiExplain } from '../ai/AiExplainDialog';
import { cancelScan, scanPage } from '../design/scan-client';
import { highlightFinding, runTimeMachine } from './analyze-client';
import { ContrastExplorer } from './ContrastExplorer';

const SEVERITY_META: Record<
  Finding['severity'],
  { label: string; tone: BadgeTone; icon: typeof TriangleAlert; fgClass: string }
> = {
  error: {
    label: 'Error',
    tone: 'danger',
    icon: TriangleAlert,
    fgClass: 'text-[var(--vq-danger-fg)]',
  },
  warning: {
    label: 'Warning',
    tone: 'warning',
    icon: TriangleAlert,
    fgClass: 'text-[var(--vq-warning-fg)]',
  },
  info: { label: 'Info', tone: 'info', icon: TriangleAlert, fgClass: 'text-[var(--vq-info-fg)]' },
};

const CATEGORY_LABEL: Record<Finding['category'], string> = {
  accessibility: 'Accessibility',
  performance: 'Performance',
  consistency: 'Consistency',
};

/** One finding row: severity, category, message, and a highlight-on-page action. */
function FindingRow(props: { finding: Finding }) {
  const meta = SEVERITY_META[props.finding.severity];
  const Icon = meta.icon;
  return (
    <li class="flex items-start gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2">
      <Icon class={`mt-0.5 size-3.5 shrink-0 ${meta.fgClass}`} aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <Badge tone={meta.tone} class="text-[8.5px]">
            {meta.label}
          </Badge>
          <Badge tone="neutral" class="text-[8.5px]">
            {CATEGORY_LABEL[props.finding.category]}
          </Badge>
        </div>
        <p class="mt-1 text-[11.5px] leading-snug text-[var(--vq-fg)]">{props.finding.message}</p>
      </div>
      {props.finding.element && (
        <button
          type="button"
          class="vq-icon-btn mt-0.5 h-6 w-6 shrink-0"
          aria-label="Highlight this element on the page"
          title="Highlight on page"
          onClick={() => void highlightFinding(props.finding.element)}
        >
          <MousePointerClick class="size-3.5" />
        </button>
      )}
    </li>
  );
}

/** Audits section — a11y, performance, and consistency findings by severity. */
function AuditsSection() {
  const findings = createMemo<Finding[]>(() => analysis.inspection?.findings ?? []);
  const bySeverity = createMemo(() => {
    const order: Finding['severity'][] = ['error', 'warning', 'info'];
    const grouped = new Map<Finding['severity'], Finding[]>();
    for (const severity of order) grouped.set(severity, []);
    for (const f of findings()) grouped.get(f.severity)?.push(f);
    return order.map((severity) => ({ severity, list: grouped.get(severity) ?? [] }));
  });
  const counts = createMemo(() => {
    const all = findings();
    return {
      error: all.filter((f) => f.severity === 'error').length,
      warning: all.filter((f) => f.severity === 'warning').length,
      info: all.filter((f) => f.severity === 'info').length,
    };
  });

  return (
    <Panel
      id="audits"
      title="Audits"
      subtitle="Accessibility, performance, and design consistency findings — every item traces to its element."
      actions={
        <div class="flex items-center gap-1.5">
          <Show when={findings().length > 0}>
            {/* Phase 9: prioritize the fixes — bounded findings via the free AI pipeline. */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const inspection = analysis.inspection;
                if (!inspection) return;
                openAiExplain('audit', { page: inspection }, 'Prioritize these fixes (AI)');
              }}
              title="Ask AI to rank the findings into a fix order"
            >
              <Sparkles class="size-3.5" aria-hidden="true" />
              Prioritize
            </Button>
          </Show>
          <Show when={findings().length === 0}>
            <Badge tone="success">All clear</Badge>
          </Show>
        </div>
      }
    >
      <Show
        when={findings().length > 0}
        fallback={
          <p class="px-2 py-4 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            No issues found on this page. Scan to re-audit.
          </p>
        }
      >
        <For each={bySeverity()}>
          {(group) => (
            <Show when={group.list.length > 0}>
              <div class="mb-2 flex items-center gap-1.5">
                <Badge tone={SEVERITY_META[group.severity].tone}>
                  {SEVERITY_META[group.severity].label}
                </Badge>
                <span class="text-[11px] text-[var(--vq-fg-subtle)]">
                  {group.list.length} finding{group.list.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul class="mb-3 flex flex-col gap-1.5">
                <For each={group.list}>{(finding) => <FindingRow finding={finding} />}</For>
              </ul>
            </Show>
          )}
        </For>
        <p class="text-[10.5px] text-[var(--vq-fg-subtle)]">
          {counts().error} error · {counts().warning} warning · {counts().info} info — flagged,
          never asserted as a fix.
        </p>
      </Show>
    </Panel>
  );
}

const TECH_CATEGORY_TONE: Record<Technology['category'], BadgeTone> = {
  frontend: 'accent',
  styling: 'info',
  platform: 'warning',
  infra: 'neutral',
};

/** Technology stack — detected from DOM markers with honest confidence. */
function TechnologySection() {
  const technologies = createMemo<Technology[]>(() => analysis.inspection?.technologies ?? []);
  return (
    <Panel
      id="technology"
      title="Technology"
      subtitle="Framework, library, and platform markers — DOM-only detection (content scripts can't see page globals)."
    >
      <Show
        when={technologies().length > 0}
        fallback={
          <p class="px-2 py-4 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            No technology markers found — the page may be plain HTML.
          </p>
        }
      >
        <ul class="flex flex-col gap-1.5">
          <For each={technologies()}>
            {(tech) => (
              <li class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2">
                <div class="flex min-w-0 items-center gap-2">
                  <Cpu class="size-3.5 shrink-0 text-[var(--vq-fg-subtle)]" aria-hidden="true" />
                  <span class="truncate text-[12px] font-medium text-[var(--vq-fg)]">
                    {tech.name}
                  </span>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  <Badge tone={TECH_CATEGORY_TONE[tech.category]} class="text-[8.5px]">
                    {tech.category}
                  </Badge>
                  <Badge
                    tone={tech.confidence === 'detected' ? 'success' : 'info'}
                    class="text-[8.5px]"
                    title={
                      tech.confidence === 'detected'
                        ? 'Direct DOM marker'
                        : 'Heuristic — could be a coincidence'
                    }
                  >
                    {tech.confidence}
                  </Badge>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Panel>
  );
}

/** Responsive section — viewport meta, breakpoints, and the Time Machine. */
function ResponsiveSection() {
  const inspection = () => analysis.inspection;
  const breakpoints = () => inspection()?.breakpoints ?? [];
  const containerQueries = () => inspection()?.containerQueries ?? [];
  const viewportMeta = () => inspection()?.viewportMeta ?? true;
  // Phase 9 power-up: common device widths as one-click presets.
  const PRESETS = [375, 768, 1024, 1280, 1440];

  const [width, setWidth] = createSignal(1280);
  const [probe, setProbe] = createSignal<{
    layoutWidth: number;
    horizontalOverflow: boolean;
    emulated: boolean;
  } | null>(null);
  const [probing, setProbing] = createSignal(false);
  const [probeError, setProbeError] = createSignal<string | null>(null);

  // Deterministic active mapping for the current slider position.
  const active = createMemo(() => {
    const w = width();
    return breakpoints().map((bp) => {
      const passesMin = bp.minWidth === null || w >= bp.minWidth;
      const passesMax = bp.maxWidth === null || w <= bp.maxWidth;
      return { ...bp, active: passesMin && passesMax };
    });
  });

  async function probeWidth(target?: number) {
    const w = target ?? width();
    setProbing(true);
    setProbeError(null);
    try {
      const result = await runTimeMachine(w);
      if (!result) return;
      if (result.ok) {
        setProbe({
          layoutWidth: result.layoutWidth,
          horizontalOverflow: result.horizontalOverflow,
          emulated: result.emulated,
        });
      } else {
        setProbe(null);
        setProbeError(result.error);
      }
    } finally {
      setProbing(false);
    }
  }

  return (
    <Panel
      id="responsive"
      title="Responsive"
      subtitle="Breakpoints parsed from the page's own media queries — the slider shows which are active at each width."
      actions={
        <Show when={!viewportMeta()}>
          <Badge
            tone="warning"
            title="Without a viewport meta tag, mobile browsers render a desktop-width layout."
          >
            No viewport meta
          </Badge>
        </Show>
      }
    >
      <Show
        when={breakpoints().length > 0 || containerQueries().length > 0}
        fallback={
          <p class="px-2 py-4 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            No media or container queries found — this page may use a fixed-width layout.
          </p>
        }
      >
        {/* Device presets — jump to a common width and probe it. */}
        <div class="mb-2 flex flex-wrap gap-1">
          <For each={PRESETS}>
            {(preset) => (
              <button
                type="button"
                aria-pressed={width() === preset}
                onClick={() => {
                  setWidth(preset);
                  void probeWidth(preset);
                }}
                class={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] tabular-nums transition-colors ${
                  width() === preset
                    ? 'border-[var(--vq-accent)] bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]'
                    : 'border-[var(--vq-border)] text-[var(--vq-fg-muted)] hover:border-[var(--vq-border-strong)]'
                }`}
              >
                {preset}
              </button>
            )}
          </For>
        </div>

        {/* Time Machine slider */}
        <div class="mb-3">
          <div class="mb-1 flex items-center justify-between">
            <label
              for="time-machine-width"
              class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase"
            >
              Time Machine
            </label>
            <span class="text-[12px] font-semibold tabular-nums text-[var(--vq-fg)]">
              {width()}px
            </span>
          </div>
          <input
            id="time-machine-width"
            type="range"
            min="320"
            max="1920"
            step="10"
            value={width()}
            onInput={(e) => setWidth(Number((e.target as HTMLInputElement).value))}
            class="w-full accent-[var(--vq-accent)]"
          />
          <div class="mt-1 flex items-center justify-between text-[9.5px] text-[var(--vq-fg-subtle)] tabular-nums">
            <span>320</span>
            <span>768</span>
            <span>1280</span>
            <span>1920</span>
          </div>
        </div>

        {/* Active breakpoints at the current width */}
        <Show when={active().length > 0}>
          <p class="mb-1 text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Active at {width()}px
          </p>
          <div class="mb-3 flex flex-wrap gap-1">
            <For each={active()}>
              {(bp) => (
                <Badge tone={bp.active ? 'accent' : 'neutral'} class="font-mono text-[9.5px]">
                  {bp.active ? '●' : '○'} {bp.raw}
                </Badge>
              )}
            </For>
          </div>
        </Show>

        {/* Probe result */}
        <div class="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void probeWidth()}
            disabled={probing()}
          >
            <MonitorSmartphone class="size-3.5" aria-hidden="true" />
            {probing() ? 'Probing…' : 'Probe at this width'}
          </Button>
          <Show when={probe()}>
            {(p) => (
              <span class="text-[11px] text-[var(--vq-fg-subtle)]">
                {p().emulated ? 'Live emulation' : 'From media-query rules'}: layout{' '}
                {p().layoutWidth > 0 ? `${p().layoutWidth}px` : 'n/a'}
                {p().horizontalOverflow ? ' · overflows horizontally' : ' · fits'}
              </span>
            )}
          </Show>
        </div>
        <Show when={probeError()}>
          <p class="mt-1 text-[11px] text-[var(--vq-warning-fg)]">{probeError()}</p>
        </Show>

        {/* Container queries */}
        <Show when={containerQueries().length > 0}>
          <p class="mb-1 mt-3 text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Container queries
          </p>
          <div class="flex flex-wrap gap-1">
            <For each={containerQueries()}>
              {(cq) => (
                <Badge
                  tone="info"
                  class="font-mono text-[9.5px]"
                  title={cq.name ? `container: ${cq.name}` : 'anonymous container'}
                >
                  {cq.name ? `@container ${cq.name} ${cq.raw}` : `@container ${cq.raw}`}
                </Badge>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </Panel>
  );
}

/** Analyze panel — scan hero + audits, technology, responsive sections. */
export function AnalyzePanel() {
  const [recentlyScanned, setRecentlyScanned] = createSignal(false);

  async function runScan() {
    await scanPage();
    setRecentlyScanned(true);
    setTimeout(() => setRecentlyScanned(false), 4000);
  }

  return (
    <div class="flex flex-col gap-3 p-3">
      <div class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-lg)] border border-[var(--vq-border)] bg-[var(--vq-bg-raised)] px-3 py-2.5">
        <div class="min-w-0">
          <p class="text-[12.5px] font-semibold text-[var(--vq-fg)]">Analyze</p>
          <p class="truncate text-[11px] text-[var(--vq-fg-subtle)]">
            {analysis.scanning
              ? 'Scanning — audits land after the design analysis.'
              : analysis.inspection
                ? 'Accessibility, performance, stack, and responsive behavior.'
                : 'Scan the page to audit accessibility, performance, and responsiveness.'}
          </p>
        </div>
        <Show
          when={analysis.scanning}
          fallback={
            <Button variant="primary" onClick={() => void runScan()}>
              <ScanSearch class="size-3.5" aria-hidden="true" />
              {recentlyScanned() ? 'Re-scan' : 'Scan page'}
            </Button>
          }
        >
          <Button variant="secondary" onClick={() => void cancelScan()} title="Stop the scan">
            <Square class="size-3.5" aria-hidden="true" />
            Cancel scan
          </Button>
        </Show>
      </div>

      <Show when={analysis.scanError}>
        {(error) => (
          <div
            role="alert"
            class="flex items-start gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-danger-border)] bg-[var(--vq-danger-soft)] px-3 py-2 text-[11.5px] text-[var(--vq-danger-fg)]"
          >
            <TriangleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{error()}</span>
          </div>
        )}
      </Show>

      <Show when={analysis.inspection != null}>
        <AuditsSection />
        <ContrastExplorer />
        <ResponsiveSection />
        <TechnologySection />
      </Show>

      <Show when={analysis.inspection == null && !analysis.scanning}>
        <Panel id="analyze-empty" title="Analyze" subtitle="What this panel shows" bodyClass="p-4">
          <p class="text-[12px] leading-relaxed text-[var(--vq-fg-muted)]">
            Scan the page to run three analyses on top of the design scan:{' '}
            <span class="flex items-center gap-1 font-medium text-[var(--vq-fg)]">
              <Accessibility class="size-3" aria-hidden="true" /> Accessibility
            </span>{' '}
            (WCAG contrast, alt text, labels, heading order),{' '}
            <span class="flex items-center gap-1 font-medium text-[var(--vq-fg)]">
              <Gauge class="size-3" aria-hidden="true" /> Performance
            </span>{' '}
            (layout shift, lazy loading, oversized assets), the detected{' '}
            <span class="flex items-center gap-1 font-medium text-[var(--vq-fg)]">
              <Cpu class="size-3" aria-hidden="true" /> technology stack
            </span>
            , and the{' '}
            <span class="flex items-center gap-1 font-medium text-[var(--vq-fg)]">
              <SlidersHorizontal class="size-3" aria-hidden="true" /> responsive Time Machine
            </span>
            . Every finding is anchored to its element and can be highlighted on the page.
          </p>
        </Panel>
      </Show>
    </div>
  );
}
