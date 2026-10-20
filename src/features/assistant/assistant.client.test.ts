import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildPassageBriefingBody,
  parseAssistantEventStream,
  streamPassageBriefing,
} from './assistant.client';
import { AssistantBriefingError, type PassageBriefingRequest } from './assistant.types';

const encoder = new TextEncoder();
const request: PassageBriefingRequest = {
  projectId: 17,
  bookCode: 'JHN',
  chapter: 3,
  activeVerse: 16,
  outputLanguage: 'en',
  grounding: null,
  ignoreCache: false,
  attempt: 0,
  persistentIgnoreCache: false,
};
const started = {
  type: 'briefing_started',
  attemptId: 'attempt-1',
  operationVersion: 'passage-briefing-v1',
  cacheEpoch: '1',
  outputContractVersion: 'fluent-widgets-v1',
  references: ['JHN 3:16'],
};
const complete = {
  type: 'briefing_complete',
  markdown: 'Hello world',
  operationVersion: 'passage-briefing-v1',
  cacheEpoch: '1',
  outputContractVersion: 'fluent-widgets-v1',
  outputLanguage: 'en',
};

function frame(event: { type: string } & Record<string, unknown>): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function byteStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function streamThenFail(source: string): ReadableStream<Uint8Array> {
  let sent = false;
  return new ReadableStream({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(encoder.encode(source));
        return;
      }
      controller.error(new Error('reader failed after terminal event'));
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of parseAssistantEventStream(stream)) events.push(event);
  return events;
}

afterEach(() => vi.restoreAllMocks());

describe('Assistant API client', () => {
  it('builds selector-only requests and sends bounded diagnostics only when active', () => {
    expect(buildPassageBriefingBody(request)).toEqual({
      bookCode: 'JHN',
      chapter: 3,
      activeVerse: 16,
      outputLanguage: 'en',
    });
    const diagnostic = buildPassageBriefingBody({
      ...request,
      grounding: 'english',
      ignoreCache: true,
    });
    expect(diagnostic).toEqual({
      bookCode: 'JHN',
      chapter: 3,
      activeVerse: 16,
      outputLanguage: 'en',
      grounding: 'english',
      ignore_cache: true,
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/source|target|draft|provider|instruction/i);
  });

  it('parses every byte-boundary split, CRLF, comments, and multiline data', async () => {
    const source = `: keepalive\r\nevent: briefing_started\r\ndata: ${JSON.stringify(started)}\r\n\r\n`;
    for (let split = 0; split <= source.length; split += 1) {
      await expect(
        collect(byteStream([source.slice(0, split), source.slice(split)]))
      ).resolves.toEqual([started]);
    }
    const multiline =
      'event: briefing_delta\ndata: {"type":"briefing_delta",\ndata: "delta":"x"}\n\n';
    await expect(collect(byteStream([multiline]))).resolves.toEqual([
      { type: 'briefing_delta', delta: 'x' },
    ]);
  });

  it('publishes accumulated deltas before a verified completion without consuming an abort signal', async () => {
    let init: RequestInit | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, requestInit) => {
      init = requestInit;
      return Promise.resolve(
        new Response(
          byteStream([
            frame(started),
            frame({ type: 'briefing_delta', delta: 'Hello ' }),
            frame({ type: 'briefing_delta', delta: 'world' }),
            frame(complete),
          ]),
          { headers: { 'Content-Type': 'text/event-stream' } }
        )
      );
    });
    const updates: string[] = [];
    const result = await streamPassageBriefing(request, data => updates.push(data.source));

    expect(updates).toContain('Hello ');
    expect(updates).toContain('Hello world');
    expect(result).toMatchObject({ source: 'Hello world', phase: 'complete', cacheHit: false });
    expect(init?.signal).toBeUndefined();
  });

  it('passes an explicitly authorized private-attempt cancellation signal to fetch', async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      receivedSignal = init?.signal;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });

    const result = streamPassageBriefing(request, () => undefined, controller.signal);
    expect(receivedSignal).toBe(controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'network_error', retryable: true });
  });

  it('accepts a purple-wash fact only from an explicit completed cacheHit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        byteStream([
          frame(started),
          frame({ type: 'briefing_delta', delta: 'Hello world' }),
          frame({ ...complete, cacheHit: true }),
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    );
    await expect(streamPassageBriefing(request, () => undefined)).resolves.toMatchObject({
      cacheHit: true,
    });
  });

  it('never publishes completion before terminal stream validation succeeds', async () => {
    const terminal = frame({ ...complete, cacheHit: true });
    const prefix = frame(started) + frame({ type: 'briefing_delta', delta: 'Hello world' });
    const invalidStreams = [
      byteStream([prefix, terminal, frame({ type: 'briefing_delta', delta: 'trailing' })]),
      byteStream([prefix, terminal, 'event: briefing_delta\ndata: {"type":"briefing_delta"']),
      streamThenFail(prefix + terminal),
    ];
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    for (const body of invalidStreams) {
      fetchMock.mockResolvedValueOnce(
        new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
      );
      const publications: Array<{ phase: string; cacheHit: boolean }> = [];
      await expect(
        streamPassageBriefing(request, data => {
          publications.push({ phase: data.phase, cacheHit: data.cacheHit });
        })
      ).rejects.toBeDefined();
      expect(publications).not.toContainEqual(expect.objectContaining({ phase: 'complete' }));
      expect(publications).not.toContainEqual(expect.objectContaining({ cacheHit: true }));
    }
  });

  it('maps the API retryAfter wire field into the internal retry delay', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        byteStream([
          frame(started),
          frame({
            type: 'briefing_error',
            code: 'rate_limited',
            retryable: true,
            retryAfter: 17,
          }),
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    );
    await expect(streamPassageBriefing(request, () => undefined)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 17,
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'rate_limited', retryable: true, retryAfter: 9 }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(streamPassageBriefing(request, () => undefined)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 9,
    });
  });

  it('rejects provider errors, invalid ordering, completion mismatches, and unexpected EOF', async () => {
    const cases = [
      [frame(started), frame({ type: 'briefing_error', code: 'timed_out', retryable: true })],
      [frame({ type: 'briefing_delta', delta: 'before start' })],
      [frame(started), frame(started)],
      [frame(started), frame({ type: 'briefing_delta', delta: 'prefix' }), frame(complete)],
      [
        frame(started),
        frame({ type: 'briefing_delta', delta: 'Hello world' }),
        frame(complete),
        frame({ type: 'briefing_delta', delta: 'after complete' }),
      ],
      [frame(started), frame({ type: 'briefing_delta', delta: 'prefix' })],
    ];
    for (const chunks of cases) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(byteStream(chunks), { headers: { 'Content-Type': 'text/event-stream' } })
      );
      await expect(streamPassageBriefing(request, () => undefined)).rejects.toBeInstanceOf(
        AssistantBriefingError
      );
    }
  });
});
