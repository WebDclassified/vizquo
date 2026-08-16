/**
 * AI explain dialog (Phase 7, Sections 7.22–7.23) — the single surface for
 * every AI action ("Why?", explain element/page/asset).
 *
 * Privacy gate (product law, Section 8): before any page content goes to an
 * external provider, the dialog shows exactly what will be sent
 * (`payloadSummary`) and requires explicit confirmation on first use. After
 * consent is stored, the summary stays visible above the Send button so the
 * user always sees what leaves the machine. AI off / no key / no selection are
 * honest dead-end-free states that route to Settings.
 */
import { Dialog as KDialog } from '@kobalte/core';
import { Bot, Clipboard, LoaderCircle, Settings2, ShieldCheck } from 'lucide-solid';
import { createMemo, createSignal, Show } from 'solid-js';
import { aiReadiness } from '../../../../ai/gate';
import { providerOrigin } from '../../../../ai/registry';
import type { InspectionComparison } from '../../../../export/compare';
import { SETTING_KEYS } from '../../../../shared/constants';
import type {
  AIExplainRequest,
  AIRequestContext,
  Asset,
  ElementInspection,
  Inspection,
} from '../../../../shared/types';
import { Badge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { persist } from '../../../stores/persisted-store';
import { setActivePanel, setUi, ui } from '../../../stores/ui-store';
import { copyText } from '../create/create-client';
import { buildRequest, runExplain } from './ai-client';

/** What the dialog explains. */
export interface AiExplainTarget {
  context: AIRequestContext;
  input: {
    inspection?: ElementInspection;
    page?: Inspection;
    asset?: Asset;
    comparison?: InspectionComparison;
  };
  title: string;
}

// Module-level signals: the inspector button and the command palette open this
// dialog without prop-drilling through the panel tree.
const [open, setOpen] = createSignal(false);
const [target, setTarget] = createSignal<AiExplainTarget | null>(null);

// Reset per-open state lives here so a stale answer never leaks into the next
// element's explanation (reviewer #2).
const [busy, setBusy] = createSignal(false);
const [result, setResult] = createSignal<string | null>(null);
const [error, setError] = createSignal<string | null>(null);

export function openAiExplain(
  context: AIRequestContext,
  input: AiExplainTarget['input'],
  title: string,
): void {
  setTarget({ context, input, title });
  setResult(null);
  setError(null);
  setBusy(false);
  setOpen(true);
}

function RequestGate(props: { request: AIExplainRequest; onRun: () => void; busy: boolean }) {
  const consent = () => ui.ai.consentGiven;

  async function confirmAndRun() {
    // Store consent first — the user just read exactly what will be sent.
    await setUiConsent();
    props.onRun();
  }

  return (
    <div class="flex flex-col gap-2.5">
      <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] p-2.5">
        <p class="flex items-center gap-1.5 text-[10.5px] font-medium tracking-wider text-[var(--vq-fg-subtle)] uppercase">
          <ShieldCheck class="size-3.5" aria-hidden="true" />
          What will be sent to the model
        </p>
        <p class="mt-1.5 text-[11.5px] leading-relaxed text-[var(--vq-fg)]">
          {props.request.payloadSummary}
        </p>
        <p class="mt-1.5 text-[10.5px] leading-relaxed text-[var(--vq-fg-subtle)]">
          Model: <span class="vq-code">{props.request.model}</span> · Your API key never leaves the
          background worker. Nothing is stored after the reply.
        </p>
      </div>

      <Show
        when={consent()}
        fallback={
          <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-warning-soft)] bg-[var(--vq-warning-soft)] p-2.5">
            <p class="text-[11.5px] leading-relaxed text-[var(--vq-warning-fg)]">
              First use: this content is sent to the model provider you chose. Confirm to proceed —
              you won't be asked again, but the summary above always stays visible.
            </p>
          </div>
        }
      >
        <p class="text-[10.5px] text-[var(--vq-fg-subtle)]">
          Content shown above will be sent to {ui.ai.provider}. You can turn AI off in Settings any
          time.
        </p>
      </Show>

      <div class="flex items-center justify-end gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={consent() ? props.onRun : () => void confirmAndRun()}
          disabled={props.busy}
        >
          {props.busy ? (
            <LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Bot class="size-3.5" aria-hidden="true" />
          )}
          {consent() ? 'Send request' : 'Confirm & send'}
        </Button>
      </div>
    </div>
  );
}

async function setUiConsent(): Promise<void> {
  setUi('ai', 'consentGiven', true);
  persist(SETTING_KEYS.aiConsentGiven, true);
  // Enabling AI means the provider's host permission must exist for the
  // background fetch to succeed — request it here so first send doesn't fail
  // with a confusing permission error (reviewer #5). Ollama → localhost.
  if (!ui.ai.hostPermission) {
    const origin = providerOrigin(ui.ai.provider, ui.ai.customBaseUrl);
    if (origin) {
      try {
        const { browser } = await import('wxt/browser');
        const granted = await browser.permissions.request({ origins: [origin] });
        setUi('ai', 'hostPermission', granted);
      } catch {
        setUi('ai', 'hostPermission', false);
      }
    }
  }
}

export function AiExplainDialog() {
  const request = createMemo<AIExplainRequest | null>(() => {
    const t = target();
    if (!t) return null;
    return buildRequest(t.context, t.input);
  });

  async function run() {
    const req = request();
    if (!req) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await runExplain(req);
      if (res.ok) setResult(res.text);
      else setError(res.error);
    } finally {
      setBusy(false);
    }
  }

  // Only hard-block on disabled / missing key. Missing consent is NOT a
  // block — it is what the RequestGate's first-use flow surfaces (reviewer
  // #1: the consent gate must be reachable, not mislabeled as "no API key").
  const disabledReason = createMemo<string | null>(() => {
    const readiness = aiReadiness(ui.ai);
    if (readiness.ready) return null;
    if (readiness.reason === 'disabled') return 'AI is off';
    if (readiness.reason === 'no-key') return 'no API key';
    return null; // no-consent → the gate handles it
  });

  return (
    <KDialog.Root open={open()} onOpenChange={(o) => !o && setOpen(false)}>
      <KDialog.Portal>
        <KDialog.Overlay class="vq-overlay fixed inset-0 z-[150]" aria-hidden="true" />
        <KDialog.Content class="vq-float fixed left-1/2 top-1/2 z-[160] w-[min(460px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--vq-radius-xl)] focus:outline-none">
          <header class="flex items-center justify-between border-b border-[var(--vq-border)] px-4 py-3">
            <div class="min-w-0">
              <KDialog.Title class="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--vq-fg)]">
                <Bot class="size-4 shrink-0 text-[var(--vq-accent)]" aria-hidden="true" />
                {target()?.title ?? 'Ask Vizquo AI'}
              </KDialog.Title>
              <KDialog.Description class="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--vq-fg-subtle)]">
                <Badge tone="info">AI generated</Badge>
                <span>Review what's sent before anything leaves your browser.</span>
              </KDialog.Description>
            </div>
          </header>

          <div class="max-h-[60vh] overflow-y-auto p-3">
            <Show
              when={request()}
              fallback={
                <p class="p-2 text-[11.5px] text-[var(--vq-fg-muted)]">Nothing to explain yet.</p>
              }
            >
              <Show when={!disabledReason()}>
                <Show when={!busy() && !result() && !error()}>
                  <RequestGate
                    request={request() as AIExplainRequest}
                    onRun={() => void run()}
                    busy={busy()}
                  />
                </Show>

                <Show when={busy()}>
                  <div class="flex flex-col items-center gap-2 py-6 text-center">
                    <LoaderCircle
                      class="size-5 animate-spin text-[var(--vq-accent)]"
                      aria-hidden="true"
                    />
                    <p class="text-[12px] text-[var(--vq-fg-muted)]">
                      Asking {ui.ai.provider}… free models can take a few seconds.
                    </p>
                  </div>
                </Show>

                <Show when={result()}>
                  {(text) => (
                    <div class="flex flex-col gap-2">
                      <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] p-3">
                        <p class="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--vq-fg)]">
                          {text()}
                        </p>
                      </div>
                      <div class="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                          Done
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void copyText(text(), 'AI explanation')}
                        >
                          <Clipboard class="size-3.5" aria-hidden="true" />
                          Copy
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => void run()}>
                          <Bot class="size-3.5" aria-hidden="true" />
                          Ask again
                        </Button>
                      </div>
                    </div>
                  )}
                </Show>

                <Show when={error()}>
                  {(msg) => (
                    <div class="flex flex-col gap-2.5">
                      <div class="flex flex-col gap-1.5 rounded-[var(--vq-radius-md)] border border-[var(--vq-danger-soft)] bg-[var(--vq-danger-soft)] p-3">
                        <p class="text-[12px] font-medium text-[var(--vq-danger-fg)]">
                          The request failed
                        </p>
                        <p class="text-[11.5px] leading-relaxed text-[var(--vq-danger-fg)]">
                          {msg()}
                        </p>
                      </div>
                      <div class="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                          Close
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void run()}>
                          <LoaderCircle class="size-3.5" aria-hidden="true" />
                          Retry
                        </Button>
                      </div>
                    </div>
                  )}
                </Show>
              </Show>

              <Show when={disabledReason()}>
                <div class="flex flex-col gap-2.5 py-2">
                  <p class="text-[11.5px] leading-relaxed text-[var(--vq-fg-muted)]">
                    {disabledReason() === 'AI is off'
                      ? 'AI is off by default. Turn it on in Settings, add your API key, and grant the provider access — or keep using Vizquo without AI.'
                      : 'Add your API key for the selected provider in Settings. It is stored locally and used only for requests you make.'}
                  </p>
                  <div class="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                      Close
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setOpen(false);
                        setActivePanel('settings');
                      }}
                    >
                      <Settings2 class="size-3.5" aria-hidden="true" />
                      Open Settings
                    </Button>
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog.Root>
  );
}
