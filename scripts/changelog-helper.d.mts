/**
 * Type declarations for scripts/changelog-helper.mjs — the release pipeline's
 * pure changelog helpers. Keeps `tsc --noEmit` (CI typecheck) happy when the
 * unit tests import the module.
 */
export function changelogHasVersion(raw: string, version: string): boolean;
export function insertChangelogPlaceholder(
  raw: string,
  version: string,
): { raw: string; inserted: boolean };
export function restoreRenamedChangelogHeading(raw: string, oldV: string, newV: string): string;
