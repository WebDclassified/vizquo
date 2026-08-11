/**
 * Reports tab (Phase 8, Section 7.25) — generate a standalone, sanitized HTML
 * design report from any stored (or live) inspection. The report is
 * self-contained (no external resources), previewed in a sandboxed iframe and
 * downloadable as a real file.
 */
import { ExternalLink, FileDown, FileText } from 'lucide-solid';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { buildReportHtml } from '../../../../../export/report';
import { Badge } from '../../../../components/Badge';
import { Button } from '../../../../components/Button';
import { Panel } from '../../../../components/Panel';
import { downloadText } from '../../create/create-client';
import { allCandidates, useHistoryCandidates } from './candidates';

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'report'
  );
}

export function ReportsTab() {
  const history = useHistoryCandidates();
  const candidates = allCandidates(history);
  const [selected, setSelected] = createSignal('');

  createEffect(() => {
    const list = candidates();
    if (list.length === 0) return;
    if (!list.some((c) => c.id === selected())) setSelected(list[0]?.id ?? '');
  });

  const report = createMemo(() => {
    const choice = candidates().find((c) => c.id === selected());
    if (!choice) return null;
    return { label: choice.label, html: buildReportHtml(choice.inspection) };
  });

  function download() {
    const current = report();
    if (!current) return;
    downloadText(current.html, `vizquo-report-${slugify(current.label)}.html`, 'text/html');
  }

  // The sandboxed iframe above cannot run the report's print handler, so the
  // report also opens in its own tab — its Print / Save as PDF button lives
  // there (export/report.ts).
  function openInTab() {
    const current = report();
    if (!current) return;
    const blob = new Blob([current.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div class="flex flex-col gap-3">
      <Panel
        title="Design reports"
        subtitle="Self-contained HTML — open it anywhere, no page data leaks"
        actions={
          <Badge tone="neutral">
            <FileText class="size-3" />
            {candidates().length} scans
          </Badge>
        }
      >
        <Show
          when={candidates().length > 0}
          fallback={
            <p class="px-2 py-5 text-center text-[12px] text-[var(--vq-fg-subtle)]">
              No scans yet — scan a page, then generate its design report here.
            </p>
          }
        >
          <div class="flex flex-wrap items-center gap-1.5">
            <label class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="text-[10px] font-semibold tracking-wider text-[var(--vq-fg-subtle)] uppercase">
                Inspection
              </span>
              <select
                value={selected()}
                onChange={(e) => setSelected((e.target as HTMLSelectElement).value)}
                class="h-8 w-full rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2 text-[12px] text-[var(--vq-fg)] focus:outline-none"
              >
                <For each={candidates()}>{(c) => <option value={c.id}>{c.label}</option>}</For>
              </select>
            </label>
            <Button
              size="sm"
              variant="secondary"
              onClick={openInTab}
              disabled={!report()}
              class="mt-4"
              title="Opens the report with its Print / Save as PDF button"
            >
              <ExternalLink class="size-3.5" />
              Open &amp; print
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={download}
              disabled={!report()}
              class="mt-4"
            >
              <FileDown class="size-3.5" />
              Download .html
            </Button>
          </div>

          <Show
            when={report()}
            fallback={
              <p class="px-2 py-4 text-[11.5px] text-[var(--vq-fg-subtle)]">
                Pick an inspection to preview its report.
              </p>
            }
          >
            {(current) => (
              <div class="mt-3 overflow-hidden rounded-[var(--vq-radius-md)] border border-[var(--vq-border)]">
                <p class="truncate border-b border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2.5 py-1.5 text-[10.5px] text-[var(--vq-fg-subtle)]">
                  Preview — {current().label}
                </p>
                {/* Sandboxed: the report is generated HTML with no scripts; the
                    sandbox keeps even unexpected content inert. */}
                <iframe
                  title={`Design report — ${current().label}`}
                  sandbox=""
                  srcdoc={current().html}
                  class="h-72 w-full bg-white"
                />
              </div>
            )}
          </Show>
        </Show>
      </Panel>
    </div>
  );
}
