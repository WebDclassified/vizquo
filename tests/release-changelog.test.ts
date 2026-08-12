/**
 * Unit tests for the release pipeline's changelog helpers
 * (scripts/changelog-helper.mjs). These cover the exact failure mode the
 * 0.10.7 release nearly hit: changelog headings carry titles
 * ("## 0.10.6 — Probes in CI, …"), so the version must be matched as a
 * prefix, and the post-bump restore must bring the renamed old heading back
 * without touching the fresh entry.
 */
import { describe, expect, it } from 'vitest';
import {
  changelogHasVersion,
  insertChangelogPlaceholder,
  restoreRenamedChangelogHeading,
} from '../scripts/changelog-helper.mjs';

const SAMPLE = `# Changelog

## 0.10.6 — Probes in CI, real-site QA, handoff UX

- Bullet one.

## 0.10.5 — Context-menu handoff fix

- Bullet two.
`;

describe('changelogHasVersion', () => {
  it('matches titled and bare headings', () => {
    expect(changelogHasVersion(SAMPLE, '0.10.6')).toBe(true);
    expect(changelogHasVersion(SAMPLE, '0.10.5')).toBe(true);
    expect(changelogHasVersion('# Changelog\n\n## 0.10.7\n\nbody', '0.10.7')).toBe(true);
  });

  it('does not match longer versions sharing the prefix', () => {
    expect(changelogHasVersion('# Changelog\n\n## 0.10.60 — X\n', '0.10.6')).toBe(false);
    expect(changelogHasVersion('# Changelog\n\n## 0.10.7-beta\n', '0.10.7')).toBe(false);
  });

  it('reports missing versions honestly', () => {
    expect(changelogHasVersion(SAMPLE, '0.10.7')).toBe(false);
  });
});

describe('insertChangelogPlaceholder', () => {
  it('inserts a placeholder above the existing entries when missing', () => {
    const { raw, inserted } = insertChangelogPlaceholder(SAMPLE, '0.10.7');
    expect(inserted).toBe(true);
    expect(
      raw.startsWith(
        '# Changelog\n\n## 0.10.7\n\n_Template: summarize this release._\n\n## 0.10.6',
      ),
    ).toBe(true);
  });

  it('is a no-op when the entry already exists', () => {
    const { raw, inserted } = insertChangelogPlaceholder(SAMPLE, '0.10.6');
    expect(inserted).toBe(false);
    expect(raw).toBe(SAMPLE);
  });
});

describe('restoreRenamedChangelogHeading', () => {
  // Simulates bump-version renaming the old "## 0.10.6 — …" heading to
  // "## 0.10.7 — …" while a fresh 0.10.7 entry already sits on top.
  const AFTER_BUMP = `# Changelog

## 0.10.7 — Release automation

- Fresh entry body.

## 0.10.7 — Probes in CI, real-site QA, handoff UX

- Old entry body.

## 0.10.5 — Context-menu handoff fix
`;

  it('restores the renamed old heading, keeping its title', () => {
    const restored = restoreRenamedChangelogHeading(AFTER_BUMP, '0.10.6', '0.10.7');
    expect(restored).toContain('## 0.10.7 — Release automation');
    expect(restored).toContain('## 0.10.6 — Probes in CI, real-site QA, handoff UX');
    expect(restored).not.toContain('## 0.10.7 — Probes');
    // Old entry body stays intact under the restored heading.
    expect(restored).toContain('- Old entry body.');
  });

  it('leaves the changelog untouched when only one heading matches', () => {
    const single = '# Changelog\n\n## 0.10.7 — Release automation\n\nbody\n';
    expect(restoreRenamedChangelogHeading(single, '0.10.6', '0.10.7')).toBe(single);
  });

  it('handles bare (untitled) headings', () => {
    const afterBump = '# Changelog\n\n## 0.10.7\n\n## 0.10.7\n\nold body\n';
    expect(restoreRenamedChangelogHeading(afterBump, '0.10.6', '0.10.7')).toBe(
      '# Changelog\n\n## 0.10.7\n\n## 0.10.6\n\nold body\n',
    );
  });
});
