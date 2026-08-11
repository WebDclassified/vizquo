/**
 * AI configuration (Phase 7, Section 7.23).
 *
 * `AUTHOR_DEFAULT_KEY` is the extension author's own OpenRouter key, bundled
 * so AI works out of the box in dev mode. A user's own key in Settings always
 * takes precedence (`resolveApiKey`), and AI stays fully usable without a
 * bundled key when this is empty.
 *
 * Keyless production builds (release posture): the key is only inlined when
 * `import.meta.env.DEV` is true (WXT dev server). `wxt build` — every
 * distributable bundle, including the Web Store ZIP — ships with the key
 * stripped to `''`, so nobody can extract it from a published extension and
 * spend the author's credits. Users then paste their own key in Settings.
 */

/**
 * The author's bundled development key. Vite statically replaces
 * `import.meta.env.DEV` — dev = inlined, production build = ''.
 */
export const AUTHOR_DEFAULT_KEY = import.meta.env.DEV
  ? 'sk-or-v1-REVOKED'
  : '';

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
