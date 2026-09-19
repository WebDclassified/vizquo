/**
 * AI configuration (Phase 7, Section 7.23).
 *
 * Vizquo ships **fully keyless** — there is no bundled API key, vendor, or
 * model in the repository or in any build. AI runs only against endpoints the
 * user configures themselves: a custom OpenAI-compatible server (their key,
 * their model slug) or a fully-local Ollama. (An author-default dev key and a
 * bundled OpenRouter default were removed: a key embedded in a published
 * extension is extractable by anyone who downloads it, and a built-in vendor
 * contradicts the bring-your-own-endpoint posture.)
 */

/**
 * True when a key will be used: only the user's own saved key. Single source
 * of truth shared by the ui-store and Settings so the two can never drift.
 */
export function aiHasKey(userKey: boolean): boolean {
  return userKey;
}
