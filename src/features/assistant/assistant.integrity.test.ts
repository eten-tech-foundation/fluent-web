import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamPassageBriefing } from './assistant.client';
import receiptFixture from './fixtures/receipt-v1.json';

import type { PassageBriefingData, PassageBriefingRequest } from './assistant.types';

const request: PassageBriefingRequest = {
  projectId: 1,
  bookCode: 'JHN',
  chapter: 1,
  activeVerse: 1,
  outputLanguage: 'en',
  grounding: null,
  ignoreCache: false,
  persistentIgnoreCache: false,
  attempt: 0,
};
const metadata = {
  operationVersion: 'passage-briefing-v1',
  cacheEpoch: '1',
  outputContractVersion: 'fluent-widgets-v1',
};
const integrity = (sequence: number, complete: boolean) => ({
  protocol: 'fluent-turn-v1',
  contextReceipt: receiptFixture.contextToken,
  operationId: 'briefing-1',
  prefix: { sequence, complete, receipt: receiptFixture.prefixToken },
});
const source = receiptFixture.prefix.markdown;
const frames = [
  {
    type: 'briefing_started',
    attemptId: 'briefing-1',
    references: ['JHN 1:1'],
    ...metadata,
    ...integrity(0, false),
  },
  { type: 'briefing_delta', delta: source, ...integrity(1, false) },
  {
    type: 'briefing_complete',
    markdown: source,
    outputLanguage: 'en',
    ...metadata,
    ...integrity(1, true),
  },
];
async function run(events: unknown[], updates: PassageBriefingData[] = []) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              events
                .map((event, index) => `id: ${index + 1}\ndata: ${JSON.stringify(event)}\n\n`)
                .join('')
            )
          );
          controller.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  );
  return streamPassageBriefing(request, data => updates.push(data));
}
afterEach(() => vi.restoreAllMocks());
describe('additive signed briefing delivery', () => {
  it('preserves portable receipt bytes atomically with exact Unicode source', async () => {
    const updates: PassageBriefingData[] = [];
    const result = await run(frames, updates);
    expect(result.integrity).toMatchObject({
      contextReceipt: receiptFixture.contextToken,
      prefix: {
        markdown: source,
        receipt: receiptFixture.prefixToken,
        sequence: 1,
        complete: true,
      },
    });
    expect(
      updates.every(data => !data.integrity || data.source === data.integrity.prefix.markdown)
    ).toBe(true);
    expect(updates.at(-2)?.integrity?.prefix.complete).toBe(false);
  });
  it.each([
    ['sequence gap', { ...frames[1], ...integrity(2, false) }],
    ['changed context', { ...frames[1], contextReceipt: 'other' }],
    ['changed operation', { ...frames[1], operationId: 'other' }],
    ['premature complete', { ...frames[1], ...integrity(1, true) }],
    ['missing metadata', { type: 'briefing_delta', delta: source }],
    ['mixed unsigned', { ...frames[1], continuationUnavailable: 'context_too_large' }],
  ])('rejects %s without committing mismatched source', async (_name, delta) => {
    const updates: PassageBriefingData[] = [];
    await expect(run([frames[0], delta, frames[2]], updates)).rejects.toMatchObject({
      code: 'malformed_upstream_response',
    });
    expect(updates.at(-1)?.source).toBe('');
  });
  it('drops old receipt when continuation becomes unavailable while retaining ordinary briefing', async () => {
    const unavailable = { continuationUnavailable: 'context_too_large' };
    const result = await run([
      frames[0],
      frames[1],
      { type: 'briefing_delta', delta: ' unsigned', ...unavailable },
      {
        type: 'briefing_complete',
        markdown: source + ' unsigned',
        outputLanguage: 'en',
        ...metadata,
        ...unavailable,
      },
    ]);
    expect(result).toMatchObject({
      source: source + ' unsigned',
      phase: 'complete',
      continuationUnavailable: 'context_too_large',
    });
    expect(result.integrity).toBeUndefined();
  });
  it('keeps missing-key briefing usable but does not claim continuation', async () => {
    const events = frames.map(frame => {
      const {
        protocol: _protocol,
        contextReceipt: _context,
        operationId: _operation,
        prefix: _prefix,
        ...plain
      } = frame;
      return { ...plain, continuationUnavailable: 'temporarily_unavailable' };
    });
    const result = await run(events);
    expect(result.phase).toBe('complete');
    expect(result.integrity).toBeUndefined();
    expect(result.continuationUnavailable).toBe('temporarily_unavailable');
  });
});
