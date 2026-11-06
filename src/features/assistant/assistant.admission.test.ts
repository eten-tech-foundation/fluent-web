import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithAssistantAdmission } from './assistant.admission';
import { assistantDelivery } from './assistant.stream';

const busy = () =>
  new Response(JSON.stringify({ code: 'generation_busy', retryable: true, retryAfter: 1 }), {
    status: 429,
  });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pre-generation admission retry', () => {
  it('waits transparently and sends the same body until admitted', async () => {
    vi.useFakeTimers();
    const admitted = new Response('stream', { headers: { 'content-type': 'text/event-stream' } });
    const fetcher = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(admitted);
    vi.stubGlobal('fetch', fetcher);
    const delivery = assistantDelivery();
    const init = { method: 'POST', body: '{"question":"same"}', signal: delivery.signal };
    const result = fetchWithAssistantAdmission('/turn', init, delivery);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(admitted);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(call => call[1] === init)).toBe(true);
    delivery.close();
  });
  it('does not retry ordinary rate limits or any accepted stream', async () => {
    for (const response of [
      new Response(JSON.stringify({ code: 'rate_limited', retryable: true }), { status: 429 }),
      new Response('data: generation_busy', { headers: { 'content-type': 'text/event-stream' } }),
    ]) {
      const fetcher = vi.fn().mockResolvedValue(response);
      vi.stubGlobal('fetch', fetcher);
      const delivery = assistantDelivery();
      expect(await fetchWithAssistantAdmission('/turn', {}, delivery)).toBe(response);
      expect(fetcher).toHaveBeenCalledTimes(1);
      delivery.close();
    }
  });
  it('stops waiting on cancellation and never sends another request', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(busy());
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const delivery = assistantDelivery(controller.signal);
    const result = fetchWithAssistantAdmission('/turn', {}, delivery);
    const failure = expect(result).rejects.toMatchObject({ code: 'network_error' });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await failure;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    delivery.close();
  });
  it('returns the explicit busy error when the waiting budget is exhausted', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(async () => busy());
    vi.stubGlobal('fetch', fetcher);
    const delivery = assistantDelivery();
    const result = fetchWithAssistantAdmission('/turn', {}, delivery);
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await result).status).toBe(429);
    expect(fetcher.mock.calls.length).toBeGreaterThan(2);
    expect(fetcher.mock.calls.length).toBeLessThan(20);
    delivery.close();
  });
});
