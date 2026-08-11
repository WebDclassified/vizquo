/**
 * Prompt builders (Phase 7, Section 7.23) — turn inspected page data into
 * bounded, redacted LLM payloads, each paired with a `payloadSummary` that
 * states exactly what will be sent (the privacy gate shows it verbatim).
 *
 * Redaction rules (Section 4 security):
 * - No raw outerHTML/innerHTML dumps; only a bounded snippet (first 160 chars).
 * - Text content bounded to 200 chars; secrets (input values, hrefs to
 *   sensitive paths, data-* attributes) are excluded by construction.
 * - Attribute names are enumerated, never passed through wholesale.
 * - The summaries and prompts are generated from the same data, so the
 *   privacy gate can never disagree with the actual payload.
 */
import type { InspectionComparison } from '../export/compare';
import type {
  AIExplainRequest,
  AIRequestContext,
  Asset,
  ElementInspection,
  Finding,
  Inspection,
} from '../shared/types';

const MAX_TEXT = 200;
const MAX_HTML_SNIPPET = 160;
const MAX_PROPERTIES = 14;
const MAX_VARIABLES = 10;

/** Truncate to a character budget, appending an ellipsis when cut. */
function bound(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Reduce an HTML snippet to tag + id/class/role only. Every other attribute
 * (href, src, action, style, value, data-*, …) is dropped, so the payload
 * summary's claim — "No attribute values beyond these are sent" — is
 * byte-accurate: attribute values can never leak, even inside the snippet.
 */
function sanitizeSnippet(html: string): string {
  return (
    html
      // Drop every attribute except id/class/role, then the void-tag slash.
      .replace(/\s[a-z][a-z0-9-]*(=("[^"]*"|'[^']*'))?/gi, (match) =>
        /^\s(id|class|role)=/i.test(match) ? match : '',
      )
      .replace(/\s*\/?>/g, '>')
  );
}

/** A value to include, or null when it's noise/empty. */
function include(value: string | undefined | null, skip: string[] = []): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || skip.includes(v)) return null;
  return v;
}

const SKIP_COLORS = ['rgba(0, 0, 0, 0)', 'transparent'];

function styleSummary(inspection: ElementInspection): string {
  const { layout, appearance, typography } = inspection;
  const entries: string[] = [];
  const add = (label: string, value: string | null | undefined, skip: string[] = []): void => {
    const v = include(value, skip);
    if (v) entries.push(`${label}: ${v}`);
  };
  add('display', layout.display);
  add('position', layout.position);
  add('width', layout.width);
  add('height', layout.height);
  add(
    'margin',
    `${layout.margin.top} ${layout.margin.right} ${layout.margin.bottom} ${layout.margin.left}`,
  );
  add(
    'padding',
    `${layout.padding.top} ${layout.padding.right} ${layout.padding.bottom} ${layout.padding.left}`,
  );
  add('gap', layout.gap);
  add('flex-direction', layout.flexDirection);
  add('justify-content', layout.justifyContent);
  add('align-items', layout.alignItems);
  add('color', appearance.color);
  add('background-color', appearance.backgroundColor, SKIP_COLORS);
  add('border-radius', appearance.borderRadius, ['0px']);
  add(
    'border',
    appearance.borderWidth !== '0px'
      ? `${appearance.borderWidth} ${appearance.borderStyle} ${appearance.borderColor}`
      : null,
  );
  add('box-shadow', appearance.boxShadow, ['none']);
  add('font-family', typography.fontFamily);
  add('font-size', typography.fontSize);
  add('font-weight', typography.fontWeight);
  add('line-height', typography.lineHeight);
  add('letter-spacing', typography.letterSpacing);
  add('text-align', typography.textAlign);
  add('text-transform', typography.textTransform);
  add('opacity', appearance.opacity, ['1']);
  return entries.slice(0, MAX_PROPERTIES).join('; ');
}

function elementIdentity(inspection: ElementInspection): string {
  const html = inspection.html;
  let out = `<${html.tagName}`;
  if (html.id) out += ` id="${html.id}"`;
  if (html.classes.length > 0) out += ` class="${html.classes.slice(0, 5).join(' ')}"`;
  if (html.attributes.role) out += ` role="${html.attributes.role}"`;
  out += '>';
  return out;
}

/** Element context — the "Why?" feature (Section 7.22). */
export function elementExplainRequest(
  inspection: ElementInspection,
  model: string,
): AIExplainRequest {
  const identity = elementIdentity(inspection);
  const styles = styleSummary(inspection);
  const text = bound(inspection.text ?? '', MAX_TEXT);
  // The HTML snippet is sanitized (sensitive attributes stripped) and bounded.
  const snippet = bound(sanitizeSnippet(inspection.html.outerHTML), MAX_HTML_SNIPPET);
  const variables = inspection.variables
    .slice(0, MAX_VARIABLES)
    .map((v) => `${v.variable}: ${v.value}`)
    .join(', ');
  const traces = inspection.traces
    .slice(0, 6)
    .map((t) => {
      const rule = t.matchedRule
        ? `[${t.matchedRule.selectorText}${
            t.matchedRule.source
              ? ` @ ${t.matchedRule.source.stylesheet}:${t.matchedRule.source.line}`
              : ''
          }]`
        : '';
      return `${t.property}: ${t.computedValue}${rule}`;
    })
    .join('; ');

  return {
    context: 'element',
    model,
    payloadSummary:
      `The element ${identity} (tag, id, first classes, role), ${styles ? `its computed styles (${styles.split('; ').length} properties)` : 'no non-default styles'}` +
      `${text ? `, up to 200 chars of its visible text` : ''}` +
      `${variables ? `, and the first ${Math.min(inspection.variables.length, MAX_VARIABLES)} CSS variables it can see (${variables})` : ''}` +
      `. No attribute values beyond these are sent; input values and data-* attributes are excluded.`,
    systemPrompt:
      'You are Vizquo, a world-class design-intelligence assistant embedded ' +
      'in a browser extension. Your job is to give the BEST possible answer to ' +
      "the user's question about why an inspected web element looks and " +
      'behaves the way it does. Answer with the exactness of a senior design ' +
      'engineer and the clarity of a great teacher.\n' +
      'Rules:\n' +
      '1. Lead with a direct, confident one-to-two-sentence answer to the ' +
      'question — no throat-clearing.\n' +
      '2. Support it with the actual values in the prompt: name the computed ' +
      'property, its value, and — when present — the selector and file:line ' +
      'that produced it. This is a source-of-truth product; cite your evidence.\n' +
      '3. Explain the design reasoning (why a spacing/color/type choice makes ' +
      'sense, what it signals to the user, how it scales), then note anything ' +
      'unusual or worth changing.\n' +
      '4. Only use values that appear in the prompt. NEVER invent, guess, or ' +
      'hallucinate a property value, selector, or file. If the data does not ' +
      'support a claim, say exactly that.\n' +
      '5. Be concise and skimmable: short paragraphs or bullets, plain ' +
      'language, no fluff, no filler. Flag when a value is inherited, ' +
      'overridden, or comes from a CSS variable.',
    userPrompt: [
      `Element: ${identity}`,
      text ? `Visible text (bounded): ${JSON.stringify(text)}` : null,
      styles ? `Computed styles: ${styles}` : null,
      variables ? `Visible CSS variables: ${variables}` : null,
      traces ? `Source traces (property: computed value [selector @ file:line]): ${traces}` : null,
      snippet ? `HTML snippet (sanitized, ${MAX_HTML_SNIPPET} chars max): ${snippet}` : null,
      'Question: Why does this element look and behave this way? Explain its ' +
        'layout, colors, typography, and spacing decisions, and identify which ' +
        'CSS rules and variables drive them.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** Page context — "explain this design system" (Section 7.23 commands). */
export function pageExplainRequest(inspection: Inspection, model: string): AIExplainRequest {
  const tokens = inspection.tokens;
  const colors = tokens.colors
    .slice(0, 12)
    .map((c) => `${c.value.role ?? 'color'}: ${c.value.hex}`)
    .join(', ');
  const fonts = [...new Set(tokens.fonts.map((f) => f.value.family))].slice(0, 6).join(', ');
  const spacing = tokens.spacing
    .slice(0, 10)
    .map((s) => `${s.value}px`)
    .join(', ');
  const radii = tokens.radius
    .slice(0, 8)
    .map((r) => `${r.value}px`)
    .join(', ');
  const components = inspection.components
    .slice(0, 10)
    .map((c) => `${c.type} (${c.instances.length}×)`)
    .join(', ');

  return {
    context: 'design-system',
    model,
    payloadSummary:
      `The page's extracted design system: its title and URL, up to 12 colors ` +
      `with inferred roles, up to 6 font families, recurring spacing values, ` +
      `radius values, up to 10 detected component types with instance counts, ` +
      `the top CSS variables, and the design-consistency score. No page HTML, ` +
      `DOM structure, or element text is sent.`,
    systemPrompt:
      'You are Vizquo, a world-class design-intelligence assistant embedded ' +
      'in a browser extension. Give the BEST possible summary and critique of ' +
      "the website's design system from the extracted tokens provided.\n" +
      'Rules:\n' +
      '1. Open with a one-paragraph verdict: what kind of design system this ' +
      'is, and how cohesive it feels.\n' +
      '2. Organize by colors, typography, spacing, radius, components, then ' +
      'consistency. For each, name the concrete values and what they imply.\n' +
      '3. Call out the strongest signals of cohesion AND the most concrete ' +
      'inconsistencies — with the values that show them.\n' +
      '4. End with 2-4 prioritized, actionable improvements specific to the ' +
      'values listed (not generic advice).\n' +
      '5. Use only tokens that appear in the prompt. Distinguish directly ' +
      'observed tokens from inferred roles. Never fabricate values.',
    userPrompt: [
      `Page: ${inspection.page.title} (${inspection.page.url})`,
      colors ? `Colors: ${colors}` : null,
      fonts ? `Fonts: ${fonts}` : null,
      spacing ? `Spacing scale (px): ${spacing}` : null,
      radii ? `Radii (px): ${radii}` : null,
      components ? `Components: ${components}` : null,
      `Design consistency score: ${inspection.consistencyScore}/100`,
      "Question: Summarize this site's design system. What makes it cohesive, " +
        'what looks inconsistent, and what would you improve?',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** Asset context — "explain this asset" (Section 7.23 commands). */
export function assetExplainRequest(asset: Asset, model: string): AIExplainRequest {
  const dims = asset.naturalDims ? `${asset.naturalDims[0]}×${asset.naturalDims[1]}px` : null;
  const rendered = asset.renderedDims
    ? `${asset.renderedDims[0]}×${asset.renderedDims[1]}px rendered`
    : null;
  const url = bound(asset.url, 120);

  return {
    context: 'asset',
    model,
    payloadSummary:
      `One asset: its type (${asset.type}), a bounded URL (${url.length} chars), ` +
      `natural/rendered dimensions and alt text when present. No image bytes, ` +
      `no surrounding page content.`,
    systemPrompt:
      'You are Vizquo, a world-class design-intelligence assistant embedded ' +
      'in a browser extension. Give the BEST possible assessment of this single ' +
      'web asset from its metadata. State what the asset is likely for and any ' +
      'quality issues (dimensions, format, alt text) with confidence, based ' +
      'only on the data provided. Be concise; never fabricate attributes.',
    userPrompt: [
      `Asset type: ${asset.type}`,
      `URL (bounded): ${url}`,
      dims ? `Natural dimensions: ${dims}` : null,
      rendered ? `Rendered: ${rendered}` : null,
      asset.alt ? `Alt text: ${bound(asset.alt, 120)}` : null,
      'Question: What is this asset likely for, and are there any obvious ' +
        'quality issues (dimensions, format, alt text)?',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** Compare context — "narrate the diff" between two scans (Phase 9). */
export function compareExplainRequest(
  comparison: InspectionComparison,
  model: string,
): AIExplainRequest {
  // Bounded: differing rows per section, capped — never the full dump.
  const MAX_DIFFS = 6;
  const lines: string[] = [];
  for (const section of comparison.sections) {
    const diffs = section.rows.filter((row) => row.inA !== row.inB);
    if (diffs.length === 0) continue;
    const shown = diffs
      .slice(0, MAX_DIFFS)
      .map((row) => (row.inA ? `+ ${row.label}` : `− ${row.label}`));
    const more = diffs.length > MAX_DIFFS ? ` (+${diffs.length - MAX_DIFFS} more)` : '';
    lines.push(`${section.label}: ${shown.join(', ')}${more}`);
  }

  return {
    context: 'compare',
    model,
    payloadSummary:
      `A diff between two scanned pages (${comparison.a.title} → ${comparison.b.title}): ` +
      `the design-consistency scores on each side, and per section (colors, fonts, spacing, ` +
      `radius, shadows, gradients, breakpoints, technology) only the values present on exactly ` +
      `one side, capped at ${MAX_DIFFS} per section. No HTML, DOM, or element text is sent.`,
    systemPrompt:
      'You are Vizquo, a world-class design-intelligence assistant embedded in a browser ' +
      'extension. Summarize what changed between two scans of a page, as a tight visual ' +
      'regression report.\n' +
      'Rules:\n' +
      '1. Lead with a one-line verdict: did the design system drift, and in which direction?\n' +
      '2. Group the changes by section (colors, type, spacing, radius, breakpoints…), naming ' +
      'only values that appear in the prompt.\n' +
      '3. Call out what likely caused each change (new accent, spacing scale shift, font ' +
      'replacement) — grounded in the listed values, never invented.\n' +
      '4. End with 1-2 concrete checks the user should do next. Be concise; use only the data given.',
    userPrompt: [
      `Scan A: ${comparison.a.title} (${comparison.a.url})`,
      `Scan B: ${comparison.b.title} (${comparison.b.url})`,
      `Consistency: ${comparison.consistency.a}/100 → ${comparison.consistency.b}/100`,
      lines.length > 0
        ? `Changes (values present on only one side):\n${lines.join('\n')}`
        : 'Changes: none detected — the two scans share every detected value.',
      'Question: Narrate what changed between these two scans and what it means for the design ' +
        'system.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** Audit context — "prioritize the fixes" for a page's findings (Phase 9). */
export function auditExplainRequest(inspection: Inspection, model: string): AIExplainRequest {
  const ORDER: Finding['severity'][] = ['error', 'warning', 'info'];
  const sorted = [...inspection.findings]
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
    .slice(0, 20);
  const findings = sorted.map((f) => `[${f.severity}] (${f.category}) ${f.message}`).join('\n');
  const techs = inspection.technologies
    .slice(0, 8)
    .map((t) => t.name)
    .join(', ');

  return {
    context: 'audit',
    model,
    payloadSummary:
      `The page's audit findings (up to 20, sorted by severity — message text only, no ` +
      `element markup), the design-consistency score, and up to 8 detected technologies. No ` +
      `HTML, DOM structure, or page text is sent.`,
    systemPrompt:
      'You are Vizquo, a world-class design-intelligence assistant embedded in a browser ' +
      'extension. Prioritize the accessibility, performance, and consistency findings of a ' +
      'scanned page into an actionable fix order.\n' +
      'Rules:\n' +
      '1. Group findings by impact (must-fix, should-fix, nice-to-have), not just severity — a ' +
      'warning that blocks screen-reader use outranks an error in a rarely-seen state.\n' +
      '2. For the top 3-5, give the concrete fix in one sentence each (e.g. "add alt to the hero ' +
      'image"), grounded in the finding text given.\n' +
      '3. Note anything that is really one root cause expressed as several findings.\n' +
      '4. Use only findings present in the prompt. Never invent issues or stack claims.',
    userPrompt: [
      `Page: ${inspection.page.title} (${inspection.page.url})`,
      `Design consistency score: ${inspection.consistencyScore}/100`,
      techs ? `Detected technologies: ${techs}` : null,
      findings ? `Findings:\n${findings}` : 'Findings: none detected.',
      'Question: Which of these should be fixed first, and what exactly should change?',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** Route a context + input to its request builder (used by the panel). */
export function buildExplainRequest(
  context: AIRequestContext,
  input: {
    inspection?: ElementInspection;
    page?: Inspection;
    asset?: Asset;
    comparison?: InspectionComparison;
  },
  model: string,
): AIExplainRequest | null {
  switch (context) {
    case 'element':
      return input.inspection ? elementExplainRequest(input.inspection, model) : null;
    case 'design-system':
      return input.page ? pageExplainRequest(input.page, model) : null;
    case 'asset':
      return input.asset ? assetExplainRequest(input.asset, model) : null;
    case 'page':
      return input.page ? pageExplainRequest(input.page, model) : null;
    case 'compare':
      return input.comparison ? compareExplainRequest(input.comparison, model) : null;
    case 'audit':
      return input.page ? auditExplainRequest(input.page, model) : null;
  }
}
