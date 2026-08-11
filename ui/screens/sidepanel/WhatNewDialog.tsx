/**
 * What's-new dialog (Phase 8) — release notes straight from CHANGELOG.md.
 *
 * The changelog is bundled raw (`?raw`) and parsed by shared/changelog.ts
 * (pure, unit-tested). On first run the latest version is marked seen without
 * interrupting onboarding; on every later update, the dialog auto-opens once
 * with exactly the versions newer than the last seen one. Opening it manually
 * (header button / palette) shows the full log.
 */
import { Dialog as KDialog } from '@kobalte/core';
import { Sparkles, X } from 'lucide-solid';
import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import changelogRaw from '../../../CHANGELOG.md?raw';
import { latestChangelogVersion, parseChangelog } from '../../../shared/changelog';
import { APP_NAME, SETTING_KEYS } from '../../../shared/constants';
import { repository } from '../../../storage';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { persist } from '../../stores/persisted-store';
import { closeWhatsNew, openWhatsNew, ui } from '../../stores/ui-store';

export function WhatNewDialog() {
  const entries = createMemo(() => parseChangelog(changelogRaw));
  const latest = createMemo(() => latestChangelogVersion(entries()));
  /** The last version the user acknowledged; null = never recorded. */
  const [seen, setSeen] = createSignal<string | null>(null);

  // Versions strictly newer than the seen one — the "what changed" list.
  const unseen = createMemo(() => {
    const list = entries();
    const current = seen();
    if (!current) return list.slice(0, 1);
    const index = list.findIndex((entry) => entry.version === current);
    return index === -1 ? list : list.slice(0, index);
  });

  onMount(() => {
    void repository
      .getSetting<string>(SETTING_KEYS.changelogSeenVersion)
      .then((stored) => {
        setSeen(stored);
        if (stored == null) {
          // First run: record the latest silently — onboarding covers the
          // welcome; the dialog exists for *updates*.
          if (latest()) persist(SETTING_KEYS.changelogSeenVersion, latest());
        } else if (stored !== latest() && !ui.whatsNewOpen) {
          // An update shipped since the user last looked — show it once.
          openWhatsNew();
        }
      })
      .catch(() => {
        // Storage unavailable — the manual entry points still work.
      });
  });

  function markSeen(): void {
    if (latest()) persist(SETTING_KEYS.changelogSeenVersion, latest());
    setSeen(latest());
    closeWhatsNew();
  }

  return (
    <KDialog.Root
      open={ui.whatsNewOpen}
      onOpenChange={(open) => {
        if (!open) closeWhatsNew();
      }}
    >
      <KDialog.Portal>
        <KDialog.Overlay class="fixed inset-0 z-[150] bg-[var(--vq-overlay)]" aria-hidden="true" />
        <KDialog.Content class="fixed left-1/2 top-1/2 z-[160] w-[min(460px,calc(100%-32px))] max-h-[80vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--vq-radius-xl)] border border-[var(--vq-border)] bg-[var(--vq-bg-raised)] shadow-[var(--vq-shadow-md)] focus:outline-none">
          <div class="flex items-center justify-between gap-2 border-b border-[var(--vq-border)] px-4 py-3">
            <div class="flex items-center gap-2">
              <Sparkles class="size-4 text-[var(--vq-accent)]" aria-hidden="true" />
              <KDialog.Title class="text-[13px] font-semibold text-[var(--vq-fg)]">
                What's new in {APP_NAME}
              </KDialog.Title>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={closeWhatsNew}
              class="vq-icon-btn h-6 w-6"
            >
              <X class="size-3.5" />
            </button>
          </div>

          <div class="max-h-[52vh] overflow-y-auto px-4 py-3">
            <Show
              when={entries().length > 0}
              fallback={
                <p class="py-6 text-center text-[12px] text-[var(--vq-fg-subtle)]">
                  No release notes yet.
                </p>
              }
            >
              <For each={unseen()}>
                {(entry) => (
                  <section class="mb-4 last:mb-0">
                    <p class="flex flex-wrap items-center gap-1.5">
                      <Badge tone="accent" class="vq-nums">
                        v{entry.version}
                      </Badge>
                      {entry.title && (
                        <span class="text-[12.5px] font-semibold text-[var(--vq-fg)]">
                          {entry.title}
                        </span>
                      )}
                    </p>
                    <ul class="mt-1.5 flex flex-col gap-1">
                      <For each={entry.bullets}>
                        {(bullet) => (
                          <li class="text-[12px] leading-relaxed text-[var(--vq-fg-muted)]">
                            {bullet}
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                )}
              </For>
            </Show>
          </div>

          <footer class="flex items-center justify-end gap-2 border-t border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-4 py-2.5">
            <Button variant="primary" size="sm" onClick={markSeen}>
              Got it
            </Button>
          </footer>
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog.Root>
  );
}
