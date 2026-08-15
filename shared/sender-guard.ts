/**
 * Message sender validation (Requirements §15/§16, INV-007).
 *
 * Chrome guarantees `sender.id` is this extension for every message it
 * delivers, and that web-page JavaScript cannot reach the service worker
 * directly — but defense in depth still applies: privileged handlers must
 * come from an extension PAGE (the side panel / window), never from a
 * content script, because a content script executes inside a hostile page's
 * document. A hostile page cannot inject into the isolated world, yet a
 * compromised content script (or a future bug) must not be able to spend the
 * user's AI credits, trigger downloads, or open windows.
 *
 * Pure functions so the exact predicates the worker relies on are
 * unit-testable without a browser (tests/sender-guard.test.ts).
 */

/** Structural sender shape — what @webext-core passes to handlers. */
export interface SenderLike {
  id?: string;
  url?: string;
  tab?: { id?: number } | null;
}

/** True when the message came from an extension page (side panel / window). */
export function isExtensionPageSender(
  sender: SenderLike | undefined,
  extensionId: string,
  extensionPagePrefix: string,
): boolean {
  return (
    sender?.id === extensionId &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(extensionPagePrefix)
  );
}

/** True when the message came from one of our content scripts in a tab. */
export function isContentScriptSender(
  sender: SenderLike | undefined,
  extensionId: string,
): boolean {
  return sender?.id === extensionId && sender?.tab != null;
}

/**
 * Panel-only guard for privileged handlers. Returns an honest refusal
 * message, or null when the sender is allowed.
 */
export function requireExtensionPage(
  sender: SenderLike | undefined,
  extensionId: string,
  extensionPagePrefix: string,
  what: string,
): string | null {
  if (!isExtensionPageSender(sender, extensionId, extensionPagePrefix)) {
    return `${what} is only available from the Vizquo side panel.`;
  }
  return null;
}
