# Security

Vizquo is an inspection tool, not a security-bypass tool.

## Page content is untrusted input

- Any HTML/SVG/text extracted from an inspected page is sanitized before it
  is rendered inside Vizquo's own UI.
- Vizquo never executes page-provided JavaScript.
- Extracted data is rendered in Vizquo's isolated UI; the content script runs
  in an isolated world and never touches the host page's globals beyond what
  inspection requires.

## Boundaries we never cross

- **No CORS/CSP bypass.** When an asset or stylesheet can't be read due to
  browser security, Vizquo says so explicitly and does not attempt a bypass.
- **No same-origin policy bypass.** Cross-origin iframes are labeled as
  uninspectable with an explanation.
- **Closed Shadow DOM** is labeled as inaccessible; open Shadow DOM is
  supported (Phase 3+).
- **No permanent mutation.** Live editing (Phase 6) only ever mutates a
  cloned/cached view or uses non-persistent style injection, never the real
  page.

## API keys and the AI layer (Phase 7)

- **Bundled dev key vs. keyless production.** Dev builds bundle the author's
  own OpenRouter key in `ai/config.ts` (`AUTHOR_DEFAULT_KEY`) so AI works
  out of the box for testing. The constant is gated on `import.meta.env.DEV`
  — `wxt build` (every distributable bundle, including the Web Store ZIP)
  statically replaces it with `''`, so the published extension is **keyless
  by construction** and nobody can extract the author's key. Users paste
  their own key in Settings, which is the recommended production posture.
  The unit test pins the dev-bundled state so shipping with a key stays a
  deliberate choice.
- A user's own key always overrides the bundled default (`resolveApiKey`).
- Keys are stored through the repository (local IndexedDB, extension-scoped)
  and are read **only** by the background worker, which performs the network
  call. The key is never sent to the content script, the inspected page, or
  the side panel's renderer state beyond a `hasKey` boolean.
- Keys are never logged, never persisted into any inspection or cache entry,
  and never included in debug bundles.
- Prompts are bounded and redacted in `ai/prompts.ts`: text ≤ 200 chars,
  HTML snippets ≤ 160 chars with `value`/`name`/`data-*` attributes
  stripped, input values and data attributes excluded by construction. The
  privacy gate shows the exact `payloadSummary` before first send.

## Permissions

Minimum base permission set — `storage`, `sidePanel`, `downloads`,
`contextMenus`, `activeTab` — with no runtime injection or offscreen APIs
(`scripting` / `offscreen` are deliberately absent; the content script is
statically declared, and WXT's dev-mode `scripting` grant never ships).
`activeTab` applies only while the user is actively invoking the extension;
permanent per-site access is requested on demand via
`optional_host_permissions`, and the OpenRouter / localhost origins are
requested only when the corresponding AI provider is enabled. See
`PERMISSIONS.md`.

## Reporting

If you find a security issue, do not open a public issue — report it privately
per the project's security contacts.
