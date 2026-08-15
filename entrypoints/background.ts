/**
 * Background service worker — Phase 2.
 *
 * - Opens the side panel on toolbar click (Section 7.26).
 * - Browser-level commands: open side panel, toggle inspect mode (via the
 *   typed bus), toggle Designer/Engineer, screenshot (Phase 6).
 * - Context menu "Inspect with Vizquo": asks the content script for the
 *   element under the right-click, stores it as the pending selection, and
 *   opens the side panel pre-focused on that element.
 * - Per-tab inspect-mode badge: content reports state changes through the
 *   typed bus and the worker paints the toolbar badge.
 */

import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { resolveApiKey } from '../ai/config';
import { DEFAULT_OLLAMA_BASE_URL, OllamaProvider } from '../ai/ollama';
import { OpenRouterProvider } from '../ai/openrouter';
import { buildAssetZip, sanitizeFilename, type ZipAssetEntry } from '../export/assets-zip';
import { SETTING_KEYS, STORAGE_KEYS } from '../shared/constants';
import { onMessage, type PingResult, sendMessage } from '../shared/messages';
import {
  isContentScriptSender,
  requireExtensionPage as refuseUnlessExtensionPage,
  type SenderLike,
} from '../shared/sender-guard';
import type {
  AIExplainRequest,
  AIExplainResult,
  CaptureResult,
  ElementRef,
  ExportAssetRequest,
  ExportAssetsResult,
} from '../shared/types';
import { repository } from '../storage';

// Message sender validation (Requirements §15/§16, INV-007) — pure helpers
// in shared/sender-guard.ts, unit-tested in tests/sender-guard.test.ts.
const EXTENSION_PAGE_PREFIX = browser.runtime.getURL('');
const extensionId = browser.runtime.id;

function isContentScript(sender: SenderLike | undefined): boolean {
  return isContentScriptSender(sender, extensionId);
}

function requireExtensionPage(sender: SenderLike | undefined, what: string): string | null {
  return refuseUnlessExtensionPage(sender, extensionId, EXTENSION_PAGE_PREFIX, what);
}

const CONTEXT_MENU_ID = 'vizquo-inspect';

/** Payload bounds for privileged background handlers (§15/§30/§41). */
const MAX_AI_PAYLOAD_BYTES = 256 * 1024;
const MAX_EXPORT_REQUESTS = 500;

export default defineBackground(() => {
  if (browser.sidePanel) {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }

  // --- Context menu: "Inspect with Vizquo" (Section 7.26) -----------------
  // contextMenus.create reports duplicate-id failures through
  // runtime.lastError, not a thrown error — the service worker restarts
  // often, so re-creating the same id used to log
  // "Cannot create item with duplicate id vizquo-inspect". Clear first,
  // then create: idempotent on every restart.
  void (async () => {
    try {
      await browser.contextMenus.removeAll();
      await browser.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: 'Inspect with Vizquo',
        contexts: ['all'],
      });
    } catch {
      // Menus unavailable in this context — harmless.
    }
  })();

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      if (info.menuItemId !== CONTEXT_MENU_ID || tab?.id == null) return;
      let ref: { ref: ElementRef | null } = { ref: null };
      try {
        ref = await sendMessage('GET_CONTEXT_TARGET', undefined, tab.id);
      } catch {
        ref = { ref: null };
      }
      // Both payloads are tab-stamped so a panel connected to a different
      // tab/window never consumes another tab's selection (multi-tab
      // isolation, Section 7.27).
      await browser.storage.local.set({
        [STORAGE_KEYS.pendingSelection]: { ref: ref.ref, tabId: tab.id },
        [STORAGE_KEYS.inspectModeChanged]: { enabled: true, at: Date.now(), tabId: tab.id },
      });
      if (browser.sidePanel) {
        try {
          await browser.sidePanel.open({ tabId: tab.id });
        } catch {
          // Side panel may already be open in another window — fine.
        }
      }
    })();
  });

  // --- Toolbar badge reflects inspect mode per tab ------------------------
  onMessage('INSPECT_STATE_CHANGED', ({ data, sender }) => {
    // Content-script only: a badge update naming a tab must come from that
    // tab's own content script (INV-007/INV-010).
    if (!isContentScript(sender)) return;
    const tabId = sender.tab?.id;
    if (tabId == null) return;
    void browser.action.setBadgeText({
      tabId,
      text: data.enabled ? '●' : '',
    });
    void browser.action.setBadgeBackgroundColor({ tabId, color: '#6e7bff' });
    void browser.action.setTitle({
      tabId,
      title: data.enabled
        ? 'Vizquo — inspect mode is on. Press Ctrl+Shift+E or Esc to leave.'
        : 'Vizquo — open the side panel or press Ctrl+Shift+E to inspect.',
    });
  });

  // --- Browser-level commands ---------------------------------------------
  browser.commands.onCommand.addListener((command) => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      switch (command) {
        case 'open-sidepanel':
          if (tab?.id != null && browser.sidePanel) {
            await browser.sidePanel.open({ tabId: tab.id });
          }
          break;
        case 'toggle-inspect-mode': {
          if (tab?.id == null) break;
          let state = { enabled: false };
          try {
            state = await sendMessage('GET_INSPECT_STATE', undefined, tab.id);
          } catch {
            // Not connected — nothing to toggle.
            break;
          }
          try {
            await sendMessage('SET_INSPECT_MODE', { enabled: !state.enabled }, tab.id);
          } catch {
            // Content script disappeared mid-toggle.
          }
          break;
        }
        case 'toggle-mode':
          await browser.storage.local.set({ 'command:mode-toggle': Date.now() });
          break;
        case 'screenshot-viewport':
          if (tab?.id != null && browser.sidePanel) {
            await browser.sidePanel.open({ tabId: tab.id });
          }
          await browser.storage.local.set({ 'command:screenshot-viewport': Date.now() });
          break;
        default:
          break;
      }
    })();
  });

  // --- Phase 8: omnibox (keyword "viz") ---------------------------------
  // Type `viz <command>` in the address bar. The chosen command is written to
  // storage (same channel as browser-level commands, DECISIONS.md) and the
  // side panel routes it; the panel also reads the key on mount in case it
  // wasn't open when the command fired.
  const OMNIBOX_COMMANDS: { content: string; description: string; command: string }[] = [
    { content: 'viz scan', description: 'Scan the current page', command: 'scan' },
    { content: 'viz inspect', description: 'Open the element inspector', command: 'inspect' },
    { content: 'viz compare', description: 'Compare two scans', command: 'compare' },
    { content: 'viz report', description: 'Generate a design report', command: 'report' },
    { content: 'viz history', description: 'Open scan history', command: 'history' },
    { content: 'viz settings', description: 'Open Vizquo settings', command: 'settings' },
  ];

  if (browser.omnibox) {
    browser.omnibox.onInputChanged.addListener((input, suggest) => {
      const query = input.trim().toLowerCase();
      const matches = OMNIBOX_COMMANDS.filter((entry) =>
        entry.content.toLowerCase().includes(query),
      );
      suggest(
        matches.map((entry) => ({
          content: entry.content,
          description: entry.description,
        })),
      );
    });

    browser.omnibox.onInputEntered.addListener((text) => {
      void (async () => {
        // Open the side panel first so it is alive to receive the storage
        // event; App also re-reads the key on mount (belt and braces).
        const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.id != null && browser.sidePanel) {
          try {
            await browser.sidePanel.open({ tabId: tab.id });
          } catch {
            // Side panel may already be open in another window — fine.
          }
        }
        const command =
          OMNIBOX_COMMANDS.find((entry) => entry.content === text.trim())?.command ?? 'inspect';
        await browser.storage.local.set({
          [STORAGE_KEYS.commandOmnibox]: { command, at: Date.now() },
        });
      })();
    });
  }

  // --- Phase 8: detachable inspector window -----------------------------
  // Popup window with the same App as the side panel — more room to inspect.
  onMessage('OPEN_INSPECTOR_WINDOW', async ({ sender }: { sender?: SenderLike }) => {
    if (requireExtensionPage(sender, 'The detached inspector') != null) {
      return { opened: false };
    }
    try {
      await browser.windows.create({
        url: browser.runtime.getURL('/window.html'),
        type: 'popup',
        width: 980,
        height: 720,
      });
      return { opened: true };
    } catch {
      return { opened: false };
    }
  });

  // Content scripts cannot read chrome.tabs — the background resolves the
  // sender's tab id for them (used to tab-stamp storage payloads). Only a
  // content script can ask; a page URL alone never names a tab.
  onMessage('GET_CONTENT_TAB_ID', ({ sender }) =>
    isContentScript(sender) ? { tabId: sender.tab?.id ?? null } : { tabId: null },
  );

  // --- Phase 7: contextual AI (Sections 7.22–7.23) -----------------------
  // The API key lives here, in the background worker only — it is never sent
  // to the content script or the page. The panel already gate-checked consent
  // and built a bounded payload; this handler enforces the key + enabled flag
  // independently (defense in depth) and performs the network call.
  onMessage(
    'AI_EXPLAIN',
    async ({
      data,
      sender,
    }: {
      data: AIExplainRequest;
      sender?: SenderLike;
    }): Promise<AIExplainResult> => {
      // Panel-only: the payload was pre-built and pre-summarized by the
      // privacy gate in the side panel. A content script must not be able to
      // spend the user's AI credits or exfiltrate prompts (INV-007).
      const refused = requireExtensionPage(sender, 'AI explanation');
      if (refused) return { ok: false, error: refused };
      // Bounded payload (defense in depth — the panel already bounds the
      // prompt builders; this caps what any sender can force the worker to
      // serialize and send to the provider, §15 size limits).
      if (JSON.stringify(data).length > MAX_AI_PAYLOAD_BYTES) {
        return {
          ok: false,
          error: 'The AI request is too large to send. Narrow the selection and retry.',
        };
      }
      try {
        const [enabled, storedKey, providerId, ollamaBaseUrl] = await Promise.all([
          repository.getSetting<boolean>(SETTING_KEYS.aiEnabled),
          repository.getSetting<string>(SETTING_KEYS.aiApiKey),
          repository.getSetting<'openrouter' | 'ollama'>(SETTING_KEYS.aiProvider),
          repository.getSetting<string>(SETTING_KEYS.aiOllamaBaseUrl),
        ]);
        if (!enabled) {
          return {
            ok: false,
            error: 'AI is disabled in Settings. Turn it on to use this feature.',
          };
        }

        // Phase 9: local Ollama needs no key — the strictest privacy posture.
        if (providerId === 'ollama') {
          const provider = new OllamaProvider(ollamaBaseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL);
          return await provider.explain(data, '');
        }

        // OpenRouter: a user's stored key wins; otherwise the bundled author
        // default is used in dev builds so AI works out of the box (see
        // ai/config.ts — production builds ship keyless).
        const apiKey = resolveApiKey(storedKey);
        if (!apiKey) {
          return {
            ok: false,
            error:
              'No AI key is set. Add your own OpenRouter API key in Settings (it is never shared).',
          };
        }
        const provider = new OpenRouterProvider();
        return await provider.explain(data, apiKey);
      } catch {
        return {
          ok: false,
          error: 'AI is unavailable right now — check Settings and try again.',
        };
      }
    },
  );

  // --- Phase 6: viewport screenshot capture (Section 7.20) ---------------
  onMessage(
    'CAPTURE_VIEWPORT',
    async ({ sender }: { sender?: SenderLike }): Promise<CaptureResult> => {
      const refused = requireExtensionPage(sender, 'Screenshot capture');
      if (refused) return { ok: false, error: refused };
      try {
        const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.id == null) {
          return { ok: false, error: 'No active tab to capture.' };
        }
        // Service workers have no Image/canvas — the panel decodes dimensions
        // when it draws the capture. This returns the raw PNG data URL.
        const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        return { ok: true, dataUrl, width: 0, height: 0 };
      } catch {
        return {
          ok: false,
          error: 'The browser refused the capture. Grant site access to this tab and try again.',
        };
      }
    },
  );

  // --- Phase 4: bulk asset export (Section 7.10) --------------------------
  onMessage(
    'EXPORT_ASSETS',
    async ({
      data,
      sender,
    }: {
      data: { requests: ExportAssetRequest[] };
      sender?: SenderLike;
    }): Promise<ExportAssetsResult> => {
      // Panel-only: exporting performs privileged network fetches + a download;
      // a content script must not be able to turn the worker into an arbitrary
      // fetch proxy or start downloads from a page (INV-007, §30/§31 SSRF).
      const refused = requireExtensionPage(sender, 'Asset export');
      if (refused) return { ok: false, error: refused };
      const requests = data.requests;
      if (requests.length === 0) return { ok: false, error: 'Nothing selected to export.' };
      // Cap the batch so a hostile/oversized selection cannot spawn hundreds of
      // fetches from the worker (§41 asset stress).
      if (requests.length > MAX_EXPORT_REQUESTS) {
        return {
          ok: false,
          error: `Too many assets selected — export up to ${MAX_EXPORT_REQUESTS} at a time.`,
        };
      }
      const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const pageUrl = tab?.url ?? '';

      // Assets are page-provided URLs — validate the scheme (no file:/chrome:/
      // or custom schemes through the privileged fetch) and cap per-asset size
      // so a hostile page cannot make the worker buffer unbounded payloads.
      const SAFE_SCHEMES = new Set(['http:', 'https:', 'blob:', 'data:']);
      const MAX_ASSET_BYTES = 50 * 1024 * 1024;
      const schemeOk = (raw: string): boolean => {
        try {
          return SAFE_SCHEMES.has(new URL(raw).protocol);
        } catch {
          return false;
        }
      };

      // Fetch each asset with a per-request timeout; failures become metadata
      // entries with a reason — never silently dropped (CORS is explained).
      const entries: ZipAssetEntry[] = await Promise.all(
        requests.map(async (request: ExportAssetRequest) => {
          const failed = (reason: string): ZipAssetEntry => ({
            url: request.url,
            type: request.type,
            filename: request.filename,
            bytes: new Uint8Array(),
            status: 'failed' as const,
            reason,
          });
          if (!schemeOk(request.url)) {
            return failed(
              'The asset URL uses an unsupported scheme — only http(s), blob, and data are exported.',
            );
          }
          // Re-sanitize the filename at the worker boundary (the panel already
          // sanitizes; this pins the ZIP path even if a future sender forgets,
          // §35 path traversal).
          request = { ...request, filename: sanitizeFilename(request.filename || 'asset') };
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15_000);
            const response = await fetch(request.url, { signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) {
              return failed(`HTTP ${response.status} while fetching the asset.`);
            }
            const announced = Number(response.headers.get('content-length') ?? '0');
            if (announced > MAX_ASSET_BYTES) {
              return failed(
                `The asset exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MB export cap.`,
              );
            }
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength > MAX_ASSET_BYTES) {
              return failed(
                `The asset exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MB export cap.`,
              );
            }
            return {
              url: request.url,
              type: request.type,
              filename: request.filename,
              bytes: new Uint8Array(buffer),
              status: 'downloaded' as const,
            };
          } catch {
            return failed(
              'Fetch failed — the asset may be CORS-blocked or the network unavailable. It is never bypassed.',
            );
          }
        }),
      );

      const zip = buildAssetZip(pageUrl, entries);
      const totalBytes = entries.reduce((acc, e) => acc + e.bytes.byteLength, 0);
      const failures = entries
        .filter(
          (e): e is ZipAssetEntry & { reason: string } => e.status === 'failed' && e.reason != null,
        )
        .map((e) => ({ url: e.url, reason: e.reason }));

      try {
        const blob = new Blob([new Uint8Array(zip)], { type: 'application/zip' });
        const objectUrl = URL.createObjectURL(blob);
        await browser.downloads.download({
          url: objectUrl,
          filename: 'vizquo-assets.zip',
          saveAs: false,
        });
        // Revoke after a beat — downloads read the URL asynchronously.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } catch {
        return { ok: false, error: 'The ZIP was built but the browser refused the download.' };
      }

      return {
        ok: true,
        downloaded: entries.filter((e) => e.status === 'downloaded').length,
        failures,
        totalBytes,
      };
    },
  );

  // Full round-trip: sidepanel → background → content → background → sidepanel.
  onMessage('PING', async ({ data }) => {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    let content: PingResult['content'] = {
      ok: false,
      error: 'No content script is connected to this tab. Grant site access to connect.',
    };
    if (tab?.id != null) {
      try {
        const reply = await sendMessage('PING_TAB', { nonce: data.nonce }, tab.id);
        content = {
          ok: true,
          nonce: reply.nonce,
          url: reply.url,
          title: reply.title,
          inspectModeEnabled: reply.inspectModeEnabled,
        };
      } catch {
        content = {
          ok: false,
          error: 'Page not connected. Grant site access, then reload the tab.',
        };
      }
    }
    // The content script knows its own URL/title (window.location / title)
    // even when tabs.query cannot expose them — the manifest has no "tabs"
    // permission, so tab.url is only visible for origins the extension has
    // host permission on. Prefer the content script's own report so the panel
    // always knows what page it is connected to (scanning refuses to run
    // without a URL).
    const tabUrl = content.ok && content.url ? content.url : tab?.url;
    const tabTitle = content.ok && content.title ? content.title : tab?.title;
    return {
      nonce: data.nonce,
      backgroundOk: true,
      extensionVersion: browser.runtime.getManifest().version,
      at: Date.now(),
      tab: tab ? { id: tab.id, url: tabUrl, title: tabTitle } : null,
      content,
    };
  });
});
