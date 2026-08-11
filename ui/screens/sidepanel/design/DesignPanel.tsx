import { ScanSearch, Square, TriangleAlert } from 'lucide-solid';
import { createSignal, Show } from 'solid-js';
import { Button } from '../../../components/Button';
import { analysis } from '../../../stores/analysis-store';
import { BreakpointsPanel } from './BreakpointsPanel';
import { ColorSystem } from './ColorSystem';
import { ComponentSection } from './ComponentSection';
import { DesignOverview } from './DesignOverview';
import { FindingsPanel } from './FindingsPanel';
import { MultiSelectBanner } from './MultiSelectBanner';
import { ScaleSystem } from './ScaleSystem';
import { SectionSkeleton } from './SectionSkeleton';
import { cancelScan, scanPage } from './scan-client';
import { TypographySystem } from './TypographySystem';
import { VariablesPanel } from './VariablesPanel';

/**
 * Section reveal (Section 7.27): each section renders once its phase lands —
 * colors → typography → spacing → components — instead of one blocking spinner.
 * A section that has never started shows its skeleton so the layout is stable.
 */
function Reveal(props: {
  /** True when the section's data has landed (renders the real section). */
  ready: boolean;
  /** True while the scan is running (keeps the skeleton in place). */
  active?: boolean;
  children: Parameters<typeof Show>[0]['children'];
}) {
  return (
    <Show
      when={props.ready}
      fallback={
        <Show when={props.active ?? false} fallback={<div />}>
          <SectionSkeleton />
        </Show>
      }
    >
      {props.children}
    </Show>
  );
}

export function DesignPanel() {
  const [recentlyScanned, setRecentlyScanned] = createSignal(false);

  async function runScan() {
    setRecentlyScanned(false);
    await scanPage();
    setRecentlyScanned(true);
    setTimeout(() => setRecentlyScanned(false), 4000);
  }

  const hasData = () => analysis.inspection != null;
  const colorsReady = () => analysis.progress.colors === 'done';
  const typographyReady = () => analysis.progress.typography === 'done';
  const scalesReady = () => analysis.progress.spacing === 'done';
  const componentsReady = () => analysis.progress.components === 'done';

  return (
    <div class="flex flex-col gap-3 p-3">
      <MultiSelectBanner />

      {/* Scan hero — the one-click action for this panel (Section 1). */}
      <div class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-lg)] border border-[var(--vq-border)] bg-[var(--vq-bg-raised)] px-3 py-2.5">
        <div class="min-w-0">
          <p class="text-[12.5px] font-semibold text-[var(--vq-fg)]">Design DNA</p>
          <p class="truncate text-[11px] text-[var(--vq-fg-subtle)]">
            {analysis.scanning
              ? 'Scanning — colors first, then type, spacing, components.'
              : hasData()
                ? 'Re-scan to pick up page changes.'
                : 'Scan the page to infer its visual system.'}
          </p>
        </div>
        <Show
          when={analysis.scanning}
          fallback={
            <Button
              variant="primary"
              onClick={() => void runScan()}
              title="One-click scan of the visible page"
            >
              <ScanSearch class="size-3.5" aria-hidden="true" />
              {recentlyScanned() ? 'Re-scan' : 'Scan page'}
            </Button>
          }
        >
          {/* A running scan is cancellable — huge pages can take a while. */}
          <Button
            variant="secondary"
            onClick={() => void cancelScan()}
            title="Stop the scan — already-extracted sections stay visible"
          >
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

      <Reveal ready={hasData() && colorsReady()} active={analysis.scanning}>
        <DesignOverview />
      </Reveal>
      <Reveal ready={hasData() && colorsReady()} active={analysis.scanning}>
        <ColorSystem />
      </Reveal>
      <Reveal ready={hasData() && typographyReady()} active={analysis.scanning}>
        <TypographySystem />
      </Reveal>
      <Reveal ready={hasData() && scalesReady()} active={analysis.scanning}>
        <ScaleSystem />
      </Reveal>
      <Reveal ready={hasData() && componentsReady()} active={analysis.scanning}>
        <ComponentSection />
      </Reveal>
      <Reveal ready={hasData() && componentsReady()} active={analysis.scanning}>
        <VariablesPanel />
      </Reveal>
      <Reveal ready={hasData() && componentsReady()} active={analysis.scanning}>
        <BreakpointsPanel />
      </Reveal>
      <Reveal ready={hasData() && componentsReady()} active={analysis.scanning}>
        <FindingsPanel />
      </Reveal>
    </div>
  );
}
