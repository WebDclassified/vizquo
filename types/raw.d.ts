/** Vite ?raw imports (e.g. `import changelog from '../CHANGELOG.md?raw'`). */
declare module '*?raw' {
  const content: string;
  export default content;
}

/**
 * Vite ?worker&url imports — the emitted URL string of the analysis worker
 * asset. The module form matches the `?worker&url` suffix Vite resolves
 * (import.meta.url inside a content script is the *page's* origin, so the
 * orchestrator builds the extension URL with browser.runtime.getURL() instead
 * and fetches it through web_accessible_resources — see orchestrator.ts).
 */
declare module '*?worker&url' {
  const url: string;
  export default url;
}

/**
 * The subset of vite/client this project uses. WXT generates its own
 * tsconfig without vite/client (that's why `?raw` needed the declaration
 * above), but `import.meta.env.DEV` is statically replaced by Vite — it
 * gates the bundled AI key to dev builds (see ai/config.ts).
 */
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
