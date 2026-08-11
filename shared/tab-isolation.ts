/**
 * Multi-tab isolation (Section 7.27) — a pure predicate shared by the panel's
 * storage-event handlers (inspector + scan clients).
 *
 * Every storage payload a content script publishes (selection, inspect mode,
 * scan progress, multi-selection, pending selection) is stamped with its
 * producing tab id. A panel connected to tab B must never consume tab A's
 * events — otherwise data from one page leaks into another tab's panel.
 *
 * Rules:
 * - No connected tab → nothing is consumed (this panel never asked for it).
 * - Unstamped (legacy) payloads are accepted for backward compatibility.
 * - Stamped payloads from another tab are always dropped.
 */
export function isForTab(
  payloadTabId: number | undefined,
  connectedTabId: number | undefined,
): boolean {
  if (connectedTabId == null) return false;
  return payloadTabId == null || payloadTabId === connectedTabId;
}
