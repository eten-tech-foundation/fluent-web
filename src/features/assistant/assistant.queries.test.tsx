import { type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamPassageBriefing } from './assistant.client';
import {
  ASSISTANT_QUERY_DEFAULTS,
  passageBriefingQueryKey,
  passageBriefingQueryOptions,
  prefetchPassageBriefing,
  selectedPassageBriefingRequest,
  startPassageBriefingAttempt,
  usePassageBriefing,
} from './assistant.queries';

import type {
  PassageBriefingBaseRequest,
  PassageBriefingData,
  PassageBriefingRequest,
} from './assistant.types';

vi.mock('./assistant.client', () => ({
  fetchAssistantLanguages: vi.fn(),
  streamPassageBriefing: vi.fn(),
}));

const baseRequest: PassageBriefingRequest = {
  projectId: 1,
  bookCode: 'JHN',
  chapter: 3,
  activeVerse: 1,
  outputLanguage: 'en',
  grounding: null,
  ignoreCache: false,
  attempt: 0,
  persistentIgnoreCache: false,
};
const baseRequestIdentity: PassageBriefingBaseRequest = {
  projectId: baseRequest.projectId,
  bookCode: baseRequest.bookCode,
  chapter: baseRequest.chapter,
  activeVerse: baseRequest.activeVerse,
  outputLanguage: baseRequest.outputLanguage,
  grounding: baseRequest.grounding,
  ignoreCache: baseRequest.ignoreCache,
};

const completeData = (source: string): PassageBriefingData => ({
  source,
  phase: 'complete',
  metadata: {
    attemptId: 'attempt',
    operationVersion: 'v1',
    cacheEpoch: '1',
    outputContractVersion: 'fluent-widgets-v1',
    references: ['JHN 3:1'],
  },
  outputLanguage: 'en',
  cacheHit: false,
});

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe('passage briefing query ownership', () => {
  it('pins expensive-query defaults and carries every bounded choice in the key', () => {
    const client = new QueryClient();
    const options = passageBriefingQueryOptions(client, baseRequest);
    expect(options).toMatchObject({
      staleTime: ASSISTANT_QUERY_DEFAULTS.staleTime,
      gcTime: ASSISTANT_QUERY_DEFAULTS.gcTime,
      retry: false,
      retryOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
    const configured = passageBriefingQueryKey({ ...baseRequest, grounding: 'configured' });
    const sameLanguage = passageBriefingQueryKey({
      ...baseRequest,
      grounding: 'output_language',
    });
    const english = passageBriefingQueryKey({ ...baseRequest, grounding: 'english' });
    expect(
      new Set([JSON.stringify(configured), JSON.stringify(sameLanguage), JSON.stringify(english)])
        .size
    ).toBe(3);
    expect(passageBriefingQueryKey({ ...baseRequest, ignoreCache: true })).not.toEqual(
      passageBriefingQueryKey(baseRequest)
    );
    expect(
      passageBriefingQueryOptions(client, {
        ...baseRequest,
        ignoreCache: true,
        persistentIgnoreCache: false,
        attempt: 1,
      })
    ).toMatchObject({ staleTime: Infinity, refetchOnMount: false });
    expect(
      passageBriefingQueryOptions(client, {
        ...baseRequest,
        ignoreCache: true,
        persistentIgnoreCache: true,
      })
    ).toMatchObject({ staleTime: 0, refetchOnMount: 'always' });
    expect(passageBriefingQueryKey({ ...baseRequest, activeVerse: 2 })).not.toEqual(
      passageBriefingQueryKey(baseRequest)
    );
    expect(passageBriefingQueryKey({ ...baseRequest, outputLanguage: 'hi' })).not.toEqual(
      passageBriefingQueryKey(baseRequest)
    );
  });

  it('is silent while disabled and triggers when opened', async () => {
    vi.mocked(streamPassageBriefing).mockResolvedValue(completeData('done'));
    const { client, wrapper } = harness();
    const { rerender } = renderHook(
      ({ enabled }) => usePassageBriefing(client, baseRequest, enabled),
      { wrapper, initialProps: { enabled: false } }
    );
    expect(streamPassageBriefing).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(streamPassageBriefing).toHaveBeenCalledTimes(1));
  });

  it('folds same-key observers into one producer', async () => {
    let finish: ((data: PassageBriefingData) => void) | undefined;
    vi.mocked(streamPassageBriefing).mockImplementation(
      () => new Promise(resolve => (finish = resolve))
    );
    const { client, wrapper } = harness();
    renderHook(
      () => [
        usePassageBriefing(client, baseRequest, true),
        usePassageBriefing(client, baseRequest, true),
      ],
      { wrapper }
    );
    await waitFor(() => expect(streamPassageBriefing).toHaveBeenCalledTimes(1));
    await act(async () => finish?.(completeData('done')));
  });

  it('resolves a successor touch to its already successful selected retry', async () => {
    const { client } = harness();
    startPassageBriefingAttempt(client, baseRequestIdentity, false);
    const selectedRetry = selectedPassageBriefingRequest(client, baseRequestIdentity);
    expect(selectedRetry).toMatchObject({ attempt: 1, ignoreCache: false });
    client.setQueryData(passageBriefingQueryKey(selectedRetry), completeData('retried'));

    await prefetchPassageBriefing(
      client,
      selectedPassageBriefingRequest(client, baseRequestIdentity)
    );

    expect(streamPassageBriefing).not.toHaveBeenCalled();
    expect(client.getQueryData(passageBriefingQueryKey(selectedRetry))).toMatchObject({
      source: 'retried',
      phase: 'complete',
    });
  });

  it('preserves a selected one-shot bypass in successor identity', () => {
    const { client } = harness();
    startPassageBriefingAttempt(client, baseRequestIdentity, true);

    expect(selectedPassageBriefingRequest(client, baseRequestIdentity)).toMatchObject({
      attempt: 1,
      ignoreCache: true,
      persistentIgnoreCache: false,
    });
  });

  it('joins a successor selected retry that is already in flight', async () => {
    let finish: ((data: PassageBriefingData) => void) | undefined;
    vi.mocked(streamPassageBriefing).mockImplementation(
      () => new Promise(resolve => (finish = resolve))
    );
    const { client } = harness();
    startPassageBriefingAttempt(client, baseRequestIdentity, false);
    const selectedRetry = selectedPassageBriefingRequest(client, baseRequestIdentity);
    const retry = client.fetchQuery(passageBriefingQueryOptions(client, selectedRetry));
    await waitFor(() => expect(streamPassageBriefing).toHaveBeenCalledTimes(1));

    const successorTouch = prefetchPassageBriefing(
      client,
      selectedPassageBriefingRequest(client, baseRequestIdentity)
    );
    expect(streamPassageBriefing).toHaveBeenCalledTimes(1);
    finish?.(completeData('joined retry'));
    await expect(Promise.all([retry, successorTouch])).resolves.toBeDefined();
    expect(streamPassageBriefing).toHaveBeenCalledTimes(1);
  });

  it('isolates stale-key deltas and lets an unobserved producer finish into its own cache', async () => {
    const pending = new Map<
      number,
      {
        publish: (data: PassageBriefingData) => void;
        resolve: (data: PassageBriefingData) => void;
      }
    >();
    vi.mocked(streamPassageBriefing).mockImplementation(
      (request, publish) =>
        new Promise(resolve => pending.set(request.activeVerse, { publish, resolve }))
    );
    const { client, wrapper } = harness();
    const { result, rerender, unmount } = renderHook(
      ({ request }) => usePassageBriefing(client, request, true),
      { wrapper, initialProps: { request: baseRequest } }
    );
    await waitFor(() => expect(pending.has(1)).toBe(true));

    const secondRequest = { ...baseRequest, activeVerse: 2 };
    rerender({ request: secondRequest });
    await waitFor(() => expect(pending.has(2)).toBe(true));
    act(() => pending.get(1)?.publish({ ...completeData('old delta'), phase: 'streaming' }));
    expect(result.current.data?.source).not.toBe('old delta');

    unmount();
    await act(async () => pending.get(1)?.resolve(completeData('old complete')));
    expect(client.getQueryData(passageBriefingQueryKey(baseRequest))).toMatchObject({
      source: 'old complete',
      phase: 'complete',
    });
  });

  it('does not give ordinary cacheable work TanStack cancellation authority', async () => {
    let finish: ((data: PassageBriefingData) => void) | undefined;
    vi.mocked(streamPassageBriefing).mockImplementation(
      () => new Promise(resolve => (finish = resolve))
    );
    const { client, wrapper } = harness();
    const view = renderHook(() => usePassageBriefing(client, baseRequest, true), { wrapper });
    await waitFor(() => expect(streamPassageBriefing).toHaveBeenCalledTimes(1));

    expect(vi.mocked(streamPassageBriefing).mock.calls[0][2]).toBeUndefined();
    view.unmount();
    await act(async () => finish?.(completeData('preserved')));
    expect(client.getQueryData(passageBriefingQueryKey(baseRequest))).toMatchObject({
      source: 'preserved',
      phase: 'complete',
    });
  });

  it('lets TanStack cancel a private effective ignore-cache attempt after unmount', async () => {
    let receivedSignal: AbortSignal | undefined;
    vi.mocked(streamPassageBriefing).mockImplementation(
      (_request, _publish, signal) =>
        new Promise((_resolve, reject) => {
          receivedSignal = signal;
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const ignored = { ...baseRequest, ignoreCache: true, persistentIgnoreCache: false };
    const { client, wrapper } = harness();
    const view = renderHook(() => usePassageBriefing(client, ignored, true), { wrapper });
    await waitFor(() => expect(receivedSignal).toBeInstanceOf(AbortSignal));
    expect(receivedSignal?.aborted).toBe(false);

    view.unmount();
    await waitFor(() => expect(receivedSignal?.aborted).toBe(true));
  });
});
