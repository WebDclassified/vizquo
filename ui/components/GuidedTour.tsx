import { ArrowRight, X } from 'lucide-solid';
import { createEffect, onCleanup, onMount, Show } from 'solid-js';
import { Button } from './Button';

export interface TourStep {
  title: string;
  body: string;
  /** Element to anchor the card to; falls back to a centered card. */
  targetId?: string;
  /** Anchor placement relative to the target. */
  placement?: 'below' | 'center';
}

interface CardRect {
  left: number;
  top: number;
  width: number;
}

const CARD_WIDTH = 280;

/**
 * Shared guided-tour shell — overlay, anchored card, progress dots, and
 * Next/Finish actions. Both OnboardingTour (first run) and WhatsNewTour
 * (post-update highlights) render through this so the UX stays identical.
 */
export function GuidedTour(props: {
  steps: TourStep[];
  visible: boolean;
  step: number;
  done: boolean;
  label: string;
  onClose: () => void;
  onAdvance: () => void;
}) {
  const [rect, setRect] = createSignal<CardRect | null>(null);

  function measure(step: TourStep | undefined) {
    if (step?.placement !== 'below' || !step?.targetId) {
      setRect(null);
      return;
    }
    const el = document.getElementById(step.targetId);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const left = Math.min(
      Math.max(r.left + r.width / 2 - CARD_WIDTH / 2, 8),
      viewport - CARD_WIDTH - 8,
    );
    setRect({ left, top: r.bottom + 10, width: CARD_WIDTH });
  }

  const step = () => props.steps[Math.min(Math.max(props.step, 0), props.steps.length - 1)];

  onMount(() => {
    const reflow = () => measure(step());
    reflow();
    window.addEventListener('resize', reflow);
    onCleanup(() => window.removeEventListener('resize', reflow));
  });

  createEffect(() => {
    measure(step());
  });

  return (
    <Show when={props.visible && !props.done}>
      <div class="fixed inset-0 z-[140]" role="dialog" aria-modal="true" aria-label={step()?.title}>
        <div class="vq-overlay absolute inset-0" onClick={props.onClose} aria-hidden="true" />
        <Show
          when={rect()}
          fallback={
            <div class="absolute left-1/2 top-1/2 w-[min(320px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2">
              <TourCard
                steps={props.steps}
                step={props.step}
                label={props.label}
                onClose={props.onClose}
                onAdvance={props.onAdvance}
              />
            </div>
          }
        >
          {(r) => (
            <div
              class="absolute z-10"
              style={{ left: `${r().left}px`, top: `${r().top}px`, width: `${CARD_WIDTH}px` }}
            >
              <div
                class="ml-3 size-0 border-x-8 border-b-8 border-x-transparent border-b-[var(--vq-bg-raised)]"
                aria-hidden="true"
              />
              <TourCard
                steps={props.steps}
                step={props.step}
                label={props.label}
                onClose={props.onClose}
                onAdvance={props.onAdvance}
              />
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}

function TourCard(props: {
  steps: TourStep[];
  step: number;
  label: string;
  onClose: () => void;
  onAdvance: () => void;
}) {
  const current = () => props.steps[Math.min(Math.max(props.step, 0), props.steps.length - 1)];
  const last = () => props.step >= props.steps.length - 1;
  return (
    <div class="vq-float overflow-hidden rounded-[var(--vq-radius-xl)]">
      <div class="flex items-start justify-between gap-2 px-4 pt-3.5">
        <span class="text-[11px] font-semibold tracking-wider text-[var(--vq-accent)] uppercase">
          {props.label} · {props.step + 1} of {props.steps.length}
        </span>
        <button
          type="button"
          aria-label="Skip tour"
          onClick={props.onClose}
          class="vq-icon-btn h-6 w-6"
        >
          <X class="size-3.5" />
        </button>
      </div>
      <div class="px-4 pb-4">
        <h2 class="mt-1 text-[14px] font-semibold text-[var(--vq-fg)]">{current()?.title}</h2>
        <p class="mt-1.5 text-[12.5px] leading-relaxed text-[var(--vq-fg-muted)]">
          {current()?.body}
        </p>
        <div class="mt-4 flex items-center justify-between">
          <div class="flex items-center gap-1" aria-hidden="true">
            <For each={props.steps}>
              {(_, i) => (
                <span
                  class={`size-1.5 rounded-full transition-colors ${
                    i() === props.step ? 'bg-[var(--vq-accent)]' : 'bg-[var(--vq-border-strong)]'
                  }`}
                />
              )}
            </For>
          </div>
          <Button variant="primary" size="sm" onClick={props.onAdvance}>
            {last() ? 'Finish' : 'Next'}
            {!last() && <ArrowRight class="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
