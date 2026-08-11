/**
 * Persisted settings — loaded from the repository into the UI store, and
 * written back on every change. Settings live in IndexedDB via the repository
 * (Section 2.2); a chrome.storage.sync mirror for roaming settings is deferred
 * until a setting actually needs to roam (see DECISIONS.md).
 */
import { aiHasKey } from '../../ai/config';
import { DEFAULT_OLLAMA_BASE_URL } from '../../ai/ollama';
import {
  DEFAULT_AI_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  type ThemeId,
  type UiMode,
} from '../../shared/constants';
import type { AIProviderId } from '../../shared/types';
import { repository } from '../../storage';
import { setUi } from './ui-store';

/** Load persisted settings from the repository into the UI store. */
export async function loadPersistedSettings(): Promise<void> {
  try {
    const [
      theme,
      uiMode,
      fontScale,
      reducedMotion,
      highContrast,
      onboarding,
      aiEnabled,
      aiProvider,
      aiModel,
      aiApiKey,
      aiConsentGiven,
      aiOllamaBaseUrl,
      aiOllamaModel,
    ] = await Promise.all([
      repository.getSetting<ThemeId>(SETTING_KEYS.theme),
      repository.getSetting<UiMode>(SETTING_KEYS.uiMode),
      repository.getSetting<number>(SETTING_KEYS.fontScale),
      repository.getSetting<boolean>(SETTING_KEYS.reducedMotion),
      repository.getSetting<boolean>(SETTING_KEYS.highContrast),
      repository.getSetting<string>(SETTING_KEYS.onboardingCompleted),
      repository.getSetting<boolean>(SETTING_KEYS.aiEnabled),
      repository.getSetting<AIProviderId>(SETTING_KEYS.aiProvider),
      repository.getSetting<string>(SETTING_KEYS.aiModel),
      repository.getSetting<string>(SETTING_KEYS.aiApiKey),
      repository.getSetting<boolean>(SETTING_KEYS.aiConsentGiven),
      repository.getSetting<string>(SETTING_KEYS.aiOllamaBaseUrl),
      repository.getSetting<string>(SETTING_KEYS.aiOllamaModel),
    ]);

    const completed = onboarding === 'completed';

    setUi({
      theme: theme ?? DEFAULT_SETTINGS.theme,
      uiMode: uiMode ?? DEFAULT_SETTINGS.uiMode,
      fontScale: fontScale ?? DEFAULT_SETTINGS.fontScale,
      reducedMotion: reducedMotion ?? DEFAULT_SETTINGS.reducedMotion,
      highContrast: highContrast ?? DEFAULT_SETTINGS.highContrast,
      onboarding: completed
        ? { visible: false, step: 0, done: true }
        : { visible: true, step: 0, done: false },
      ai: {
        enabled: aiEnabled ?? false,
        provider: aiProvider ?? 'openrouter',
        model: aiModel ?? DEFAULT_AI_MODEL,
        // Ollama needs no key — local inference. Otherwise a key is available
        // when the user saved their own OR the bundled author default exists
        // (the key value never enters the UI store).
        hasKey: (aiProvider ?? 'openrouter') === 'ollama' || aiHasKey(Boolean(aiApiKey)),
        userKey: Boolean(aiApiKey),
        consentGiven: aiConsentGiven ?? false,
        hostPermission: false,
        ollamaBaseUrl: aiOllamaBaseUrl ?? DEFAULT_OLLAMA_BASE_URL,
        ollamaModel: aiOllamaModel ?? DEFAULT_OLLAMA_MODEL,
      },
    });
  } catch {
    // Repository unavailable (first run / storage blocked): stay on defaults.
  }
}

/** Fire-and-forget persistence of a single setting. */
export function persist(key: string, value: unknown): void {
  void repository.setSetting(key, value).catch(() => {
    // Non-fatal: the UI stays correct for the session even if persistence fails.
  });
}
