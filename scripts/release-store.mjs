#!/usr/bin/env node
/**
 * Store release automation — one command from a clean checkout to
 * upload-ready store packages.
 *
 *   node scripts/release-store.mjs <old> <new> [flags]
 *   npm run release -- 0.10.6 0.10.7
 *
 * Pipeline:
 *   1. Preflight — old version matches shared/constants.ts, clean git tree
 *      (unless --force), CHANGELOG entry ensured
 *   2. Version bump across every release file (scripts/bump-version.mjs),
 *      with the renamed old CHANGELOG heading restored
 *   3. Validation — compile, lint, unit tests (skip with --skip-validate)
 *   4. Build Chrome + Firefox (MV3) and produce the three store ZIPs
 *   5. Keyless scan — zero bundled API secrets in the built output
 *   6. (--screenshots) regenerate the promo tile + store screenshots
 *   7. Assemble .output/release/vizquo-<new>/ with ZIPs + listing kit
 *   8. Print the upload checklist
 *
 * Flags:
 *   --dry-run        print the full plan + environment checks, change nothing
 *   --screenshots    also regenerate deploy-kit/promo + screenshots
 *   --skip-validate  skip compile/lint/unit (fast iteration)
 *   --force          allow a dirty git tree
 */
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const FLAGS = new Set(['--dry-run', '--screenshots', '--skip-validate', '--force', '--help']);
const positionals = args.filter((a) => !FLAGS.has(a));
const [oldV, newV] = positionals;
const dryRun = args.includes('--dry-run');
const withScreenshots = args.includes('--screenshots');
const skipValidate = args.includes('--skip-validate');
const force = args.includes('--force');

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function step(label) {
  console.log(`\n▶ ${label}`);
}

function ok(label) {
  console.log(`  ✔ ${label}`);
}

function warn(label) {
  console.log(`  ⚠ ${label}`);
}

function run(cmd) {
  console.log(`  $ ${cmd}`);
  if (dryRun) return '';
  try {
    return execSync(cmd, { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' });
  } catch (err) {
    fail(
      `command failed: ${cmd}\n${String(err.message ?? err)
        .split('\n')
        .slice(0, 4)
        .join('\n')}`,
    );
  }
}

function capture(cmd) {
  if (dryRun) return '';
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------------ */
/* Help / usage                                                             */
/* ------------------------------------------------------------------------ */

if (args.includes('--help') || args.length === 0) {
  console.log(`Store release automation for Vizquo.

Usage:
  npm run release -- <old> <new> [flags]

Example:
  npm run release -- 0.10.6 0.10.7
  npm run release -- 0.10.6 0.10.7 --screenshots

Flags:
  --dry-run        print the full plan + environment checks, change nothing
  --screenshots    also regenerate deploy-kit/promo + screenshots
  --skip-validate  skip compile/lint/unit tests (fast iteration)
  --force          allow a dirty git tree
`);
  process.exit(args.length === 0 ? 1 : 0);
}

if (!oldV || !newV) fail('usage: node scripts/release-store.mjs <old> <new> [flags]');
if (oldV === newV) fail(`old and new versions are identical ('${oldV}') — nothing to release`);

/* ------------------------------------------------------------------------ */
/* 1. Preflight                                                             */
/* ------------------------------------------------------------------------ */

step('Preflight');

// Old version must match the shipped constant.
const constants = readFileSync(join(ROOT, 'shared/constants.ts'), 'utf8');
const versionMatch = constants.match(/APP_VERSION\s*=\s*'([^']+)'/);
if (!versionMatch || versionMatch[1] !== oldV) {
  fail(`shared/constants.ts declares version '${versionMatch?.[1] ?? '?'}' — expected '${oldV}'`);
}
ok(`shared/constants.ts is at ${oldV}`);

// Clean tree — a release should be a deliberate, reviewable commit.
if (!dryRun) {
  const dirty = capture('git status --porcelain');
  if (dirty && !force) {
    fail('working tree is dirty — commit or stash first (or pass --force)');
  }
  ok('working tree clean');
}

// Environment checks (real runs will fail loudly anyway; dry-run previews).
const checks = [
  ['npm', 'npm --version'],
  ['build tooling (node_modules/.bin/wxt)', 'test -f node_modules/.bin/wxt && echo yes || echo no'],
  ['chrome build (.output/chrome-mv3)', 'test -d .output/chrome-mv3 && echo yes || echo no'],
];
for (const [label, cmd] of checks) {
  if (dryRun) {
    console.log(`  ⚙ ${label} — will be verified during the real run`);
    continue;
  }
  const result = capture(cmd);
  if (result.trim() !== 'yes')
    warn(`${label} not found — will be produced/installed during the run`);
  else ok(`${label} available`);
}

if (dryRun) {
  console.log('\n── DRY RUN — plan only, nothing changed ──');
  console.log(`
  1. Ensure a "## ${newV}" CHANGELOG entry exists
  2. node scripts/bump-version.mjs ${oldV} ${newV}  (11 release files)
  3. Restore the renamed "## ${oldV}" CHANGELOG heading
  4. ${skipValidate ? '(skipped)' : 'npm run compile && npm run lint && npm run test'}
  5. npm run build && npm run build:firefox:mv3
  6. npm run zip && npx wxt zip --browser firefox --mv3 && npx wxt zip --sources
  7. Keyless scan of .output/chrome-mv3 + .output/firefox-mv3
  8. ${withScreenshots ? 'Regenerate promo + screenshots' : '(screenshots not regenerated — pass --screenshots)'}
  9. Assemble .output/release/vizquo-${newV}/ + RELEASE.md
`);
  process.exit(0);
}

/* ------------------------------------------------------------------------ */
/* 2. Changelog + version bump                                              */
/* ------------------------------------------------------------------------ */

step('Version bump');

const changelogPath = join(ROOT, 'CHANGELOG.md');
// Headings may carry a title ("## 0.10.7 — Release notes"), so match the
// version prefix followed by a space or end-of-line. Non-global for the
// boolean check (a global regex would carry state across .test() calls).
const newHeadingRe = new RegExp(`^## ${escapeRe(newV)}(\\s|$)`, 'm');

// Ensure a fresh top entry exists BEFORE the bump, so the bump's rename of
// the old heading can be told apart from it afterwards.
let changelog = readFileSync(changelogPath, 'utf8');
if (!newHeadingRe.test(changelog)) {
  const nl = changelog.indexOf('\n');
  const insertAt = nl === -1 ? changelog.length : nl + 1;
  changelog =
    changelog.slice(0, insertAt) +
    `\n## ${newV}\n\n_Template: summarize this release._\n` +
    changelog.slice(insertAt);
  writeFileSync(changelogPath, changelog);
  warn(`added placeholder "## ${newV}" to CHANGELOG.md — fill it in before publishing`);
}
ok(`CHANGELOG entry "## ${newV}" present`);

run(`node scripts/bump-version.mjs ${oldV} ${newV}`);

// The bump renames the old "## ${oldV} — …" heading (title included) to
// "## ${newV} — …". Restore the LAST new-version heading's prefix back to
// the old version, keeping its title intact.
changelog = readFileSync(changelogPath, 'utf8');
const lines = changelog.split('\n');
const renamedIdx = lines
  .map((line, i) => (newHeadingRe.test(line) ? i : -1))
  .filter((i) => i !== -1);
if (renamedIdx.length > 1) {
  const target = renamedIdx[renamedIdx.length - 1];
  lines[target] = lines[target].replace(`## ${newV}`, `## ${oldV}`);
  changelog = lines.join('\n');
  writeFileSync(changelogPath, changelog);
  ok(`restored the renamed "## ${oldV}" CHANGELOG heading`);
}

// The naive bump replaces EVERY <old> occurrence, including entry-body text
// (historical entries, the fresh template) — surface the diff for review.
warn('review the CHANGELOG diff — the bump rewrites body-text version references too');
run('git diff --stat CHANGELOG.md');

/* ------------------------------------------------------------------------ */
/* 3. Validation                                                            */
/* ------------------------------------------------------------------------ */

if (!skipValidate) {
  step('Validation');
  run('npm run compile');
  run('npm run lint');
  run('npm run test');
  ok('compile, lint, and unit tests pass');
}

/* ------------------------------------------------------------------------ */
/* 4. Build + ZIP                                                           */
/* ------------------------------------------------------------------------ */

step('Build Chrome + Firefox (MV3)');
run('npm run build');
run('npm run build:firefox:mv3');

step('Verifying built manifests');
for (const [label, dir] of [
  ['chrome', '.output/chrome-mv3'],
  ['firefox', '.output/firefox-mv3'],
]) {
  const manifest = JSON.parse(readFileSync(join(ROOT, dir, 'manifest.json'), 'utf8'));
  if (manifest.version !== newV) {
    fail(
      `${label} build reports version '${manifest.version}' — expected '${newV}' (stale build?)`,
    );
  }
  ok(`${label} manifest at ${newV}`);
}

step('ZIP store packages');
run('npm run zip');
run('npx wxt zip --browser firefox --mv3');
run('npx wxt zip --sources');

/* ------------------------------------------------------------------------ */
/* 5. Keyless scan                                                          */
/* ------------------------------------------------------------------------ */

step('Keyless scan');
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function scanSecrets(dir) {
  let hits = 0;
  let skipped = 0;
  for (const file of walk(dir)) {
    if (statSync(file).size > 5 * 1024 * 1024) {
      skipped += 1;
      continue; // skip large bundles
    }
    const text = readFileSync(file, 'utf8');
    hits += (text.match(/sk-or-[A-Za-z0-9]{8,}/g) ?? []).length;
  }
  return { hits, skipped };
}

const chromeScan = scanSecrets(join(ROOT, '.output', 'chrome-mv3'));
const firefoxScan = scanSecrets(join(ROOT, '.output', 'firefox-mv3'));
const secretHits = chromeScan.hits + firefoxScan.hits;
if (secretHits > 0) fail(`keyless check failed — ${secretHits} bundled API key(s) in the build`);
ok('no bundled API keys in the built output');
warn(`${chromeScan.skipped + firefoxScan.skipped} files > 5MB skipped by the scan`);

/* ------------------------------------------------------------------------ */
/* 6. Screenshots (optional)                                                */
/* ------------------------------------------------------------------------ */

if (withScreenshots) {
  step('Regenerating store assets');
  run('node scripts/generate-promo-tile.mjs');
  // The screenshot capture drives a headed browser — wrap in xvfb on Linux
  // when no display is present.
  const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY;
  run(`${needsXvfb ? 'xvfb-run -a ' : ''}node scripts/capture-screenshots.mjs`);
  ok('promo tile + screenshots regenerated');
}

/* ------------------------------------------------------------------------ */
/* 7. Assemble the release package                                          */
/* ------------------------------------------------------------------------ */

step('Assembling release package');
const releaseDir = join(ROOT, '.output', 'release', `vizquo-${newV}`);
mkdirSync(releaseDir, { recursive: true });

for (const zip of [
  `vizquo-${newV}-chrome.zip`,
  `vizquo-${newV}-firefox.zip`,
  `vizquo-${newV}-sources.zip`,
]) {
  const src = join(ROOT, '.output', zip);
  if (!existsSync(src)) fail(`missing ${zip} — the zip step did not produce it`);
  copyFileSync(src, join(releaseDir, zip));
  ok(`copied ${zip}`);
}

for (const file of ['store-listing.md', 'publish-checklist.md', 'privacy-policy.md']) {
  const src = join(ROOT, 'deploy-kit', file);
  if (existsSync(src)) copyFileSync(src, join(releaseDir, file));
}
const promoDir = join(ROOT, 'deploy-kit', 'promo');
if (existsSync(promoDir)) cpSync(promoDir, join(releaseDir, 'promo'), { recursive: true });
const shotsDir = join(ROOT, 'deploy-kit', 'screenshots');
if (existsSync(shotsDir)) cpSync(shotsDir, join(releaseDir, 'screenshots'), { recursive: true });

const commit = capture('git rev-parse --short HEAD');
const date = new Date().toISOString();
const summary = `# Vizquo ${newV} — Store release package

Generated: ${date}
Source commit: ${commit}

## Artifacts
- \`${newV}-chrome.zip\` — Chrome Web Store + Edge Add-ons
- \`${newV}-firefox.zip\` — Firefox Add-ons (AMO)
- \`${newV}-sources.zip\` — Firefox AMO source-code requirement

## Validation
- compile / lint / unit tests: ${skipValidate ? 'skipped (--skip-validate)' : 'passed'}
- keyless scan: 0 bundled API keys
- screenshots regenerated: ${withScreenshots ? 'yes' : 'no'}

## Upload (manual, web consoles)
- Edge (free): https://partner.microsoft.com/dashboard/microsoftedge
- Firefox AMO (free): https://addons.mozilla.org/developers/
- Chrome Web Store ($5, one-time): https://chrome.google.com/webstore/devconsole
  → keep the PEM upload key in a password manager — never in the repo.

## Post-upload smoke pass (optional but recommended)
- xvfb-run -a node scripts/probe-extension.mjs
- xvfb-run -a node scripts/probe-extension-advanced.mjs
- node scripts/probe-real-sites.mjs
`;
writeFileSync(join(releaseDir, 'RELEASE.md'), summary);
ok(`release package ready at .output/release/vizquo-${newV}/`);

/* ------------------------------------------------------------------------ */
/* 8. Final checklist                                                       */
/* ------------------------------------------------------------------------ */

console.log(`
━━━ Release ${newV} ready ━━━

Package:  .output/release/vizquo-${newV}/
  ${newV}-chrome.zip      → Chrome Web Store + Edge Add-ons
  ${newV}-firefox.zip     → Firefox AMO
  ${newV}-sources.zip     → Firefox AMO (source requirement)
  store-listing.md / publish-checklist.md / privacy-policy.md / assets

Remaining manual steps (web consoles only):
  1. Fill in the real notes under "## ${newV}" in CHANGELOG.md if a
     placeholder was added.
  2. Edge:    https://partner.microsoft.com/dashboard/microsoftedge
  3. Firefox: https://addons.mozilla.org/developers/
  4. Chrome:  https://chrome.google.com/webstore/devconsole (keep the PEM key safe)

Commit the version bump + CHANGELOG, then tag: git tag v${newV} && git push --tags
`);
