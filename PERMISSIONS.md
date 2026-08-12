# Permissions

> Created by Prabhat Teotia


Every manifest permission, with a one-line justification. Vizquo requests the
minimum it needs at install and site access only on demand — never a blanket
grant.

| Permission | Why |
|---|---|
| `storage` | Persist settings, collections, history, notes, and the L3 cache (via the repository). |
| `sidePanel` | Open the side panel — Vizquo's primary surface. |
| `downloads` | Bulk asset export (ZIP) and screenshot downloads. |
| `contextMenus` | The "Inspect with Vizquo" right-click item (Section 7.26), which pre-selects the element under the cursor in the panel. |
| `activeTab` | The most conservative permission in Chrome: granted only while the user is actively invoking the extension (toolbar click, context menu, or shortcut). Lets the screenshot studio capture the current tab and the context-menu hand-off work without a prior site grant. |

Five base permissions at install — deliberately minimal. `activeTab` is not a
blanket grant (it expires with the user's interaction), and the content
script is declared statically in the manifest (it runs on `http(s)` pages
after the user grants per-site access). Screenshot compositing happens on the
side panel's own canvas, so no `offscreen` API is needed, and content-script
hot-reload in development uses WXT's own dev-mode `scripting` grant — the
shipped build never carries `scripting` or `offscreen`. Unused permissions
are flagged by store review and erode trust, so the manifest carries only
what runs.

Optional host permissions — `<all_urls>` (per-site inspection), `http://localhost/*`
(Ollama, Phase 9) and `https://openrouter.ai/*` (cloud AI, Phase 7) — are
requested on demand through `chrome.permissions.request`, never at install.
Per-site access is granted when the user clicks "Grant access to this tab"
(a reload applies it); OpenRouter/Ollama access is requested only when the
user enables that provider. Nothing is granted at install time beyond the
base set above. Context-menu clicks grant temporary host access to the
clicked tab for the selection hand-off only.

Browser-level commands (Ctrl/Shift/Y · E · D · S) are declared in the
manifest and are remappable by the user at `chrome://extensions/shortcuts`.
