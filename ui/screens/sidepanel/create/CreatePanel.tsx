import {
  Camera,
  Clipboard,
  Code2,
  Download,
  Eraser,
  FileCode2,
  FolderArchive,
  LoaderCircle,
  PencilRuler,
  RefreshCcw,
  Save,
  Undo2,
} from 'lucide-solid';
import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import {
  buildProjectZip,
  EXPORT_MATRIX,
  FORMAT_LABEL,
  filenameFor,
  renderExport,
  SCOPE_LABEL,
} from '../../../../export/export-center';
import type {
  CaptureResult,
  ElementRef,
  ExportFormat,
  ExportScope,
  LiveEdit,
  ScreenshotRegion,
} from '../../../../shared/types';
import { repository } from '../../../../storage';
import { Button } from '../../../components/Button';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';
import { notify } from '../../../stores/toast';
import { ui } from '../../../stores/ui-store';
import { scanPage } from '../design/scan-client';
import { store as inspectorStore } from '../inspector/inspector-store';
import {
  applyEdit,
  captureFullpage,
  captureViewport,
  clearEdits,
  clearSavedLiveEdits,
  copyText,
  downloadDataUrl,
  downloadText,
  getEdits,
  getMultiSelectionBounds,
  getPageGeometry,
  isWebTab,
  loadSavedLiveEdits,
  persistLiveEdits,
  restoreSavedLiveEdits,
  undoEdit,
} from './create-client';

/* ======================================================================== */
/* Screenshot studio (7.20)                                                  */
/* ======================================================================== */

type Region = 'viewport' | 'element' | 'fullpage' | 'selection';

const REGION_LABEL: Record<Region, string> = {
  viewport: 'Viewport',
  element: 'Selected element',
  fullpage: 'Full page',
  selection: 'Multi-selection',
};

function cropToRect(
  dataUrl: string,
  rect: { x: number; y: number; width: number; height: number },
  dpr: number,
): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ ok: false, error: 'Canvas is unavailable for cropping.' });
          return;
        }
        ctx.drawImage(
          img,
          Math.max(0, rect.x) * dpr,
          Math.max(0, rect.y) * dpr,
          rect.width * dpr,
          rect.height * dpr,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        resolve({
          ok: true,
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        resolve({ ok: false, error: 'The element crop failed.' });
      }
    };
    img.onerror = () => resolve({ ok: false, error: 'The capture could not be decoded.' });
    img.src = dataUrl;
  });
}

/** Decode an image's natural dimensions from its data URL. */
function decodeImageDims(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function ScreenshotStudio() {
  const [region, setRegion] = createSignal<Region>('viewport');
  const [capture, setCapture] = createSignal<CaptureResult | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [savedId, setSavedId] = createSignal<string | null>(null);

  /** The captured image URL, or null when there is no successful capture. */
  const imageUrl = createMemo<string | null>(() => {
    const shot = capture();
    return shot?.ok && shot.dataUrl ? shot.dataUrl : null;
  });

  const selectedRect = createMemo(() => {
    const inspection = inspectorStore.inspection;
    if (!inspection) return null;
    const r = inspection.rect;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  async function run() {
    if (!isWebTab()) return;
    setBusy(true);
    setSavedId(null);
    setCapture(null);
    try {
      let result: CaptureResult | null = null;
      if (region() === 'fullpage') {
        result = await captureFullpage();
      } else if (region() === 'element') {
        const rect = selectedRect();
        if (!rect) {
          notify({
            title: 'Select an element first',
            description: 'Lock an element in the inspector, then capture it.',
            tone: 'warning',
          });
          setBusy(false);
          return;
        }
        const viewport = await captureViewport();
        const geometry = await getPageGeometry();
        if (viewport.ok && viewport.dataUrl && geometry) {
          result = await cropToRect(viewport.dataUrl, rect, geometry.devicePixelRatio);
        } else {
          result = viewport;
        }
      } else if (region() === 'selection') {
        if (analysis.multiRefs.length < 2) {
          notify({
            title: 'Select elements first',
            description: 'Shift-click two or more elements on the page, then capture them.',
            tone: 'warning',
          });
          setBusy(false);
          return;
        }
        const bounds = await getMultiSelectionBounds();
        if (!bounds) {
          notify({
            title: 'Selection not found',
            description: 'Re-select the elements on the page and try again.',
            tone: 'warning',
          });
          setBusy(false);
          return;
        }
        const viewport = await captureViewport();
        const geometry = await getPageGeometry();
        if (viewport.ok && viewport.dataUrl && geometry) {
          result = await cropToRect(viewport.dataUrl, bounds, geometry.devicePixelRatio);
        } else {
          result = viewport;
        }
      } else {
        result = await captureViewport();
      }
      setCapture(result);
      if (result && !result.ok) {
        notify({ title: 'Capture failed', description: result.error, tone: 'error' });
      }
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const shot = capture();
    if (!shot?.ok || !shot.dataUrl) return;
    const regionLabel = region();
    try {
      // The background (service worker) can't decode images, so the panel
      // reads the real dimensions from the data URL before persisting.
      const dims = await decodeImageDims(shot.dataUrl);
      const id = `shot-${Date.now()}`;
      await repository.saveScreenshot({
        id,
        pageUrl: ui.connection.tabUrl ?? '',
        region: regionLabel as ScreenshotRegion,
        dataUrl: shot.dataUrl,
        // Prefer the decoded pixel dimensions; fall back to what the capture
        // reported if the decode ever fails.
        width: dims?.width ?? shot.width ?? 0,
        height: dims?.height ?? shot.height ?? 0,
        createdAt: Date.now(),
        elementRef: regionLabel === 'element' ? (inspectorStore.lockedRef ?? undefined) : undefined,
      });
      setSavedId(id);
      notify({ title: 'Screenshot saved to your library', tone: 'success' });
    } catch {
      notify({ title: 'Could not save the screenshot', tone: 'error' });
    }
  }

  return (
    <Panel
      id="screenshot-studio"
      title="Screenshot studio"
      subtitle="Capture the viewport, a selected element, or the full page — annotate and save to your library."
      actions={
        <Show when={imageUrl()}>
          <Button size="sm" variant="ghost" onClick={() => void save()} disabled={busy()}>
            <Save class="size-3.5" aria-hidden="true" />
            Save
          </Button>
        </Show>
      }
    >
      <fieldset class="mb-3 flex flex-wrap gap-1.5">
        <legend class="sr-only">Capture region</legend>
        <For each={['viewport', 'element', 'fullpage', 'selection'] as Region[]}>
          {(option) => (
            <button
              type="button"
              disabled={option === 'selection' && analysis.multiRefs.length < 2}
              title={
                option === 'selection' && analysis.multiRefs.length < 2
                  ? 'Shift-click two or more elements on the page first'
                  : undefined
              }
              class={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                region() === option
                  ? 'border-[var(--vq-accent)] bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]'
                  : 'border-[var(--vq-border)] text-[var(--vq-fg-muted)] hover:border-[var(--vq-border-strong)]'
              } disabled:cursor-not-allowed disabled:opacity-40`}
              aria-pressed={region() === option}
              onClick={() => setRegion(option)}
            >
              {REGION_LABEL[option]}
            </button>
          )}
        </For>
      </fieldset>

      <div class="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void run()} disabled={busy()}>
          {busy() ? (
            <LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Camera class="size-3.5" aria-hidden="true" />
          )}
          {busy() ? 'Capturing…' : 'Capture'}
        </Button>
        <Show when={imageUrl()}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadDataUrl(imageUrl() as string, `vizquo-${region()}.png`)}
          >
            <Download class="size-3.5" aria-hidden="true" />
            Download
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCapture(null)}>
            <Eraser class="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        </Show>
      </div>

      <Show when={region() === 'element' && !selectedRect()}>
        <p class="mt-2 text-[11px] text-[var(--vq-warning-fg)]">
          No element locked yet — inspect and lock one first.
        </p>
      </Show>
      <Show when={region() === 'selection' && analysis.multiRefs.length < 2}>
        <p class="mt-2 text-[11px] text-[var(--vq-warning-fg)]">
          Shift-click two or more elements on the page to capture their bounding box.
        </p>
      </Show>
      <Show when={region() === 'selection' && analysis.multiRefs.length >= 2}>
        <p class="mt-2 text-[11px] text-[var(--vq-fg-subtle)]">
          Only the parts of the selection inside the current viewport are captured.
        </p>
      </Show>

      <Show when={imageUrl()}>
        {(src) => (
          <div class="mt-3 overflow-hidden rounded-[var(--vq-radius-md)] border border-[var(--vq-border)]">
            <img
              src={src()}
              alt={`${region()} capture`}
              class="block max-h-64 w-full object-contain bg-[var(--vq-bg-sunken)]"
            />
          </div>
        )}
      </Show>
      <Show when={savedId()}>
        <p class="mt-2 text-[11px] text-[var(--vq-success-fg)]">
          Saved — find it in your screenshot library (Phase 8 collections).
        </p>
      </Show>
    </Panel>
  );
}

/* ======================================================================== */
/* Live editing (7.21)                                                       */
/* ======================================================================== */

const EDITABLE_PROPERTIES = [
  'background-color',
  'color',
  'border-radius',
  'padding',
  'margin',
  'gap',
  'font-size',
  'font-weight',
  'border-width',
  'border-color',
  'box-shadow',
  'opacity',
  'width',
  'height',
  'max-width',
  'display',
  'justify-content',
  'align-items',
];

function LiveEditing() {
  const [edits, setEdits] = createSignal<LiveEdit[]>([]);
  const [property, setProperty] = createSignal('background-color');
  const [value, setValue] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  // Phase 9: a session saved for THIS page after a reload can be restored.
  const [savedEdits, setSavedEdits] = createSignal<LiveEdit[]>([]);
  const [restoring, setRestoring] = createSignal(false);

  const target = createMemo<ElementRef | null>(() => inspectorStore.lockedRef);

  async function refresh() {
    const live = await getEdits();
    setEdits(live);
    // The saved copy only matters when nothing is live (post-reload) — mirror
    // the current session into storage so it survives a reload.
    if (live.length > 0) await persistLiveEdits(live);
  }

  // Show any edits already applied when the panel (re)opens, and surface a
  // saved session from a previous visit to this page.
  onMount(async () => {
    await refresh();
    const saved = await loadSavedLiveEdits();
    if (saved.length > 0 && edits().length === 0) setSavedEdits(saved);
  });

  async function restoreSaved() {
    setRestoring(true);
    try {
      const result = await restoreSavedLiveEdits(savedEdits());
      setSavedEdits([]);
      await refresh();
      notify({
        title: `${result.applied} edit${result.applied === 1 ? '' : 's'} restored`,
        description:
          result.failed > 0
            ? `${result.failed} skipped — those elements no longer match.`
            : 'Saved for this page again after your next change.',
        tone: result.failed > 0 ? 'warning' : 'success',
      });
    } finally {
      setRestoring(false);
    }
  }

  async function discardSaved() {
    await clearSavedLiveEdits();
    setSavedEdits([]);
    notify({ title: 'Saved edits discarded', tone: 'neutral' });
  }

  async function apply() {
    const ref = target();
    const val = value().trim();
    if (!ref) {
      notify({ title: 'Lock an element first', tone: 'warning' });
      return;
    }
    if (!val) {
      notify({ title: 'Enter a value to apply', tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const result = await applyEdit(ref, property(), val);
      if (result.ok) {
        notify({ title: 'Edit applied — reload the page to revert', tone: 'success' });
        setEdits(result.edits);
        setSavedEdits([]);
        void persistLiveEdits(result.edits);
        setValue('');
      } else {
        notify({ title: 'Edit failed', description: result.error, tone: 'error' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string) {
    const result = await undoEdit(id);
    if (result.ok) {
      setEdits(result.edits);
      void persistLiveEdits(result.edits);
    }
  }

  async function reset() {
    const result = await clearEdits();
    notify({
      title: `${result.count} edit${result.count === 1 ? '' : 's'} reverted`,
      tone: 'success',
    });
    setSavedEdits([]);
    await clearSavedLiveEdits();
    await refresh();
  }

  return (
    <Panel
      id="live-editing"
      title="Live editing"
      subtitle="Try CSS changes on the locked element — a reload reverts them, but the session is saved so you can restore it."
      actions={
        <Show when={edits().length > 0}>
          <Button size="sm" variant="ghost" onClick={() => void reset()}>
            <RefreshCcw class="size-3.5" aria-hidden="true" />
            Reset all
          </Button>
        </Show>
      }
    >
      {/* Phase 9: a saved session from a previous visit to this page. */}
      <Show when={savedEdits().length > 0}>
        <div class="mb-3 flex flex-col gap-1.5 rounded-[var(--vq-radius-md)] border border-[var(--vq-accent-border)] bg-[var(--vq-accent-soft)] p-2.5">
          <p class="text-[11.5px] font-medium text-[var(--vq-fg)]">
            {savedEdits().length} saved edit{savedEdits().length === 1 ? '' : 's'} for this page
          </p>
          <p class="text-[10.5px] leading-relaxed text-[var(--vq-fg-muted)]">
            From your last visit — reloading reverted them. Restore to re-apply, or discard.
          </p>
          <div class="flex gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void restoreSaved()}
              disabled={restoring()}
            >
              {restoring() ? (
                <LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw class="size-3.5" aria-hidden="true" />
              )}
              {restoring() ? 'Restoring…' : 'Restore'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void discardSaved()}
              disabled={restoring()}
            >
              Discard
            </Button>
          </div>
        </div>
      </Show>
      <Show
        when={target()}
        fallback={
          <p class="px-2 py-4 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            Lock an element in the inspector to edit its styles.
          </p>
        }
      >
        <div class="mb-3 grid grid-cols-2 gap-1.5">
          <label class="flex flex-col gap-1">
            <span class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
              Property
            </span>
            <select
              value={property()}
              onChange={(e) => setProperty((e.target as HTMLSelectElement).value)}
              class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] focus:outline-none"
            >
              <For each={EDITABLE_PROPERTIES}>{(prop) => <option value={prop}>{prop}</option>}</For>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
              Value
            </span>
            <input
              type="text"
              value={value()}
              placeholder="e.g. #635bff"
              onInput={(e) => setValue((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void apply();
              }}
              class="h-8 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] focus:border-[var(--vq-accent)] focus:outline-none"
            />
          </label>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void apply()} disabled={busy()}>
          {busy() ? (
            <LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <PencilRuler class="size-3.5" aria-hidden="true" />
          )}
          Apply edit
        </Button>

        <Show when={edits().length > 0}>
          <p class="mb-1 mt-4 text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Session edits
          </p>
          <ul class="flex flex-col gap-1.5">
            <For each={edits()}>
              {(edit) => (
                <li class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-1.5">
                  <div class="min-w-0">
                    <p class="truncate font-mono text-[11px] text-[var(--vq-fg)]">
                      {edit.property}: <span class="text-[var(--vq-accent)]">{edit.value}</span>
                    </p>
                    <p class="truncate text-[10px] text-[var(--vq-fg-subtle)]">
                      was {edit.originalValue || '(unset)'}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="vq-icon-btn h-6 w-6 shrink-0"
                    aria-label={`Undo ${edit.property}`}
                    title="Undo this edit"
                    onClick={() => void undo(edit.id)}
                  >
                    <Undo2 class="size-3.5" />
                  </button>
                </li>
              )}
            </For>
          </ul>
          <p class="mt-2 text-[10.5px] text-[var(--vq-fg-subtle)]">
            Reloading the page restores the original styles — your session is kept for this page so
            you can restore it from here.
          </p>
        </Show>
      </Show>
    </Panel>
  );
}

/* ======================================================================== */
/* Export center (7.24)                                                      */
/* ======================================================================== */

function ExportCenter() {
  const [scope, setScope] = createSignal<ExportScope>('token');
  const [format, setFormat] = createSignal<ExportFormat>('css');
  const [output, setOutput] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [zipBytes, setZipBytes] = createSignal<Uint8Array | null>(null);

  const formats = createMemo(() => EXPORT_MATRIX[scope()]);

  const canExport = createMemo(() => {
    if (!analysis.inspection) return false;
    if (scope() === 'element' || scope() === 'component') return inspectorStore.inspection != null;
    return true;
  });

  async function run() {
    const inspection = analysis.inspection;
    if (!inspection) {
      notify({ title: 'Scan the page first', tone: 'warning' });
      return;
    }
    setError(null);
    setZipBytes(null);
    try {
      const element = inspectorStore.inspection ?? undefined;
      if ((scope() === 'element' || scope() === 'component') && !element) {
        setError('Lock an element in the inspector to export element or component code.');
        return;
      }
      if (scope() === 'project') {
        // Build once — the preview is a summary string, the bytes drive download.
        const { content, bytes } = buildProjectZip(inspection, element);
        setOutput(content);
        setZipBytes(bytes);
        return;
      }
      setOutput(renderExport(scope(), format(), { inspection, element }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The export could not be generated.');
      setOutput(null);
    }
  }

  function download() {
    if (scope() === 'project' && zipBytes()) {
      const blob = new Blob([zipBytes() as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'vizquo-project.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    if (output()) {
      downloadText(output() as string, filenameFor(scope(), format()), 'text/plain;charset=utf-8');
    }
  }

  return (
    <Panel
      id="export-center"
      title="Export center"
      subtitle="Generate tokens, component code, or a full project bundle — every format downloads as a real file."
      actions={
        <Show when={output() && canExport()}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copyText(output() as string, 'Export')}
          >
            <Clipboard class="size-3.5" aria-hidden="true" />
            Copy
          </Button>
        </Show>
      }
    >
      <Show
        when={analysis.inspection}
        fallback={
          <p class="px-2 py-4 text-center text-[12px] text-[var(--vq-fg-subtle)]">
            Scan the page to export its design tokens and components.
          </p>
        }
      >
        <fieldset class="mb-3 flex flex-wrap gap-1.5">
          <legend class="sr-only">Export scope</legend>
          <For each={Object.keys(EXPORT_MATRIX) as ExportScope[]}>
            {(option) => (
              <button
                type="button"
                class={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  scope() === option
                    ? 'border-[var(--vq-accent)] bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]'
                    : 'border-[var(--vq-border)] text-[var(--vq-fg-muted)] hover:border-[var(--vq-border-strong)]'
                }`}
                aria-pressed={scope() === option}
                onClick={() => {
                  setScope(option);
                  setFormat(EXPORT_MATRIX[option][0] ?? 'css');
                  setOutput(null);
                }}
              >
                {SCOPE_LABEL[option]}
              </button>
            )}
          </For>
        </fieldset>

        <fieldset class="mb-3 flex flex-wrap gap-1.5">
          <legend class="sr-only">Export format</legend>
          <For each={formats()}>
            {(option) => (
              <button
                type="button"
                class={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  format() === option
                    ? 'border-[var(--vq-accent)] bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]'
                    : 'border-[var(--vq-border)] text-[var(--vq-fg-muted)] hover:border-[var(--vq-border-strong)]'
                }`}
                aria-pressed={format() === option}
                onClick={() => {
                  setFormat(option);
                  setOutput(null);
                }}
              >
                {FORMAT_LABEL[option]}
              </button>
            )}
          </For>
        </fieldset>

        <Show when={scope() === 'project'}>
          <p class="mb-2 text-[11px] leading-snug text-[var(--vq-fg-muted)]">
            The project bundle contains every token format, the locked element as a React component,
            and a report of the page's design system.
          </p>
        </Show>

        <div class="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void run()}
            disabled={!canExport()}
            title={!canExport() ? 'Scan the page first' : undefined}
          >
            <Code2 class="size-3.5" aria-hidden="true" />
            Generate
          </Button>
          <Show when={output()}>
            <Button size="sm" variant="secondary" onClick={download}>
              <Download class="size-3.5" aria-hidden="true" />
              Download
            </Button>
          </Show>
        </div>

        <Show when={error()}>
          <p class="mt-2 text-[11px] text-[var(--vq-danger-fg)]" role="alert">
            {error()}
          </p>
        </Show>

        <Show when={output()}>
          {(out) => (
            <div class="mt-3 overflow-hidden rounded-[var(--vq-radius-md)] border border-[var(--vq-border)]">
              <div class="flex items-center gap-1.5 border-b border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2.5 py-1.5">
                <FileCode2 class="size-3 text-[var(--vq-fg-subtle)]" aria-hidden="true" />
                <span class="truncate font-mono text-[10.5px] text-[var(--vq-fg-subtle)]">
                  {filenameFor(scope(), format())}
                </span>
              </div>
              <pre class="max-h-56 overflow-auto bg-[var(--vq-bg-sunken)] p-2.5 text-[10.5px] leading-relaxed text-[var(--vq-fg)]">
                {scope() === 'project' ? out() : out().slice(0, 8000)}
              </pre>
            </div>
          )}
        </Show>

        <Show when={!canExport()}>
          <p class="mt-2 text-[11px] text-[var(--vq-warning-fg)]">
            Element and component exports need a locked element in the inspector.
          </p>
        </Show>
      </Show>
    </Panel>
  );
}

/* ======================================================================== */
/* Create panel                                                              */
/* ======================================================================== */

/** Create panel — screenshot studio, live editing, and the export center. */
export function CreatePanel() {
  const [recentlyScanned, setRecentlyScanned] = createSignal(false);

  async function runScan() {
    await scanPage();
    setRecentlyScanned(true);
    setTimeout(() => setRecentlyScanned(false), 4000);
  }

  return (
    <div class="flex flex-col gap-3 p-3">
      <div class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-lg)] border border-[var(--vq-border)] bg-[var(--vq-bg-raised)] px-3 py-2.5">
        <div class="min-w-0">
          <p class="text-[12.5px] font-semibold text-[var(--vq-fg)]">Create</p>
          <p class="truncate text-[11px] text-[var(--vq-fg-subtle)]">
            {analysis.inspection
              ? 'Screenshots, live edits, and exports for this page.'
              : 'Capture, edit, and export — scan the page to unlock token and component exports.'}
          </p>
        </div>
        <Button variant="primary" onClick={() => void runScan()} disabled={analysis.scanning}>
          <FolderArchive class="size-3.5" aria-hidden="true" />
          {analysis.scanning ? 'Scanning…' : recentlyScanned() ? 'Re-scan' : 'Scan page'}
        </Button>
      </div>

      <ScreenshotStudio />
      <LiveEditing />
      <ExportCenter />
    </div>
  );
}
