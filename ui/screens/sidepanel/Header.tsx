import { Command, Keyboard, Moon, Settings, Sparkles, Sun, SunMoon } from 'lucide-solid';
import { SETTING_KEYS, type ThemeId } from '../../../shared/constants';
import { IconButton } from '../../components/IconButton';
import { Logo } from '../../components/Logo';
import { persist } from '../../stores/persisted-store';
import { notify } from '../../stores/toast';
import {
  openCheatsheet,
  openPalette,
  openWhatsNew,
  setActivePanel,
  setTheme,
  ui,
} from '../../stores/ui-store';

function nextTheme(theme: ThemeId): ThemeId {
  if (theme === 'light') return 'dark';
  if (theme === 'dark') return 'auto';
  return 'light';
}

function ThemeGlyph(props: { class?: string }) {
  if (ui.theme === 'light') return <Sun class={props.class} />;
  if (ui.theme === 'dark') return <Moon class={props.class} />;
  return <SunMoon class={props.class} />;
}

export function Header() {
  function cycleTheme() {
    const next = nextTheme(ui.theme);
    setTheme(next);
    persist(SETTING_KEYS.theme, next);
    notify({ title: `Theme: ${next}`, tone: 'neutral' });
  }

  return (
    <header class="flex h-[var(--vq-header-height)] shrink-0 items-center justify-between gap-2 border-b border-[var(--vq-border)] px-3">
      <div class="flex min-w-0 items-center gap-2">
        <Logo class="h-[21px] w-auto shrink-0 text-[var(--vq-fg)]" />
      </div>

      <div class="flex shrink-0 items-center gap-0.5">
        <IconButton
          id="vq-palette-btn"
          icon={Command}
          label="Command palette"
          tooltip="Command palette (Ctrl/⌘ K)"
          onClick={openPalette}
        />
        <IconButton
          icon={Keyboard}
          label="Keyboard shortcuts"
          tooltip="Keyboard shortcuts (?)"
          onClick={openCheatsheet}
        />
        <IconButton
          icon={Sparkles}
          label="What's new"
          tooltip="What's new"
          onClick={openWhatsNew}
        />
        <IconButton
          icon={ThemeGlyph}
          label={`Theme: ${ui.theme}`}
          tooltip={`Theme: ${ui.theme} — click to change`}
          onClick={cycleTheme}
        />
        <IconButton
          icon={Settings}
          label="Settings"
          selected={ui.activePanel === 'settings'}
          onClick={() => setActivePanel('settings')}
        />
      </div>
    </header>
  );
}
