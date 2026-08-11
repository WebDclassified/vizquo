/**
 * App-wide constants and setting keys.
 */

export const APP_NAME = 'Vizquo';
export const APP_VERSION = '0.10.2';

/** Bump when the Inspection shape changes — invalidates all cached entries. */
export const INSPECTION_SCHEMA_VERSION = 4;

/** Sensible default cap for the L3 cache; configurable in Settings (Section 2.3). */
export const DEFAULT_CACHE_MAX_BYTES = 200 * 1024 * 1024;

export const THEMES = ['light', 'dark', 'auto'] as const;
export type ThemeId = (typeof THEMES)[number];

export const UI_MODES = ['designer', 'engineer'] as const;
export type UiMode = (typeof UI_MODES)[number];

/** Cross-context coordination keys (content ↔ background ↔ side panel). */
export const STORAGE_KEYS = {
  /** content → sidepanel: the locked element changed. */
  selectionChanged: 'vizquo:selection',
  /** content → sidepanel: inspect mode toggled. */
  inspectModeChanged: 'vizquo:inspect-mode',
  /** background → sidepanel: element to pre-select (context menu). */
  pendingSelection: 'vizquo:pending-selection',
  /** background → sidepanel: browser-level command fired. */
  commandModeToggle: 'command:mode-toggle',
  commandScreenshotViewport: 'command:screenshot-viewport',
  /** content → sidepanel: incremental scan progress with partial results. */
  scanProgress: 'vizquo:scan-progress',
  /** content → sidepanel: multi-element selection changed (shift-click). */
  multiSelectionChanged: 'vizquo:multi-selection',
  /** background → sidepanel: omnibox command fired (Phase 8). */
  commandOmnibox: 'command:omnibox',
} as const;

export const SETTING_KEYS = {
  theme: 'settings.theme',
  uiMode: 'settings.mode',
  fontScale: 'settings.fontScale',
  reducedMotion: 'settings.reducedMotion',
  highContrast: 'settings.highContrast',
  onboardingCompleted: 'onboarding.completed',
  cacheMaxBytes: 'cache.maxBytes',
  /* ---- Phase 7: contextual AI (Section 7.23) ---- */
  aiEnabled: 'ai.enabled',
  aiProvider: 'ai.provider',
  aiModel: 'ai.model',
  aiApiKey: 'ai.apiKey',
  aiConsentGiven: 'ai.consentGiven',
  /* ---- Phase 9: zero-cost local AI (Ollama) ---- */
  aiOllamaBaseUrl: 'ai.ollamaBaseUrl',
  aiOllamaModel: 'ai.ollamaModel',
  /* ---- Phase 8: what's-new + resizable regions ---- */
  changelogSeenVersion: 'changelog.seenVersion',
  splitInspector: 'split.inspector',
} as const;

/**
 * OpenRouter model list (Section 7.23). Every option is free — the AI layer
 * costs users nothing. `openrouter/free` (the top pick) auto-routes to the
 * best available free model and is the default. Users can pick any other
 * listed model or type a custom slug in Settings.
 */
export const AI_MODELS: { id: string; label: string; free: boolean }[] = [
  { id: 'openrouter/free', label: 'OpenRouter Free (auto-select)', free: true },
  { id: 'deepseek/deepseek-chat:free', label: 'DeepSeek Chat (free)', free: true },
  { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (free)', free: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)', free: true },
  { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (free)', free: true },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (free)', free: true },
];

export const DEFAULT_AI_MODEL = 'openrouter/free';

/** Select value that reveals the custom-model text input. */
export const AI_CUSTOM_MODEL = '__custom__';

export const AI_PROVIDERS: { id: 'openrouter' | 'ollama'; label: string; description: string }[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Cloud, free models by default — nothing to install.',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    description: 'Runs entirely on your machine — zero cost, zero cloud.',
  },
];

/** Default local model for the Ollama provider. */
export const DEFAULT_OLLAMA_MODEL = 'llama3.2';

export interface SettingsDefaults {
  theme: ThemeId;
  uiMode: UiMode;
  fontScale: number;
  reducedMotion: boolean;
  highContrast: boolean;
}

export const DEFAULT_SETTINGS: SettingsDefaults = {
  theme: 'auto',
  uiMode: 'designer',
  fontScale: 1,
  reducedMotion: false,
  highContrast: false,
};

/** Keyboard shortcut documentation — cheatsheet + onboarding share this. */
export interface ShortcutDoc {
  keys: string[];
  macKeys: string[];
  label: string;
  detail: string;
  /** Registered as a browser-level chrome.commands shortcut (remappable). */
  browserLevel?: boolean;
  /** Set when the shortcut's feature ships in a later phase. */
  phase?: string;
}

export const SHORTCUTS: ShortcutDoc[] = [
  {
    keys: ['Ctrl+K'],
    macKeys: ['⌘K'],
    label: 'Command palette',
    detail: 'Search every action in Vizquo.',
  },
  {
    keys: ['?'],
    macKeys: ['?'],
    label: 'Keyboard shortcuts',
    detail: 'Show this cheatsheet.',
  },
  {
    keys: ['Ctrl+Shift+Y'],
    macKeys: ['⌘⇧Y'],
    label: 'Open side panel',
    detail: 'Open Vizquo from any page.',
    browserLevel: true,
  },
  {
    keys: ['Ctrl+Shift+E'],
    macKeys: ['⌘⇧E'],
    label: 'Toggle inspect mode',
    detail: 'Toggle hover inspection on the current page.',
    browserLevel: true,
  },
  {
    keys: ['Ctrl+Shift+D'],
    macKeys: ['⌘⇧D'],
    label: 'Toggle Designer / Engineer mode',
    detail: 'Switch how extracted data is presented.',
    browserLevel: true,
  },
  {
    keys: ['Ctrl+Shift+S'],
    macKeys: ['⌘⇧S'],
    label: 'Screenshot viewport',
    detail: 'Capture the visible viewport.',
    browserLevel: true,
    phase: 'Phase 6',
  },
  {
    keys: ['Esc'],
    macKeys: ['Esc'],
    label: 'Close',
    detail: 'Close the current dialog or palette.',
  },
  {
    keys: ['↑ / ↓'],
    macKeys: ['↑ / ↓'],
    label: 'Navigate lists',
    detail: 'Move through palette results and listboxes.',
  },
];
