import { defineConfig } from '@playwright/test';

/**
 * E2E smoke tests (Phase 1 DoD runtime verification). Loads the BUILT
 * extension (.output/chrome-mv3) into a persistent Chromium context and drives
 * the side panel like a user would.
 *
 * Run `npm run build` first, then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  // First extension load on a busy CI runner is slow — 20s keeps the
  // panel-render assertions from flaking while still failing fast on real
  // regressions.
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
