import { afterEach, expect, it, vi } from 'vitest';

import { fetchAssistantLanguages } from './assistant.client';
import { TURN_LIMITS } from './assistant.turn.types';

const configured = {
  languages: [
    { code: 'hi', displayName: 'हिन्दी' },
    { code: 'en', displayName: 'English' },
  ],
  defaultLanguage: 'hi',
  englishFallback: 'en',
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('parses the configured list and sends credentials with a cancellation signal', async () => {
  const fetcher = vi.fn(async () => Response.json(configured));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchAssistantLanguages(1, 'hi')).resolves.toEqual(configured);
  expect(fetcher).toHaveBeenCalledOnce();
});

it('bounds a language request even if fetch ignores its signal', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  const failed = expect(fetchAssistantLanguages(1, null)).rejects.toMatchObject({
    code: 'timed_out',
  });
  await vi.advanceTimersByTimeAsync(TURN_LIMITS.connectMs);
  await failed;
});

it('cancels discovery while reading the response body', async () => {
  const cancel = vi.fn();
  vi.stubGlobal('fetch', async () => new Response(new ReadableStream({ cancel })));
  const controller = new AbortController();
  const failed = expect(fetchAssistantLanguages(1, null, controller.signal)).rejects.toMatchObject({
    code: 'network_error',
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  controller.abort();
  await failed;
  expect(cancel).toHaveBeenCalledOnce();
});

it('bounds response parsing and rejects oversized bodies', async () => {
  vi.stubGlobal('fetch', async () => new Response(' '.repeat(TURN_LIMITS.responseBytes + 1)));
  await expect(fetchAssistantLanguages(1, null)).rejects.toMatchObject({
    code: 'malformed_upstream_response',
  });
});

it('preserves the safe non-retryable invalid configuration code', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ code: 'invalid_configuration', retryable: false }, { status: 503 })
  );
  await expect(fetchAssistantLanguages(1, null)).rejects.toMatchObject({
    code: 'invalid_configuration',
    retryable: false,
  });
});

it('rejects malformed JSON without returning a default language', async () => {
  vi.stubGlobal('fetch', async () => new Response('{bad'));
  await expect(fetchAssistantLanguages(1, null)).rejects.toMatchObject({
    code: 'malformed_upstream_response',
  });
});
