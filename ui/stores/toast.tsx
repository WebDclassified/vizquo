/**
 * Toast & undo system (Section 7.27) — one consistent toast component for
 * copy/save confirmations, built on Kobalte's toaster.
 */
import { Toast, toaster } from '@kobalte/core';
import { Check, Info, TriangleAlert, X } from 'lucide-solid';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

const TOAST_REGION = 'vizquo';

function toneColor(tone: ToastTone): string {
  switch (tone) {
    case 'success':
      return 'text-[var(--vq-success-fg)]';
    case 'warning':
      return 'text-[var(--vq-warning-fg)]';
    case 'error':
      return 'text-[var(--vq-danger-fg)]';
    default:
      return 'text-[var(--vq-info-fg)]';
  }
}

function ToastGlyph(props: { tone: ToastTone }) {
  if (props.tone === 'success') return <Check class="size-4" />;
  if (props.tone === 'warning') return <TriangleAlert class="size-4" />;
  if (props.tone === 'error') return <Info class="size-4" />;
  return <Info class="size-4" />;
}

function VizToast(props: {
  toastId: number;
  title: string;
  description?: string;
  tone: ToastTone;
}) {
  return (
    <Toast.Root
      toastId={props.toastId}
      class="pointer-events-auto flex w-full items-start gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-raised)] px-3 py-2.5 shadow-[var(--vq-shadow-md)]"
    >
      <span class={`mt-0.5 shrink-0 ${toneColor(props.tone)}`}>
        <ToastGlyph tone={props.tone} />
      </span>
      <div class="min-w-0 flex-1">
        <Toast.Title class="text-[13px] font-medium text-[var(--vq-fg)]">{props.title}</Toast.Title>
        {props.description && (
          <Toast.Description class="mt-0.5 text-[12px] text-[var(--vq-fg-muted)]">
            {props.description}
          </Toast.Description>
        )}
      </div>
      <Toast.CloseButton
        class="shrink-0 rounded-[var(--vq-radius-sm)] p-0.5 text-[var(--vq-fg-subtle)] transition-colors hover:text-[var(--vq-fg)]"
        aria-label="Dismiss notification"
      >
        <X class="size-3.5" />
      </Toast.CloseButton>
    </Toast.Root>
  );
}

export function notify(input: ToastInput): number {
  const tone = input.tone ?? 'neutral';
  return toaster.show(
    (props) => (
      <VizToast
        toastId={props.toastId}
        title={input.title}
        description={input.description}
        tone={tone}
      />
    ),
    { region: TOAST_REGION },
  );
}

/** Mount once in the app shell. */
export function ToastViewport() {
  return (
    <Toast.Region
      regionId={TOAST_REGION}
      duration={3500}
      pauseOnInteraction
      limit={4}
      class="pointer-events-none fixed inset-x-3 bottom-3 z-[200] outline-none"
    >
      <Toast.List class="flex flex-col gap-2" />
    </Toast.Region>
  );
}
