/**
 * AI configuration (Phase 7, Section 7.23).
 *
 * Vizquo ships **fully keyless** — there is no bundled API key in the
 * repository or in any build. (A dev-only key was removed: GitHub secret
 * scanning blocks keys in public repositories, and keyless-by-construction is
 * the correct release posture — a key embedded in an extension could be
 * extracted by anyone who downloads it.) Users paste their own OpenRouter key
 * in Settings, or use the fully-local Ollama provider with no key at all.
 */

/**
 * Always empty in every build. Kept as a constant so `resolveApiKey` and
 * `hasAuthorDefaultKey` keep a single source of truth.
 */
export const AUTHOR_DEFAULT_KEY = '';

/** True when a bundled default key is present in this build. */
export function hasAuthorDefaultKey(): boolean {
  return AUTHOR_DEFAULT_KEY.trim().length > 0;
}

/**
 * Resolve the key for a request: a user-stored key wins; otherwise fall back
 * to the bundled author default; otherwise null (honest "no key" state).
 */
export function resolveApiKey(stored: string | null | undefined): string | null {
  const trimmed = stored?.trim();
  if (trimmed) return trimmed;
  return hasAuthorDefaultKey() ? AUTHOR_DEFAULT_KEY : null;
}

/**
 * Whether AI has a usable key: a user-saved key OR the bundled author
 * default. Single source of truth shared by the ui-store and persisted-store
 * so the two can never drift (reviewer nit #4).
 */
export function aiHasKey(userKey: boolean): boolean {
  return userKey || hasAuthorDefaultKey();
}
