import {
  Activity,
  Database,
  Download,
  KeyRound,
  ShieldCheck,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-solid';
import { createEffect, createSignal, For, onMount, Show } from 'solid-js';
import { browser } from 'wxt/browser';
import { aiHasKey, hasAuthorDefaultKey } from '../../../ai/config';
import { DEFAULT_OLLAMA_BASE_URL } from '../../../ai/ollama';
import {
  LIBRARY_IMPORT_MAX_BYTES,
  parseLibraryDump,
  serializeLibrary,
} from '../../../export/library-port';
import {
  AI_CUSTOM_MODEL,
  AI_MODELS,
  AI_PROVIDERS,
  APP_NAME,
  APP_VERSION,
  INSPECTION_SCHEMA_VERSION,
  SETTING_KEYS,
  THEMES,
} from '../../../shared/constants';
import type { AIProviderId, CacheStats } from '../../../shared/types';
import { repository } from '../../../storage';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Toggle } from '../../components/Toggle';
import { analysis } from '../../stores/analysis-store';
import { persist } from '../../stores/persisted-store';
import { notify } from '../../stores/toast';
import { setTheme, setUi, ui } from '../../stores/ui-store';
import { downloadText } from './create/create-client';

const OPENROUTER_ORIGIN = 'https://openrouter.ai/*';
const LOCALHOST_ORIGIN = 'http://localhost/*';

/** Host origin the current provider needs for its network calls. */
function providerOrigin(provider: AIProviderId): string {
  return provider === 'ollama' ? LOCALHOST_ORIGIN : OPENROUTER_ORIGIN;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsScreen() {
  const [cacheStats, setCacheStats] = createSignal<CacheStats | null>(null);
  const [hostPermissions, setHostPermissions] = createSignal<string[]>([]);
  // Phase 9: whole-origin storage usage (navigator.storage.estimate) — the
  // browser's quota view, complementing the internal cache stats.
  const [storageEstimate, setStorageEstimate] = createSignal<{
    usage: number;
    quota: number;
  } | null>(null);

  onMount(async () => {
    try {
      setCacheStats(await repository.getCacheStats());
    } catch {
      setCacheStats(null);
    }
    try {
      const permissions = await browser.permissions.getAll();
      setHostPermissions(permissions.origins ?? []);
    } catch {
      setHostPermissions([]);
    }
    if (navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage != null && estimate.quota != null) {
          setStorageEstimate({ usage: estimate.usage, quota: estimate.quota });
        }
      } catch {
        setStorageEstimate(null);
      }
    }
  });

  function changeTheme(theme: 'light' | 'dark' | 'auto') {
    setTheme(theme);
    persist(SETTING_KEYS.theme, theme);
  }

  function changeFontScale(value: number) {
    const rounded = Math.round(value * 100) / 100;
    setUi('fontScale', rounded);
    persist(SETTING_KEYS.fontScale, rounded);
  }

  async function clearCache() {
    await repository.clearCache();
    setCacheStats(await repository.getCacheStats());
    notify({ title: 'Cache cleared', tone: 'success' });
  }

  async function changeAiEnabled(enabled: boolean) {
    setUi('ai', 'enabled', enabled);
    persist(SETTING_KEYS.aiEnabled, enabled);
    if (enabled && !ui.ai.hostPermission) await requestHostPermission();
    if (enabled && !ui.ai.consentGiven) {
      notify({
        title: 'Review the AI notice below',
        description: 'Before the first AI request you will see exactly what is sent.',
        tone: 'warning',
      });
    }
  }

  async function requestHostPermission(): Promise<void> {
    try {
      const origin = providerOrigin(ui.ai.provider);
      const granted = await browser.permissions.request({ origins: [origin] });
      setUi('ai', 'hostPermission', granted);
      notify({
        title: granted ? 'Provider access granted' : 'Provider access not granted',
        description: granted
          ? ui.ai.provider === 'ollama'
            ? 'Ollama requests will now reach your local server.'
            : 'AI requests will now work with your key.'
          : 'You can still use every non-AI feature.',
        tone: granted ? 'success' : 'warning',
      });
    } catch {
      setUi('ai', 'hostPermission', false);
    }
  }

  async function changeProvider(provider: AIProviderId) {
    setUi('ai', 'provider', provider);
    // Ollama needs no API key — flip readiness so the gate passes keyless.
    if (provider === 'ollama') {
      setUi('ai', 'hasKey', true);
    } else {
      setUi('ai', 'hasKey', aiHasKey(ui.ai.userKey));
    }
    persist(SETTING_KEYS.aiProvider, provider);
    // The host permission differs per provider — refresh it on switch.
    const granted = await browser.permissions.contains({ origins: [providerOrigin(provider)] });
    setUi('ai', 'hostPermission', granted);
  }

  async function changeOllamaBaseUrl(raw: string) {
    const value = raw.trim() || DEFAULT_OLLAMA_BASE_URL;
    setUi('ai', 'ollamaBaseUrl', value);
    persist(SETTING_KEYS.aiOllamaBaseUrl, value);
  }

  async function changeOllamaModel(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setUi('ai', 'ollamaModel', value);
    persist(SETTING_KEYS.aiOllamaModel, value);
  }

  const [customModel, setCustomModel] = createSignal('');

  async function saveKey(raw: string) {
    const key = raw.trim();
    if (!key) {
      notify({ title: 'Paste your API key first', tone: 'warning' });
      return;
    }
    await repository.setSetting(SETTING_KEYS.aiApiKey, key);
    setUi('ai', 'userKey', true);
    setUi('ai', 'hasKey', true);
    notify({
      title: 'API key saved',
      description: 'Stored locally in this extension only. It overrides the bundled key.',
      tone: 'success',
    });
  }

  async function clearKey() {
    await repository.setSetting(SETTING_KEYS.aiApiKey, '');
    setUi('ai', 'userKey', false);
    // The bundled author default (if present) still provides a working key.
    setUi('ai', 'hasKey', aiHasKey(false));
    notify({
      title: 'Your API key removed',
      description: hasAuthorDefaultKey()
        ? 'AI now uses the bundled default key again.'
        : 'Add another key in Settings to use AI.',
      tone: 'success',
    });
  }

  function changeModel(model: string) {
    if (model === AI_CUSTOM_MODEL) {
      // Reveal the custom input pre-filled with the current model.
      setCustomModel(ui.ai.model);
      return;
    }
    setUi('ai', 'model', model);
    persist(SETTING_KEYS.aiModel, model);
  }

  function saveCustomModel() {
    const slug = customModel().trim();
    if (!slug) {
      notify({ title: 'Enter a model slug', tone: 'warning' });
      return;
    }
    setUi('ai', 'model', slug);
    persist(SETTING_KEYS.aiModel, slug);
    notify({ title: `Model set to ${slug}`, tone: 'success' });
  }

  /** The select value: the model when it's a known option, else the custom sentinel. */
  const modelSelectValue = () =>
    AI_MODELS.some((m) => m.id === ui.ai.model) ? ui.ai.model : AI_CUSTOM_MODEL;
  const isCustomModel = () => modelSelectValue() === AI_CUSTOM_MODEL;

  // When the stored model is a custom slug (not in the list), prefill the
  // custom input so the active model is always visible on reopen (reviewer #1).
  createEffect(() => {
    if (isCustomModel()) setCustomModel(ui.ai.model);
  });

  async function giveConsent() {
    setUi('ai', 'consentGiven', true);
    persist(SETTING_KEYS.aiConsentGiven, true);
    if (!ui.ai.hostPermission) await requestHostPermission();
    notify({ title: 'AI enabled — thank you for reviewing the notice', tone: 'success' });
  }

  const stats = cacheStats();

  /* ---- Phase 9: data portability (library export / import) ---- */
  const [importing, setImporting] = createSignal(false);
  let importInputRef: HTMLInputElement | undefined;

  async function exportLibrary() {
    try {
      const [inspections, collections, notes, history, screenshots] = await Promise.all([
        repository.listInspections(),
        repository.listCollections(),
        repository.listNotes(),
        repository.listHistory(),
        repository.listScreenshots(),
      ]);
      const json = serializeLibrary({ inspections, collections, notes, history, screenshots });
      downloadText(
        json,
        `vizquo-library-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      );
      notify({
        title: 'Library exported',
        description: `${inspections.length} scans, ${collections.length} collections, ${notes.length} notes.`,
        tone: 'success',
      });
    } catch {
      notify({ title: 'Export failed', tone: 'error' });
    }
  }

  async function importLibrary(file: File) {
    if (importing()) return;
    // Quota defense: a real export is tiny next to this cap; anything larger
    // is corrupt or hostile and must not be parsed at all.
    if (file.size > LIBRARY_IMPORT_MAX_BYTES) {
      notify({
        title: 'Import rejected',
        description: 'The file is larger than 50 MB — no Vizquo library export is that big.',
        tone: 'warning',
      });
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      let parsed: ReturnType<typeof parseLibraryDump>;
      try {
        parsed = parseLibraryDump(JSON.parse(text) as unknown);
      } catch {
        parsed = { ok: false, reason: 'The file is not valid JSON.' };
      }
      if (!parsed.ok) {
        notify({ title: 'Import rejected', description: parsed.reason, tone: 'warning' });
        return;
      }
      const { dump } = parsed;
      // Every row already passed shape validation, so a write failure here is
      // an unexpected edge — counted and reported, never silent or partial.
      const counts = { inspections: 0, collections: 0, notes: 0, history: 0, screenshots: 0 };
      let skipped = 0;
      const write = async <T,>(
        rows: T[],
        save: (row: T) => Promise<void>,
        key: keyof typeof counts,
      ): Promise<void> => {
        for (const row of rows) {
          try {
            await save(row);
            counts[key] += 1;
          } catch {
            skipped += 1;
          }
        }
      };
      await write(dump.inspections, (r) => repository.saveInspection(r), 'inspections');
      await write(dump.collections, (r) => repository.saveCollection(r), 'collections');
      await write(dump.notes, (r) => repository.saveNote(r), 'notes');
      await write(dump.history, (r) => repository.saveHistory(r), 'history');
      await write(dump.screenshots, (r) => repository.saveScreenshot(r), 'screenshots');
      const total = counts.inspections + counts.collections + counts.notes;
      notify({
        title: 'Library imported',
        description:
          skipped > 0
            ? `${total} scans/collections/notes restored, ${skipped} rows skipped.`
            : `${counts.inspections} scans, ${counts.collections} collections, ${counts.notes} notes restored.`,
        tone: skipped > 0 ? 'warning' : 'success',
      });
      setCacheStats(await repository.getCacheStats());
    } catch {
      notify({
        title: 'Import failed',
        description: 'The file could not be read — is it a valid Vizquo library export?',
        tone: 'error',
      });
    } finally {
      setImporting(false);
    }
  }

  /** Phase 9 power-up: wipe every table, then reload to a fresh state. */
  async function resetAll() {
    const confirmed = window.confirm(
      'Delete ALL Vizquo data — scans, collections, notes, screenshots, cache, and settings? This cannot be undone.',
    );
    if (!confirmed) return;
    try {
      await repository.clearAll();
      notify({
        title: 'All data cleared',
        description: 'Reloading Vizquo to a fresh state…',
        tone: 'success',
      });
      setTimeout(() => window.location.reload(), 500);
    } catch {
      notify({
        title: 'Reset failed',
        description: 'Try again — nothing was deleted.',
        tone: 'error',
      });
    }
  }

  // Every permission in the manifest (PERMISSIONS.md) — granted at install.
  // activeTab is the least-invasive permission: active only while the user is
  // interacting with the extension (toolbar click / context menu / shortcut).
  const MANIFEST_PERMISSIONS = ['storage', 'sidePanel', 'downloads', 'contextMenus', 'activeTab'];

  /**
   * Diagnostics (Phase 8): download a JSON bundle of the extension's state.
   * The AI API key is always redacted — a debug export must never leak it.
   */
  async function downloadDebugBundle() {
    const settings: Record<string, unknown> = {};
    for (const key of Object.values(SETTING_KEYS)) {
      try {
        settings[key] = await repository.getSetting(key);
      } catch {
        settings[key] = undefined;
      }
    }
    settings[SETTING_KEYS.aiApiKey] = '[redacted]';
    const bundle = {
      app: APP_NAME,
      version: APP_VERSION,
      inspectionSchemaVersion: INSPECTION_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      settings,
      cache: stats ?? null,
      permissions: {
        manifest: MANIFEST_PERMISSIONS,
        origins: hostPermissions(),
      },
      connection: {
        status: ui.connection.status,
        tabUrl: ui.connection.tabUrl,
        tabTitle: ui.connection.tabTitle,
        latencyMs: ui.connection.latencyMs,
        contentOk: ui.connection.contentOk,
        inspectModeEnabled: ui.connection.inspectModeEnabled,
        extensionVersion: ui.connection.extensionVersion,
      },
      lastScan: {
        at: analysis.lastScanAt,
        cached: analysis.cached,
        stale: analysis.stale,
        url: analysis.inspection?.page.url ?? null,
      },
    };
    downloadText(
      JSON.stringify(bundle, null, 2),
      `vizquo-debug-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    );
    notify({ title: 'Debug bundle downloaded', tone: 'success' });
  }

  return (
    <div class="flex flex-col gap-3 p-3">
      <Panel title="Appearance">
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2 px-2">
            <div>
              <span class="block text-[13px] font-medium text-[var(--vq-fg)]">Theme</span>
              <span class="block text-[11.5px] text-[var(--vq-fg-muted)]">
                Auto follows your OS color scheme.
              </span>
            </div>
            <Segmented
              ariaLabel="Theme"
              value={ui.theme}
              onChange={changeTheme}
              options={THEMES.map((t) => ({
                value: t,
                label: t.charAt(0).toUpperCase() + t.slice(1),
              }))}
            />
          </div>
        </div>
      </Panel>

      <Panel title="Accessibility">
        <div class="flex flex-col">
          <Toggle
            label="High contrast"
            description="Stronger borders and text contrast inside Vizquo."
            checked={ui.highContrast}
            onChange={(v) => {
              setUi('highContrast', v);
              persist(SETTING_KEYS.highContrast, v);
            }}
          />
          <Toggle
            label="Reduced motion"
            description="Override OS setting — disable animations and transitions."
            checked={ui.reducedMotion}
            onChange={(v) => {
              setUi('reducedMotion', v);
              persist(SETTING_KEYS.reducedMotion, v);
            }}
          />
          <div class="px-2 py-2.5">
            <div class="mb-1.5 flex items-center justify-between">
              <label for="vq-font-scale" class="text-[13px] font-medium text-[var(--vq-fg)]">
                Font scale
              </label>
              <span class="vq-nums text-[12px] text-[var(--vq-fg-muted)]">
                {Math.round(ui.fontScale * 100)}%
              </span>
            </div>
            <input
              id="vq-font-scale"
              type="range"
              min={0.85}
              max={1.25}
              step={0.05}
              value={ui.fontScale}
              onChange={(e) => changeFontScale(Number((e.target as HTMLInputElement).value))}
              class="w-full accent-[var(--vq-accent)]"
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Data & cache"
        subtitle="Local-only storage — nothing leaves the browser"
        actions={
          stats && (
            <Badge tone="neutral" class="vq-nums">
              {formatBytes(stats.sizeBytes)}
            </Badge>
          )
        }
      >
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-2 py-1">
            <span class="flex items-center gap-2 text-[12.5px] text-[var(--vq-fg-muted)]">
              <Database class="size-3.5" />
              {stats ? (
                <span class="vq-nums">
                  {stats.count} {stats.count === 1 ? 'entry' : 'entries'}
                  {stats.byKind.inspection > 0 &&
                    ` · ${formatBytes(stats.byKind.inspection)} inspections`}
                  {stats.byKind.screenshot > 0 &&
                    ` · ${formatBytes(stats.byKind.screenshot)} screenshots`}
                </span>
              ) : (
                'Reading…'
              )}
            </span>
            <Button
              size="sm"
              variant="danger"
              onClick={clearCache}
              disabled={!stats || stats.count === 0}
            >
              <Trash2 class="size-3.5" />
              Clear
            </Button>
          </div>
          <p class="px-2 text-[11px] leading-relaxed text-[var(--vq-fg-subtle)]">
            Scanned pages are cached locally (LRU, capped) so re-opening a page you've already
            scanned is instant. Clear any time — no data is lost from the page itself.
          </p>
          <Show when={storageEstimate()}>
            {(estimate) => (
              <p class="px-2 text-[10.5px] text-[var(--vq-fg-subtle)]">
                Browser quota:{' '}
                <span class="vq-nums">
                  {formatBytes(estimate().usage)} of {formatBytes(estimate().quota)} used
                </span>{' '}
                — includes this library plus the cache.
              </p>
            )}
          </Show>
        </div>

        <div class="mt-2 flex items-center justify-between gap-2 border-t border-[var(--vq-border)] px-2 pt-2">
          <div class="min-w-0">
            <p class="text-[12.5px] font-medium text-[var(--vq-fg)]">Backup your library</p>
            <p class="text-[11px] text-[var(--vq-fg-subtle)]">
              Export scans, collections, notes, and screenshots as one JSON file. Re-import any time
              to restore.
            </p>
          </div>
          <div class="flex shrink-0 gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => void exportLibrary()}>
              <Download class="size-3.5" aria-hidden="true" />
              Export
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={importing()}
              onClick={() => importInputRef?.click()}
            >
              <Upload class="size-3.5" aria-hidden="true" />
              {importing() ? 'Importing…' : 'Import'}
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              class="sr-only"
              aria-label="Import library JSON"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) void importLibrary(file);
                (e.target as HTMLInputElement).value = '';
              }}
            />
          </div>
        </div>

        <div class="mt-2 flex items-center justify-between gap-2 border-t border-[var(--vq-danger-soft)] px-2 pt-2">
          <div class="min-w-0">
            <p class="text-[12.5px] font-medium text-[var(--vq-danger-fg)]">Reset everything</p>
            <p class="text-[11px] text-[var(--vq-fg-subtle)]">
              Clears all scans, collections, notes, screenshots, cache, and settings — back to a
              fresh install. Export a backup first if you want to keep anything.
            </p>
          </div>
          <Button size="sm" variant="danger" onClick={() => void resetAll()}>
            <Trash2 class="size-3.5" aria-hidden="true" />
            Reset
          </Button>
        </div>
      </Panel>

      <Panel
        title="AI (optional)"
        subtitle="Free by default — OpenRouter free models, or a fully local Ollama server. Bring your own key only if you want; nothing is shared with Vizquo."
      >
        <div class="flex flex-col">
          <Toggle
            label="Enable AI features"
            description="Off by default. Everything else in Vizquo works without it."
            checked={ui.ai.enabled}
            onChange={(v) => void changeAiEnabled(v)}
          />
          <Show when={ui.ai.enabled}>
            <div class="flex flex-col gap-2.5 px-2 py-2.5">
              <label class="flex flex-col gap-1">
                <span class="text-[12px] font-medium text-[var(--vq-fg)]">Provider</span>
                <select
                  value={ui.ai.provider}
                  onChange={(e) =>
                    void changeProvider((e.target as HTMLSelectElement).value as AIProviderId)
                  }
                  class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] focus:outline-none"
                >
                  <For each={AI_PROVIDERS}>
                    {(provider) => <option value={provider.id}>{provider.label}</option>}
                  </For>
                </select>
                <span class="text-[11px] text-[var(--vq-fg-subtle)]">
                  {AI_PROVIDERS.find((p) => p.id === ui.ai.provider)?.description}
                </span>
              </label>

              <Show when={ui.ai.provider === 'ollama'}>
                <div class="flex flex-col gap-2">
                  <label class="flex flex-col gap-1">
                    <span class="text-[12px] font-medium text-[var(--vq-fg)]">
                      Ollama server URL
                    </span>
                    <input
                      id="vq-ollama-base"
                      type="text"
                      value={ui.ai.ollamaBaseUrl}
                      onInput={(e) =>
                        void changeOllamaBaseUrl((e.target as HTMLInputElement).value)
                      }
                      placeholder="http://localhost:11434"
                      class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] focus:border-[var(--vq-accent)] focus:outline-none"
                    />
                  </label>
                  <label class="flex flex-col gap-1">
                    <span class="text-[12px] font-medium text-[var(--vq-fg)]">Local model</span>
                    <input
                      id="vq-ollama-model"
                      type="text"
                      value={ui.ai.ollamaModel}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void changeOllamaModel((e.target as HTMLInputElement).value);
                        }
                      }}
                      placeholder="llama3.2"
                      class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] focus:border-[var(--vq-accent)] focus:outline-none"
                    />
                  </label>
                  <p class="text-[11px] leading-relaxed text-[var(--vq-fg-subtle)]">
                    Install <span class="vq-code">ollama</span> from ollama.com, run{' '}
                    <span class="vq-code">ollama pull llama3.2</span>, and keep{' '}
                    <span class="vq-code">ollama serve</span> running. Everything stays on this
                    machine — no key, no cloud.
                  </p>
                </div>
              </Show>

              <Show when={ui.ai.provider === 'openrouter'}>
                <label class="flex flex-col gap-1">
                  <span class="text-[12px] font-medium text-[var(--vq-fg)]">Model</span>
                  <select
                    value={modelSelectValue()}
                    onChange={(e) => changeModel((e.target as HTMLSelectElement).value)}
                    class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] focus:outline-none"
                  >
                    <For each={AI_MODELS}>
                      {(model) => <option value={model.id}>{model.label}</option>}
                    </For>
                    <option value={AI_CUSTOM_MODEL}>Custom model…</option>
                  </select>
                </label>

                <Show when={isCustomModel()}>
                  <div class="flex flex-col gap-1.5">
                    <label class="flex flex-col gap-1">
                      <span class="text-[11px] text-[var(--vq-fg-subtle)]">
                        Model slug (e.g. <code class="vq-code">anthropic/claude-3.5-sonnet</code>)
                      </span>
                      <input
                        id="vq-ai-model-custom"
                        type="text"
                        value={customModel()}
                        onInput={(e) => setCustomModel((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveCustomModel();
                        }}
                        placeholder="provider/model"
                        class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] focus:border-[var(--vq-accent)] focus:outline-none"
                      />
                    </label>
                    <Button size="sm" variant="secondary" onClick={saveCustomModel}>
                      Use this model
                    </Button>
                  </div>
                </Show>

                <Show when={ui.ai.userKey}>
                  <div class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2.5 py-2">
                    <span class="flex items-center gap-2 text-[12px] text-[var(--vq-fg-muted)]">
                      <KeyRound class="size-3.5" aria-hidden="true" />
                      Your API key is saved — it is never displayed again.
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void clearKey()}>
                      Remove
                    </Button>
                  </div>
                </Show>

                <Show when={!ui.ai.userKey}>
                  <div class="flex flex-col gap-1.5">
                    <label class="flex flex-col gap-1">
                      <span class="flex items-center gap-1.5 text-[12px] font-medium text-[var(--vq-fg)]">
                        <KeyRound class="size-3.5" aria-hidden="true" />
                        Your OpenRouter API key
                        <Show when={ui.ai.hasKey}>
                          <span class="vq-nums text-[10px] text-[var(--vq-fg-subtle)]">
                            (using bundled default — set your own to override)
                          </span>
                        </Show>
                      </span>
                      <input
                        id="vq-ai-key"
                        type="password"
                        placeholder="sk-or-…"
                        autocomplete="off"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            void saveKey((e.target as HTMLInputElement).value);
                          }
                        }}
                        class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] focus:border-[var(--vq-accent)] focus:outline-none"
                      />
                    </label>
                    <p class="text-[11px] leading-relaxed text-[var(--vq-fg-subtle)]">
                      Your key is stored only inside this extension and used only by the background
                      worker for requests you make. It is never sent to the page you inspect, never
                      logged, and never uploaded anywhere else.
                    </p>
                    <div class="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void saveKey(
                            (document.getElementById('vq-ai-key') as HTMLInputElement)?.value ?? '',
                          )
                        }
                      >
                        Save key
                      </Button>
                    </div>
                  </div>
                </Show>
              </Show>

              <Show when={!ui.ai.consentGiven}>
                <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-warning-soft)] bg-[var(--vq-warning-soft)] p-3">
                  <p class="flex items-center gap-1.5 text-[12px] font-medium text-[var(--vq-warning-fg)]">
                    <ShieldCheck class="size-3.5" aria-hidden="true" />
                    Privacy notice
                  </p>
                  <p class="mt-1 text-[11px] leading-relaxed text-[var(--vq-warning-fg)]">
                    Before your first AI request, Vizquo shows you exactly what will be sent to the
                    model and requires your confirmation. Prompts are bounded summaries of the
                    inspected element or page — never raw HTML, input values, or data-attributes. AI
                    is off by default and can be turned off any time.
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    class="mt-2"
                    onClick={() => void giveConsent()}
                  >
                    I understand — allow AI requests
                  </Button>
                </div>
              </Show>

              <Show when={!ui.ai.hostPermission}>
                <div class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] px-2.5 py-2">
                  <span class="flex items-center gap-2 text-[12px] text-[var(--vq-fg-muted)]">
                    <Wrench class="size-3.5" aria-hidden="true" />
                    {ui.ai.provider === 'ollama'
                      ? 'localhost access not granted yet — needed to reach your Ollama server.'
                      : 'openrouter.ai access not granted yet.'}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void requestHostPermission()}
                  >
                    Grant access
                  </Button>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Panel>

      <Panel
        title="Diagnostics"
        subtitle="Permissions, last scan, and a debug bundle for issue reports"
      >
        <div class="flex flex-col gap-2.5">
          <div class="px-2">
            <p class="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-[var(--vq-fg-subtle)] uppercase">
              <ShieldCheck class="size-3" />
              Permissions
            </p>
            <div class="flex flex-wrap gap-1">
              <For each={MANIFEST_PERMISSIONS}>
                {(permission) => <Badge tone="success">{permission}</Badge>}
              </For>
              <Show when={hostPermissions().length > 0}>
                <For each={hostPermissions()}>
                  {(origin) => (
                    <Badge tone="info" title="On-demand host permission (granted)">
                      {origin}
                    </Badge>
                  )}
                </For>
              </Show>
            </div>
            <p class="mt-1.5 text-[10.5px] leading-relaxed text-[var(--vq-fg-subtle)]">
              Manifest permissions are fixed; host permissions are granted on demand, never by
              default. See PERMISSIONS.md for the one-line justification of each.
            </p>
          </div>

          <div class="px-2">
            <p class="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-[var(--vq-fg-subtle)] uppercase">
              <Activity class="size-3" />
              Last scan
            </p>
            <div class="flex flex-col gap-1 text-[11.5px] text-[var(--vq-fg-muted)]">
              <p>
                Time:{' '}
                <span class="vq-nums">
                  {analysis.lastScanAt ? new Date(analysis.lastScanAt).toLocaleString() : 'never'}
                </span>
              </p>
              <p class="truncate">Page: {analysis.inspection?.page.url ?? '—'}</p>
              <p class="flex items-center gap-1.5">
                Serving:
                <Show when={analysis.stale}>
                  <Badge tone="warning">stale — refreshing</Badge>
                </Show>
                <Show when={analysis.cached && !analysis.stale}>
                  <Badge tone="info">cached</Badge>
                </Show>
                <Show when={!analysis.cached && !analysis.stale}>
                  <Badge tone="neutral">fresh scan</Badge>
                </Show>
              </p>
            </div>
          </div>

          <div class="px-2">
            <Button size="sm" variant="secondary" onClick={() => void downloadDebugBundle()}>
              <Download class="size-3.5" />
              Download debug bundle
            </Button>
            <p class="mt-1.5 text-[10.5px] leading-relaxed text-[var(--vq-fg-subtle)]">
              JSON with settings, cache stats, permissions, and connection state. The AI API key is
              always redacted.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title={`About ${APP_NAME}`}>
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between px-2 py-1">
            <span class="text-[12px] text-[var(--vq-fg-muted)]">Version</span>
            <Badge tone="neutral" class="vq-nums">
              v{APP_VERSION}
            </Badge>
          </div>
          <div class="flex items-center justify-between px-2 py-1">
            <span class="text-[12px] text-[var(--vq-fg-muted)]">Inspection schema</span>
            <Badge tone="neutral" class="vq-nums">
              v{INSPECTION_SCHEMA_VERSION}
            </Badge>
          </div>
          <p class="px-2 pt-1 text-[11px] leading-relaxed text-[var(--vq-fg-subtle)]">
            {APP_NAME} is a design-intelligence layer for the web. All analysis runs locally;
            nothing is uploaded, tracked, or sold.
          </p>
        </div>
      </Panel>
    </div>
  );
}
