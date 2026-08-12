import UnoCSS from 'unocss/vite';
import { defineConfig } from 'wxt';

// See PERMISSIONS.md for a one-line justification of every permission below.
export default defineConfig({
  modules: ['@wxt-dev/module-solid'],
  vite: () => ({
    plugins: [UnoCSS()],
  }),
  alias: {
    '@shared': 'shared',
    '@storage': 'storage',
    '@ui': 'ui',
  },
  manifest: {
    name: 'Vizquo',
    short_name: 'Vizquo',
    description: 'Inspect anything. Understand everything. Build faster.',
    // Creator credit — surfaced in chrome://extensions and store listings.
    // WXT's manifest author type is the `{ email }` object shape; Chrome
    // serializes the string form, so cast only for the type checker.
    author: 'Prabhat Teotia' as unknown as { email: string },
    // The minimum working set — the content script is declared statically
    // below (no runtime injection API needed) and screenshot compositing runs
    // on the panel's own canvas, so scripting/offscreen stay out. activeTab is
    // the most conservative permission there is: granted only when the user
    // invokes the extension (toolbar click / context menu / shortcut), and it
    // lets the screenshot studio capture the current tab without a prior site
    // grant. (WXT auto-adds scripting+tabs to the dev manifest for content-
    // script HMR — production never carries them.)
    permissions: ['storage', 'sidePanel', 'downloads', 'contextMenus', 'activeTab'],
    // <all_urls> is the per-site access the user grants on demand (never at
    // install); openrouter.ai is requested when the user enables cloud AI, and
    // localhost when they choose the fully-local Ollama provider (Phase 9).
    optional_host_permissions: ['<all_urls>', 'https://openrouter.ai/*', 'http://localhost/*'],
    // The analysis worker runs inside the content script (isolated world). Its
    // script URL is built with browser.runtime.getURL(), and MV3 requires
    // extension resources fetched/loaded from content scripts to be declared
    // web-accessible for the sites the content script runs on.
    web_accessible_resources: [
      {
        resources: ['assets/analysis-worker-*.js'],
        matches: ['http://*/*', 'https://*/*'],
      },
    ],
    action: {
      default_title: 'Open Vizquo side panel',
    },
    // Type `viz` in the address bar to run Vizquo commands from anywhere
    // (Phase 8). Chrome-only API — Firefox ignores the key.
    omnibox: {
      keyword: 'viz',
    },
    // Firefox/AMO: MV3 requires a stable extension ID, and new extensions need
    // a data-collection declaration — Vizquo collects none and says so.
    // Chrome ignores this key entirely.
    browser_specific_settings: {
      gecko: {
        id: 'vizquo@vizquo.app',
        data_collection_permissions: { required: ['none'] },
      },
    },
    commands: {
      'open-sidepanel': {
        description: 'Open the Vizquo side panel',
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
      },
      // Ctrl+Shift+I is reserved by Chrome for DevTools, so inspect mode uses Ctrl+Shift+E.
      'toggle-inspect-mode': {
        description: 'Toggle inspect mode on the current page',
        suggested_key: { default: 'Ctrl+Shift+E', mac: 'Command+Shift+E' },
      },
      'toggle-mode': {
        description: 'Toggle Designer / Engineer mode',
        suggested_key: { default: 'Ctrl+Shift+D', mac: 'Command+Shift+D' },
      },
      'screenshot-viewport': {
        description: 'Capture a screenshot of the current viewport',
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
      },
    },
  },
});
