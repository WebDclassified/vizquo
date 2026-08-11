/**
 * Ollama provider (Phase 9) — zero-cost local AI for privacy-first users.
 *
 * Talks to a local Ollama server (`http://localhost:11434`) over its native
 * chat API. No API key, no cloud, nothing leaves the machine — the strictest
 * privacy posture Vizquo can offer, at the cost of requiring Ollama to be
 * installed and running (users opt in via Settings; the localhost host
 * permission is requested on demand).
 *
 * Same AIProvider contract as OpenRouterProvider: throws nothing, always
 * returns an honest result. Non-streaming with a timeout, mirroring the
 * OpenRouter provider (an MV3 service worker can be killed mid-stream).
 */
import type { AIExplainRequest, AIExplainResult } from '../shared/types';
import type { AIProvider } from './provider';

/** Default local Ollama endpoint. Users can override it in Settings. */
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 512;
const TEMPERATURE = 0.2;

/** Human-readable failure for an HTTP status Ollama returns. */
function httpError(status: number): string {
  switch (status) {
    case 404:
      return 'The model was not found in your local Ollama. Run `ollama pull <model>` and retry.';
    case 500:
      return 'Ollama failed to generate — check `ollama serve` is running and healthy.';
    default:
      return `Ollama returned HTTP ${status}.`;
  }
}

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const;

  /** Base URL (with port). `apiKey` is unused — local inference needs none. */
  constructor(private readonly baseUrl: string = DEFAULT_OLLAMA_BASE_URL) {}

  async explain(request: AIExplainRequest, _apiKey: string): Promise<AIExplainResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          stream: false,
          options: { num_predict: MAX_TOKENS, temperature: TEMPERATURE },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, error: httpError(response.status) };
      }

      const data = (await response.json()) as {
        message?: { content?: string };
        error?: string;
      };
      if (data.error) return { ok: false, error: `Ollama error: ${data.error}` };
      const text = data.message?.content?.trim();
      if (!text) {
        return { ok: false, error: 'Ollama returned an empty response — try again.' };
      }
      return { ok: true, text, model: request.model, provider: 'ollama' };
    } catch {
      if (controller.signal.aborted) {
        return {
          ok: false,
          error: 'The request timed out — Ollama may still be loading the model.',
        };
      }
      return {
        ok: false,
        error:
          'Could not reach Ollama. Check that `ollama serve` is running on localhost:11434 and grant the localhost permission in Settings.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
