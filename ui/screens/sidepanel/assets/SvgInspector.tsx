import { Code2, Copy, Download, ExternalLink, FileCode2, Link2, X } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import { sanitizeSvgContent } from '../../../../engine/dom/svg';
import { svgToReact } from '../../../../export/svg-react';
import type { Asset } from '../../../../shared/types';
import { Badge } from '../../../components/Badge';
import { ConfidenceBadge } from '../../../components/ConfidenceBadge';
import { copyText } from './assets-client';

interface SvgInspectorProps {
  asset: Asset;
  onClose: () => void;
  onDownload: () => void;
  onCopySvg: () => void;
  onOpenUrl: () => void;
  onCopyUrl: () => void;
}

function MetaRow(props: { label: string; value?: string }) {
  return (
    <div class="flex items-center justify-between gap-2 px-3 py-1">
      <dt class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
        {props.label}
      </dt>
      <dd class="truncate font-mono text-[11px] text-[var(--vq-fg)]">{props.value ?? 'Unknown'}</dd>
    </div>
  );
}

function StatChip(props: { label: string; value: number }) {
  return (
    <div class="flex flex-col items-center rounded-[var(--vq-radius-md)] bg-[var(--vq-bg-sunken)] px-2 py-1.5">
      <span class="text-[13px] font-semibold tabular-nums text-[var(--vq-fg)]">{props.value}</span>
      <span class="text-[9.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
        {props.label}
      </span>
    </div>
  );
}

export function SvgInspector(props: SvgInspectorProps) {
  const asset = () => props.asset;
  const svg = () => asset().svg;
  const [reactSource, setReactSource] = createSignal<string | null>(null);
  const [convertError, setConvertError] = createSignal<string | null>(null);

  function generateReact() {
    const content = svg()?.content;
    if (!content) {
      setConvertError('This SVG has no captured source to convert.');
      return;
    }
    try {
      setReactSource(svgToReact(content));
      setConvertError(null);
    } catch (error) {
      setReactSource(null);
      setConvertError(error instanceof Error ? error.message : 'Could not convert this SVG.');
    }
  }

  return (
    <div class="flex flex-col">
      <header class="flex items-center justify-between gap-2 border-b border-[var(--vq-border)] px-3 py-2">
        <div class="flex min-w-0 items-center gap-2">
          <h2 class="truncate text-[12px] font-semibold text-[var(--vq-fg)]">SVG inspector</h2>
          <ConfidenceBadge level="detected" class="shrink-0 text-[9px]" />
        </div>
        <button
          type="button"
          class="vq-icon-btn"
          aria-label="Close inspector"
          onClick={props.onClose}
        >
          <X class="size-4" />
        </button>
      </header>

      {/* Live preview in shadow DOM — SVG sanitized first: event handlers
          would execute in this extension page (shadow DOM isolates styles
          and the tree, never scripts). */}
      <div
        class="flex h-32 items-center justify-center bg-[var(--vq-bg-sunken)]"
        ref={(el) => {
          const host = el as HTMLDivElement;
          const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
          shadow.innerHTML = sanitizeSvgContent(svg()?.content ?? '');
        }}
      />

      <dl class="flex flex-col border-b border-[var(--vq-border)] py-1.5">
        <MetaRow label="ViewBox" value={svg()?.viewBox} />
        <MetaRow
          label="Width / height"
          value={svg()?.width ? `${svg()?.width} × ${svg()?.height ?? 'auto'}` : svg()?.height}
        />
        <MetaRow label="Source" value={asset().source} />
        <MetaRow
          label="URL"
          value={asset().url.startsWith('data:') ? 'inline SVG (data URL)' : asset().url}
        />
      </dl>

      <div class="grid grid-cols-4 gap-1.5 px-3 py-2">
        <StatChip label="Paths" value={svg()?.pathCount ?? 0} />
        <StatChip label="Fills" value={svg()?.fillColors.length ?? 0} />
        <StatChip label="Strokes" value={svg()?.strokeColors.length ?? 0} />
        <StatChip label="Classes" value={svg()?.classes.length ?? 0} />
      </div>

      <Show when={(svg()?.fillColors.length ?? 0) > 0}>
        <div class="border-t border-[var(--vq-border)] px-3 py-2">
          <p class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Fill colors
          </p>
          <div class="mt-1 flex flex-wrap gap-1">
            <For each={svg()?.fillColors ?? []}>
              {(fill) => (
                <span
                  class="inline-flex items-center gap-1 rounded-[var(--vq-radius-sm)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--vq-fg-muted)]"
                  title={fill}
                >
                  <span
                    class="h-2.5 w-2.5 rounded-full border border-black/10"
                    style={{ background: fill }}
                  />
                  {fill}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={(svg()?.ids.length ?? 0) > 0}>
        <div class="border-t border-[var(--vq-border)] px-3 py-2">
          <p class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Element ids
          </p>
          <div class="mt-1 flex flex-wrap gap-1">
            <For each={svg()?.ids ?? []}>
              {(id) => (
                <Badge tone="neutral" class="font-mono text-[9.5px]">
                  #{id}
                </Badge>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Convert to React */}
      <div class="border-t border-[var(--vq-border)] px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[10.5px] tracking-wider text-[var(--vq-fg-subtle)] uppercase">
            Generate React component
          </p>
          <button
            type="button"
            class="vq-icon-btn h-6 w-6"
            aria-label="Convert SVG to a React component"
            title="Convert to JSX"
            onClick={generateReact}
          >
            <Code2 class="size-3.5" />
          </button>
        </div>
        <Show when={convertError()}>
          <p class="mt-1 text-[11px] text-[var(--vq-warning-fg)]">{convertError()}</p>
        </Show>
        <Show when={reactSource()}>
          <pre class="mt-2 max-h-44 overflow-auto rounded-[var(--vq-radius-md)] bg-[var(--vq-bg-sunken)] p-2 font-mono text-[10px] leading-relaxed text-[var(--vq-fg)]">
            {reactSource()}
          </pre>
          <button
            type="button"
            class="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--vq-accent)] hover:underline"
            onClick={() => {
              const source = reactSource();
              if (source) void copyText(source, 'React component');
            }}
          >
            <Copy class="size-3" aria-hidden="true" />
            Copy component
          </button>
        </Show>
      </div>

      {/* Actions — no dead ends (product law #3). */}
      <footer class="flex flex-wrap items-center gap-1.5 border-t border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-3 py-2">
        <button
          type="button"
          class="vq-btn-secondary vq-btn-sm"
          onClick={() => void props.onCopySvg()}
        >
          <Copy class="size-3.5" aria-hidden="true" />
          Copy SVG
        </button>
        <button type="button" class="vq-btn-secondary vq-btn-sm" onClick={() => props.onDownload()}>
          <Download class="size-3.5" aria-hidden="true" />
          Download
        </button>
        <button
          type="button"
          class="vq-btn-secondary vq-btn-sm"
          onClick={() => void props.onCopyUrl()}
          disabled={asset().url.startsWith('data:')}
          title={
            asset().url.startsWith('data:')
              ? 'Inline SVGs have no external URL'
              : 'Copy the asset URL'
          }
        >
          <Link2 class="size-3.5" aria-hidden="true" />
          Copy URL
        </button>
        <button
          type="button"
          class="vq-btn-secondary vq-btn-sm"
          onClick={props.onOpenUrl}
          disabled={asset().url.startsWith('data:')}
          title={
            asset().url.startsWith('data:')
              ? 'Inline SVGs have no external URL'
              : 'Open the asset URL'
          }
        >
          <ExternalLink class="size-3.5" aria-hidden="true" />
          Open
        </button>
        <span class="ml-auto text-[10px] text-[var(--vq-fg-subtle)]">
          <FileCode2 class="mr-0.5 inline size-3" aria-hidden="true" />
          {svg()?.content.length ?? 0} chars
        </span>
      </footer>
    </div>
  );
}
