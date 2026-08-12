/**
 * Pure changelog helpers for the release pipeline — extracted from
 * scripts/release-store.mjs so the version-heading logic is unit-testable.
 *
 * Changelog headings may carry a title ("## 0.10.7 — Release notes"), so the
 * version is matched as a prefix followed by a space or end-of-line — never
 * a prefix of a longer version (## 0.10.70 must not match 0.10.7).
 */
function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function headingRe(version) {
  return new RegExp(`^## ${escapeRe(version)}(\\s|$)`, 'm');
}

/** True when the changelog already has a "## <version>" heading (titled or bare). */
export function changelogHasVersion(raw, version) {
  return headingRe(version).test(raw);
}

/**
 * Insert a "## <version>" placeholder above the existing entries when the
 * version has no entry yet. Pure — returns `{ raw, inserted }`.
 */
export function insertChangelogPlaceholder(raw, version) {
  if (changelogHasVersion(raw, version)) return { raw, inserted: false };
  const nl = raw.indexOf('\n');
  const insertAt = nl === -1 ? raw.length : nl + 1;
  return {
    raw:
      raw.slice(0, insertAt) +
      `\n## ${version}\n\n_Template: summarize this release._\n` +
      raw.slice(insertAt),
    inserted: true,
  };
}

/**
 * After a naive version bump renamed the old "## <oldV> — …" heading to
 * "## <newV> — …", restore the LAST new-version heading's prefix back to
 * oldV, keeping its title intact. Pure — returns the (possibly unchanged)
 * changelog text.
 */
export function restoreRenamedChangelogHeading(raw, oldV, newV) {
  const lines = raw.split('\n');
  const re = headingRe(newV);
  const matches = lines.map((line, i) => (re.test(line) ? i : -1)).filter((i) => i !== -1);
  if (matches.length <= 1) return raw;
  const target = matches[matches.length - 1];
  lines[target] = lines[target].replace(`## ${newV}`, `## ${oldV}`);
  return lines.join('\n');
}
