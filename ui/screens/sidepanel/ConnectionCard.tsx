import { RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-solid';
import { onMount } from 'solid-js';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { PropertyRow } from '../../components/PropertyRow';
import { Toggle } from '../../components/Toggle';
import { notify } from '../../stores/toast';
import { ui } from '../../stores/ui-store';
import { grantSiteAccess, runConnectionCheck, setInspectModeFromCard } from './connection';

function ConnectionSkeleton() {
  return (
    <div class="flex flex-col gap-2.5 p-3" role="status" aria-label="Checking connection">
      <div class="h-4 w-1/2 animate-pulse rounded bg-[var(--vq-bg-sunken)]" />
      <div class="h-4 w-2/3 animate-pulse rounded bg-[var(--vq-bg-sunken)]" />
      <div class="h-4 w-1/3 animate-pulse rounded bg-[var(--vq-bg-sunken)]" />
    </div>
  );
}

export function ConnectionCard() {
  onMount(() => {
    if (ui.connection.status === 'idle') void runConnectionCheck();
  });

  async function onToggleInspectMode(value: boolean) {
    void setInspectModeFromCard(value);
    if (value) {
      notify({
        title: 'Inspect mode on',
        description: 'Hover any element to preview it; click to lock.',
        tone: 'success',
      });
    } else {
      notify({ title: 'Inspect mode off', tone: 'neutral' });
    }
  }

  async function onGrantAccess() {
    const granted = await grantSiteAccess();
    if (!granted) {
      notify({
        title: 'Site access not granted',
        description:
          'Vizquo needs access to this page to inspect it. You can grant it from the browser prompt.',
        tone: 'warning',
      });
    }
  }

  const connected = () => ui.connection.status === 'connected' && ui.connection.contentOk === true;
  const notConnected = () =>
    ui.connection.status === 'error' ||
    (ui.connection.status === 'connected' && !ui.connection.contentOk);

  return (
    <Panel
      title="Connection"
      subtitle="side panel ↔ background ↔ page"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void runConnectionCheck()}
          title="Check again"
        >
          <RefreshCw class="size-3.5" />
          Check
        </Button>
      }
    >
      <Show when={ui.connection.status !== 'connecting'} fallback={<ConnectionSkeleton />}>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 px-1.5">
            <Show
              when={connected()}
              fallback={<WifiOff class="size-4 text-[var(--vq-warning-fg)]" />}
            >
              <Wifi class="size-4 text-[var(--vq-success-fg)]" />
            </Show>
            <span class="text-[13px] font-medium text-[var(--vq-fg)]">
              <Show when={connected()} fallback="Not connected">
                Connected
              </Show>
            </span>
            {ui.connection.latencyMs != null && (
              <Badge tone="neutral" class="vq-nums">
                {ui.connection.latencyMs} ms round-trip
              </Badge>
            )}
          </div>

          <Show
            when={connected()}
            fallback={
              <div class="vq-grid mx-1.5 mb-1 flex flex-col gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-warning-soft)] bg-[var(--vq-warning-soft)] p-2.5">
                <p class="text-[12px] leading-relaxed text-[var(--vq-warning-fg)]">
                  <Show when={notConnected()} fallback="Checking the page…">
                    Vizquo can't reach this page yet. Grant access to connect the inspector —
                    nothing is sent anywhere; everything runs locally.
                  </Show>
                </p>
                <div>
                  <Button size="sm" variant="primary" onClick={onGrantAccess}>
                    <ShieldCheck class="size-3.5" />
                    Grant access to this tab
                  </Button>
                </div>
              </div>
            }
          >
            <div class="flex flex-col">
              <PropertyRow label="Tab" value={ui.connection.tabTitle ?? 'Unknown'} />
              <PropertyRow
                label="URL"
                value={ui.connection.tabUrl ?? 'Unknown'}
                copy={ui.connection.tabUrl}
              />
              <PropertyRow label="Extension" value={ui.connection.extensionVersion ?? 'Unknown'} />
              <div class="px-1.5 py-0.5">
                <Toggle
                  label="Inspect mode"
                  description="Hover to preview elements, click to lock, arrows to navigate the DOM."
                  checked={ui.connection.inspectModeEnabled === true}
                  onChange={onToggleInspectMode}
                />
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </Panel>
  );
}
