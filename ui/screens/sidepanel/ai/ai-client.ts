/**
 * AI client (Phase 7) — the side panel's bridge to the background worker's
 * AI_EXPLAIN handler. The key never enters this file: the panel builds a
 * bounded request (ai/prompts.ts), the privacy gate already showed its
 * payload summary, and the background performs the network call.
 */
import { buildExplainRequest } from '../../../../ai/prompts';
import type { InspectionComparison } from '../../../../export/compare';
import { sendMessage } from '../../../../shared/messages';
import type {
  AIExplainRequest,
  AIExplainResult,
  AIRequestContext,
  Asset,
  ElementInspection,
  Inspection,
} from '../../../../shared/types';
import { ui } from '../../../stores/ui-store';

/** Build the explain request the gate previews and the worker sends. */
export function buildRequest(
  context: AIRequestContext,
  input: {
    inspection?: ElementInspection;
    page?: Inspection;
    asset?: Asset;
    comparison?: InspectionComparison;
  },
): AIExplainRequest | null {
  return buildExplainRequest(context, input, ui.ai.model);
}

/** Send an already-built request; returns the provider result or an honest error. */
export async function runExplain(request: AIExplainRequest): Promise<AIExplainResult> {
  try {
    return await sendMessage('AI_EXPLAIN', request);
  } catch {
    return { ok: false, error: 'The AI worker did not answer. Check Settings and retry.' };
  }
}
