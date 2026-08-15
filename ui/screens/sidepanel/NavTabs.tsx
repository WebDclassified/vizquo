import { Tabs as KTabs } from '@kobalte/core';
import { For } from 'solid-js';
import { SETTING_KEYS } from '../../../shared/constants';
import { Segmented } from '../../components/Segmented';
import { persist } from '../../stores/persisted-store';
import { type PanelId, setActivePanel, setUiMode, ui } from '../../stores/ui-store';

const TABS: { id: PanelId; label: string }[] = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'design', label: 'Design' },
  { id: 'assets', label: 'Assets' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'create', label: 'Create' },
  { id: 'library', label: 'Library' },
];

const TAB_CLASS =
  'relative shrink-0 whitespace-nowrap rounded-[var(--vq-radius-md)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--vq-fg-muted)] transition-colors duration-[var(--vq-duration-fast)] hover:bg-[var(--vq-bg-hover)] hover:text-[var(--vq-fg)] data-[selected]:bg-[var(--vq-accent-soft)] data-[selected]:text-[var(--vq-accent)] data-[selected]:shadow-[inset_0_1px_0_var(--vq-highlight)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]';

export function NavTabs() {
  function changeMode(mode: 'designer' | 'engineer') {
    setUiMode(mode);
    persist(SETTING_KEYS.uiMode, mode);
  }

  const tabValue = () => (ui.activePanel === 'settings' ? 'inspect' : ui.activePanel);

  return (
    <nav
      id="vq-nav"
      class="vq-chrome flex h-[var(--vq-nav-height)] shrink-0 items-center gap-2 border-b border-[var(--vq-border)] px-2"
      aria-label="Primary"
    >
      {/* The tab row scrolls horizontally when the panel is narrow (real
          side panels are ~280–420px wide) — the mode toggle stays fixed. */}
      <KTabs.Root
        value={tabValue()}
        onChange={(v) => setActivePanel(v as PanelId)}
        class="min-w-0 flex-1"
      >
        <KTabs.List class="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <For each={TABS}>
            {(tab) => (
              <KTabs.Trigger value={tab.id} class={TAB_CLASS}>
                {tab.label}
              </KTabs.Trigger>
            )}
          </For>
        </KTabs.List>
      </KTabs.Root>

      <Segmented
        ariaLabel="Presentation mode"
        class="shrink-0"
        value={ui.uiMode}
        onChange={changeMode}
        options={[
          { value: 'designer', label: 'Designer' },
          { value: 'engineer', label: 'Engineer' },
        ]}
      />
    </nav>
  );
}
