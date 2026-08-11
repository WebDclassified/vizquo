/**
 * CHANGELOG parser (Phase 8) — powers the "What's new" dialog.
 *
 * Pure and Node-safe: takes the raw markdown (bundled via `?raw` in the UI,
 * plain text in tests) and returns ordered release entries. The file is the
 * single source of truth; the dialog renders whatever `## <version> — <title>`
 * sections exist, so shipping a release is just editing CHANGELOG.md.
 */
export interface ChangelogEntry {
  /** Version line, e.g. `0.8.0`. */
  version: string;
  /** Text after the first ` — ` separator, e.g. `Phase 8: Library`. */
  title: string;
  /** Bullet points (leading `-`/`*` stripped, blank lines dropped). */
  bullets: string[];
}

/** Parse `## <version> — <title>` sections in file order (top = newest). */
export function parseChangelog(raw: string): ChangelogEntry[] {
  const sections = raw.split(/^## /m).slice(1);
  const entries: ChangelogEntry[] = [];
  for (const section of sections) {
    const lines = section.split('\n');
    const heading = (lines[0] ?? '').trim();
    if (!heading) continue;
    const separator = heading.indexOf(' — ');
    const version = separator === -1 ? heading : heading.slice(0, separator).trim();
    const title = separator === -1 ? '' : heading.slice(separator + 3).trim();
    const bullets = lines
      .slice(1)
      .map((line) => line.replace(/^[-*]\s+/, '').trim())
      .filter((line) => line.length > 0);
    entries.push({ version, title, bullets });
  }
  return entries;
}

/** The newest version (the first `## ` section), or null for an empty log. */
export function latestChangelogVersion(entries: ChangelogEntry[]): string | null {
  return entries[0]?.version ?? null;
}
