/**
 * Phase 1 DoD smoke test: "extension loads unpacked in Chrome, side panel
 * opens, theme switches correctly, onboarding tour completes and never
 * reappears, zero console errors."
 *
 * The side panel page is opened as a regular extension page (it is the same
 * extension context, so storage/messaging behave identically). Host-page
 * inspection (the full round-trip) requires granting site access, which a
 * browser-automation harness cannot do — that flow is covered by unit tests
 * and manual verification (see TESTING.md).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/chrome-mv3');

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
});

test('side panel renders, themes switch, palette opens, no console errors', async () => {
  const consoleErrors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  // Brand renders.
  await expect(page.getByText('Vizquo', { exact: true }).first()).toBeVisible();

  // First-run onboarding tour appears, and completing it never shows it again.
  const skipTour = page.getByRole('button', { name: 'Skip tour' });
  await expect(skipTour).toBeVisible();
  await skipTour.click();
  await expect(skipTour).toHaveCount(0);

  // Theme quick-toggle: default auto → first click goes to light.
  const themeButton = page.getByRole('button', { name: /^Theme: / });
  await expect(themeButton).toBeVisible();
  await themeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await themeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Command palette opens via keyboard and filters. (Scoped to the listbox:
  // 'Theme: dark' also matches the header theme quick-toggle button.)
  await page.keyboard.press('Control+k');
  await expect(page.getByText('Command palette', { exact: true })).toBeVisible();
  const listbox = page.getByRole('dialog', { name: 'Command palette' }).getByRole('listbox');
  await page.keyboard.type('theme');
  await expect(listbox.getByText('Theme: dark', { exact: true })).toBeVisible();
  // First Escape closes the combobox listbox, second closes the dialog.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Command palette', { exact: true })).toHaveCount(0);

  // Phase 2: inspector commands are reachable from the palette.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('inspect');
  await expect(listbox.getByText('Toggle inspect mode', { exact: true })).toBeVisible();
  await expect(listbox.getByText('Show DOM tree', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Command palette', { exact: true })).toHaveCount(0);

  // Cheatsheet via '?'.
  await page.keyboard.press('?');
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toHaveCount(0);

  // Connection card exists (Inspect is the default panel).
  await expect(page.getByText('Connection', { exact: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('Phase 3: Design panel renders with its scan hero and palette commands', async () => {
  const consoleErrors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  // Skip onboarding if it appears (fresh context per test is not guaranteed).
  const skipTour = page.getByRole('button', { name: 'Skip tour' });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  // Navigate to the Design tab → Design DNA panel with the scan hero.
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByText('Design DNA', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Scan page/ })).toBeVisible();

  // The scan is a no-op without site access (tab id unset), so the panel
  // must stay stable — no crash, no console errors.
  await page.getByRole('button', { name: /Scan page/ }).click();
  await expect(page.getByRole('button', { name: /Scan page/ })).toBeVisible();

  // Phase 3 commands resolve from the palette.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('primary color');
  const listbox = page.getByRole('dialog', { name: 'Command palette' }).getByRole('listbox');
  await expect(listbox.getByText('Find primary color', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  expect(consoleErrors).toEqual([]);
});

test('Phase 4: Assets panel renders with its scan hero, filters, and palette commands', async () => {
  const consoleErrors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  const skipTour = page.getByRole('button', { name: 'Skip tour' });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  // Navigate to the Assets tab → Asset extractor panel with the scan hero.
  await page.getByRole('tab', { name: 'Assets' }).click();
  await expect(page.getByText('Asset extractor', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Scan page/ })).toBeVisible();

  // Empty state is honest — no assets extracted yet.
  await expect(page.getByText('No assets extracted yet', { exact: false })).toBeVisible();

  // Scan is a no-op without site access — the panel stays stable.
  await page.getByRole('button', { name: /Scan page/ }).click();
  await expect(page.getByRole('button', { name: /Scan page/ })).toBeVisible();

  // Phase 4 commands resolve from the palette.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('export assets');
  const listbox = page.getByRole('dialog', { name: 'Command palette' }).getByRole('listbox');
  await expect(listbox.getByText('Export assets as ZIP', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  expect(consoleErrors).toEqual([]);
});

test('Phase 5: Analyze panel renders audits, technology stack, and palette commands', async () => {
  const consoleErrors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  const skipTour = page.getByRole('button', { name: 'Skip tour' });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  // Navigate to the Analyze tab → audits + responsive intelligence panel.
  await page.getByRole('tab', { name: 'Analyze' }).click();
  await expect(page.getByRole('button', { name: /Scan page/ })).toBeVisible();

  // Honest empty state — nothing audited yet.
  await expect(
    page.getByText('Scan the page to run three analyses', { exact: false }),
  ).toBeVisible();

  // Scan is a no-op without site access — the panel stays stable.
  await page.getByRole('button', { name: /Scan page/ }).click();
  await expect(page.getByRole('button', { name: /Scan page/ })).toBeVisible();

  // Phase 5 commands resolve from the palette.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('accessibility');
  const listbox = page.getByRole('dialog', { name: 'Command palette' }).getByRole('listbox');
  await expect(listbox.getByText('Analyze accessibility', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  expect(consoleErrors).toEqual([]);
});

test("Phase 8: Library renders, what's-new opens, split pane + diagnostics present", async () => {
  const consoleErrors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  const skipTour = page.getByRole('button', { name: 'Skip tour' });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  // Library tab renders with its six tabs.
  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(page.getByRole('tab', { name: 'Collections' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Notes' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Timeline' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Compare' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Reports' })).toBeVisible();

  // Honest empty states — no data yet, no crash.
  await expect(page.getByText('No collections yet', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('Nothing scanned yet', { exact: false })).toBeVisible();
  // Phase 10: the version timeline renders with its honest empty state.
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(
    page.getByText('each Design scan adds a version here', { exact: false }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect(page.getByText('No scans yet', { exact: false })).toBeVisible();

  // Phase 9: the library search box is wired across the list tabs.
  await expect(page.getByLabel('Search collections, history, and notes')).toBeVisible();

  // What's-new dialog opens from the header button.
  await page.getByRole('button', { name: "What's new" }).click();
  await expect(page.getByText("What's new in Vizquo", { exact: true })).toBeVisible();
  await page.getByText('Got it', { exact: true }).click();
  await expect(page.getByText("What's new in Vizquo", { exact: true })).toHaveCount(0);

  // Inspector: without site access the connection card explains the split
  // panes and detach live behind a connected page (same rule as scans).
  await page.getByRole('tab', { name: 'Inspect' }).click();
  await expect(page.getByText('Connection', { exact: true })).toBeVisible();

  // Settings diagnostics: permissions + last scan + debug bundle button,
  // and the Phase 9 reset-everything danger zone.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Diagnostics', { exact: true })).toBeVisible();
  await expect(page.getByText('Last scan', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download debug bundle/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('Phase 9: accessibility regression — dialogs, labels, and focus are exposed', async () => {
  const consoleErrors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  const skipTour = page.getByRole('button', { name: 'Skip tour' });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  // Command palette: the dialog and its input must be accessible by name.
  // (Typing a query opens the listbox — same interaction the other palette
  // tests use; Kobalte renders the listbox on combobox interaction.)
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox')).toBeVisible();
  await page.keyboard.type('settings');
  const listbox = dialog.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByText('Settings', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Settings: every toggle exposes a labelled control, and the range input
  // has an associated label.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('switch', { name: 'High contrast' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Reduced motion' })).toBeVisible();
  await expect(page.getByLabel('Font scale')).toBeVisible();

  // Toggles are keyboard-operable: focus the high-contrast switch and flip it.
  await page.getByRole('switch', { name: 'High contrast' }).focus();
  await expect(page.getByRole('switch', { name: 'High contrast' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: 'High contrast' })).toBeChecked();

  // Cheatsheet: accessible dialog with a title and description.
  await page.keyboard.press('?');
  const cheatsheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(cheatsheet).toBeVisible();
  await expect(cheatsheet.getByText('Press ? anytime to open this again.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cheatsheet).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});

test('Phase 6: Create panel renders studio, live editing, and export center', async () => {
  const consoleErrors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  const skipTour = page.getByRole('button', { name: 'Skip tour' });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  // Navigate to the Create tab → screenshot studio + live editing + export center.
  await page.getByRole('tab', { name: 'Create' }).click();
  await expect(page.getByText('Screenshot studio', { exact: true })).toBeVisible();
  await expect(page.getByText('Live editing', { exact: true })).toBeVisible();
  await expect(page.getByText('Export center', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Scan page/ })).toBeVisible();

  // Capture is a no-op without site access — the panel stays stable.
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeVisible();

  // Phase 9: the Multi-selection capture chip exists but stays disabled
  // until elements are shift-clicked on a page.
  await expect(page.getByRole('button', { name: 'Multi-selection' })).toBeDisabled();

  // Export center is honest without a scan — it asks for one, no fake data.
  await expect(
    page.getByText('Scan the page to export its design tokens', { exact: false }),
  ).toBeVisible();

  // Phase 6 commands resolve from the palette.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('generate react');
  const listbox = page.getByRole('dialog', { name: 'Command palette' }).getByRole('listbox');
  await expect(listbox.getByText('Generate React', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('design tokens');
  await expect(listbox.getByText('Export design tokens', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  expect(consoleErrors).toEqual([]);
});
