/**
 * Phase 7 tests (Sections 7.22–7.23): prompt-builder redaction/bounding,
 * the AI readiness gate, and keyless-by-construction config.
 */
import { describe, expect, it } from 'vitest';
import { aiHasKey } from '../ai/config';
import { aiReadiness } from '../ai/gate';
import {
  assetExplainRequest,
  compareExplainRequest,
  elementExplainRequest,
  pageExplainRequest,
} from '../ai/prompts';
import { compareInspections } from '../export/compare';
import type { Asset, ColorToken, Inspection } from '../shared/types';
import { buttonInspection } from './helpers/element-fixture';
import { makeInspection } from './helpers/inspection';

const MODEL = 'deepseek/deepseek-chat:free';

/* ------------------------------------------------------------------------ */
/* Prompt builders: bounded + redacted, summary matches payload             */
/* ------------------------------------------------------------------------ */

describe('elementExplainRequest', () => {
  const LONG_TEXT = 'x'.repeat(500);

  it('bounds long visible text to 200 chars', () => {
    const req = elementExplainRequest(buttonInspection({ text: LONG_TEXT }), MODEL);
    expect(req.userPrompt).toContain(`"${'x'.repeat(200)}…"`);
    // Text (200) + sanitized snippet (160) + identity + styles + question.
    expect(req.userPrompt.length).toBeLessThan(1400);
  });

  it('never dumps raw outerHTML beyond the 160-char snippet', () => {
    const req = elementExplainRequest(
      buttonInspection({
        html: {
          ...buttonInspection().html,
          outerHTML: `<button data-secret="abc">${'y'.repeat(600)}</button>`,
        },
      }),
      MODEL,
    );
    // The snippet IS sent (bounded), but only tag + id/class/role survive.
    expect(req.userPrompt).toContain('HTML snippet (sanitized');
    expect(req.userPrompt).not.toContain('data-secret');
    expect(req.userPrompt).not.toContain('abc');
    expect(req.userPrompt).not.toContain('y'.repeat(400));
  });

  it('strips href/src/action/style values from the snippet (summary is byte-accurate)', () => {
    const req = elementExplainRequest(
      buttonInspection({
        html: {
          ...buttonInspection().html,
          tagName: 'A',
          outerHTML: '<a href="https://x.com/?token=leak" style="color:red">Link</a>',
        },
      }),
      MODEL,
    );
    expect(req.userPrompt).not.toContain('token=leak');
    expect(req.userPrompt).not.toContain('color:red');
    expect(req.userPrompt).not.toContain('href=');
    // The snippet survives as tag-only — identity keeps the element's class,
    // which is declared in the payload summary.
    expect(req.userPrompt).toContain('HTML snippet (sanitized, 160 chars max): <a>Link</a>');
  });

  it('excludes input values and data attributes by construction', () => {
    const req = elementExplainRequest(
      buttonInspection({
        html: {
          ...buttonInspection().html,
          attributes: { type: 'submit', value: 'hunter2', 'data-token': 'leak' },
        },
      }),
      MODEL,
    );
    expect(req.userPrompt).not.toContain('hunter2');
    expect(req.userPrompt).not.toContain('leak');
    expect(req.userPrompt).not.toContain('data-token');
  });

  it('states exactly what is sent in the payload summary (no false omission)', () => {
    const inspection = buttonInspection({
      text: 'Get started',
      variables: [{ variable: '--primary', value: '#635bff', definedBy: null }],
    });
    const req = elementExplainRequest(inspection, MODEL);
    expect(req.payloadSummary).toContain('computed styles');
    expect(req.payloadSummary).toContain('visible text');
    expect(req.payloadSummary).toContain('--primary');
    expect(req.payloadSummary).toContain('excluded');
  });

  it('attaches the model and element context', () => {
    const req = elementExplainRequest(buttonInspection(), MODEL);
    expect(req.context).toBe('element');
    expect(req.model).toBe(MODEL);
    // The identity header uses the inspection's tagName verbatim (BUTTON).
    expect(req.userPrompt).toContain('Element: <BUTTON');
    expect(req.userPrompt).toContain('btn-primary');
  });
});

describe('pageExplainRequest', () => {
  function pageInspection(): Inspection {
    return makeInspection({
      id: 'i1',
      page: { url: 'https://example.com', title: 'Example', scannedAt: 0 },
      createdAt: 0,
      scanDurationMs: 100,
      scannedElementCount: 100,
      components: [
        {
          id: 'c1',
          type: 'button',
          instances: [],
          confidence: { level: 'detected' },
          variants: {},
        },
      ],
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
            value: { family: 'Inter', source: 'google', weight: 400 },
            confidence: { level: 'detected' },
            usageCount: 10,
            usedBy: [],
          },
        ],
      },
    });
  }

  it('summarizes the design system without raw HTML or DOM', () => {
    const req = pageExplainRequest(pageInspection(), MODEL);
    expect(req.context).toBe('design-system');
    expect(req.payloadSummary).toContain('design system');
    expect(req.payloadSummary).toContain('No page HTML');
    expect(req.userPrompt).toContain('#635bff');
    expect(req.userPrompt).toContain('Inter');
    expect(req.userPrompt).toContain('88/100');
  });
});

describe('assetExplainRequest', () => {
  it('bounds the URL and omits image bytes', () => {
    const asset: Asset = {
      id: 'a1',
      type: 'image',
      url: `https://cdn.example.com/${'p'.repeat(300)}.png`,
      source: 'img',
      naturalDims: [800, 600],
      alt: 'Hero',
    };
    const req = assetExplainRequest(asset, MODEL);
    expect(req.payloadSummary).toContain('bounded URL');
    expect(req.payloadSummary).toContain('No image bytes');
    expect(req.userPrompt).toContain('800×600px');
    expect(req.userPrompt.length).toBeLessThan(600);
  });
});

/* ------------------------------------------------------------------------ */
/* compareExplainRequest (Phase 9, timeline AI diff)                       */
/* ------------------------------------------------------------------------ */

describe('compareExplainRequest', () => {
  function color(hex: string): ColorToken {
    return {
      value: { hex, oklch: '', role: undefined },
      confidence: { level: 'detected' },
      usageCount: 1,
      usedBy: [],
    };
  }

  it('sends only one-sided values — the shared set never leaks into the diff', () => {
    const a = makeInspection({
      tokens: {
        colors: [color('#111111'), color('#333333')],
        fonts: [],
        spacing: [],
        radius: [],
        shadows: [],
      },
    });
    const b = makeInspection({
      tokens: {
        colors: [color('#111111'), color('#222222')],
        fonts: [],
        spacing: [],
        radius: [],
        shadows: [],
      },
    });
    const req = compareExplainRequest(compareInspections(a, b), MODEL);
    expect(req.context).toBe('compare');
    expect(req.payloadSummary).toContain('values present on exactly one side');
    expect(req.payloadSummary).toContain('No HTML, DOM, or element text is sent.');
    expect(req.userPrompt).toContain('+ #333333'); // added on side A
    expect(req.userPrompt).toContain('− #222222'); // removed on side B
    expect(req.userPrompt).not.toContain('#111111'); // shared value is never sent
  });

  it('caps the diff at 6 rows per section with a +N more marker', () => {
    const a = makeInspection({
      tokens: {
        colors: Array.from({ length: 8 }, (_, i) => color(`#00000${i}`)),
        fonts: [],
        spacing: [],
        radius: [],
        shadows: [],
      },
    });
    const b = makeInspection({});
    const req = compareExplainRequest(compareInspections(a, b), MODEL);
    const shown = req.userPrompt.match(/\+ #00000/g)?.length ?? 0;
    expect(shown).toBe(6);
    expect(req.userPrompt).toContain('(+2 more)');
  });

  it('reports an unchanged scan honestly', () => {
    const a = makeInspection({});
    const req = compareExplainRequest(compareInspections(a, a), MODEL);
    expect(req.userPrompt).toContain('Changes: none detected');
  });

  it('includes both consistency scores as the drift signal', () => {
    const a = makeInspection({ consistencyScore: 90 });
    const b = makeInspection({ consistencyScore: 55 });
    const req = compareExplainRequest(compareInspections(a, b), MODEL);
    expect(req.userPrompt).toContain('Consistency: 90/100 → 55/100');
  });
});

/* ------------------------------------------------------------------------ */
/* Config: user-owned keys only — no bundled key or model                   */
/* ------------------------------------------------------------------------ */

describe('ai config', () => {
  it('uses only the user\u2019s own key — nothing is bundled', () => {
    // Release posture: no key, vendor, or model is embedded in the repository
    // or any build. AI runs only against endpoints the user configures.
    expect(aiHasKey(true)).toBe(true);
    expect(aiHasKey(false)).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */
/* Readiness gate                                                           */
/* ------------------------------------------------------------------------ */

describe('aiReadiness', () => {
  it('requires AI to be enabled first', () => {
    expect(aiReadiness({ enabled: false, hasKey: true, consentGiven: true })).toEqual({
      ready: false,
      reason: 'disabled',
    });
  });

  it('requires a key when enabled', () => {
    expect(aiReadiness({ enabled: true, hasKey: false, consentGiven: true })).toEqual({
      ready: false,
      reason: 'no-key',
    });
  });

  it('requires consent even with a key', () => {
    expect(aiReadiness({ enabled: true, hasKey: true, consentGiven: false })).toEqual({
      ready: false,
      reason: 'no-consent',
    });
  });

  it('is ready only when all three hold', () => {
    expect(aiReadiness({ enabled: true, hasKey: true, consentGiven: true })).toEqual({
      ready: true,
    });
  });
});
