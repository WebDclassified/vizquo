/**
 * Paused screen — shown after the user ends the inspection session (Stop in
 * the header). Chrome's side panel cannot be closed programmatically, so this
 * state is the honest shutdown surface: it tells the user the page was
 * restored and offers one click to resume. Reopening the panel from the
 * toolbar also lands here until Resume is pressed.
 */
import { Play } from 'lucide-solid';
import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { resumeSession } from './session-client';

export function StoppedScreen() {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Logo class="h-[22px] w-auto text-[var(--vq-fg)]" />
      <p class="text-[13px] font-semibold text-[var(--vq-fg)]">Inspection session ended</p>
      <p class="max-w-[260px] text-[11.5px] leading-relaxed text-[var(--vq-fg-subtle)]">
        Vizquo is paused. The page was restored — highlights, live edits, and overlays were cleared.
        Nothing was changed permanently.
      </p>
      <Button variant="primary" size="sm" onClick={() => void resumeSession()}>
        <Play class="size-3.5" aria-hidden="true" />
        Resume inspecting
      </Button>
      <p class="text-[10.5px] text-[var(--vq-fg-muted)]">
        You can also reopen the panel from the browser toolbar at any time.
      </p>
    </div>
  );
}
