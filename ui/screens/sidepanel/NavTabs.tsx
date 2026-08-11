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
  'relative rounded-[var(--vq-radius-md)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--vq-fg-muted)] transition-colors duration-[var(--vq-duration-fast)] hover:bg-[var(--vq-bg-hover)] hover:text-[var(--vq-fg)] data-[selected]:bg-[var(--vq-accent-soft)] data-[selected]:text-[var(--vq-accent)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)]';

export function NavTabs() {
  function changeMode(mode: 'designer' | 'engineer') {
    setUiMode(mode);
    persist(SETTING_KEYS.uiMode, mode);
  }

  const tabValue = () => (ui.activePanel === 'settings' ? 'inspect' : ui.activePanel);

  return (
    <nav
      id="vq-nav"
      class="flex h-[var(--vq-nav-height)] shrink-0 items-center justify-between gap-2 border-b border-[var(--vq-border)] px-2"
      aria-label="Primary"
    >
      <KTabs.Root value={tabValue()} onChange={(v) => setActivePanel(v as PanelId)}>
        <KTabs.List class="flex items-center gap-0.5">
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
