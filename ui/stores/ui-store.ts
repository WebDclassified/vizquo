/**
 * UI state — one of the three explicit Solid stores (Section 2):
 *   ui-store          → this file: panel, mode, theme, overlays, connection
 *   analysis-store    → scan results (populated by the engine in Phase 3)
 *   persisted-store   → repository-backed settings (load/persist helpers)
 */

import { createStore } from 'solid-js/store';
import { aiHasKey } from '../../ai/config';
import { DEFAULT_OLLAMA_BASE_URL } from '../../ai/ollama';
import {
  DEFAULT_AI_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_SETTINGS,
  type ThemeId,
  type UiMode,
} from '../../shared/constants';
import type { AIProviderId } from '../../shared/types';

export type PanelId =
  | 'inspect'
  | 'design'
  | 'assets'
  | 'analyze'
  | 'create'
  | 'library'
  | 'settings';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  tabId?: number;
  tabUrl?: string;
  tabTitle?: string;
  latencyMs?: number;
  contentOk?: boolean;
  inspectModeEnabled?: boolean;
  extensionVersion?: string;
  error?: string;
  lastCheckedAt?: number;
}

export interface AiUiState {
  enabled: boolean;
  provider: AIProviderId;
  model: string;
  /** True when a key will be used (user's own OR the bundled author default). */
  hasKey: boolean;
  /** True when the user has saved their OWN key (overrides the bundled one). */
  userKey: boolean;
  /** Privacy-gate consent: shown exactly what is sent and explicitly agreed. */
  consentGiven: boolean;
  /** True when the provider host permission has been granted. */
  hostPermission: boolean;
  /* ---- Phase 9: Ollama (local, keyless) ---- */
  ollamaBaseUrl: string;
  ollamaModel: string;
  /* ---- Custom (OpenAI-compatible) provider ---- */
  customBaseUrl: string;
}

interface UIState {
  theme: ThemeId;
  uiMode: UiMode;
  activePanel: PanelId;
  paletteOpen: boolean;
  cheatsheetOpen: boolean;
  /** What's-new dialog (Phase 8) — auto-opens once per new CHANGELOG version. */
  whatsNewOpen: boolean;
  fontScale: number;
  reducedMotion: boolean;
  highContrast: boolean;
  connection: ConnectionState;
  onboarding: { visible: boolean; step: number; done: boolean };
  /** Post-update "What's new" tour — walks the user through what changed. */
  whatsNewTour: { visible: boolean; step: number; done: boolean };
  ai: AiUiState;
  /** True after the user ends the inspection session (Stop button): the page
   *  was restored (inspect mode off, highlights/edits cleared) and the panel
   *  shows the paused screen until Resume. */
  stopped: boolean;
}

const [ui, setUi] = createStore<UIState>({
  theme: DEFAULT_SETTINGS.theme,
  uiMode: DEFAULT_SETTINGS.uiMode,
  activePanel: 'inspect',
  paletteOpen: false,
  cheatsheetOpen: false,
  whatsNewOpen: false,
  fontScale: DEFAULT_SETTINGS.fontScale,
  reducedMotion: DEFAULT_SETTINGS.reducedMotion,
  highContrast: DEFAULT_SETTINGS.highContrast,
  connection: { status: 'idle' },
  onboarding: { visible: false, step: 0, done: true },
  whatsNewTour: { visible: false, step: 0, done: true },
  ai: {
    enabled: false,
    provider: 'openrouter',
    model: DEFAULT_AI_MODEL,
    // The bundled author default makes AI usable before a user key exists.
    hasKey: aiHasKey(false),
    userKey: false,
    consentGiven: false,
    hostPermission: false,
    ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
    ollamaModel: DEFAULT_OLLAMA_MODEL,
    customBaseUrl: '',
  },
  stopped: false,
});

export { setUi, ui };

export const openPalette = () => setUi('paletteOpen', true);
export const closePalette = () => setUi('paletteOpen', false);
export const openCheatsheet = () => setUi('cheatsheetOpen', true);
export const closeCheatsheet = () => setUi('cheatsheetOpen', false);
export const openWhatsNew = () => setUi('whatsNewOpen', true);
export const closeWhatsNew = () => setUi('whatsNewOpen', false);
/** Start the post-update highlight tour from the What's New dialog. */
export const startWhatsNewTour = () =>
  setUi('whatsNewTour', { visible: true, step: 0, done: false });
export const closeWhatsNewTour = () =>
  setUi('whatsNewTour', { visible: false, step: 0, done: true });
export const setActivePanel = (panel: PanelId) => setUi('activePanel', panel);
export const setStopped = (stopped: boolean) => setUi('stopped', stopped);
export const setTheme = (theme: ThemeId) => setUi('theme', theme);
export const setUiMode = (mode: UiMode) => setUi('uiMode', mode);
export const toggleUiMode = () =>
  setUi('uiMode', (m) => (m === 'designer' ? 'engineer' : 'designer'));
