/**
 * Inspect panel (Phase 2) — the command center for element inspection.
 * Layout: toolbar → [DOM tree | element detail]. When the page isn't
 * connected, the connection card explains why and offers on-demand access.
 */
import { createEffect, Show, untrack } from 'solid-js';
import { SETTING_KEYS } from '../../../shared/constants';
import { SplitPane } from '../../components/SplitPane';
import { ui } from '../../stores/ui-store';
import { ConnectionCard } from './ConnectionCard';
import { DomTree } from './inspector/DomTree';
import { ElementDetail } from './inspector/ElementDetail';
import { DomTreeSkeleton } from './inspector/InspectorSkeleton';
import { InspectorToolbar } from './inspector/InspectorToolbar';
import {
  fetchDomTree,
  fetchInspection,
  pushOverlayOptions,
  setInspectorTabId,
} from './inspector/inspector-client';
import { store } from './inspector/inspector-store';

export function InspectPanel() {
  const connected = () => ui.connection.status === 'connected' && ui.connection.contentOk === true;

  // Sync the tab id + initial overlay options once connected. The overlay is
  // read untracked: this is a one-time push on connect, not something that
  // should re-run (and re-push) on every overlay change. Tracking it here
  // meant pushOverlayOptions → setStore('overlay') re-triggered this effect
  // synchronously — an infinite recursion that blew the call stack.
  createEffect(() => {
    if (connected() && ui.connection.tabId != null) {
      setInspectorTabId(ui.connection.tabId);
      const overlay = untrack(() => store.overlay);
      void pushOverlayOptions(overlay);
      if (store.domTree == null) void fetchDomTree();
      if (store.lockedRef && !store.inspection) void fetchInspection(store.lockedRef);
    }
  });

  return (
    <div class="flex h-full flex-col">
      <Show when={connected()} fallback={<ConnectionCard />}>
        <InspectorToolbar />
        <SplitPane
          orientation="horizontal"
          initialSize={232}
          minSize={160}
          maxSize={420}
          persistKey={SETTING_KEYS.splitInspector}
          dividerLabel="Resize DOM tree"
          class="min-h-0 flex-1"
          first={
            <section class="flex h-full flex-col" aria-label="DOM tree">
              <Show when={!store.domLoading} fallback={<DomTreeSkeleton />}>
                <Show
                  when={store.domTree != null}
                  fallback={
                    <div class="p-3 text-[11.5px] text-[var(--vq-fg-muted)]">
                      {store.domError ?? 'Build the DOM tree to get started.'}
                    </div>
                  }
                >
                  <DomTree truncated={store.domTruncated} />
                </Show>
              </Show>
            </section>
          }
          second={
            <section class="flex h-full min-w-0 flex-col" aria-label="Element inspector">
              <ElementDetail />
            </section>
          }
        />
      </Show>
    </div>
  );
}
