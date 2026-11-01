import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { act, render, screen, waitFor } from '@/test/render';

import {
  ASSISTANT_QUERY_DEFAULTS,
  passageBriefingAttemptQueryKey,
  passageBriefingQueryKey,
  selectedPassageBriefingRequest,
} from '../assistant.queries';
import { ASSISTANT_STORAGE_KEYS } from '../assistant.storage';

import { AssistantConversationProvider } from './AssistantConversationProvider';
import { AssistantPanel } from './AssistantPanel';

const api = config.api.url;
const context = { projectId: 7, bookCode: 'JHN', chapter: 3, activeVerse: 16 };
const panelProps = {
  context,
  contextReady: true,
  contextError: false,
  reference: 'JHN 3:16-18',
};
const encoder = new TextEncoder();
const macro = '{{fluent:v1:suggested_question|What should I research?}}';

function frame(event: Record<string, unknown>): Uint8Array {
  return encoder.encode(`event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`);
}

function started(activeVerse = 16) {
  return {
    type: 'briefing_started',
    attemptId: `attempt-${String(activeVerse)}`,
    operationVersion: 'passage-briefing-v1',
    cacheEpoch: '1',
    outputContractVersion: 'fluent-widgets-v1',
    references: [`JHN 3:${String(activeVerse)}`],
  };
}

function complete(markdown: string, cacheHit?: boolean) {
  return {
    type: 'briefing_complete',
    markdown,
    operationVersion: 'passage-briefing-v1',
    cacheEpoch: '1',
    outputContractVersion: 'fluent-widgets-v1',
    outputLanguage: 'hi',
    ...(cacheHit === undefined ? {} : { cacheHit }),
  };
}

function completedStream(markdown = 'Briefing', cacheHit?: boolean) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(frame(started()));
      controller.enqueue(frame({ type: 'briefing_delta', delta: markdown }));
      controller.enqueue(frame(complete(markdown, cacheHit)));
      controller.close();
    },
  });
}

function byteStream(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function wrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <AssistantConversationProvider actorId={1} intent='7:1' projectId={7}>
        {children}
      </AssistantConversationProvider>
    </QueryClientProvider>
  );
}

function languages() {
  server.use(
    http.get(`${api}/projects/7/assistant/languages`, () =>
      HttpResponse.json({
        languages: [
          { code: 'en', displayName: 'English' },
          { code: 'hi', displayName: 'Hindi' },
        ],
        defaultLanguage: 'hi',
        englishFallback: 'en',
      })
    )
  );
}

beforeEach(() => {
  localStorage.clear();
  languages();
});

describe('AssistantPanel', () => {
  it('waits for canonical pericope resolution instead of requesting the active verse early', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(completedStream(), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const view = render(
      <AssistantPanel
        {...panelProps}
        contextReady={false}
        localForceOn={false}
        nextContext={null}
        reference={null}
      />,
      { wrapper: wrapper() }
    );

    expect(screen.getByText('Resolving passage…')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Assistant output language' })).toHaveValue('hi')
    );
    expect(bodies).toHaveLength(0);

    view.rerender(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />);
    await waitFor(() => expect(bodies).toHaveLength(1));
  });

  it('never requests a raw interior verse during the raw-to-canonical debounce', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(completedStream(), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const rawInterior = { ...context, activeVerse: 17 };
    const view = render(
      <AssistantPanel
        {...panelProps}
        context={rawInterior}
        contextReady={false}
        localForceOn={false}
        nextContext={null}
        reference={null}
      />,
      { wrapper: wrapper() }
    );

    // Resolve and select the cached language before canonical passage resolution finishes.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Assistant output language' })).toHaveValue('hi')
    );
    expect(bodies).toHaveLength(0);

    view.rerender(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />);
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ chapter: 3, activeVerse: 16 });
    expect(bodies).not.toContainEqual(expect.objectContaining({ activeVerse: 17 }));
  });

  it('uses the server-selected project-source default, persists it, and keeps stored diagnostics inert', async () => {
    localStorage.setItem(ASSISTANT_STORAGE_KEYS.ignoreCache, 'true');
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(completedStream(), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    render(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />, {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(screen.getByRole('heading', { name: 'JHN 3:16-18' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Assistant output language' })).toHaveValue('hi');
    expect(localStorage.getItem(ASSISTANT_STORAGE_KEYS.outputLanguage)).toBe('hi');
    expect(bodies[0]).toMatchObject({ outputLanguage: 'hi' });
    expect(bodies[0]).not.toHaveProperty('grounding');
    expect(bodies[0]).not.toHaveProperty('ignore_cache');
    expect(screen.queryByTestId('assistant-debug-controls')).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Assistant output language' }),
      'en'
    );
    expect(localStorage.getItem(ASSISTANT_STORAGE_KEYS.outputLanguage)).toBe('en');
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ outputLanguage: 'en' });
  });

  it('restores the chosen language through a fresh workspace and query cache', async () => {
    const selections: Array<string | null> = [];
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.get(`${api}/projects/7/assistant/languages`, ({ request }) => {
        const selected = new URL(request.url).searchParams.get('selected');
        selections.push(selected);
        return HttpResponse.json({
          languages: [
            { code: 'en', displayName: 'English' },
            { code: 'hi', displayName: 'Hindi' },
          ],
          defaultLanguage: selected === 'en' ? 'en' : 'hi',
          englishFallback: 'en',
        });
      }),
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(completedStream(), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const first = render(
      <AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />,
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Assistant output language' }),
      'en'
    );
    await waitFor(() => expect(bodies).toHaveLength(2));
    first.unmount();

    render(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />, {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(selections).toEqual([null, 'en']);
    expect(bodies.map(body => body.outputLanguage)).toEqual(['hi', 'en', 'en']);
    expect(screen.getByRole('combobox', { name: 'Assistant output language' })).toHaveValue('en');
  });

  it('replaces an unsupported saved language before requesting a briefing', async () => {
    localStorage.setItem(ASSISTANT_STORAGE_KEYS.outputLanguage, 'removed');
    const selections: Array<string | null> = [];
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.get(`${api}/projects/7/assistant/languages`, ({ request }) => {
        selections.push(new URL(request.url).searchParams.get('selected'));
        return HttpResponse.json({
          languages: [{ code: 'en', displayName: 'English' }],
          defaultLanguage: 'en',
          englishFallback: 'en',
        });
      }),
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(completedStream(), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    render(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />, {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(selections).toEqual(['removed']);
    expect(bodies.map(body => body.outputLanguage)).toEqual(['en']);
    expect(screen.getByRole('combobox', { name: 'Assistant output language' })).toHaveValue('en');
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['English']);
    expect(localStorage.getItem(ASSISTANT_STORAGE_KEYS.outputLanguage)).toBe('en');
  });

  it('sends only force-on debug choices and makes force fresh a one-attempt cache bypass', async () => {
    localStorage.setItem(ASSISTANT_STORAGE_KEYS.ignoreCache, 'true');
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(completedStream(), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ grounding: 'configured', ignore_cache: true });

    await user.click(screen.getByRole('checkbox', { name: 'Ignore cache' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toHaveProperty('grounding', 'configured');
    expect(bodies[1]).not.toHaveProperty('ignore_cache');

    await user.selectOptions(screen.getByLabelText('Grounding resources'), 'english');
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]).toHaveProperty('grounding', 'english');
    await user.selectOptions(screen.getByLabelText('Grounding resources'), 'output_language');
    await waitFor(() => expect(bodies).toHaveLength(4));
    expect(bodies[3]).toHaveProperty('grounding', 'output_language');

    await user.click(screen.getByRole('button', { name: 'Force fresh generation' }));
    await waitFor(() => expect(bodies).toHaveLength(5));
    expect(bodies[4]).toMatchObject({ grounding: 'output_language', ignore_cache: true });
  });

  it('reuses an aged completed force-fresh attempt across remount until another click', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(completedStream(`Briefing ${String(bodies.length)}`), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = wrapper(queryClient);
    const view = render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
      wrapper: Wrapper,
    });

    expect(await screen.findByText('Briefing 1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Force fresh generation' }));
    expect(await screen.findByText('Briefing 2')).toBeVisible();
    expect(bodies[1]).toHaveProperty('ignore_cache', true);
    view.unmount();

    const agedNow = Date.now() + ASSISTANT_QUERY_DEFAULTS.staleTime + 1;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(agedNow);
    try {
      render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
        wrapper: Wrapper,
      });
      expect(await screen.findByText('Briefing 2')).toBeVisible();
      await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
      expect(bodies).toHaveLength(2);

      await user.click(screen.getByRole('button', { name: 'Force fresh generation' }));
      expect(await screen.findByText('Briefing 3')).toBeVisible();
      expect(bodies).toHaveLength(3);
      expect(bodies[2]).toHaveProperty('ignore_cache', true);
    } finally {
      clock.mockRestore();
    }
  });

  it('reuses an aged completed force-fresh attempt after a key revisit until another click', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        const source = `Briefing ${String(body.activeVerse)}-${String(bodies.length)}`;
        return new HttpResponse(completedStream(source), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
      wrapper: wrapper(queryClient),
    });

    expect(await screen.findByText('Briefing 16-1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Force fresh generation' }));
    expect(await screen.findByText('Briefing 16-2')).toBeVisible();
    const agedNow = Date.now() + ASSISTANT_QUERY_DEFAULTS.staleTime + 1;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(agedNow);
    try {
      const otherContext = { ...context, activeVerse: 20 };
      view.rerender(
        <AssistantPanel
          localForceOn
          {...panelProps}
          context={otherContext}
          nextContext={null}
          reference='JHN 3:20'
        />
      );
      expect(await screen.findByText('Briefing 20-3')).toBeVisible();

      view.rerender(<AssistantPanel {...panelProps} localForceOn nextContext={null} />);
      expect(await screen.findByText('Briefing 16-2')).toBeVisible();
      await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
      expect(bodies.filter(body => body.activeVerse === 16)).toHaveLength(2);

      await user.click(screen.getByRole('button', { name: 'Force fresh generation' }));
      expect(await screen.findByText('Briefing 16-4')).toBeVisible();
      const passageRequests = bodies.filter(body => body.activeVerse === 16);
      expect(passageRequests).toHaveLength(3);
      expect(passageRequests[2]).toHaveProperty('ignore_cache', true);
    } finally {
      clock.mockRestore();
    }
  });

  it('keeps a cancelled partial force-fresh attempt incomplete until an explicit retry', async () => {
    let calls = 0;
    let forceFreshSignal: AbortSignal | undefined;
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, ({ request }) => {
        calls += 1;
        if (calls === 1) {
          return new HttpResponse(completedStream('Initial briefing'), {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        if (calls === 2) {
          forceFreshSignal = request.signal;
          return new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(frame(started()));
                controller.enqueue(
                  frame({ type: 'briefing_delta', delta: 'Partial force-fresh briefing' })
                );
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
        return new HttpResponse(completedStream('Explicit retry briefing'), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = wrapper(queryClient);
    const view = render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
      wrapper: Wrapper,
    });
    const baseRequest = {
      ...context,
      outputLanguage: 'hi',
      grounding: 'configured',
      ignoreCache: false,
    } as const;

    expect(await screen.findByText('Initial briefing')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Force fresh generation' }));
    expect(await screen.findByText('Partial force-fresh briefing')).toBeVisible();
    expect(calls).toBe(2);

    view.unmount();
    await waitFor(() => expect(forceFreshSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(queryClient.getQueryData(passageBriefingAttemptQueryKey(baseRequest))).toMatchObject({
        nonce: 1,
        forceFresh: true,
        cancelled: true,
      })
    );

    render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
      wrapper: Wrapper,
    });
    expect(await screen.findByText('Partial force-fresh briefing')).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('did not finish');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(calls).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Explicit retry briefing')).toBeVisible();
    expect(calls).toBe(3);
    expect(selectedPassageBriefingRequest(queryClient, baseRequest)).toMatchObject({
      attempt: 2,
      ignoreCache: false,
    });
  });

  it('shows deltas before completion and activates a macro only when its closing bytes arrive', async () => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    server.use(
      http.post(
        `${api}/projects/7/assistant/briefing`,
        () =>
          new HttpResponse(
            new ReadableStream({
              start(streamController) {
                controller = streamController;
                streamController.enqueue(frame(started()));
                streamController.enqueue(
                  frame({ type: 'briefing_delta', delta: macro.slice(0, -2) })
                );
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } }
          )
      )
    );
    render(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />, {
      wrapper: wrapper(),
    });

    await screen.findByText(/What should I research/);
    expect(screen.queryByTestId('suggested-question')).not.toBeInTheDocument();
    await act(async () => {
      controller?.enqueue(frame({ type: 'briefing_delta', delta: '}}' }));
      controller?.enqueue(frame(complete(macro)));
      controller?.close();
    });
    expect(await screen.findByRole('button', { name: 'What should I research?' })).toBeVisible();
  });

  it('shows the purple wash only for an explicit cache hit while locally force-on', async () => {
    server.use(
      http.post(
        `${api}/projects/7/assistant/briefing`,
        () =>
          new HttpResponse(completedStream('Cached briefing', true), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
      )
    );
    const view = render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
      wrapper: wrapper(),
    });
    const text = await screen.findByText('Cached briefing');
    await waitFor(() =>
      expect(text.closest('[data-cache-hit]')).toHaveAttribute('data-cache-hit', 'true')
    );

    view.rerender(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />);
    expect(view.container.querySelector('[data-cache-hit]')).toHaveAttribute(
      'data-cache-hit',
      'false'
    );
    expect(screen.queryByTestId('assistant-debug-controls')).not.toBeInTheDocument();
  });

  it('does not show a cache hit or touch a successor before clean terminal EOF', async () => {
    let terminalController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const requested: number[] = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        const body = (await request.json()) as { activeVerse: number };
        requested.push(body.activeVerse);
        if (body.activeVerse !== 16) {
          return new HttpResponse(completedStream('Unexpected successor'), {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        return new HttpResponse(
          new ReadableStream({
            start(controller) {
              terminalController = controller;
              controller.enqueue(frame(started()));
              controller.enqueue(
                frame({ type: 'briefing_delta', delta: 'Unverified terminal briefing' })
              );
              controller.enqueue(frame(complete('Unverified terminal briefing', true)));
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        );
      })
    );
    const view = render(
      <AssistantPanel {...panelProps} localForceOn nextContext={{ ...context, activeVerse: 17 }} />,
      { wrapper: wrapper() }
    );

    await screen.findByText('Unverified terminal briefing');
    await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
    expect(view.container.querySelector('[data-cache-hit]')).toHaveAttribute(
      'data-cache-hit',
      'false'
    );
    expect(requested).toEqual([16]);

    await act(async () => {
      terminalController?.enqueue(frame({ type: 'briefing_delta', delta: 'trailing' }));
      terminalController?.close();
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('did not finish');
    expect(view.container.querySelector('[data-cache-hit]')).toHaveAttribute(
      'data-cache-hit',
      'false'
    );
    expect(requested).toEqual([16]);
  });

  it('keeps a successful retry selected across tab unmount and reopen', async () => {
    let calls = 0;
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, () => {
        calls += 1;
        if (calls === 1) {
          return new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(frame(started()));
                controller.enqueue(
                  frame({ type: 'briefing_error', code: 'timed_out', retryable: true })
                );
                controller.close();
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
        return new HttpResponse(completedStream('Retried briefing'), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const Wrapper = wrapper();
    const view = render(
      <AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />,
      {
        wrapper: Wrapper,
      }
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('did not finish');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Retried briefing')).toBeVisible();
    expect(calls).toBe(2);

    view.unmount();
    render(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />, {
      wrapper: Wrapper,
    });
    expect(await screen.findByText('Retried briefing')).toBeVisible();
    expect(calls).toBe(2);
  });

  it('assigns a fresh request identity to every repeated retry', async () => {
    let calls = 0;
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, () => {
        calls += 1;
        return new HttpResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(frame(started()));
              controller.enqueue(
                frame({ type: 'briefing_error', code: 'timed_out', retryable: true })
              );
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        );
      })
    );
    const user = userEvent.setup();
    render(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />, {
      wrapper: wrapper(),
    });

    for (const expectedCalls of [2, 3]) {
      await user.click(await screen.findByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(calls).toBe(expectedCalls));
    }
  });

  it('does not refetch an aged failed partial attempt when the pane reopens', async () => {
    let calls = 0;
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, () => {
        calls += 1;
        if (calls === 1) {
          return new HttpResponse(
            byteStream([
              frame(started()),
              frame({ type: 'briefing_delta', delta: 'Partial ordinary briefing' }),
              frame({ type: 'briefing_error', code: 'timed_out', retryable: true }),
            ]),
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
        return new HttpResponse(completedStream('Explicit ordinary retry'), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = wrapper(queryClient);
    const view = render(
      <AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />,
      { wrapper: Wrapper }
    );

    expect(await screen.findByText('Partial ordinary briefing')).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('did not finish');
    view.unmount();

    const agedNow = Date.now() + ASSISTANT_QUERY_DEFAULTS.staleTime + 1;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(agedNow);
    render(<AssistantPanel {...panelProps} localForceOn={false} nextContext={null} />, {
      wrapper: Wrapper,
    });
    expect(await screen.findByText('Partial ordinary briefing')).toBeVisible();
    await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
    expect(calls).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Explicit ordinary retry')).toBeVisible();
    expect(calls).toBe(2);
    expect(
      selectedPassageBriefingRequest(queryClient, {
        ...context,
        outputLanguage: 'hi',
        grounding: null,
        ignoreCache: false,
      }).attempt
    ).toBe(1);
    clock.mockRestore();
  });

  it('does not refetch a failed partial persistent bypass when the pane reopens', async () => {
    localStorage.setItem(ASSISTANT_STORAGE_KEYS.ignoreCache, 'true');
    let calls = 0;
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, () => {
        calls += 1;
        if (calls === 1) {
          return new HttpResponse(
            byteStream([
              frame(started()),
              frame({ type: 'briefing_delta', delta: 'Partial private briefing' }),
              frame({ type: 'briefing_error', code: 'timed_out', retryable: true }),
            ]),
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
        return new HttpResponse(completedStream('Explicit private retry'), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = wrapper(queryClient);
    const view = render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
      wrapper: Wrapper,
    });

    expect(await screen.findByText('Partial private briefing')).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('did not finish');
    view.unmount();
    render(<AssistantPanel {...panelProps} localForceOn nextContext={null} />, {
      wrapper: Wrapper,
    });
    expect(await screen.findByText('Partial private briefing')).toBeVisible();
    await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
    expect(calls).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Explicit private retry')).toBeVisible();
    expect(calls).toBe(2);
    expect(
      selectedPassageBriefingRequest(queryClient, {
        ...context,
        outputLanguage: 'hi',
        grounding: 'configured',
        ignoreCache: true,
      }).attempt
    ).toBe(1);
  });

  it('reuses a successor briefing from its already successful selected retry', async () => {
    const requested: number[] = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        const body = (await request.json()) as { activeVerse: number };
        requested.push(body.activeVerse);
        const verseCalls = requested.filter(verse => verse === body.activeVerse).length;
        if (body.activeVerse === 17 && verseCalls === 1) {
          return new HttpResponse(
            byteStream([
              frame(started(17)),
              frame({ type: 'briefing_error', code: 'timed_out', retryable: true }),
            ]),
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
        const source = body.activeVerse === 17 ? 'B retried' : 'A current';
        return new HttpResponse(
          byteStream([
            frame(started(body.activeVerse)),
            frame({ type: 'briefing_delta', delta: source }),
            frame(complete(source)),
          ]),
          { headers: { 'Content-Type': 'text/event-stream' } }
        );
      })
    );
    const user = userEvent.setup();
    const passageB = { ...context, activeVerse: 17 };
    const view = render(
      <AssistantPanel
        {...panelProps}
        context={passageB}
        localForceOn={false}
        nextContext={null}
        reference='JHN 3:17'
      />,
      { wrapper: wrapper() }
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('B retried')).toBeVisible();
    expect(requested.filter(verse => verse === 17)).toHaveLength(2);

    view.rerender(<AssistantPanel {...panelProps} localForceOn={false} nextContext={passageB} />);
    expect(await screen.findByText('A current')).toBeVisible();
    await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
    expect(requested.filter(verse => verse === 17)).toHaveLength(2);
  });

  it('joins a successor briefing to its selected retry while that retry is in flight', async () => {
    let retryController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const requested: number[] = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        const body = (await request.json()) as { activeVerse: number };
        requested.push(body.activeVerse);
        const verseCalls = requested.filter(verse => verse === body.activeVerse).length;
        if (body.activeVerse === 17 && verseCalls === 1) {
          return new HttpResponse(
            byteStream([
              frame(started(17)),
              frame({ type: 'briefing_error', code: 'timed_out', retryable: true }),
            ]),
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
        if (body.activeVerse === 17) {
          return new HttpResponse(
            new ReadableStream({
              start(controller) {
                retryController = controller;
                controller.enqueue(frame(started(17)));
                controller.enqueue(frame({ type: 'briefing_delta', delta: 'B retry streaming' }));
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
        return new HttpResponse(completedStream('A current'), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const passageB = { ...context, activeVerse: 17 };
    const view = render(
      <AssistantPanel
        {...panelProps}
        context={passageB}
        localForceOn={false}
        nextContext={null}
        reference='JHN 3:17'
      />,
      { wrapper: wrapper() }
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('B retry streaming')).toBeVisible();
    view.rerender(<AssistantPanel {...panelProps} localForceOn={false} nextContext={passageB} />);
    expect(await screen.findByText('A current')).toBeVisible();
    await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
    expect(requested.filter(verse => verse === 17)).toHaveLength(2);

    await act(async () => {
      retryController?.enqueue(frame(complete('B retry streaming')));
      retryController?.close();
    });
  });

  it('does not automatically retry a failed selected successor attempt', async () => {
    const requested: number[] = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        const body = (await request.json()) as { activeVerse: number };
        requested.push(body.activeVerse);
        if (body.activeVerse === 17) {
          return HttpResponse.json(
            { code: 'temporarily_unavailable', retryable: true },
            { status: 503 }
          );
        }
        return new HttpResponse(completedStream('A current'), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const passageB = { ...context, activeVerse: 17 };
    const successorBase = {
      ...passageB,
      outputLanguage: 'hi',
      grounding: null,
      ignoreCache: false,
    } as const;
    const view = render(
      <AssistantPanel
        {...panelProps}
        context={passageB}
        localForceOn={false}
        nextContext={null}
        reference='JHN 3:17'
      />,
      { wrapper: wrapper(queryClient) }
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(requested.filter(verse => verse === 17)).toHaveLength(2));
    const selectedRetry = selectedPassageBriefingRequest(queryClient, successorBase);
    expect(selectedRetry.attempt).toBe(1);
    expect(queryClient.getQueryState(passageBriefingQueryKey(selectedRetry))?.status).toBe('error');

    view.rerender(<AssistantPanel {...panelProps} localForceOn={false} nextContext={passageB} />);
    expect(await screen.findByText('A current')).toBeVisible();
    await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
    expect(requested.filter(verse => verse === 17)).toHaveLength(2);
    expect(queryClient.getQueryState(passageBriefingQueryKey(selectedRetry))?.status).toBe('error');
  });

  it('does not prefetch a successor when effective ignore-cache is true', async () => {
    localStorage.setItem(ASSISTANT_STORAGE_KEYS.ignoreCache, 'true');
    const requested: number[] = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        const body = (await request.json()) as { activeVerse: number };
        requested.push(body.activeVerse);
        return new HttpResponse(completedStream('Uncached briefing'), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      })
    );
    render(
      <AssistantPanel {...panelProps} localForceOn nextContext={{ ...context, activeVerse: 17 }} />,
      { wrapper: wrapper() }
    );

    expect(await screen.findByText('Uncached briefing')).toBeVisible();
    await act(async () => Promise.resolve());
    expect(requested).toEqual([16]);
  });

  it('lets historical navigation finish without prefetch and touches one current successor only', async () => {
    const controllers = new Map<number, ReadableStreamDefaultController<Uint8Array>>();
    const requested: number[] = [];
    server.use(
      http.post(`${api}/projects/7/assistant/briefing`, async ({ request }) => {
        const body = (await request.json()) as { activeVerse: number };
        requested.push(body.activeVerse);
        return new HttpResponse(
          new ReadableStream({
            start(controller) {
              controllers.set(body.activeVerse, controller);
              controller.enqueue(frame(started(body.activeVerse)));
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        );
      })
    );
    const firstNext = { ...context, activeVerse: 17 };
    const view = render(
      <AssistantPanel {...panelProps} localForceOn={false} nextContext={firstNext} />,
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(controllers.has(16)).toBe(true));

    const current = { ...context, activeVerse: 20 };
    const currentNext = { ...context, activeVerse: 21 };
    view.rerender(
      <AssistantPanel
        {...panelProps}
        context={current}
        localForceOn={false}
        nextContext={currentNext}
        reference='JHN 3:20-21'
      />
    );
    await waitFor(() => expect(controllers.has(20)).toBe(true));

    const finish = (verse: number) => {
      const source = `Briefing ${String(verse)}`;
      controllers.get(verse)?.enqueue(frame({ type: 'briefing_delta', delta: source }));
      controllers.get(verse)?.enqueue(frame(complete(source)));
      controllers.get(verse)?.close();
    };
    await act(async () => finish(16));
    expect(requested).not.toContain(17);
    await act(async () => finish(20));
    await waitFor(() => expect(requested.filter(verse => verse === 21)).toHaveLength(1));
    expect(requested).not.toContain(17);
  });
});
