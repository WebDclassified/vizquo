/**
 * Provider registry — the single place that turns a stored provider id +
 * settings into a working AIProvider. The background worker calls this on
 * every AI_EXPLAIN request; the panel never constructs providers directly.
 */
import type { AIProviderId } from '../shared/types';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { DEFAULT_OLLAMA_BASE_URL, OllamaProvider } from './ollama';
import { OpenAiCompatibleProvider } from './openai-compatible';
import { OpenRouterProvider } from './openrouter';
import type { AIProvider } from './provider';

export interface ProviderSettings {
  /** Stored Ollama base URL (used only by the ollama provider). */
  ollamaBaseUrl?: string;
  /** Stored custom (OpenAI-compatible) base URL — required by `custom`. */
  customBaseUrl?: string;
}

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/** The host origin a provider needs permission for (Settings + manifest). */
export function providerOrigin(provider: AIProviderId, customBaseUrl?: string): string | null {
  switch (provider) {
    case 'ollama':
      return 'http://localhost/*';
    case 'openrouter':
      return 'https://openrouter.ai/*';
    case 'openai':
      return 'https://api.openai.com/*';
    case 'anthropic':
      return 'https://api.anthropic.com/*';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/*';
    case 'groq':
      return 'https://api.groq.com/*';
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
    case 'openai':
      return new OpenAiCompatibleProvider('openai', {
        label: 'OpenAI',
        baseUrl: OPENAI_BASE_URL,
      });
    case 'groq':
      return new OpenAiCompatibleProvider('groq', {
        label: 'Groq',
        baseUrl: GROQ_BASE_URL,
      });
    case 'anthropic':
      return new AnthropicProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'custom': {
      const base = settings.customBaseUrl?.trim();
      return new OpenAiCompatibleProvider('custom', {
        label: 'your custom endpoint',
        baseUrl: base && /^https?:\/\//.test(base) ? base : 'https://invalid.local',
      });
    }
    default:
      // openrouter and any unknown id fall back to the default provider.
      return new OpenRouterProvider();
  }
}
