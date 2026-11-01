import { describe, expect, it, vi } from 'vitest';

import { AssistantConversation } from './assistant.conversation';
import { AssistantBriefingError, type PassageBriefingData } from './assistant.types';
import fixture from './fixtures/turn-v1.json';

import type { TurnUpdate, streamAssistantTurn } from './assistant.turn.client';

const context = { projectId: 1, bookCode: 'JHN', chapter: 1, activeVerse: 1 };
const briefing: PassageBriefingData = {
  source: fixture.request.briefing.markdown,
  phase: 'complete',
  metadata: null,
  outputLanguage: 'en',
  cacheHit: false,
  integrity: {
    contextReceipt: fixture.request.contextReceipt,
    operationId: 'briefing',
    prefix: fixture.request.briefing,
  },
};
function setup() {
  const deliveries: Array<{
    publish: (update: TurnUpdate) => void;
    signal: AbortSignal;
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  const transport = vi.fn<typeof streamAssistantTurn>(
    (_project, _request, publish, signal) =>
      new Promise<void>((resolve, reject) => {
        deliveries.push({ publish, signal, resolve, reject });
      })
  );
  const owner = new AssistantConversation(transport);
  owner.intent(1, 1, 'chapter-1');
  owner.navigate({ context, ready: true, intent: 'chapter-1' });
  owner.configure('en');
  owner.observeBriefing(briefing, owner.getSnapshot().generation);
  return { owner, transport, deliveries };
}
function delta(
  delivery: ReturnType<typeof setup>['deliveries'][number],
  markdown = 'Visible prefix',
  complete = false
) {
  delivery.publish({
    type: 'prefix',
    operationId: 'operation',
    prefix: { markdown, sequence: 1, complete, receipt: 'opaque-receipt' },
  });
}

describe('drafting conversation lifecycle', () => {
  it('retains one transport and draft while hidden and through unresolved same canonical chapter navigation', async () => {
    const { owner, transport, deliveries } = setup();
    owner.setDraft('unsent draft');
    expect(owner.submit('Suggested question?', 'suggested_question')).toBeNull();
    owner.intent(1, 1, 'chapter-2');
    expect(owner.getSnapshot().ready).toBe(false);
    expect(owner.submit('Cannot submit unresolved', 'typed')).not.toBeNull();
    delta(deliveries[0], 'Finished while hidden', true);
    deliveries[0].resolve();
    await Promise.resolve();
    owner.navigate({ context, ready: true, intent: 'chapter-2' });
    expect(owner.getSnapshot()).toMatchObject({
      draft: 'unsent draft',
      turns: [{ attempts: [{ state: 'complete', prefix: { markdown: 'Finished while hidden' } }] }],
    });
    expect(deliveries[0].signal.aborted).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('clears hidden A-B-A without resurrection and fences late callbacks', () => {
    const { owner, deliveries } = setup();
    owner.submit('Question', 'typed');
    owner.setDraft('draft');
    owner.navigate({ context: { ...context, activeVerse: 8 }, ready: true, intent: 'chapter-1' });
    delta(deliveries[0], 'stale', true);
    owner.navigate({ context, ready: true, intent: 'chapter-1' });
    expect(owner.getSnapshot()).toMatchObject({
      turns: [],
      draft: '',
      pinned: null,
      briefing: null,
    });
    expect(deliveries[0].signal.aborted).toBe(true);
  });
  it.each(['project', 'actor', 'logout', 'exit', 'language', 'grounding', 'fresh'])(
    'fences %s boundaries',
    boundary => {
      const { owner, deliveries } = setup();
      owner.submit('Question', 'typed');
      owner.setDraft('draft');
      if (boundary === 'project') owner.intent(1, 2, 'project-2');
      if (boundary === 'actor') owner.intent(2, 1, 'chapter-1');
      if (boundary === 'logout') owner.intent(null, 1, 'chapter-1');
      if (boundary === 'exit') owner.dispose();
      if (boundary === 'language') owner.configure('hi');
      if (boundary === 'grounding') owner.configure('en', 'english');
      if (boundary === 'fresh') owner.reset();
      delta(deliveries[0], 'late', true);
      expect(owner.getSnapshot()).toMatchObject({ turns: [], draft: '', pinned: null });
      expect(deliveries[0].signal.aborted).toBe(true);
    }
  );
  it('pins early signed briefing exactly, preserves draft, and never observes later cache completion', () => {
    const { owner, transport } = setup();
    const partial = {
      ...briefing,
      phase: 'streaming' as const,
      integrity: {
        ...briefing.integrity!,
        prefix: { ...briefing.integrity!.prefix, complete: false },
      },
    };
    owner.observeBriefing(partial, owner.getSnapshot().generation);
    owner.setDraft('typed draft');
    expect(owner.submit('typed draft', 'typed')).not.toBeNull();
    expect(owner.submit('Macro?', 'suggested_question')).toBeNull();
    owner.observeBriefing({ ...briefing, source: 'late complete' }, owner.getSnapshot().generation);
    expect(owner.getSnapshot()).toMatchObject({ pinned: partial, draft: 'typed draft' });
    expect(transport.mock.calls[0][1]).toMatchObject({
      briefing: partial.integrity!.prefix,
      dont_cache: true,
    });
    expect(owner.submit('typed draft', 'typed')).toBeNull();
  });
  it('interrupts with the exact visible receipt and only pristine first suggested requests may write cache', () => {
    const { owner, transport, deliveries } = setup();
    const event = {};
    owner.submit('Macro?', 'suggested_question', event);
    expect(transport.mock.calls[0][1].dont_cache).toBe(false);
    expect(owner.submit('Macro?', 'suggested_question', event)).not.toBeNull();
    delta(deliveries[0]);
    owner.submit('Next', 'typed');
    expect(deliveries[0].signal.aborted).toBe(true);
    expect(transport.mock.calls[1][1]).toMatchObject({
      dont_cache: true,
      turns: [
        {
          input: { text: 'Macro?' },
          attempts: [
            {
              state: 'interrupted',
              prefix: { markdown: 'Visible prefix', receipt: 'opaque-receipt', complete: false },
            },
          ],
        },
      ],
    });
    delta(deliveries[0], 'late replacement', true);
    expect(owner.getSnapshot().turns[0].attempts[0].prefix?.markdown).toBe('Visible prefix');
  });
  it('retries only latest failed question with retained attempts and one logical user turn', async () => {
    const { owner, deliveries, transport } = setup();
    owner.submit(' Exact question \n', 'typed');
    delta(deliveries[0]);
    deliveries[0].reject(new AssistantBriefingError('timed_out', true));
    await Promise.resolve();
    const turnId = owner.getSnapshot().turns[0].turnId;
    expect(owner.retry()).toBeNull();
    expect(owner.getSnapshot().turns).toHaveLength(1);
    expect(owner.getSnapshot().turns[0].attempts).toHaveLength(2);
    expect(transport.mock.calls[1][1]).toMatchObject({
      submission: { kind: 'retry', turnId, input: { text: ' Exact question \n' } },
      turns: [{ attempts: [{ state: 'failed' }] }],
    });
    delta(deliveries[1], 'replacement', true);
    expect(owner.retry()).not.toBeNull();
  });
  it('preserves genuine hidden failure and restores pending question on context_changed without resubmitting', async () => {
    const { owner, deliveries, transport } = setup();
    owner.submit('Question', 'typed');
    deliveries[0].reject(new AssistantBriefingError('stream_incomplete', true));
    await Promise.resolve();
    expect(owner.getSnapshot().turns[0].attempts[0]).toMatchObject({
      state: 'failed',
      prefix: null,
    });
    owner.retry();
    deliveries[1].publish({ type: 'context_changed', protocol: 'fluent-turn-v1' });
    expect(owner.getSnapshot()).toMatchObject({
      draft: 'Question',
      turns: [],
      pinned: null,
      notice: 'context_changed',
      refresh: 1,
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('retains older failure details locally without putting them in the next wire transcript', async () => {
    const { owner, deliveries, transport } = setup();
    owner.submit('First', 'typed');
    deliveries[0].reject(new AssistantBriefingError('timed_out', true));
    await Promise.resolve();
    owner.submit('Next', 'typed');
    expect(owner.getSnapshot().turns[0].attempts[0].failure?.code).toBe('timed_out');
    expect(transport.mock.calls[1][1].turns[0].attempts[0]).not.toHaveProperty('failure');
  });
  it('keeps a first suggested turn private after a typed draft was cleared', () => {
    const { owner, transport } = setup();
    owner.setDraft('typed first');
    owner.setDraft('');
    owner.submit('Macro?', 'suggested_question');
    expect(transport.mock.calls[0][1].dont_cache).toBe(true);
  });
  it('does not interrupt admitted work or clear a draft when a later submission fails admission', () => {
    const { owner, deliveries, transport } = setup();
    owner.submit('First', 'typed');
    owner.setDraft('x'.repeat(4001));
    expect(owner.submit(owner.getSnapshot().draft, 'typed')?.code).toBe('context_too_large');
    expect(deliveries[0].signal.aborted).toBe(false);
    expect(owner.getSnapshot().draft).toHaveLength(4001);
    expect(owner.getSnapshot().turns).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects whitespace, oversized input and unsigned/oversized briefing without losing draft or requesting', () => {
    const { owner, transport } = setup();
    owner.setDraft('preserve');
    expect(owner.submit(' '.repeat(4), 'typed')?.code).toBe('invalid_request');
    expect(owner.submit('x'.repeat(4001), 'typed')?.code).toBe('context_too_large');
    owner.observeBriefing(
      { ...briefing, integrity: undefined, continuationUnavailable: 'context_too_large' },
      owner.getSnapshot().generation
    );
    expect(owner.submit('Q', 'typed')?.code).toBe('context_too_large');
    expect(owner.getSnapshot().draft).toBe('preserve');
    expect(transport).not.toHaveBeenCalled();
  });
});
