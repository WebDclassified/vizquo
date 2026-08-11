import { describe, expect, it } from 'vitest';
import { latestChangelogVersion, parseChangelog } from '../shared/changelog';

const SAMPLE = `# Changelog

## 0.8.0 — Phase 8: Library

- **Library panel**: collections, history, notes, compare, and reports.
- **Split inspector**: drag the DOM-tree divider; the position persists.

## 0.6.1 — AI defaults & answer quality

- **Model default is now \`openrouter/free\`**.

## 0.1.0 — Phase 1: Foundation

- Typed messaging bus.
- Storage layer with the L3 persistent cache.
`;

describe("parseChangelog (Phase 8, What's new)", () => {
  it('parses version, title, and bullets per section in file order', () => {
    const entries = parseChangelog(SAMPLE);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      version: '0.8.0',
      title: 'Phase 8: Library',
      bullets: [
        '**Library panel**: collections, history, notes, compare, and reports.',
        '**Split inspector**: drag the DOM-tree divider; the position persists.',
      ],
    });
    expect(entries[1]?.version).toBe('0.6.1');
    expect(entries[1]?.bullets[0]).toBe('**Model default is now `openrouter/free`**.');
    expect(entries[2]?.version).toBe('0.1.0');
  });

  it('reports the newest version from the first section', () => {
    expect(latestChangelogVersion(parseChangelog(SAMPLE))).toBe('0.8.0');
  });

  it('handles a heading without the em-dash title separator', () => {
    const entries = parseChangelog('## 1.0.0\n\n- Ship it.\n');
    expect(entries[0]).toEqual({ version: '1.0.0', title: '', bullets: ['Ship it.'] });
  });

  it('handles an empty changelog', () => {
    expect(parseChangelog('')).toEqual([]);
    expect(latestChangelogVersion([])).toBeNull();
  });

  it('skips headings without a version (non-## lines, trailing noise)', () => {
    const entries = parseChangelog('# Changelog\n\nnoise\n\n## 0.2.0 — x\n\n- a\n');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.version).toBe('0.2.0');
  });
});
