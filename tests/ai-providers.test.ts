import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../ai/anthropic';
import { GeminiProvider } from '../ai/gemini';
import { OllamaProvider } from '../ai/ollama';
import { OpenAiCompatibleProvider } from '../ai/openai-compatible';
import { OpenRouterProvider } from '../ai/openrouter';
import { createProvider, providerOrigin } from '../ai/registry';
import type { AIExplainRequest } from '../shared/types';

const REQUEST: AIExplainRequest = {
  context: 'element',
  model: 'test-model',
  systemPrompt: 'You are a design inspector.',
  userPrompt: 'Explain this element.',
  payloadSummary: 'one element summary',
};

describe('provider registry', () => {
  it('constructs the right provider class per id', () => {
    expect(createProvider('openrouter')).toBeInstanceOf(OpenRouterProvider);
    expect(createProvider('ollama', {})).toBeInstanceOf(OllamaProvider);
    expect(createProvider('openai')).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(createProvider('groq')).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(createProvider('anthropic')).toBeInstanceOf(AnthropicProvider);
    expect(createProvider('gemini')).toBeInstanceOf(GeminiProvider);
    expect(createProvider('custom', { customBaseUrl: 'https://x.example/v1' })).toBeInstanceOf(
      OpenAiCompatibleProvider,
    );
  });

  it('maps each provider to its host origin', () => {
    expect(providerOrigin('openrouter')).toBe('https://openrouter.ai/*');
    expect(providerOrigin('openai')).toBe('https://api.openai.com/*');
    expect(providerOrigin('anthropic')).toBe('https://api.anthropic.com/*');
    expect(providerOrigin('gemini')).toBe('https://generativelanguage.googleapis.com/*');
    expect(providerOrigin('groq')).toBe('https://api.groq.com/*');
    expect(providerOrigin('ollama')).toBe('http://localhost/*');
  });

  it('derives the custom origin from the base URL and returns null when missing', () => {
    expect(providerOrigin('custom', 'https://api.deepseek.com/v1')).toBe(
      'https://api.deepseek.com/*',
    );
    expect(providerOrigin('custom', '')).toBeNull();
    expect(providerOrigin('custom', 'not a url')).toBeNull();
  });

  it('fails honestly when a key is missing', async () => {
    const result = await createProvider('openai').explain(REQUEST, '');
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed custom base URL without throwing', async () => {
    const provider = createProvider('custom', { customBaseUrl: 'not-a-url' });
    const result = await provider.explain(REQUEST, 'sk-test');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Could not reach');
  });
});

describe('custom OpenAI-compatible provider URL shape', () => {
  it('posts to <baseUrl>/chat/completions and strips trailing slashes', async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '  the answer  ' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const provider = createProvider('custom', { customBaseUrl: 'https://x.example/v1///' });
      const result = await provider.explain(REQUEST, 'sk-test');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.text).toBe('the answer');
      expect(calls[0]).toBe('https://x.example/v1/chat/completions');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
