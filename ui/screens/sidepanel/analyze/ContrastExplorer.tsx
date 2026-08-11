/**
 * Contrast explorer (Phase 9 power-up) — pick any two colors from the page
 * palette and see the live WCAG contrast ratio with AA/AAA verdicts. Reuses
 * the audit's own parse + luminance math, so what it shows is exactly what
 * the accessibility audit judges by.
 */
import { ArrowLeftRight, Contrast } from 'lucide-solid';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { contrastRatio, parseColor } from '../../../../engine/accessibility/audit';
import { contrastVerdicts } from '../../../../engine/accessibility/contrast-verdicts';
import type { Inspection } from '../../../../shared/types';
import { Badge } from '../../../components/Badge';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';

/** Fallback colors so the explorer is usable even before a scan. */
const FALLBACKS = ['#ffffff', '#000000', '#f5f7fa', '#6e7bff'];

function paletteColors(inspection: Inspection | null): string[] {
  const scanned = inspection?.tokens.colors.map((c) => c.value.hex) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hex of [...scanned, ...FALLBACKS]) {
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hex);
  }
  return out;
}

/** Initial pick: the page's text/background role hex when available. */
function roleHex(role: 'text' | 'background', fallback: string): string {
  const colors = paletteColors(analysis.inspection);
  const match = analysis.inspection?.tokens.colors.find((c) => c.value.role === role);
  return match && colors.includes(match.value.hex) ? match.value.hex : fallback;
}

export function ContrastExplorer() {
  const colors = createMemo<string[]>(() => paletteColors(analysis.inspection));
  const [fg, setFg] = createSignal(roleHex('text', '#000000'));
  const [bg, setBg] = createSignal(roleHex('background', '#ffffff'));

  const ratio = createMemo<number | null>(() => {
    const a = parseColor(fg());
    const b = parseColor(bg());
    if (!a || !b) return null;
    return contrastRatio(a, b);
  });

  const verdicts = createMemo(() => {
    const r = ratio();
    return r != null ? contrastVerdicts(r) : null;
  });

  const swap = () => {
    const f = fg();
    setFg(bg());
    setBg(f);
  };

  return (
    <Panel
      id="contrast-explorer"
      title="Contrast explorer"
      subtitle="Pick two colors from the page palette and judge them by the same WCAG math as the audit."
      actions={
        <span class="flex items-center gap-1.5 text-[11px] text-[var(--vq-fg-muted)]">
          <Contrast class="size-3.5" aria-hidden="true" />
          <Show when={ratio() != null} fallback="n/a">
            <span class="vq-nums text-[12px] font-semibold text-[var(--vq-fg)]">
              {ratio()?.toFixed(2)}:1
            </span>
          </Show>
        </span>
      }
    >
      <div class="flex items-center gap-2">
        <label class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Foreground
          </span>
          <select
            value={fg()}
            onChange={(e) => setFg((e.target as HTMLSelectElement).value)}
            class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 font-mono text-[11.5px] text-[var(--vq-fg)] focus:outline-none"
            aria-label="Foreground color"
          >
            <For each={colors()}>{(hex) => <option value={hex}>{hex}</option>}</For>
          </select>
        </label>
        <button
          type="button"
          class="vq-icon-btn mt-5 h-7 w-7 shrink-0"
          aria-label="Swap foreground and background"
          title="Swap colors"
          onClick={swap}
        >
          <ArrowLeftRight class="size-3.5" />
        </button>
        <label class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Background
          </span>
          <select
            value={bg()}
            onChange={(e) => setBg((e.target as HTMLSelectElement).value)}
            class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 font-mono text-[11.5px] text-[var(--vq-fg)] focus:outline-none"
            aria-label="Background color"
          >
            <For each={colors()}>{(hex) => <option value={hex}>{hex}</option>}</For>
          </select>
        </label>
      </div>

      {/* Rendered sample — what the pair actually looks like. */}
      <div
        class="mt-2.5 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] px-3 py-3"
        style={{ background: bg(), color: fg() }}
      >
        <p class="text-[13px] font-medium">The quick brown fox jumps over the lazy dog</p>
        <p class="mt-0.5 text-[10.5px] opacity-70">AaBbCc 123 · normal text</p>
      </div>

      <Show when={verdicts()}>
        {(v) => (
          <div class="mt-2.5 grid grid-cols-2 gap-1.5">
            <VerdictRow label="AA normal text" pass={v().aaNormal} need="4.5:1" />
            <VerdictRow label="AA large text" pass={v().aaLarge} need="3.0:1" />
            <VerdictRow label="AAA normal text" pass={v().aaaNormal} need="7.0:1" />
            <VerdictRow label="AAA large text" pass={v().aaaLarge} need="4.5:1" />
          </div>
        )}
      </Show>
    </Panel>
  );
}

function VerdictRow(props: { label: string; pass: boolean; need: string }) {
  return (
    <div class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-1.5">
      <span class="text-[11px] text-[var(--vq-fg-muted)]">{props.label}</span>
      <Badge tone={props.pass ? 'success' : 'danger'} class="vq-nums text-[9.5px]">
        {props.pass ? `PASS · ${props.need}` : `FAIL · ${props.need}`}
      </Badge>
    </div>
  );
}
