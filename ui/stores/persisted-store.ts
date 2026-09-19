/**
 * Persisted settings — loaded from the repository into the UI store, and
 * written back on every change. Settings live in IndexedDB via the repository
 * (Section 2.2); a chrome.storage.sync mirror for roaming settings is deferred
 * until a setting actually needs to roam (see DECISIONS.md).
 */
import { DEFAULT_OLLAMA_BASE_URL } from '../../ai/ollama';
import {
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
      aiCustomBaseUrl,
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
      repository.getSetting<string>(SETTING_KEYS.aiCustomBaseUrl),
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
        // Legacy stored values ('openrouter', 'openai', …) are normalizing
        // providers: Vizquo now ships only user-owned endpoints.
        provider: normalizeProvider(aiProvider),
        // An empty stored model is legitimate (the user hasn't chosen one
        // yet — the Settings field starts empty on purpose).
        model: aiModel ?? '',
        // Ollama needs no key — local inference. Otherwise a key exists only
        // when the user saved their own (no bundled key ships in any build).
        hasKey: normalizeProvider(aiProvider) === 'ollama' || Boolean(aiApiKey),
        userKey: Boolean(aiApiKey),
        consentGiven: aiConsentGiven ?? false,
        hostPermission: false,
        ollamaBaseUrl: aiOllamaBaseUrl ?? DEFAULT_OLLAMA_BASE_URL,
        ollamaModel: aiOllamaModel ?? DEFAULT_OLLAMA_MODEL,
        customBaseUrl: aiCustomBaseUrl ?? '',
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

/**
 * Map stored provider ids onto the two supported providers. Builds before
 * 1.1.0 offered built-in vendors (openrouter, openai, anthropic, gemini,
 * groq); their keys/origins mean nothing to a generic OpenAI-compatible
 * endpoint, so those users land on `custom` (the closest model) with their
 * key and base URL preserved — never silently dropped onto Ollama.
 */
function normalizeProvider(stored: AIProviderId | null | undefined): AIProviderId {
  if (stored === 'ollama') return 'ollama';
  return 'custom';
}
