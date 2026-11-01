import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamAssistantTurn, type TurnUpdate } from './assistant.turn.client';
import { assistantTurnRequestSchema, TURN_LIMITS } from './assistant.turn.types';
import receiptFixture from './fixtures/receipt-v1.json';
import fixture from './fixtures/turn-v1.json';

const request = assistantTurnRequestSchema.parse(fixture.request);
const events = fixture.events.slice(0, 3);
function response(frames: unknown[], trailing = '', ids = true) {
  const bytes =
    frames
      .map((event, index) => `${ids ? `id: ${index + 1}\n` : ''}data: ${JSON.stringify(event)}\n\n`)
      .join('') + trailing;
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bytes));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
}
async function run(frames: unknown[], updates: TurnUpdate[] = [], trailing = '', ids = true) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(frames, trailing, ids));
  await streamAssistantTurn(
    1,
    request,
    update => updates.push(update),
    new AbortController().signal
  );
  return updates;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('bounded signed turn delivery', () => {
  it('accepts portable wire fixtures and commits exact text with opaque receipts only', async () => {
    const updates = await run(events);
    expect(updates).toEqual([
      events[0],
      {
        type: 'prefix',
        operationId: 'operation-1',
        prefix: {
          markdown: 'The Word',
          sequence: 1,
          complete: false,
          receipt: 'fixture-prefix-not-a-signature',
        },
      },
      {
        type: 'prefix',
        operationId: 'operation-1',
        prefix: {
          markdown: 'The Word',
          sequence: 1,
          complete: true,
          receipt: 'fixture-complete-not-a-signature',
        },
      },
    ]);
    expect(receiptFixture.prefixToken.length).toBeLessThan(TURN_LIMITS.receiptChars);
  });
  it.each([
    ['missing start', events.slice(1)],
    ['duplicate start', [events[0], ...events]],
    ['wrong turn', [events[0], { ...events[1], turnId: 'other' }, events[2]]],
    ['wrong attempt', [events[0], { ...events[1], attemptId: 'other' }, events[2]]],
    ['wrong operation', [events[0], { ...events[1], operationId: 'other' }, events[2]]],
    ['wrong context', [{ ...events[0], contextReceipt: 'other' }, ...events.slice(1)]],
    ['sequence gap', [events[0], { ...events[1], sequence: 2 }, events[2]]],
    ['bad terminal sequence', [events[0], events[1], { ...events[2], sequence: 2 }]],
    ['replacement terminal', [events[0], events[1], { ...events[2], markdown: 'Replacement' }]],
    ['duplicate terminal', [...events, events[2]]],
    ['changed after start', [events[0], fixture.events[4]]],
    [
      'unknown omission',
      [
        {
          ...events[0],
          projection: { historyWindow: 5, omittedTurnIds: ['unknown'], emptyTurnIds: [] },
        },
        ...events.slice(1),
      ],
    ],
  ])('rejects %s without publishing completed output', async (_name, frames) => {
    const updates: TurnUpdate[] = [];
    await expect(run(frames, updates)).rejects.toMatchObject({
      code: 'malformed_upstream_response',
    });
    expect(updates.some(update => update.type === 'prefix' && update.prefix.complete)).toBe(false);
  });
  it('rejects EOF, partial frames, missing ids, and nonmonotonic ids', async () => {
    await expect(run(events.slice(0, 2))).rejects.toMatchObject({ code: 'stream_incomplete' });
    await expect(run(events, [], 'data: {')).rejects.toMatchObject({ code: 'stream_incomplete' });
    await expect(run(events, [], '', false)).rejects.toMatchObject({
      code: 'malformed_upstream_response',
    });
    await expect(run(events, [], 'id: 3\ndata: {}\n\n')).rejects.toMatchObject({
      code: 'malformed_upstream_response',
    });
  });
  it('preserves the last atomic prefix on normalized error and handles context_changed before start', async () => {
    const updates: TurnUpdate[] = [];
    await expect(run([events[0], events[1], fixture.events[3]], updates)).rejects.toMatchObject({
      code: 'timed_out',
      retryable: true,
    });
    expect(updates.at(-1)).toMatchObject({
      type: 'prefix',
      prefix: { markdown: 'The Word', complete: false },
    });
    expect(await run([fixture.events[4]])).toEqual([fixture.events[4]]);
  });
  it('bounds output and individual frames without exposing oversized content', async () => {
    await expect(
      run([
        events[0],
        { ...events[1], delta: 'x'.repeat(15000) },
        { ...events[1], sequence: 2, delta: 'x' },
        { ...events[2], sequence: 2 },
      ])
    ).rejects.toMatchObject({ code: 'context_too_large' });
    await expect(run([], [], ':'.repeat(TURN_LIMITS.frameBytes + 1))).rejects.toMatchObject({
      code: 'malformed_upstream_response',
    });
  });
  it.each(['connect', 'idle', 'total'])(
    'enforces %s deadline even when fetch/reader does not settle',
    async phase => {
      vi.useFakeTimers();
      if (phase === 'connect')
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
      else
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                if (phase === 'total') {
                  const timer = setInterval(() => {
                    try {
                      controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
                    } catch {
                      clearInterval(timer);
                    }
                  }, 10000);
                }
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } }
          )
        );
      const promise = streamAssistantTurn(1, request, () => {}, new AbortController().signal);
      const assertion = expect(promise).rejects.toMatchObject({ code: 'timed_out' });
      await vi.advanceTimersByTimeAsync(
        phase === 'connect' ? 10000 : phase === 'idle' ? 45000 : 180000
      );
      await assertion;
    }
  );
  it('decodes split UTF-8 bytes and keeps normalized HTTP errors bounded', async () => {
    const unicode = 'é漢😀';
    const bytes = new TextEncoder().encode(
      [events[0], { ...events[1], delta: unicode }, events[2]]
        .map((event, index) => `id: ${index + 1}\ndata: ${JSON.stringify(event)}\n\n`)
        .join('')
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    );
    const updates: TurnUpdate[] = [];
    await streamAssistantTurn(
      1,
      request,
      update => updates.push(update),
      new AbortController().signal
    );
    expect(updates.at(-1)).toMatchObject({
      type: 'prefix',
      prefix: { markdown: unicode, complete: true },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'rate_limited', retryable: true, retryAfter: 30 }), {
        status: 429,
      })
    );
    await expect(
      streamAssistantTurn(1, request, () => {}, new AbortController().signal)
    ).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 30 });
  });
  it('locally aborts delivery with no automatic retry', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const promise = streamAssistantTurn(1, request, () => {}, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'network_error' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
