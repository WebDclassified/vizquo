/**
 * AI readiness gate (Phase 7, Section 7.23) — pure, framework-free, so it can
 * be unit-tested in node. Evaluated from the AI settings slice; the panel and
 * the privacy gate share it. Order matters: disabled → missing key → missing
 * consent (a user must never be pushed into consent before they are enabled
 * and have a key).
 */
export type AiReadiness =
  | { ready: true }
  | { ready: false; reason: 'disabled' | 'no-key' | 'no-consent' };

export interface AiGateState {
  enabled: boolean;
  hasKey: boolean;
  consentGiven: boolean;
}

export function aiReadiness(ai: AiGateState): AiReadiness {
  if (!ai.enabled) return { ready: false, reason: 'disabled' };
  if (!ai.hasKey) return { ready: false, reason: 'no-key' };
  if (!ai.consentGiven) return { ready: false, reason: 'no-consent' };
  return { ready: true };
}
