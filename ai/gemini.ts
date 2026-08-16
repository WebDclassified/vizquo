/**
 * Google Gemini provider — the Generative Language API
 * (`https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`).
 * The key travels as a query parameter (`?key=`), which is how the official
 * API expects it; host permission is still required for the fetch to work
 * from the worker.
 */
import type { AIExplainRequest, AIExplainResult } from '../shared/types';
import type { AIProvider } from './provider';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 512;
const TEMPERATURE = 0.2;

function httpError(status: number): string {
  switch (status) {
    case 400:
      return 'The request was rejected — the model slug may be wrong, or the prompt was too long.';
    case 401:
    case 403:
      return 'The Gemini API key was rejected. Check it in Settings.';
    case 404:
      return 'The model was not found on Gemini — check the model slug in Settings.';
    case 429:
      return 'Rate limited by Gemini — wait a moment and retry.';
    default:
      return `Gemini returned HTTP ${status}.`;
  }
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;

  async explain(request: AIExplainRequest, apiKey: string): Promise<AIExplainResult> {
    if (!apiKey.trim()) {
      return { ok: false, error: 'Add your Gemini API key in Settings first.' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const url = `${GEMINI_BASE}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
          generationConfig: {
            maxOutputTokens: MAX_TOKENS,
            temperature: TEMPERATURE,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, error: httpError(response.status) };
      }

      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!text) {
        return { ok: false, error: 'Gemini returned an empty response — try again.' };
      }
      return { ok: true, text, model: request.model, provider: 'gemini' };
    } catch {
      if (controller.signal.aborted) {
        return { ok: false, error: 'The request timed out — try again.' };
      }
      return {
        ok: false,
        error:
          'Could not reach Gemini (network error or missing host permission). Grant generativelanguage.googleapis.com access in Settings and retry.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
