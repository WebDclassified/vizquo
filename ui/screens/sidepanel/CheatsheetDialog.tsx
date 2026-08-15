import { Dialog as KDialog } from '@kobalte/core';
import { For } from 'solid-js';
import { SHORTCUTS } from '../../../shared/constants';
import { Badge } from '../../components/Badge';
import { Kbd } from '../../components/Kbd';
import { closeCheatsheet, ui } from '../../stores/ui-store';

export function CheatsheetDialog() {
  return (
    <KDialog.Root open={ui.cheatsheetOpen} onOpenChange={(open) => !open && closeCheatsheet()}>
      <KDialog.Portal>
        <KDialog.Overlay class="vq-overlay fixed inset-0 z-[150]" aria-hidden="true" />
        <KDialog.Content class="vq-float fixed left-1/2 top-1/2 z-[160] w-[min(380px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--vq-radius-xl)] focus:outline-none">
          <header class="flex items-center justify-between border-b border-[var(--vq-border)] px-4 py-3">
            <div>
              <KDialog.Title class="text-[13px] font-semibold text-[var(--vq-fg)]">
                Keyboard shortcuts
              </KDialog.Title>
              <KDialog.Description class="text-[11px] text-[var(--vq-fg-subtle)]">
                Press ? anytime to open this again.
              </KDialog.Description>
            </div>
          </header>

          <div class="max-h-[60vh] overflow-y-auto p-2">
            <For each={SHORTCUTS}>
              {(shortcut) => (
                <div class="flex items-center justify-between gap-3 rounded-[var(--vq-radius-md)] px-2 py-2 hover:bg-[var(--vq-bg-hover)]">
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[12.5px] font-medium text-[var(--vq-fg)]">
                        {shortcut.label}
                      </span>
                      {shortcut.browserLevel && (
                        <Badge
                          tone="info"
                          title="Registered as a browser-level shortcut — remappable at chrome://extensions/shortcuts"
                        >
                          browser
                        </Badge>
                      )}
                      {shortcut.phase && <Badge tone="accent">{shortcut.phase}</Badge>}
                    </div>
                    <p class="text-[11.5px] text-[var(--vq-fg-muted)]">{shortcut.detail}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <For each={shortcut.keys}>
                      {(key) => (
                        <>
                          <Kbd>{key}</Kbd>
                          {key !== shortcut.keys[shortcut.keys.length - 1] && (
                            <span class="text-[var(--vq-fg-subtle)]">or</span>
                          )}
                        </>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>

          <footer class="border-t border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--vq-fg-muted)]">
            Browser-level shortcuts can be remapped at{' '}
            <code class="vq-code">chrome://extensions/shortcuts</code>. macOS uses ⌘ in place of
            Ctrl.
          </footer>
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog.Root>
  );
}
