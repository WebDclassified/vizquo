/**
 * Version bump helper — replaces OLD in every release file that references
 * it. Usage: node scripts/bump-version.mjs 0.10.3 0.10.4
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [oldV, newV] = process.argv.slice(2);
if (!oldV || !newV) {
  console.error('usage: node scripts/bump-version.mjs <old> <new>');
  process.exit(1);
}

const FILES = [
  'package.json',
  'package-lock.json',
  'shared/constants.ts',
  'landing/index.html',
  'deploy-kit/edge-submission.md',
  'deploy-kit/publish-checklist.md',
  'deploy-kit/store-listing.md',
  'deploy-kit/safari-port.md',
  'README.md',
  'tomorrow.md',
  'CHANGELOG.md',
];

let changed = 0;
for (const f of FILES) {
  if (!existsSync(f)) continue;
  const before = readFileSync(f, 'utf8');
  const after = before.split(oldV).join(newV);
  if (after !== before) {
    writeFileSync(f, after);
    changed += 1;
    console.log(`updated ${f}`);
  }
}
console.log(`done — ${changed} files updated ${oldV} -> ${newV}`);
