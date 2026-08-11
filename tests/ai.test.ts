/**
 * Phase 7 tests (Sections 7.22–7.23): prompt-builder redaction/bounding,
 * the OpenRouter provider (mocked fetch), and the AI readiness gate.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHOR_DEFAULT_KEY, hasAuthorDefaultKey, resolveApiKey } from '../ai/config';
import { aiReadiness } from '../ai/gate';
import { OllamaProvider } from '../ai/ollama';
import { OpenRouterProvider } from '../ai/openrouter';
import { assetExplainRequest, elementExplainRequest, pageExplainRequest } from '../ai/prompts';
import { DEFAULT_AI_MODEL } from '../shared/constants';
import type { Asset, Inspection } from '../shared/types';
import { buttonInspection } from './helpers/element-fixture';

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
    return {
      id: 'i1',
      page: { url: 'https://example.com', title: 'Example', scannedAt: 0 },
      createdAt: 0,
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
        spacing: [],
        radius: [],
        shadows: [],
      },
      assets: [],
      components: [
        {
          id: 'c1',
          type: 'button',
          instances: [],
          confidence: { level: 'detected' },
          variants: {},
        },
      ],
      findings: [],
      variables: [],
      gradients: [],
      breakpoints: [],
      typeStyles: [],
      consistencyScore: 88,
      scanDurationMs: 100,
      technologies: [],
      containerQueries: [],
      viewportMeta: true,
      truncated: false,
      scannedElementCount: 100,
      metrics: {
        imageCount: 0,
        svgCount: 0,
        animationCount: 0,
        transitionCount: 0,
        breakpointCount: 0,
      },
      cached: false,
      stale: false,
    };
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
/* OpenRouter provider: mocked fetch                                        */
/* ------------------------------------------------------------------------ */

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenRouterProvider', () => {
  const provider = new OpenRouterProvider();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the assistant text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okJson({
          choices: [{ message: { role: 'assistant', content: 'Because it is a button.' } }],
        }),
      ),
    );
    const result = await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      'sk-or-test',
    );
    expect(result).toEqual({
      ok: true,
      text: 'Because it is a button.',
      model: MODEL,
      provider: 'openrouter',
    });
  });

  it('sends the Bearer key in the Authorization header', async () => {
    const fetchMock = vi.fn(async () => okJson({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      'sk-or-secret',
    );
    const call = fetchMock.mock.calls[0] as unknown;
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-or-secret');
    const body = JSON.parse(String(init.body)) as { model: string; max_tokens: number };
    expect(body.model).toBe(MODEL);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('maps a 401 to an honest invalid-key error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 401, message: 'Invalid key' } }), {
            status: 401,
          }),
      ),
    );
    const result = await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      'sk-or-bad',
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('rejected') });
  });

  it('maps a 429 to an honest rate-limit error (free models are shared)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 429 })),
    );
    const result = await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      'sk-or-test',
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Rate limited') });
  });

  it('maps a 400 to a token-limit-aware message (free models cap output)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 400 })),
    );
    const result = await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      'sk-or-test',
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('cap output length') });
  });

  it('is honest when a reasoning model returns no final answer (no CoT-as-answer)', async () => {
    // Law #5: never present an inference as fact. Raw chain-of-thought is not
    // the final answer — surface an honest error instead of labeling it as one.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okJson({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                reasoning: 'The button uses a flex layout with 16px padding…',
              },
            },
          ],
        }),
      ),
    );
    const result = await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      'sk-or-test',
    );
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('no final answer'),
    });
  });

  it('returns an honest error on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    const result = await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      'sk-or-test',
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an empty key without calling the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      '',
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('key') });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles an empty model response honestly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ choices: [{ message: { content: '   ' } }] })),
    );
    const result = await provider.explain(
      { context: 'element', payloadSummary: 'x', systemPrompt: 's', userPrompt: 'u', model: MODEL },
      'sk-or-test',
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('empty') });
  });
});

/* ------------------------------------------------------------------------ */
/* Ollama provider (Phase 9): local, keyless, zero cost                     */
/* ------------------------------------------------------------------------ */

describe('OllamaProvider', () => {
  const provider = new OllamaProvider();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the assistant text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ message: { role: 'assistant', content: 'Local answer.' } })),
    );
    const result = await provider.explain(
      {
        context: 'element',
        payloadSummary: 'x',
        systemPrompt: 's',
        userPrompt: 'u',
        model: 'llama3.2',
      },
      '',
    );
    expect(result).toEqual({
      ok: true,
      text: 'Local answer.',
      model: 'llama3.2',
      provider: 'ollama',
    });
  });

  it('posts to the local chat endpoint without any auth', async () => {
    const fetchMock = vi.fn(async () => okJson({ message: { content: 'ok' } }));
    vi.stubGlobal('fetch', fetchMock);
    await provider.explain(
      {
        context: 'element',
        payloadSummary: 'x',
        systemPrompt: 's',
        userPrompt: 'u',
        model: 'llama3.2',
      },
      '',
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(init.headers).not.toHaveProperty('Authorization');
    const body = JSON.parse(String(init.body)) as { model: string; stream: boolean };
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(false);
  });

  it('maps a 404 to a pull-the-model message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const result = await provider.explain(
      {
        context: 'element',
        payloadSummary: 'x',
        systemPrompt: 's',
        userPrompt: 'u',
        model: 'llama3.2',
      },
      '',
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('ollama pull') });
  });

  it('surfaces Ollama errors and empty replies honestly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ error: 'model not found' })),
    );
    const result = await provider.explain(
      {
        context: 'element',
        payloadSummary: 'x',
        systemPrompt: 's',
        userPrompt: 'u',
        model: 'nope',
      },
      '',
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Ollama error') });
  });

  it('is honest when Ollama cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    const result = await provider.explain(
      {
        context: 'element',
        payloadSummary: 'x',
        systemPrompt: 's',
        userPrompt: 'u',
        model: 'llama3.2',
      },
      '',
    );
    expect(result.ok).toBe(false);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('ollama serve') });
  });
});

/* ------------------------------------------------------------------------ */
/* Config: default model + bundled key resolution                           */
/* ------------------------------------------------------------------------ */

describe('ai config', () => {
  it('defaults to the openrouter/free auto-select model', () => {
    expect(DEFAULT_AI_MODEL).toBe('openrouter/free');
  });

  it('bundles a key only when AUTHOR_DEFAULT_KEY is set (release = keyless)', () => {
    // The author asked to bundle their key so AI works out of the box. The
    // constant lives in ai/config.ts with a REMOVE-BEFORE-PUBLISHING note;
    // this assertion is release-tolerant: it passes both with a bundled dev
    // key AND after the key is cleared for the Web Store build.
    expect(hasAuthorDefaultKey()).toBe(AUTHOR_DEFAULT_KEY.length > 0);
    if (AUTHOR_DEFAULT_KEY) {
      expect(AUTHOR_DEFAULT_KEY.startsWith('sk-or-v1-')).toBe(true);
    }
  });

  it('a stored user key overrides the bundled default', () => {
    expect(resolveApiKey('sk-or-user-key')).toBe('sk-or-user-key');
  });

  it('falls back to the bundled default when no user key is stored', () => {
    expect(resolveApiKey(null)).toBe(AUTHOR_DEFAULT_KEY);
    expect(resolveApiKey('   ')).toBe(AUTHOR_DEFAULT_KEY);
  });

  it('returns the fallback when the stored value is empty/undefined', () => {
    expect(resolveApiKey(undefined)).toBe(AUTHOR_DEFAULT_KEY);
    expect(resolveApiKey('')).toBe(AUTHOR_DEFAULT_KEY);
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
