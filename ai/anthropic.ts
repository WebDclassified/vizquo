/**
 * Anthropic provider — Claude models via the Messages API
 * (`https://api.anthropic.com/v1/messages`). Keyed with the `x-api-key`
 * header plus the required `anthropic-version` header.
 */
import type { AIExplainRequest, AIExplainResult } from '../shared/types';
import type { AIProvider } from './provider';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 512;
const TEMPERATURE = 0.2;

function httpError(status: number): string {
  switch (status) {
    case 400:
      return 'The request was rejected — the model slug may be wrong, or the prompt was too long.';
    case 401:
      return 'The Anthropic API key was rejected. Check it in Settings.';
    case 403:
      return 'The API key does not have access to this model.';
    case 404:
      return 'The model was not found on Anthropic — check the model slug in Settings.';
    case 429:
      return 'Rate limited by Anthropic — wait a moment and retry.';
    default:
      return `Anthropic returned HTTP ${status}.`;
  }
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const;

  async explain(request: AIExplainRequest, apiKey: string): Promise<AIExplainResult> {
    if (!apiKey.trim()) {
      return { ok: false, error: 'Add your Anthropic API key in Settings first.' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey.trim(),
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.userPrompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, error: httpError(response.status) };
      }

      const data = (await response.json()) as {
        content?: { type?: string; text?: string }[];
      };
      const text = data.content
        ?.filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
        .trim();
      if (!text) {
        return { ok: false, error: 'Claude returned an empty response — try again.' };
      }
      return { ok: true, text, model: request.model, provider: 'anthropic' };
    } catch {
      if (controller.signal.aborted) {
        return { ok: false, error: 'The request timed out — try again.' };
      }
      return {
        ok: false,
        error:
          'Could not reach Anthropic (network error or missing host permission). Grant api.anthropic.com access in Settings and retry.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
