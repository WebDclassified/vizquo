import { APP_AUTHOR, APP_VERSION } from '../../../shared/constants';
import { setActivePanel, ui } from '../../stores/ui-store';

const STATUS_META = {
  idle: { color: 'var(--vq-fg-subtle)', label: 'Idle' },
  connecting: { color: 'var(--vq-info)', label: 'Connecting…' },
  connected: { color: 'var(--vq-success)', label: 'Connected' },
  error: { color: 'var(--vq-danger)', label: 'Offline' },
} as const;

export function Footer() {
  const meta = () => STATUS_META[ui.connection.status];
  return (
    <footer class="vq-chrome flex h-7 shrink-0 items-center justify-between border-t border-[var(--vq-border)] px-3 text-[11px] text-[var(--vq-fg-subtle)]">
      <button
        type="button"
        onClick={() => setActivePanel('inspect')}
        class="flex items-center gap-1.5 rounded-[var(--vq-radius-sm)] px-1 py-0.5 transition-colors hover:bg-[var(--vq-bg-hover)] hover:text-[var(--vq-fg-muted)]"
        title="Open connection status"
      >
        <span
          class="size-1.5 rounded-full"
          style={{ background: meta().color }}
          aria-hidden="true"
        />
        {meta().label}
        {ui.connection.latencyMs != null && ` · ${ui.connection.latencyMs}ms`}
      </button>
      <span class="vq-nums" title={`Vizquo v${APP_VERSION} · created by ${APP_AUTHOR}`}>
        v{APP_VERSION}
      </span>
    </footer>
  );
}
