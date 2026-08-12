import { createEffect, ErrorBoundary, lazy, onCleanup, onMount, Show, Suspense } from 'solid-js';

import { browser } from 'wxt/browser';
import { SETTING_KEYS, STORAGE_KEYS, type ThemeId } from '../../../shared/constants';
import type { ElementRef } from '../../../shared/types';
import { Button } from '../../components/Button';
import { loadPersistedSettings, persist } from '../../stores/persisted-store';
import { notify, ToastViewport } from '../../stores/toast';
import {
  closePalette,
  openCheatsheet,
  openPalette,
  setActivePanel,
  toggleUiMode,
  ui,
} from '../../stores/ui-store';
import { AiExplainDialog } from './ai/AiExplainDialog';
import { CheatsheetDialog } from './CheatsheetDialog';
import { CommandPalette } from './CommandPalette';
import { runConnectionCheck, watchActiveTab } from './connection';
import { handleScanStorageChange, scanPage, setScanTabId } from './design/scan-client';
import { Footer } from './Footer';
import { Header } from './Header';
import { InspectPanel } from './InspectPanel';
import {
  handleStorageChange,
  selectElement,
  setInspectorTabId,
} from './inspector/inspector-client';
import { NavTabs } from './NavTabs';
import { OnboardingTour } from './OnboardingTour';
import { WhatNewDialog } from './WhatNewDialog';

// Phase 9: code-split the heavy feature panels. Each panel (and its engine
// imports — scan orchestration, analysis worker, asset extraction) loads in
// its own chunk on first use, so the initial bundle stays lean (build was
// warning about a >500kB App chunk). The store imports stay eager — they are
// small and every panel needs them.
const DesignPanel = lazy(() =>
  import('./design/DesignPanel').then((m) => ({ default: m.DesignPanel })),
);
const AssetsPanel = lazy(() =>
  import('./assets/AssetsPanel').then((m) => ({ default: m.AssetsPanel })),
);
const AnalyzePanel = lazy(() =>
  import('./analyze/AnalyzePanel').then((m) => ({ default: m.AnalyzePanel })),
);
const CreatePanel = lazy(() =>
  import('./create/CreatePanel').then((m) => ({ default: m.CreatePanel })),
);
const LibraryPanel = lazy(() =>
  import('./library/LibraryPanel').then((m) => ({ default: m.LibraryPanel })),
);
const SettingsScreen = lazy(() =>
  import('./SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);

function PanelFallback() {
  return (
    <div class="flex items-center justify-center p-8" role="status" aria-label="Loading panel">
      <p class="vq-meta">Loading…</p>
    </div>
  );
}

function resolveTheme(theme: ThemeId): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Panel error boundary (BUG-012): page-provided data (tokens, assets, SVG)
 * must never take the whole side panel down. A render error in any panel is
 * caught here, explained honestly, and recovered with one click — instead of
 * a dead white panel. The boundary covers the lazy panel chunk + the store
 * reads it renders; a page-provided value that crashes a panel can't kill
 * the rest of the UI.
 */
function PanelErrorBoundary(props: { children: import('solid-js').JSX.Element }) {
  return (
    <ErrorBoundary
      fallback={(_err, reset) => (
        <div
          role="alert"
          class="m-3 flex flex-col gap-2 rounded-[var(--vq-radius-lg)] border border-[var(--vq-danger-border)] bg-[var(--vq-danger-soft)] p-4"
        >
          <p class="text-[13px] font-semibold text-[var(--vq-danger-fg)]">
            This panel hit an unexpected error.
          </p>
          <p class="text-[12px] text-[var(--vq-fg-subtle)]">
            It was caused by data from the inspected page — nothing was lost. Try the panel again;
            if it persists, re-scan the page.
          </p>
          <div>
            <Button variant="primary" onClick={() => reset()}>
              Try again
            </Button>
          </div>
        </div>
      )}
    >
      {props.children}
    </ErrorBoundary>
  );
}

/** Route an omnibox command (Phase 8) to its panel action. */
function routeOmniboxCommand(command: string): void {
  switch (command) {
    case 'scan':
      setActivePanel('design');
      // Let the connection check land first when the panel just opened.
      if (ui.connection.status === 'connected') {
        void scanPage();
      } else {
        void runConnectionCheck().then(() => {
          setTimeout(() => void scanPage(), 300);
        });
      }
      break;
    case 'compare':
    case 'report':
    case 'history':
      setActivePanel('library');
      break;
    case 'settings':
      setActivePanel('settings');
      break;
    default:
      setActivePanel('inspect');
  }
}

export function App() {
  onMount(() => {
    // Keep the cached tab fresh so "Grant access" always targets the tab the
    // user is looking at (silent re-checks on tab switch / navigation).
    watchActiveTab();
    void loadPersistedSettings().then(() => {
      if (ui.connection.status === 'idle') void runConnectionCheck();
    });
    // Omnibox commands may arrive before this page was open — route any
    // pending one on mount, then let the storage listener handle live ones.
    void browser.storage.local
      .get(STORAGE_KEYS.commandOmnibox)
      .then((stored) => {
        const raw = stored[STORAGE_KEYS.commandOmnibox] as { command?: string } | undefined;
        if (raw?.command) routeOmniboxCommand(raw.command);
        if (raw) void browser.storage.local.remove(STORAGE_KEYS.commandOmnibox);
      })
      .catch(() => {
        // Storage unavailable — the listener below still works.
      });
  });

  // Keep the inspector's + scan client's tab id in sync once the connection resolves.
  createEffect(() => {
    if (ui.connection.tabId != null) {
      setInspectorTabId(ui.connection.tabId);
      setScanTabId(ui.connection.tabId);
    }
  });

  // Theming: resolved light/dark on <html> + accessibility data attributes.
  createEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(ui.theme);
    root.dataset.highContrast = String(ui.highContrast);
    root.dataset.reducedMotion = String(ui.reducedMotion);
    root.style.setProperty('--vq-font-scale', String(ui.fontScale));
  });

  // Auto theme follows OS changes live.
  createEffect(() => {
    if (ui.theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.dataset.theme = resolveTheme('auto');
    };
    mq.addEventListener('change', onChange);
    onCleanup(() => mq.removeEventListener('change', onChange));
  });

  onMount(() => {
    // Palette + cheatsheet hotkeys.
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (ui.paletteOpen) closePalette();
        else openPalette();
        return;
      }
      if (!mod && event.key === '?' && !ui.paletteOpen && !isTyping(event.target)) {
        event.preventDefault();
        openCheatsheet();
      }
    }
    window.addEventListener('keydown', onKeyDown);

    // Browser-level commands (Section 7.26) routed to the panel via storage events.
    const onStorageChanged = (
      changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
      area: string,
    ) => {
      if (area !== 'local') return;
      if ('command:mode-toggle' in changes) {
        toggleUiMode();
        persist(SETTING_KEYS.uiMode, ui.uiMode);
        return;
      }
      if ('command:screenshot-viewport' in changes) {
        setActivePanel('create');
        return;
      }
      if (STORAGE_KEYS.commandOmnibox in changes) {
        const raw = changes[STORAGE_KEYS.commandOmnibox]?.newValue as
          | { command?: string }
          | undefined;
        if (raw?.command) routeOmniboxCommand(raw.command);
        void browser.storage.local.remove(STORAGE_KEYS.commandOmnibox);
        return;
      }
      // Inspector state sync (hover / lock / inspect mode) + context-menu target.
      if (STORAGE_KEYS.pendingSelection in changes) {
        const change = changes[STORAGE_KEYS.pendingSelection];
        const raw = change?.newValue as { ref?: ElementRef | null; tabId?: number } | undefined;
        // The remove() below also fires onChanged (newValue undefined) — never
        // treat the cleanup event as a handoff (it duplicated the toast).
        if (raw != null) {
          // The context menu fired in the tab this panel is connected to.
          const isOurs = raw.tabId == null || raw.tabId === ui.connection.tabId;
          if (raw.ref && isOurs) {
            // Handoff UX: select with a flash on the page so the user sees
            // what the panel is showing, then confirm with a toast.
            void selectElement(raw.ref, { flash: true });
            setActivePanel('inspect');
            const selector = raw.ref.selector;
            notify({
              title: 'Element selected from the context menu',
              description: `${selector.length > 48 ? `${selector.slice(0, 48)}…` : selector} — right-clicked with “Inspect with Vizquo”.`,
              tone: 'neutral',
            });
          } else if (isOurs) {
            // The right-clicked element vanished (SPA navigation, removal, …)
            // — say so instead of silently opening the panel on nothing.
            notify({
              title: 'The element you right-clicked is gone',
              description:
                'It changed before the panel opened. Inspect mode is on — click any element to select it.',
              tone: 'warning',
            });
          }
        }
        void browser.storage.local.remove(STORAGE_KEYS.pendingSelection);
        return;
      }
      handleStorageChange(changes);
      handleScanStorageChange(changes);
    };
    browser.storage.onChanged.addListener(onStorageChanged);

    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      browser.storage.onChanged.removeListener(onStorageChanged);
    });
  });

  return (
    <div class="flex h-full flex-col bg-[var(--vq-bg)] text-[var(--vq-fg)]">
      <Header />
      <NavTabs />

      <main class="min-h-0 flex-1 overflow-y-auto">
        <PanelErrorBoundary>
          <Suspense fallback={<PanelFallback />}>
            <Show when={ui.activePanel === 'inspect'}>
              <InspectPanel />
            </Show>
            <Show when={ui.activePanel === 'design'}>
              <DesignPanel />
            </Show>
            <Show when={ui.activePanel === 'assets'}>
              <AssetsPanel />
            </Show>
            <Show when={ui.activePanel === 'analyze'}>
              <AnalyzePanel />
            </Show>
            <Show when={ui.activePanel === 'create'}>
              <CreatePanel />
            </Show>
            <Show when={ui.activePanel === 'library'}>
              <LibraryPanel />
            </Show>
            <Show when={ui.activePanel === 'settings'}>
              <SettingsScreen />
            </Show>
          </Suspense>
        </PanelErrorBoundary>
      </main>

      <Footer />

      <CommandPalette />
      <CheatsheetDialog />
      <AiExplainDialog />
      <OnboardingTour />
      <WhatNewDialog />
      <ToastViewport />
    </div>
  );
}
