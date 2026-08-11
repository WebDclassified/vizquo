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
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
