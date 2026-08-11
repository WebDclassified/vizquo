/**
 * Design report generator (Phase 8, Section 7.25).
 *
 * Produces a single self-contained HTML file from one Inspection:
 * - No external resources (fonts, CDNs, analytics) — works offline, leaks
 *   nothing about the user.
 * - Every page-derived string is HTML-escaped (all page content is untrusted,
 *   Section 4) — a malicious title/class can never inject markup into the
 *   report.
 * - Contains only the inspection's own data — no unrelated page data, no
 *   screenshots, no DOM dumps.
 *
 * Pure — unit-testable in Node.
 */
import type { Inspection } from '../shared/types';

function esc(value: string | number | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 24px 64px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 14px; line-height: 1.5;
    color: var(--fg); background: var(--bg);
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;
    margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border);
  }
  .meta { color: var(--muted); font-size: 12px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .card { border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
  .swatch { width: 100%; height: 28px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 6px; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
  .muted { color: var(--muted); font-size: 12px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid var(--border); margin-right: 6px; margin-bottom: 6px; }
  .score { font-size: 28px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .finding-error { border-left: 3px solid #e5484d; }
  .finding-warning { border-left: 3px solid #f5a524; }
  .finding-info { border-left: 3px solid #3b82f6; }
  .vq-print {
    position: fixed; top: 12px; right: 12px;
    font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
    color: var(--fg); background: var(--bg);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 7px 14px; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .vq-print:hover { border-color: var(--muted); }
  @media print {
    .vq-print { display: none; }
    body { padding: 0; }
    .card, tr { break-inside: avoid; }
    h2 { break-after: avoid; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #16171a; --fg: #e8e8ea; --muted: #9b9ba3; --border: #2e2f36; }
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #ffffff; --fg: #1b1c1e; --muted: #6a6b74; --border: #e3e4e8; }
  }
`;

function colorCards(inspection: Inspection): string {
  const colors = inspection.tokens.colors.slice(0, 60);
  if (colors.length === 0) return '<p class="muted">No colors detected.</p>';
  return `<div class="grid">${colors
    .map(
      (color) => `
      <div class="card">
        <div class="swatch" style="background:${esc(color.value.hex)}"></div>
        <div class="mono">${esc(color.value.hex)}</div>
        <div class="muted">${esc(color.value.role ?? '—')} · ${esc(color.usageCount)} uses</div>
      </div>`,
    )
    .join('')}</div>`;
}

function fontsTable(inspection: Inspection): string {
  const fonts = inspection.tokens.fonts.slice(0, 40);
  if (fonts.length === 0) return '<p class="muted">No fonts detected.</p>';
  return `<table><thead><tr><th>Family</th><th>Weight</th><th>Source</th><th>Uses</th></tr></thead>
  <tbody>${fonts
    .map(
      (font) => `
    <tr>
      <td>${esc(font.value.family)}</td>
      <td>${esc(font.value.weight)}</td>
      <td>${esc(font.value.source)}</td>
      <td>${esc(font.usageCount)}</td>
    </tr>`,
    )
    .join('')}</tbody></table>`;
}

function scaleCards(tokens: { value: number | string; usageCount: number }[]): string {
  if (tokens.length === 0) return '<p class="muted">None detected.</p>';
  return `<div class="grid">${tokens
    .slice(0, 40)
    .map(
      (token) => `
      <div class="card">
        <div class="mono">${esc(token.value)}${typeof token.value === 'number' ? 'px' : ''}</div>
        <div class="muted">${esc(token.usageCount)} uses</div>
      </div>`,
    )
    .join('')}</div>`;
}

function componentsTable(inspection: Inspection): string {
  const components = inspection.components.slice(0, 40);
  if (components.length === 0) return '<p class="muted">No recurring components detected.</p>';
  return `<table><thead><tr><th>Type</th><th>Instances</th><th>Confidence</th></tr></thead>
  <tbody>${components
    .map(
      (component) => `
    <tr>
      <td>${esc(component.type)}</td>
      <td>${esc(component.instances.length)}</td>
      <td>${esc(component.confidence.level)}${component.confidence.score != null ? ` (${Math.round(component.confidence.score * 100)}%)` : ''}</td>
    </tr>`,
    )
    .join('')}</tbody></table>`;
}

function findingsTable(inspection: Inspection): string {
  const findings = inspection.findings.slice(0, 80);
  if (findings.length === 0) return '<p class="muted">No findings.</p>';
  return `<table><thead><tr><th>Severity</th><th>Category</th><th>Finding</th></tr></thead>
  <tbody>${findings
    .map(
      (finding) => `
    <tr class="finding-${esc(finding.severity)}">
      <td class="muted">${esc(finding.severity)}</td>
      <td class="muted">${esc(finding.category)}</td>
      <td>${esc(finding.message)}</td>
    </tr>`,
    )
    .join('')}</tbody></table>`;
}

/**
 * Build the standalone report. Every page-derived value is escaped — the
 * output is safe to open or share as a file.
 */
export function buildReportHtml(inspection: Inspection): string {
  const { page } = inspection;
  const techBadges = inspection.technologies
    .map((tech) => `<span class="badge">${esc(tech.name)}</span>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design report — ${esc(page.title)}</title>
<style>${STYLES}</style>
</head>
<body>
  <h1>Design report</h1>
  <p class="meta">
    ${esc(page.title || page.url)} · ${esc(page.url)}<br>
    Scanned ${formatDate(page.scannedAt)} · ${esc(inspection.scannedElementCount)} elements · ${esc(inspection.scanDurationMs / 1000)}s
  </p>

  <!-- Static markup only — the inline handler prints the document. -->
  <button type="button" class="vq-print" onclick="window.print()">Print / Save as PDF</button>

  <div class="card" style="max-width: 320px">
    <div class="muted">Design consistency</div>
    <div class="score">${esc(inspection.consistencyScore)}<span class="muted" style="font-size:14px"> / 100</span></div>
  </div>

  <h2>Colors</h2>
  ${colorCards(inspection)}

  <h2>Typography</h2>
  ${fontsTable(inspection)}
  ${scaleCards(
    inspection.typeStyles.map((t) => ({
      value: `${t.family} ${t.size}/${t.lineHeight} ${t.weight}`,
      usageCount: t.usageCount,
    })),
  )}

  <h2>Spacing</h2>
  ${scaleCards(inspection.tokens.spacing)}

  <h2>Radius</h2>
  ${scaleCards(inspection.tokens.radius)}

  <h2>Shadows</h2>
  ${scaleCards(inspection.tokens.shadows)}

  <h2>Components</h2>
  ${componentsTable(inspection)}

  <h2>Technology</h2>
  <p>${techBadges || '<span class="muted">No technology markers detected.</span>'}</p>

  <h2>Findings</h2>
  ${findingsTable(inspection)}

  <p class="meta" style="margin-top:32px">
    Generated by Vizquo — a design-intelligence layer for the web. No page data beyond this report is included.
  </p>
</body>
</html>`;
}
