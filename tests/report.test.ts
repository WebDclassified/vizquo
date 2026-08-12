import { describe, expect, it } from 'vitest';
import { buildReportHtml } from '../export/report';
import { makeInspection } from './helpers/inspection';

describe('buildReportHtml (Phase 8, Section 7.25)', () => {
  it('produces a self-contained HTML document', () => {
    const html = buildReportHtml(makeInspection());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Design report — Example</title>');
    expect(html).toContain('<style>');
    // No external resources — fully self-contained: no stylesheet links, no
    // script/img sources, no @import, no external url() in styles.
    expect(html).not.toContain('rel="stylesheet"');
    expect(html).not.toContain('<script src');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('@import');
    expect(html).not.toMatch(/url\(/);
  });

  it('escapes untrusted page strings (no markup injection)', () => {
    const evil = makeInspection({
      page: { url: 'https://x.test/', title: '<script>alert(1)</script>', scannedAt: 1 },
      technologies: [
        { name: '"><img src=x onerror=alert(2)>', category: 'frontend', confidence: 'detected' },
      ],
    });
    const html = buildReportHtml(evil);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('includes colors, fonts, spacing, radius, shadows, components, findings', () => {
    const inspection = makeInspection({
      tokens: {
        colors: [
          {
            value: { hex: '#635bff', oklch: '', role: 'primary' },
            confidence: { level: 'detected' },
            usageCount: 42,
            usedBy: [],
          },
        ],
        fonts: [
          {
            value: { family: 'Inter', source: 'google', weight: 600 },
            confidence: { level: 'detected' },
            usageCount: 12,
            usedBy: [],
          },
        ],
        spacing: [{ value: 8, confidence: { level: 'detected' }, usageCount: 30, usedBy: [] }],
        radius: [{ value: 8, confidence: { level: 'detected' }, usageCount: 15, usedBy: [] }],
        shadows: [
          {
            value: '0 1px 2px rgba(0,0,0,0.1)',
            confidence: { level: 'detected' },
            usageCount: 5,
            usedBy: [],
          },
        ],
      },
      components: [
        {
          id: 'comp-1',
          type: 'button',
          instances: [],
          confidence: { level: 'inferred', score: 0.9 },
          variants: {},
        },
      ],
      findings: [
        {
          id: 'f-1',
          category: 'accessibility',
          severity: 'error',
          message: 'Low contrast',
        },
      ],
    });
    const html = buildReportHtml(inspection);
    expect(html).toContain('#635bff');
    expect(html).toContain('Inter');
    expect(html).toContain('>600<'); // font weight cell
    expect(html).toContain('8px');
    expect(html).toContain('button');
    expect(html).toContain('Low contrast');
    expect(html).toContain('88');
  });

  it('handles empty inspections gracefully', () => {
    const html = buildReportHtml(makeInspection());
    expect(html).toContain('No colors detected.');
    expect(html).toContain('No fonts detected.');
  });

  it('includes a self-contained print affordance (Phase 10)', () => {
    const html = buildReportHtml(makeInspection());
    // The print button is static markup with a fixed inline handler — no page
    // data flows into it, so escaping guarantees are unaffected.
    expect(html).toContain('Print / Save as PDF');
    expect(html).toContain('onclick="window.print()"');
    expect(html).toContain('@media print');
    // Still fully self-contained: no external resources, no script elements.
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/url\(/);
  });
});
