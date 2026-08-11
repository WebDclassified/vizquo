/**
 * OpenRouter provider (Phase 7, Section 7.23) — the default AI backend.
 *
 * BYOK (bring your own key): users paste their own OpenRouter key in Settings;
 * the bundled author default (ai/config.ts) covers first-run use until they
 * do. Free models (`openrouter/free` auto-select, or `:free` slugs) are the
 * defaults, so the AI layer costs users nothing; OpenRouter rate-limits them,
 * which we surface as an honest error.
 *
 * Non-streaming (simpler + robust in an ephemeral MV3 service worker, which
 * could be killed mid-SSE-stream), with a hard timeout and a low temperature
 * so grounded design explanations stay factual and on-topic.
 */
import type { AIExplainRequest, AIExplainResult } from '../shared/types';
import type { AIProvider } from './provider';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45_000;
// Conservative ceiling: `openrouter/free` auto-routes to free models with
// varying max_tokens caps — a value above a model's ceiling gets a 400, so
// stay well under the typical floor (reviewer #2).
const MAX_TOKENS = 512;
/** Low temperature: answers are grounded in extracted data, not free prose. */
const TEMPERATURE = 0.2;

/** Human-readable failure for an HTTP status OpenRouter returns. */
function httpError(status: number): string {
  switch (status) {
    case 400:
      return 'The model rejected the request — it may cap output length, or the prompt was too long. Try another model or a more focused question.';
    case 401:
      return 'The API key was rejected by OpenRouter. Check it in Settings.';
    case 402:
      return 'OpenRouter needs credits on this key — free models may be unavailable right now.';
    case 403:
      return 'The API key does not have access to this model.';
    case 404:
      return 'The model was not found on OpenRouter — try another model in Settings.';
    case 429:
      return 'Rate limited. Free OpenRouter models are shared — wait a moment and retry, or pick another model.';
    default:
      return `OpenRouter returned HTTP ${status}.`;
  }
}

export class OpenRouterProvider implements AIProvider {
  readonly id = 'openrouter' as const;

  async explain(request: AIExplainRequest, apiKey: string): Promise<AIExplainResult> {
    if (!apiKey.trim()) {
      return { ok: false, error: 'Add your OpenRouter API key in Settings first.' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(OPENROUTER_URL, {
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
        return { ok: false, error: httpError(response.status) };
      }

      const data = (await response.json()) as {
        choices?: {
          message?: { content?: string; reasoning?: string };
        }[];
      };
      const message = data.choices?.[0]?.message;
      const text = message?.content?.trim();
      if (!text) {
        // `openrouter/free` can route to reasoning models (e.g. DeepSeek R1),
        // which normally put the final answer in message.content. If only
        // reasoning is present, raw chain-of-thought is NOT the answer — law
        // #5 says never present an inference as fact (reviewer #3).
        const hasOnlyReasoning = Boolean(message?.reasoning?.trim());
        return {
          ok: false,
          error: hasOnlyReasoning
            ? 'The model produced reasoning but no final answer — try again or pick another model.'
            : 'The model returned an empty response — try again.',
        };
      }
      return { ok: true, text, model: request.model, provider: 'openrouter' };
    } catch {
      if (controller.signal.aborted) {
        return {
          ok: false,
          error: 'The request timed out. Free models can be slow — try again.',
        };
      }
      return {
        ok: false,
        error:
          'Could not reach OpenRouter (network error or missing host permission). Grant the openrouter.ai permission in Settings and retry.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
