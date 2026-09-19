/**
 * App-wide constants and setting keys.
 */
import type { AIProviderId } from './types';

export const APP_NAME = 'Vizquo';
export const APP_VERSION = '1.1.0';
/** Creator / author credit — shown in the About panel, store listings, and docs. */
export const APP_AUTHOR = 'Prabhat Teotia';

/** Bump when the Inspection shape changes — invalidates all cached entries. */
export const INSPECTION_SCHEMA_VERSION = 5;

/** Sensible default cap for the L3 cache; configurable in Settings (Section 2.3). */
export const DEFAULT_CACHE_MAX_BYTES = 200 * 1024 * 1024;

/** Storage cap for the version timeline — the newest N scans per URL are kept
 * (the timeline UI also renders at most this many versions per page); older
 * versions beyond the cap are garbage-collected on history writes. */
export const MAX_VERSIONS_PER_PAGE = 25;

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
  /* ---- Custom (OpenAI-compatible) provider ---- */
  aiCustomBaseUrl: 'ai.customBaseUrl',
  /* ---- Phase 8: what's-new + resizable regions ---- */
  changelogSeenVersion: 'changelog.seenVersion',
  splitInspector: 'split.inspector',
} as const;

/**
 * AI provider metadata (Section 7.23). Vizquo ships NO built-in AI vendor and
 * NO model list — the user brings their own endpoint and their own model slug.
 * `custom` is any OpenAI-compatible server; `ollama` is a fully-local server.
 */
export const AI_PROVIDERS: {
  id: AIProviderId;
  label: string;
  description: string;
  keyLabel: string;
  keyPlaceholder: string;
}[] = [
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    description:
      'Your own endpoint — OpenAI, DeepSeek, Together, LM Studio, vLLM, a private proxy…',
    keyLabel: 'API key',
    keyPlaceholder: 'sk-…',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    description: 'Runs entirely on your machine — zero cost, zero cloud, no key.',
    keyLabel: 'API key (not needed — local)',
    keyPlaceholder: '—',
  },
];

/** Default local model for the Ollama provider. */
export const DEFAULT_OLLAMA_MODEL = 'llama3.2';

/**
 * Per-provider default models. `custom` has NO default — the user must type
 * the exact slug their endpoint expects (a guessed slug is what produces
 * "model not found" 404s, so Vizquo never guesses).
 */
export const AI_PROVIDER_DEFAULT_MODELS: Record<AIProviderId, string> = {
  custom: '',
  ollama: DEFAULT_OLLAMA_MODEL,
};

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
