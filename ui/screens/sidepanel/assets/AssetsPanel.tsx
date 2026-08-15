import {
  Archive,
  Check,
  ExternalLink,
  FileAudio,
  FileImage,
  FileJson,
  FileType2,
  FileVideo,
  FolderOpen,
  Link2,
  ScanSearch,
  Square,
  TriangleAlert,
  X,
} from 'lucide-solid';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { sanitizeSvgContent } from '../../../../engine/dom/svg';
import type { Asset, AssetIssue, AssetType } from '../../../../shared/types';
import { Badge, type BadgeTone } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';
import { notify } from '../../../stores/toast';
import { cancelScan, scanPage } from '../design/scan-client';
import {
  copyText,
  downloadBlob,
  exportAssets,
  fetchAssetSvg,
  highlightAssetRefs,
} from './assets-client';
import { SvgInspector } from './SvgInspector';

type FilterId = 'all' | AssetType;

const FILTERS: { id: FilterId; label: string; icon: typeof FileImage }[] = [
  { id: 'all', label: 'All', icon: FolderOpen },
  { id: 'image', label: 'Images', icon: FileImage },
  { id: 'svg', label: 'SVGs', icon: FileType2 },
  { id: 'video', label: 'Video', icon: FileVideo },
  { id: 'audio', label: 'Audio', icon: FileAudio },
  { id: 'lottie', label: 'Lottie', icon: FileJson },
];

const TYPE_TONE: Record<AssetType, BadgeTone> = {
  image: 'info',
  svg: 'accent',
  video: 'warning',
  audio: 'warning',
  lottie: 'accent',
  font: 'info',
};

const SOURCE_LABEL: Record<Asset['source'], string> = {
  img: '<img>',
  picture: '<picture>',
  'css-background': 'CSS background',
  'inline-svg': 'Inline <svg>',
  'svg-use': '<use> sprite',
  video: '<video>',
  audio: '<audio>',
  lottie: 'Lottie player',
  favicon: 'Favicon',
  'og-image': 'Open Graph',
  'font-face': '@font-face',
};

const ISSUE_TONE: Record<AssetIssue['kind'], BadgeTone> = {
  oversized: 'warning',
  'low-res': 'warning',
  'large-file': 'warning',
  'wrong-format': 'info',
};

function dimsLabel(asset: Asset): string {
  const [rw, rh] = asset.renderedDims ?? [undefined, undefined];
  const [nw, nh] = asset.naturalDims ?? [undefined, undefined];
  const rendered = rw != null && rh != null ? `${rw}×${rh}` : null;
  const natural = nw != null && nh != null ? `${nw}×${nh}` : null;
  if (rendered && natural && rendered !== natural) return `${rendered} (src ${natural})`;
  return rendered ?? natural ?? 'dimensions unknown';
}

function AssetPreview({ asset }: { asset: Asset }) {
  if (asset.type === 'svg' && asset.svg?.content) {
    // The SVG is untrusted page content — render it into the shadow DOM so it
    // can never touch Vizquo's own document (Section 4 security).
    return (
      <div
        class="flex h-20 w-full items-center justify-center bg-[var(--vq-bg-sunken)]"
        ref={(el) => {
          const host = el as HTMLDivElement;
          const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
          // Page SVG is untrusted: sanitized first (event handlers / scripts
          // would otherwise execute in this extension page — shadow DOM does
          // not isolate scripts, only styles and the tree).
          shadow.innerHTML = sanitizeSvgContent(asset.svg?.content ?? '');
        }}
      />
    );
  }
  if (asset.type === 'image') {
    return (
      <div class="flex h-20 w-full items-center justify-center overflow-hidden bg-[var(--vq-bg-sunken)]">
        <img
          src={asset.url}
          alt={asset.alt ?? 'Extracted page image'}
          class="max-h-full max-w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div class="flex h-20 w-full items-center justify-center bg-[var(--vq-bg-sunken)] text-[var(--vq-fg-subtle)]">
      {asset.type === 'video' || asset.type === 'audio' ? 'media' : asset.type}
    </div>
  );
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Detail drawer for non-SVG assets — surfaces what the extractor collected
 * (alt, loading, file size, srcset, classification, issue messages) so a
 * flagged asset is never a dead end (product law #3). SVGs get the dedicated
 * SvgInspector instead.
 */
function AssetDetail(props: {
  asset: Asset;
  onClose: () => void;
  onHighlight: () => void;
  onCopyUrl: () => void;
  onOpenUrl: () => void;
}) {
  const { asset } = props;
  const [nw, nh] = asset.naturalDims ?? [undefined, undefined];
  const [rw, rh] = asset.renderedDims ?? [undefined, undefined];
  return (
    <div class="flex flex-col">
      <header class="flex items-center justify-between gap-2 border-b border-[var(--vq-border)] px-3 py-2">
        <div class="flex min-w-0 items-center gap-2">
          <h2 class="truncate text-[12px] font-semibold text-[var(--vq-fg)]">Asset details</h2>
          <Badge tone={TYPE_TONE[asset.type]} class="shrink-0 text-[9px]">
            {asset.type}
          </Badge>
          {asset.classification && (
            <Badge tone="neutral" class="shrink-0 text-[9px]">
              {asset.classification.label}
            </Badge>
          )}
        </div>
        <button
          type="button"
          class="vq-icon-btn"
          aria-label="Close details"
          onClick={props.onClose}
        >
          <X class="size-4" />
        </button>
      </header>

      <div class="p-3">
        <AssetPreview asset={asset} />
      </div>

      <dl class="flex flex-col border-b border-[var(--vq-border)] px-3 py-1.5">
        <MetaRow label="Source" value={SOURCE_LABEL[asset.source]} />
        <MetaRow label="URL" value={asset.url} />
        <MetaRow label="Rendered" value={rw != null && rh != null ? `${rw}×${rh} px` : 'Unknown'} />
        <MetaRow label="Natural" value={nw != null && nh != null ? `${nw}×${nh} px` : 'Unknown'} />
        <MetaRow label="File size" value={formatBytes(asset.fileSize)} />
        <MetaRow label="Alt text" value={asset.alt ?? 'None'} />
        <MetaRow label="Loading" value={asset.loading ?? 'eager'} />
        <MetaRow
          label="Srcset variants"
          value={asset.srcset?.length ? `${asset.srcset.length}` : 'None'}
        />
        {asset.classification && (
          <MetaRow
            label="Classification"
            value={`${asset.classification.label} — ${Math.round((asset.classification.confidence.score ?? 0) * 100)}% ${asset.classification.confidence.level}`}
          />
        )}
      </dl>

      <Show when={asset.issues && asset.issues.length > 0}>
        <div class="flex flex-col gap-1.5 border-b border-[var(--vq-border)] px-3 py-2.5">
          <p class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Flagged issues
          </p>
          <For each={asset.issues ?? []}>
            {(issue) => (
              <div class="flex items-start gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2.5 py-1.5">
                <TriangleAlert
                  class="mt-0.5 size-3.5 shrink-0 text-[var(--vq-warning-fg)]"
                  aria-hidden="true"
                />
                <div class="min-w-0">
                  <Badge tone={ISSUE_TONE[issue.kind]} class="mb-0.5 text-[8.5px]">
                    {issue.kind}
                  </Badge>
                  <p class="text-[11px] leading-snug text-[var(--vq-fg-muted)]">{issue.message}</p>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <footer class="flex flex-wrap items-center gap-1.5 border-t border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-3 py-2">
        <button
          type="button"
          class="vq-btn-secondary vq-btn-sm"
          onClick={() => void props.onHighlight()}
        >
          <ScanSearch class="size-3.5" aria-hidden="true" />
          Highlight on page
        </button>
        <button
          type="button"
          class="vq-btn-secondary vq-btn-sm"
          onClick={() => void props.onCopyUrl()}
        >
          <Link2 class="size-3.5" aria-hidden="true" />
          Copy URL
        </button>
        <button
          type="button"
          class="vq-btn-secondary vq-btn-sm"
          onClick={props.onOpenUrl}
          disabled={asset.url.startsWith('data:')}
          title={
            asset.url.startsWith('data:')
              ? 'Inline assets have no external URL'
              : 'Open the asset URL'
          }
        >
          <ExternalLink class="size-3.5" aria-hidden="true" />
          Open
        </button>
      </footer>
    </div>
  );
}

/** One row of an asset detail list. */
function MetaRow(props: { label: string; value: string }) {
  return (
    <div class="flex items-start justify-between gap-3 px-0 py-1">
      <dt class="shrink-0 text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
        {props.label}
      </dt>
      <dd class="min-w-0 truncate text-right font-mono text-[11px] text-[var(--vq-fg)]">
        {props.value}
      </dd>
    </div>
  );
}

function AssetCard(props: {
  asset: Asset;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { asset } = props;
  return (
    <div
      class={`group flex flex-col overflow-hidden rounded-[var(--vq-radius-md)] border transition-colors ${
        props.selected
          ? 'border-[var(--vq-accent)] bg-[var(--vq-accent-soft)]'
          : 'border-[var(--vq-border)] bg-[var(--vq-bg)] hover:border-[var(--vq-border-strong)]'
      }`}
    >
      <button
        type="button"
        class="relative block w-full cursor-pointer text-left"
        onClick={() => props.onOpen(asset.id)}
        aria-label={`Open ${asset.url}`}
      >
        <AssetPreview asset={asset} />
        <Show when={(asset.issues?.length ?? 0) > 0}>
          <span class="absolute right-1 top-1 rounded-full bg-[var(--vq-warning-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--vq-warning-fg)]">
            {asset.issues?.length} issue{asset.issues?.length === 1 ? '' : 's'}
          </span>
        </Show>
      </button>
      <div class="flex items-center gap-1.5 px-2 py-1.5">
        <label
          class={`flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[var(--vq-radius-sm)] border transition-colors ${
            props.selected
              ? 'border-[var(--vq-accent)] bg-[var(--vq-accent)] text-white'
              : 'border-[var(--vq-border-strong)] bg-transparent hover:border-[var(--vq-accent)]'
          }`}
        >
          <input
            type="checkbox"
            checked={props.selected}
            aria-label={`Select ${asset.url}`}
            onChange={(e) => {
              e.stopPropagation();
              props.onToggle(asset.id);
            }}
            class="peer sr-only"
          />
          <Show when={props.selected}>
            <Check class="size-3 pointer-events-none" />
          </Show>
        </label>
        <span class="min-w-0 flex-1 truncate text-[11px] text-[var(--vq-fg)]">
          {dimsLabel(asset)}
        </span>
        <Badge tone={TYPE_TONE[asset.type]} class="shrink-0 text-[9px]">
          {asset.type}
        </Badge>
      </div>
    </div>
  );
}

export function AssetsPanel() {
  const [filter, setFilter] = createSignal<FilterId>('all');
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [exporting, setExporting] = createSignal(false);
  const [openId, setOpenId] = createSignal<string | null>(null);
  const [recentlyScanned, setRecentlyScanned] = createSignal(false);

  const assets = (): Asset[] => analysis.inspection?.assets ?? [];
  const filtered = createMemo(() => {
    const f = filter();
    return f === 'all' ? assets() : assets().filter((a) => a.type === f);
  });

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (): void => {
    setSelected(new Set(filtered().map((a) => a.id)));
  };
  const selectVisible = (): void => {
    setSelected(new Set(assets().map((a) => a.id)));
  };
  const clearSelection = (): void => {
    setSelected(new Set<string>());
  };

  async function runScan() {
    await scanPage();
    setRecentlyScanned(true);
    setTimeout(() => setRecentlyScanned(false), 4000);
  }

  /** Export a concrete list of assets (shared by selection + by-type export). */
  async function exportList(chosen: Asset[]) {
    if (chosen.length === 0) {
      notify({
        title: 'Nothing to export',
        description: 'Select assets first.',
        tone: 'warning',
      });
      return;
    }
    setExporting(true);
    try {
      const result = await exportAssets(chosen);
      if (!result) return;
      if (result.ok) {
        notify({
          title: `${result.downloaded} assets exported as vizquo-assets.zip`,
          description:
            result.failures.length > 0
              ? `${result.failures.length} blocked by CORS — listed in metadata.json.`
              : 'metadata.json documents every asset.',
          tone: result.failures.length > 0 ? 'warning' : 'success',
        });
      } else {
        notify({ title: 'Export failed', description: result.error, tone: 'error' });
      }
    } finally {
      setExporting(false);
    }
  }

  async function runExport() {
    await exportList(assets().filter((a) => selected().has(a.id)));
  }

  // Phase 10: one-click "export everything of this type" — no checkbox dance.
  const filterLabel = () => FILTERS.find((f) => f.id === filter())?.label ?? 'assets';
  async function exportFiltered() {
    await exportList(filtered());
  }

  const openAsset = (id: string): void => {
    const asset = assets().find((a) => a.id === id);
    if (asset) setOpenId(id);
  };
  const highlightFromDetail = (id: string): void => {
    const asset = assets().find((a) => a.id === id);
    if (asset) void highlightAssetRefs(asset);
    setOpenId(null);
  };

  const openInNewTab = (asset: Asset): void => {
    window.open(asset.url, '_blank', 'noopener');
  };

  const downloadSingle = async (asset: Asset): Promise<void> => {
    if (asset.svg?.content) {
      downloadBlob(new Blob([asset.svg.content], { type: 'image/svg+xml' }), `${asset.id}.svg`);
      return;
    }
    const result = await fetchAssetSvg(asset.url);
    if (result.ok) {
      downloadBlob(new Blob([result.content], { type: 'image/svg+xml' }), `${asset.id}.svg`);
    } else {
      notify({ title: 'Could not download', description: result.error, tone: 'warning' });
    }
  };

  return (
    <div class="flex flex-col gap-3 p-3">
      {/* Scan hero — same one-click action as Design, fills this panel. */}
      <div class="flex items-center justify-between gap-2 rounded-[var(--vq-radius-lg)] border border-[var(--vq-border)] bg-[var(--vq-bg-raised)] px-3 py-2.5">
        <div class="min-w-0">
          <p class="text-[12.5px] font-semibold text-[var(--vq-fg)]">Asset extractor</p>
          <p class="truncate text-[11px] text-[var(--vq-fg-subtle)]">
            {analysis.scanning
              ? 'Scanning — assets land after colors, type, and spacing.'
              : analysis.inspection
                ? `${assets().length} assets found. Select and export as a ZIP.`
                : 'Scan the page to extract every image, SVG, and media asset.'}
          </p>
        </div>
        <Show
          when={analysis.scanning}
          fallback={
            <Button variant="primary" onClick={() => void runScan()}>
              <ScanSearch class="size-3.5" aria-hidden="true" />
              {recentlyScanned() ? 'Re-scan' : 'Scan page'}
            </Button>
          }
        >
          <Button variant="secondary" onClick={() => void cancelScan()} title="Stop the scan">
            <Square class="size-3.5" aria-hidden="true" />
            Cancel scan
          </Button>
        </Show>
      </div>
      <Show when={analysis.scanError}>
        {(error) => (
          <div
            role="alert"
            class="flex items-start gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-danger-border)] bg-[var(--vq-danger-soft)] px-3 py-2 text-[11.5px] text-[var(--vq-danger-fg)]"
          >
            <TriangleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{error()}</span>
          </div>
        )}
      </Show>{' '}
      <Show
        when={assets().length > 0}
        fallback={
          <Panel
            id="assets-empty"
            title="Asset extractor"
            subtitle="What this panel shows"
            bodyClass="p-4"
          >
            <p class="text-[12px] leading-relaxed text-[var(--vq-fg-muted)]">
              No assets extracted yet. Scan the page to list every{' '}
              <code class="font-mono text-[11px]">&lt;img&gt;</code>, CSS background, inline SVG,
              sprite, video, audio, Lottie player, favicon, and Open Graph image — with natural and
              rendered dimensions, alt text, lazy state, classification, and issue flags. Assets
              blocked by CORS during export are reported in{' '}
              <code class="font-mono text-[11px]">metadata.json</code>, never silently dropped.
            </p>
          </Panel>
        }
      >
        {/* Honesty: extraction caps at 500 and reports truncation (Section 4). */}
        <Show when={analysis.inspection?.truncated}>
          <p class="text-[11px] text-[var(--vq-warning-fg)]">
            The page had more than 500 extractable assets — showing the first 500.
          </p>
        </Show>
        {/* Type filters */}
        <fieldset class="flex flex-wrap items-center gap-1">
          <legend class="sr-only">Filter assets by type</legend>
          <For each={FILTERS}>
            {(f) => {
              const Icon = f.icon;
              return (
                <button
                  type="button"
                  class={`flex items-center gap-1.5 rounded-[var(--vq-radius-md)] px-2 py-1 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--vq-ring)] ${
                    filter() === f.id
                      ? 'bg-[var(--vq-accent-soft)] text-[var(--vq-accent)]'
                      : 'text-[var(--vq-fg-muted)] hover:bg-[var(--vq-bg-hover)] hover:text-[var(--vq-fg)]'
                  }`}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter() === f.id}
                >
                  <Icon class="size-3.5" aria-hidden="true" />
                  {f.label}
                  <span class="tabular-nums opacity-70">
                    {f.id === 'all'
                      ? assets().length
                      : assets().filter((a) => a.type === f.id).length}
                  </span>
                </button>
              );
            }}
          </For>
        </fieldset>

        {/* Selection toolbar */}
        <div class="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={selectAll}
            title="Select all visible in the current filter"
          >
            Select all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={selectVisible}
            title="Select every extracted asset"
          >
            Select all assets
          </Button>
          <Show when={selected().size > 0}>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Clear ({selected().size})
            </Button>
          </Show>
          <div class="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={exporting() || filtered().length === 0}
              onClick={() => void exportFiltered()}
              title={`Download every ${filterLabel().toLowerCase()} asset as a ZIP`}
            >
              <Archive class="size-3.5" aria-hidden="true" />
              Export all {filterLabel()}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={exporting() || selected().size === 0}
              onClick={() => void runExport()}
              title="Download the selected assets as vizquo-assets.zip"
            >
              <Archive class="size-3.5" aria-hidden="true" />
              {exporting()
                ? 'Packing…'
                : `Export ZIP${selected().size > 0 ? ` (${selected().size})` : ''}`}
            </Button>
          </div>
        </div>

        {/* Asset grid */}
        <Show
          when={filtered().length > 0}
          fallback={
            <p class="px-2 py-6 text-center text-[12px] text-[var(--vq-fg-subtle)]">
              No {filter()} assets on this page.
            </p>
          }
        >
          <div class="grid grid-cols-2 gap-2">
            <For each={filtered()}>
              {(asset) => (
                <AssetCard
                  asset={asset}
                  selected={selected().has(asset.id)}
                  onToggle={toggle}
                  onOpen={openAsset}
                />
              )}
            </For>
          </div>
        </Show>

        {/* Asset detail — SVG inspector for SVGs, metadata + issues for the rest. */}
        <Show when={openId() != null}>
          {(() => {
            const asset = assets().find((a) => a.id === openId());
            if (!asset) return null;
            const detail = asset.svg ? (
              <SvgInspector
                asset={asset}
                onClose={() => setOpenId(null)}
                onDownload={() => void downloadSingle(asset)}
                onCopySvg={async () => {
                  const fetched =
                    asset.svg?.content != null
                      ? { ok: true as const, content: asset.svg.content }
                      : await fetchAssetSvg(asset.url);
                  if (fetched.ok) await copyText(fetched.content, 'SVG');
                  else
                    notify({
                      title: 'Could not copy',
                      description: fetched.error,
                      tone: 'warning',
                    });
                }}
                onOpenUrl={() => openInNewTab(asset)}
                onCopyUrl={() => void copyText(asset.url, 'Asset URL')}
              />
            ) : (
              <AssetDetail
                asset={asset}
                onClose={() => setOpenId(null)}
                onHighlight={() => void highlightFromDetail(asset.id)}
                onCopyUrl={() => void copyText(asset.url, 'Asset URL')}
                onOpenUrl={() => openInNewTab(asset)}
              />
            );
            return (
              <div class="vq-overlay fixed inset-0 z-[140] flex items-end justify-center p-3 sm:items-center">
                <div class="vq-float max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-[var(--vq-radius-lg)]">
                  {detail}
                </div>
              </div>
            );
          })()}
        </Show>
      </Show>
    </div>
  );
}
