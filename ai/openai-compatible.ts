/**
 * OpenAI-compatible provider — the shared engine behind the OpenAI, Groq, and
 * Custom (any OpenAI-compatible endpoint) providers. POSTs to
 * `<baseUrl>/chat/completions` with a Bearer key, exactly like OpenAI's API,
 * so LM Studio, Together, DeepSeek, vLLM, and local OpenAI-compatible servers
 * all work through the Custom provider with zero extra code.
 *
 * Same contract as every provider: throws nothing, always returns a result.
 */
import type { AIExplainRequest, AIExplainResult } from '../shared/types';
import type { AIProvider } from './provider';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 512;
const TEMPERATURE = 0.2;

/** Human-readable failure for an HTTP status from an OpenAI-compatible API. */
function httpError(status: number, providerLabel: string): string {
  switch (status) {
    case 400:
      return 'The model rejected the request — the model slug may be wrong, or the prompt was too long. Check the model in Settings.';
    case 401:
      return `The API key was rejected by ${providerLabel}. Check it in Settings.`;
    case 402:
      return `${providerLabel} needs credits or a payment method on this key.`;
    case 403:
      return `The API key does not have access to this model on ${providerLabel}.`;
    case 404:
      return `The model was not found on ${providerLabel} — check the model slug in Settings.`;
    case 429:
      return `Rate limited by ${providerLabel} — wait a moment and retry.`;
    default:
      return `${providerLabel} returned HTTP ${status}.`;
  }
}

export interface OpenAiCompatibleOptions {
  /** User-facing label used in error messages (e.g. "OpenAI", "Groq"). */
  label: string;
  /** Base URL including protocol and host, without the path. */
  baseUrl: string;
}

export class OpenAiCompatibleProvider implements AIProvider {
  readonly id: AIProviderId;
  private readonly label: string;
  private readonly baseUrl: string;

  constructor(id: 'openai' | 'groq' | 'custom', options: OpenAiCompatibleOptions) {
    this.id = id;
    this.label = options.label;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
  }

  async explain(request: AIExplainRequest, apiKey: string): Promise<AIExplainResult> {
    if (!apiKey.trim()) {
      return { ok: false, error: `Add your ${this.label} API key in Settings first.` };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, error: httpError(response.status, this.label) };
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return { ok: false, error: `${this.label} returned an empty response — try again.` };
      }
      return { ok: true, text, model: request.model, provider: this.id };
    } catch {
      if (controller.signal.aborted) {
        return { ok: false, error: 'The request timed out — try again.' };
      }
      return {
        ok: false,
        error: `Could not reach ${this.label} (network error or missing host permission). Grant access in Settings and retry.`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

import type { AIProviderId } from '../shared/types';
