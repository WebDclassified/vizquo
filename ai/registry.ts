/**
 * Provider registry — the single place that turns a stored provider id +
 * settings into a working AIProvider. The background worker calls this on
 * every AI_EXPLAIN request; the panel never constructs providers directly.
 *
 * Vizquo ships NO built-in AI vendor and NO bundled key or model. Two options,
 * both fully user-owned:
 * - `custom` — any OpenAI-compatible endpoint the user configures (base URL +
 *   key + exact model slug): OpenAI, DeepSeek, Together, LM Studio, vLLM, a
 *   private proxy…
 * - `ollama` — a fully-local server the user runs themselves.
 */
import type { AIProviderId } from '../shared/types';
import { DEFAULT_OLLAMA_BASE_URL, OllamaProvider } from './ollama';
import { OpenAiCompatibleProvider } from './openai-compatible';
import type { AIProvider } from './provider';

export interface ProviderSettings {
  /** Stored Ollama base URL (used only by the ollama provider). */
  ollamaBaseUrl?: string;
  /** Stored custom (OpenAI-compatible) base URL — required by `custom`. */
  customBaseUrl?: string;
}

/** The host origin a provider needs permission for (Settings + manifest). */
export function providerOrigin(provider: AIProviderId, customBaseUrl?: string): string | null {
  switch (provider) {
    case 'ollama':
      return 'http://localhost/*';
    case 'custom': {
      // Derive the origin from the user's base URL; nothing to grant if it's
      // malformed/empty (the request will fail with an honest message).
      try {
        if (!customBaseUrl) return null;
        return `${new URL(customBaseUrl).origin}/*`;
      } catch {
        return null;
      }
    }
  }
}

/** Construct the provider matching a stored id + settings. */
export function createProvider(
  providerId: AIProviderId,
  settings: ProviderSettings = {},
): AIProvider {
  switch (providerId) {
    case 'ollama':
      return new OllamaProvider(settings.ollamaBaseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL);
    // `custom` and any unknown stored id fall through to the generic
    // OpenAI-compatible provider — never a built-in vendor.
    default: {
      const base = settings.customBaseUrl?.trim();
      return new OpenAiCompatibleProvider('custom', {
        label: 'your custom endpoint',
        baseUrl: base && /^https?:\/\//.test(base) ? base : 'https://invalid.local',
      });
    }
  }
}
