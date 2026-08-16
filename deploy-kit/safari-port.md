# Vizquo for Safari — port guide

> Created by Prabhat Teotia


Safari support is real work and **cannot be done on Windows** — it needs a Mac
with Xcode. This guide is the honest, complete path.

## The honest summary

| Factor | Reality |
|---|---|
| Feasible? | ✅ Yes — most engine code is portable (WXT / `browser.*`) |
| Machine needed | **macOS** with **Xcode** (free from the App Store) |
| Build tool | Apple's `safari-web-extension-converter` (bundled with Xcode) |
| Distribution | **Mac App Store** or Developer ID — requires the **Apple Developer Program: $99/year** |
| Biggest change | `chrome.sidePanel` **doesn't exist on Safari** — the panel UI must become a **popover / toolbar window** |
| Chrome-only APIs used | `chrome.omnibox`, `chrome.sidePanel`, `chrome.commands` (partial) — need Safari equivalents or graceful degradation |

## Step 1 — Convert the Chrome extension (on a Mac)

1. Install **Xcode** from the Mac App Store (free).
2. Copy the built Chrome extension into a folder (unzip
   `vizquo-1.0.0-chrome.zip`).
3. Convert it:
   ```sh
   xcrun safari-web-extension-converter /path/to/vizquo-1.0.0-chrome
   ```
   This generates an Xcode project with a native app wrapper + the extension
   target, and wires up the correct entitlements/bundle IDs.

## Step 2 — Adapt the code for Safari's APIs

- **Side panel → popover.** Safari has no side panel. The main panel UI
  (`sidepanel.html` + `ui/screens/sidepanel/`) must render in a popover or a
  `windows.create`-style standalone window. The cleanest path: reuse the
  existing **detachable window** entrypoint (`entrypoints/window/`) as the
  primary Safari surface.
- **`browser.runtime.getURL` + the analysis worker.** The Blob-URL worker fix
  uses `web_accessible_resources` — Safari supports WAR, but the fetch of
  `chrome-extension://` from the content script should be re-verified on
  Safari (use `browser.runtime.getURL`).
- **Omnibox / commands.** `chrome.omnibox` has no Safari equivalent — hide or
  degrade. Keyboard `commands` exist on Safari via the menu/extension settings.
- **`storage`, messaging, IndexedDB, downloads** — all work on Safari (MV3).
- Test every content-script flow in Safari's developer mode first.

## Step 3 — Sign & distribute

- **Mac App Store** (recommended for "everyone can use it"):
  - Apple Developer Program **$99/year** (no free tier).
  - The converter's Xcode project is already App Store–shaped (app + extension
    targets, App Groups entitlements).
  - Submit via **Xcode → Organizer → Distribute → App Store Connect**.
- **Developer ID + web download:** sign the app for direct distribution
  (notarize it) and link it from the landing page — users still must bypass
  Gatekeeper manually, so App Store is the better UX.
- **Safari extension gallery:** after shipping in the App Store, the extension
  also appears in Safari's extension gallery on the same Mac.

## Cost & time

- **Money:** $0 to build; **$99/year** to publish (Apple Developer Program).
- **Time:** 1–2 days for the conversion + popover adaptation + testing on a
  Mac, if the panel-as-window path is used.

## Landing page plan (already wired)

The landing page shows Safari as **"Coming soon — vote"** (links to a GitHub
issue) instead of "not supported", so interest is captured before the port
exists. When the port ships, the card flips to a real download link.
