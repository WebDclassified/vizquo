/**
 * AI provider adapter (Section 2.3 pattern, applied to AI — see Section 2.2):
 * feature code depends only on this interface, so a free/local model (Ollama,
 * WebLLM) or another hosted API can be swapped in later without touching the
 * panels or the background worker.
 *
 * Security contract (Section 8): the API key is held by the background worker
 * only. The side panel builds prompts from inspected page data (bounded and
 * redacted in `ai/prompts.ts`), the privacy gate shows exactly what will be
 * sent, and the worker performs the network call. No page data is persisted.
 */
import type { AIExplainRequest, AIExplainResult, AIProviderId } from '../shared/types';

/** One call to a provider. Providers are stateless and pure of UI concerns. */
export interface AIProvider {
  readonly id: AIProviderId;
  /** Run one explain request. Throws nothing — always returns a result. */
  explain(request: AIExplainRequest, apiKey: string): Promise<AIExplainResult>;
}

export type { AIExplainRequest, AIExplainResult, AIProviderId };
