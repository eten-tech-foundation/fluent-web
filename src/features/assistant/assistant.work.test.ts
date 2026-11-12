import { afterEach, expect, it, vi } from 'vitest';

import { streamPassageBriefing } from './assistant.client';
import { AssistantUtf8Size } from './assistant.stream';
import { streamAssistantTurn } from './assistant.turn.client';
import { assistantTurnRequestSchema } from './assistant.turn.types';
import fixture from './fixtures/turn-v1.json';

const request = assistantTurnRequestSchema.parse(fixture.request);
afterEach(() => vi.restoreAllMocks());

it.each(['briefing', 'turn'] as const)(
  'processes %s at the API default 8 MiB ceiling with linear byte-scan work',
  async operation => {
    const total = 8 * 1024 * 1024;
    const chunk = 'x'.repeat(1024);
    const count = total / chunk.length;
    const full = 'x'.repeat(total);
    const metadata = {
      operationVersion: 'v1',
      cacheEpoch: '1',
      outputContractVersion: 'fluent-widgets-v1',
    };
    const integrity = (sequence: number, complete = false) => ({
      protocol: 'fluent-turn-v1',
      operationId: 'operation',
      contextReceipt: request.contextReceipt,
      prefix: { sequence, complete, receipt: 'opaque-receipt' },
    });
    function* events() {
      yield operation === 'turn'
        ? fixture.events[0]
        : {
            type: 'briefing_started',
            attemptId: 'operation',
            references: ['JHN 1:1'],
            ...metadata,
            ...integrity(0),
          };
      for (let index = 0; index < count; index++)
        yield operation === 'turn'
          ? { ...fixture.events[1], delta: chunk, sequence: index + 1 }
          : { type: 'briefing_delta', delta: chunk, ...integrity(index + 1) };
      yield operation === 'turn'
        ? { ...fixture.events[2], sequence: count }
        : {
            type: 'briefing_complete',
            markdown: full,
            outputLanguage: 'en',
            ...metadata,
            ...integrity(count, true),
          };
    }
    const iterator = events();
    let id = 0;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = iterator.next();
        if (next.done) controller.close();
        else
          controller.enqueue(
            encoder.encode(`id: ${++id}\ndata: ${JSON.stringify(next.value)}\n\n`)
          );
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    );
    const original = TextEncoder.prototype.encode;
    let scannedUnits = 0;
    vi.spyOn(TextEncoder.prototype, 'encode').mockImplementation(function (
      this: TextEncoder,
      text = ''
    ) {
      scannedUnits += text.length;
      return original.call(this, text);
    });
    let commits = 0;
    let final = '';
    if (operation === 'turn') {
      await streamAssistantTurn(
        1,
        request,
        update => {
          if (update.type === 'prefix') {
            commits++;
            final = update.prefix.markdown;
          }
        },
        new AbortController().signal
      );
      expect(commits).toBe(count + 1);
    } else {
      await streamPassageBriefing(
        {
          projectId: 1,
          bookCode: 'JHN',
          chapter: 1,
          activeVerse: 1,
          outputLanguage: 'en',
          grounding: null,
          ignoreCache: false,
          persistentIgnoreCache: false,
          attempt: 0,
        },
        update => {
          commits++;
          final = update.source;
        }
      );
      expect(commits).toBe(count + 3);
    }
    expect(final).toBe(full);
    expect(scannedUnits).toBeLessThan(total * 16);
  }
);

it('counts split surrogate pairs exactly and resets on replacement', () => {
  const size = new AssistantUtf8Size();
  let value = '';
  for (const part of ['a', '\ud83d', '', '\ude00', '\ud800', '界', '\udc00']) {
    value += part;
    expect(size.append(part)).toBe(new TextEncoder().encode(value).byteLength);
  }
  expect(size.replace('')).toBe(0);
  expect(size.append('new')).toBe(3);
});
