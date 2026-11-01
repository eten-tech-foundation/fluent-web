import { useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';

import {
  AssistantConversationProvider,
  useAssistantConversation,
} from './AssistantConversationProvider';
import { AssistantPanel } from './AssistantPanel';

import type { AssistantConversation } from '../assistant.conversation';
import type { TurnUpdate, streamAssistantTurn } from '../assistant.turn.client';

const test = vi.hoisted(() => ({
  publish: null as ((update: TurnUpdate) => void) | null,
  owner: null as AssistantConversation | null,
}));
vi.mock('../assistant.turn.client', () => ({
  streamAssistantTurn: vi.fn<typeof streamAssistantTurn>((_project, _request, publish) => {
    test.publish = publish;
    return new Promise(() => {});
  }),
}));
const streams: Array<ReadableStreamDefaultController<Uint8Array>> = [];
const context = { projectId: 1, bookCode: 'JHN', chapter: 1, activeVerse: 1 };
function Harness() {
  const { owner, state } = useAssistantConversation();
  test.owner = owner;
  const [visible, setVisible] = useState(true);
  return (
    <>
      <button onClick={() => setVisible(!visible)}>Hide panel</button>
      <output>{state.draft}</output>
      {visible && (
        <AssistantPanel
          contextReady
          context={context}
          contextError={false}
          localForceOn={false}
          nextContext={{ ...context, activeVerse: 9 }}
          reference='John 1'
        />
      )}
    </>
  );
}
function mount() {
  localStorage.clear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AssistantConversationProvider actorId={1} intent='chapter' projectId={1}>
        <Harness />
      </AssistantConversationProvider>
    </QueryClientProvider>
  );
}
function frame(type: string, id: number, extra: Record<string, unknown>) {
  return new TextEncoder().encode(
    `id: ${id}\ndata: ${JSON.stringify({ type, protocol: 'fluent-turn-v1', contextReceipt: 'context', operationId: 'briefing', prefix: { sequence: type === 'briefing_started' ? 0 : 1, complete: type === 'briefing_complete', receipt: 'receipt' }, ...extra })}\n\n`
  );
}
const metadata = {
  operationVersion: 'passage-briefing-v1',
  cacheEpoch: '1',
  outputContractVersion: 'fluent-widgets-v1',
};
function start(controller: ReadableStreamDefaultController<Uint8Array>) {
  streams.push(controller);
  controller.enqueue(
    frame('briefing_started', 1, { ...metadata, attemptId: 'briefing', references: ['JHN 1:1'] })
  );
  controller.enqueue(
    frame('briefing_delta', 2, {
      delta: 'Frozen briefing\n\n{{fluent:v1:suggested_question|Macro?}}',
    })
  );
}
afterEach(() => {
  cleanup();
  for (const stream of streams.splice(0)) {
    try {
      stream.close();
    } catch {
      /* Already closed by the test. */
    }
  }
  vi.clearAllMocks();
});
describe('panel observes workspace-owned conversation', () => {
  it('freezes early source, detaches briefing observation, and never warms a successor from late completion', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    let requests = 0;
    server.use(
      http.get(`${config.api.url}/projects/1/assistant/languages`, () =>
        HttpResponse.json({
          languages: [{ code: 'en', displayName: 'English' }],
          defaultLanguage: 'en',
          englishFallback: 'en',
        })
      ),
      http.post(`${config.api.url}/projects/1/assistant/briefing`, () => {
        requests++;
        return new HttpResponse(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stream = controller;
              start(controller);
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        );
      })
    );
    mount();
    await screen.findByText('Frozen briefing');
    await waitFor(() => expect(test.owner!.getSnapshot().briefing?.integrity).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Macro?' }));
    expect(test.owner!.getSnapshot().turns).toHaveLength(1);
    await act(async () => {
      stream.enqueue(
        frame('briefing_delta', 3, {
          delta: ' later',
          prefix: { sequence: 2, complete: false, receipt: 'later' },
        })
      );
      stream.enqueue(
        frame('briefing_complete', 4, {
          ...metadata,
          outputLanguage: 'en',
          markdown: 'Frozen briefing\n\n{{fluent:v1:suggested_question|Macro?}} later',
          prefix: { sequence: 2, complete: true, receipt: 'complete' },
        })
      );
      stream.close();
      await Promise.resolve();
    });
    expect(screen.getByText('Frozen briefing')).toBeInTheDocument();
    expect(screen.queryByText('Frozen briefing later')).toBeNull();
    expect(requests).toBe(1);
    fireEvent.click(screen.getByText('Hide panel'));
    act(() =>
      test.publish!({
        type: 'prefix',
        operationId: 'turn',
        prefix: { markdown: 'Hidden answer', sequence: 1, complete: true, receipt: 'answer' },
      })
    );
    fireEvent.click(screen.getByText('Hide panel'));
    expect(screen.getByText('Hidden answer')).toBeVisible();
    expect(test.owner!.getSnapshot().turns[0].attempts[0].prefix?.markdown).toBe('Hidden answer');
    expect(requests).toBe(1);
  });
  it('refreshes briefing once after context_changed received while pane is hidden', async () => {
    let requests = 0;
    server.use(
      http.get(`${config.api.url}/projects/1/assistant/languages`, () =>
        HttpResponse.json({
          languages: [{ code: 'en', displayName: 'English' }],
          defaultLanguage: 'en',
          englishFallback: 'en',
        })
      ),
      http.post(`${config.api.url}/projects/1/assistant/briefing`, () => {
        requests++;
        return new HttpResponse(
          new ReadableStream<Uint8Array>({
            start(controller) {
              start(controller);
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        );
      })
    );
    mount();
    await waitFor(() => expect(test.owner!.getSnapshot().briefing?.integrity).toBeDefined());
    act(() => {
      test.owner!.submit('Pending question', 'suggested_question');
    });
    fireEvent.click(screen.getByText('Hide panel'));
    act(() => test.publish!({ protocol: 'fluent-turn-v1', type: 'context_changed' }));
    expect(requests).toBe(1);
    fireEvent.click(screen.getByText('Hide panel'));
    await waitFor(() => expect(requests).toBe(2));
    expect(screen.getByRole('textbox')).toHaveValue('Pending question');
    fireEvent.click(screen.getByText('Hide panel'));
    fireEvent.click(screen.getByText('Hide panel'));
    expect(requests).toBe(2);
    expect(test.owner!.getSnapshot().turns).toHaveLength(0);
  });
});
