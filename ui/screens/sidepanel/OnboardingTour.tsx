import { ArrowRight, X } from 'lucide-solid';
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { SETTING_KEYS } from '../../../shared/constants';
import { Button } from '../../components/Button';
import { persist } from '../../stores/persisted-store';
import { setUi, ui } from '../../stores/ui-store';

interface TourStep {
  title: string;
  body: string;
  /** Element to anchor the card to; falls back to a centered card. */
  targetId?: string;
  /** Anchor placement relative to the target. */
  placement?: 'below' | 'center';
}

const STEPS: [TourStep, TourStep, TourStep] = [
  {
    title: 'Welcome to Vizquo',
    body: 'A design-intelligence layer for the web: inspect anything, understand everything, build faster. Everything runs locally — nothing leaves the browser.',
    placement: 'center',
  },
  {
    title: 'Inspect any page',
    body: 'Open Inspect to connect to the current tab. The element inspector with CSS source tracing lands in Phase 2 — the pipeline is already live.',
    targetId: 'vq-nav',
    placement: 'below',
  },
  {
    title: 'Command palette',
    body: 'Press Ctrl/⌘ K to run any command — switch themes, jump between panels, check the connection, and more.',
    targetId: 'vq-palette-btn',
    placement: 'below',
  },
];

interface CardRect {
  left: number;
  top: number;
  width: number;
}

const CARD_WIDTH = 280;

export function OnboardingTour() {
  const [rect, setRect] = createSignal<CardRect | null>(null);

  function measure(step: TourStep) {
    if (step.placement !== 'below' || !step.targetId) {
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

  function finish() {
    persist(SETTING_KEYS.onboardingCompleted, 'completed');
    setUi('onboarding', { visible: false, step: 0, done: true });
  }

  function advance() {
    if (ui.onboarding.step >= STEPS.length - 1) {
      finish();
    } else {
      setUi('onboarding', 'step', ui.onboarding.step + 1);
    }
  }

  const step = () => STEPS[Math.min(Math.max(ui.onboarding.step, 0), STEPS.length - 1)] ?? STEPS[0];

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
    <Show when={ui.onboarding.visible && !ui.onboarding.done}>
      <div class="fixed inset-0 z-[140]" role="dialog" aria-modal="true" aria-label={step().title}>
        <div class="absolute inset-0 bg-[var(--vq-overlay)]" onClick={finish} aria-hidden="true" />{' '}
        <Show
          when={rect()}
          fallback={
            <div class="absolute left-1/2 top-1/2 w-[min(320px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2">
              <TourCard step={step()} onClose={finish} onAdvance={advance} />
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
              <TourCard step={step()} onClose={finish} onAdvance={advance} />
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}

function TourCard(props: { step: TourStep; onClose: () => void; onAdvance: () => void }) {
  return (
    <div class="overflow-hidden rounded-[var(--vq-radius-xl)] border border-[var(--vq-border)] bg-[var(--vq-bg-raised)] shadow-[var(--vq-shadow-md)]">
      <div class="flex items-start justify-between gap-2 px-4 pt-3.5">
        <span class="text-[11px] font-semibold tracking-wider text-[var(--vq-accent)] uppercase">
          Tour · {ui.onboarding.step + 1} of {STEPS.length}
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
        <h2 class="mt-1 text-[14px] font-semibold text-[var(--vq-fg)]">{props.step.title}</h2>
        <p class="mt-1.5 text-[12.5px] leading-relaxed text-[var(--vq-fg-muted)]">
          {props.step.body}
        </p>
        <div class="mt-4 flex items-center justify-between">
          <div class="flex items-center gap-1" aria-hidden="true">
            <For each={STEPS}>
              {(_, i) => (
                <span
                  class={`size-1.5 rounded-full transition-colors ${
                    i() === ui.onboarding.step
                      ? 'bg-[var(--vq-accent)]'
                      : 'bg-[var(--vq-border-strong)]'
                  }`}
                />
              )}
            </For>
          </div>
          <Button variant="primary" size="sm" onClick={props.onAdvance}>
            {ui.onboarding.step === STEPS.length - 1 ? 'Finish' : 'Next'}
            {ui.onboarding.step < STEPS.length - 1 && <ArrowRight class="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
