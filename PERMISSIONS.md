# Permissions

> Created by Prabhat Teotia


Every manifest permission, with a one-line justification. Vizquo is a
full-access inspection instrument: it carries `<all_urls>` host access so
content scripts inject on every web page at load time — no per-site grants,
no reloads, no prompts.

| Permission | Why |
|---|---|
| `storage` | Persist settings, collections, history, notes, and the L3 cache (via the repository). |
| `sidePanel` | Open the side panel — Vizquo's primary surface. |
| `downloads` | Bulk asset export (ZIP) and screenshot downloads. |
| `contextMenus` | The "Inspect with Vizquo" right-click item (Section 7.26), which pre-selects the element under the cursor in the panel. |
| `activeTab` | Lets the toolbar-invoked screenshot capture and the context-menu hand-off work instantly, complementing the always-on content script. |
| `host_permissions: <all_urls>` | **Required, granted at install.** The content script is declared statically and must run on every http/https page — inspection, scan, asset extraction, and Time Machine all depend on it. This is what the browser describes as "Read and change all your data on all websites." |

The API permissions (`storage`, `sidePanel`, `downloads`, `contextMenus`,
`activeTab`) are the minimum working set; screenshot compositing happens on
the side panel's own canvas, so no `offscreen` API is needed, and
content-script hot-reload in development uses WXT's own dev-mode `scripting`
grant — the shipped build never carries `scripting` or `offscreen`. Unused
permissions are flagged by store review and erode trust, so the manifest
carries only what runs.

The AI-provider origins (`https://openrouter.ai/*` and `http://localhost/*`)
are listed as optional host permissions and are **subsumed** by the required
`<all_urls>` grant — the Settings/AI toggles report them as granted with no
extra prompt. They remain listed so the intent is explicit and the toggle UI
stays honest.

Data flows are local-first regardless of the permission surface: nothing is
sent anywhere by default; page content only reaches a cloud AI provider when
the user opts in with their own key.

Browser-level commands (Ctrl/Shift/Y · E · D · S) are declared in the
manifest and are remappable by the user at `chrome://extensions/shortcuts`.
