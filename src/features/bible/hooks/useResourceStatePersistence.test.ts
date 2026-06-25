import { createElement, type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  type FetchResourceState,
  useResourceState,
  useSaveResourceState,
} from './useResourceStatePersistence';

const API_BASE = config.api.url;
const editorStateUrl = (id: number) =>
  `${API_BASE}/chapter-assignments/${id}/editor-state`;

const makeWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

/** A minimal valid FetchResourceState (all required fields plus defaults for new optional ones). */
const makeState = (over: Partial<FetchResourceState> = {}): FetchResourceState => ({
  activeResource: 'ult',
  languageCode: 'eng',
  tabStatus: false,
  ...over,
});

// ---------------------------------------------------------------------------
// useResourceState — fetching the new optional fields
// ---------------------------------------------------------------------------

describe('useResourceState — new field: activeLeftTab', () => {
  it('returns activeLeftTab "checks" when the server includes it', async () => {
    const state = makeState({ activeLeftTab: 'checks' });
    server.use(
      http.get(editorStateUrl(99), () => HttpResponse.json(state))
    );

    const { result } = renderHook(() => useResourceState(99), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.activeLeftTab).toBe('checks');
  });

  it('returns activeLeftTab "resources" when the server includes it', async () => {
    const state = makeState({ activeLeftTab: 'resources' });
    server.use(
      http.get(editorStateUrl(99), () => HttpResponse.json(state))
    );

    const { result } = renderHook(() => useResourceState(99), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.activeLeftTab).toBe('resources');
  });

  it('returns undefined activeLeftTab when the server omits it (old row, backward-compatible)', async () => {
    // Old rows do not include activeLeftTab; the key must simply be absent.
    const state = makeState(); // no activeLeftTab
    server.use(
      http.get(editorStateUrl(99), () => HttpResponse.json(state))
    );

    const { result } = renderHook(() => useResourceState(99), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.activeLeftTab).toBeUndefined();
  });
});

describe('useResourceState — new field: checkOccurrenceRules', () => {
  it('returns checkOccurrenceRules when the server includes them', async () => {
    const rules = {
      'JDG 4:3|the the|0': 'suppress' as const,
      'JDG 4:5|and and|0': 'surface' as const,
    };
    const state = makeState({ checkOccurrenceRules: rules });
    server.use(
      http.get(editorStateUrl(99), () => HttpResponse.json(state))
    );

    const { result } = renderHook(() => useResourceState(99), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.checkOccurrenceRules).toEqual(rules);
  });

  it('returns empty checkOccurrenceRules when the server sends an empty map', async () => {
    const state = makeState({ checkOccurrenceRules: {} });
    server.use(
      http.get(editorStateUrl(99), () => HttpResponse.json(state))
    );

    const { result } = renderHook(() => useResourceState(99), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.checkOccurrenceRules).toEqual({});
  });

  it('returns undefined checkOccurrenceRules when the server omits it (old row, backward-compatible)', async () => {
    const state = makeState(); // no checkOccurrenceRules
    server.use(
      http.get(editorStateUrl(99), () => HttpResponse.json(state))
    );

    const { result } = renderHook(() => useResourceState(99), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.checkOccurrenceRules).toBeUndefined();
  });
});

describe('useResourceState — edge cases', () => {
  it('returns null when the chapter has no saved state (404)', async () => {
    server.use(
      http.get(editorStateUrl(99), () => HttpResponse.json(null, { status: 404 }))
    );

    const { result } = renderHook(() => useResourceState(99), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('errors when the server returns a non-404 error', async () => {
    server.use(
      http.get(editorStateUrl(99), () => HttpResponse.json({}, { status: 500 }))
    );

    const { result } = renderHook(() => useResourceState(99), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fire when chapterAssignmentId is 0 (falsy guard)', async () => {
    const calls = { count: 0 };
    server.use(
      http.get(`${API_BASE}/chapter-assignments/0/editor-state`, () => {
        calls.count += 1;
        return HttpResponse.json({});
      })
    );

    renderHook(() => useResourceState(0), { wrapper: makeWrapper() });

    await new Promise(r => setTimeout(r, 50));
    expect(calls.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// useSaveResourceState — persisting the new optional fields
// ---------------------------------------------------------------------------

describe('useSaveResourceState — new fields in payload', () => {
  it('sends activeLeftTab "checks" in the resources blob', async () => {
    const captured: { body: unknown } = { body: undefined };
    server.use(
      http.put(editorStateUrl(10), async ({ request }) => {
        captured.body = await request.json();
        return HttpResponse.json({});
      })
    );

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveResourceState(), { wrapper });

    await act(async () => {
      result.current.mutate({
        chapterAssignmentId: 10,
        resourceState: {
          resources: {
            bookCode: 'GEN',
            chapterNumber: 1,
            verseNumber: 1,
            activeResource: 'ult',
            languageCode: 'eng',
            tabStatus: false,
            activeLeftTab: 'checks',
          },
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured.body).toMatchObject({
      resources: { activeLeftTab: 'checks' },
    });
  });

  it('sends checkOccurrenceRules in the resources blob', async () => {
    const rules = { 'GEN 1:1|the the|0': 'suppress' as const };
    const captured: { body: unknown } = { body: undefined };
    server.use(
      http.put(editorStateUrl(10), async ({ request }) => {
        captured.body = await request.json();
        return HttpResponse.json({});
      })
    );

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveResourceState(), { wrapper });

    await act(async () => {
      result.current.mutate({
        chapterAssignmentId: 10,
        resourceState: {
          resources: {
            bookCode: 'GEN',
            chapterNumber: 1,
            verseNumber: 1,
            activeResource: 'ult',
            languageCode: 'eng',
            tabStatus: false,
            checkOccurrenceRules: rules,
          },
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured.body).toMatchObject({
      resources: { checkOccurrenceRules: rules },
    });
  });

  it('sends both activeLeftTab and checkOccurrenceRules together', async () => {
    const rules = {
      'JDG 4:3|the the|0': 'suppress' as const,
      'JDG 4:5|and and|0': 'surface' as const,
    };
    const captured: { body: unknown } = { body: undefined };
    server.use(
      http.put(editorStateUrl(42), async ({ request }) => {
        captured.body = await request.json();
        return HttpResponse.json({});
      })
    );

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveResourceState(), { wrapper });

    await act(async () => {
      result.current.mutate({
        chapterAssignmentId: 42,
        resourceState: {
          resources: {
            bookCode: 'JDG',
            chapterNumber: 4,
            verseNumber: 3,
            activeResource: 'ult',
            languageCode: 'eng',
            tabStatus: true,
            activeLeftTab: 'checks',
            checkOccurrenceRules: rules,
          },
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured.body).toMatchObject({
      resources: {
        activeLeftTab: 'checks',
        checkOccurrenceRules: rules,
      },
    });
  });

  it('can omit activeLeftTab and checkOccurrenceRules (backward-compatible with old callers)', async () => {
    const captured: { body: unknown } = { body: undefined };
    server.use(
      http.put(editorStateUrl(5), async ({ request }) => {
        captured.body = await request.json();
        return HttpResponse.json({});
      })
    );

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveResourceState(), { wrapper });

    await act(async () => {
      result.current.mutate({
        chapterAssignmentId: 5,
        resourceState: {
          resources: {
            bookCode: 'GEN',
            chapterNumber: 1,
            verseNumber: 1,
            activeResource: 'ult',
            languageCode: 'eng',
            tabStatus: false,
            // no activeLeftTab, no checkOccurrenceRules
          },
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((captured.body as { resources: FetchResourceState }).resources.activeLeftTab).toBeUndefined();
    expect((captured.body as { resources: FetchResourceState }).resources.checkOccurrenceRules).toBeUndefined();
  });

  it('errors and does not mutate cache on server failure', async () => {
    server.use(
      http.put(editorStateUrl(10), () => HttpResponse.json({}, { status: 500 }))
    );

    // Silence the expected Logger.logException call by spying without throwing
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveResourceState(), { wrapper });

    await act(async () => {
      result.current.mutate({
        chapterAssignmentId: 10,
        resourceState: {
          resources: {
            bookCode: 'GEN',
            chapterNumber: 1,
            verseNumber: 1,
            activeResource: 'ult',
            languageCode: 'eng',
            tabStatus: false,
          },
        },
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('updates the react-query cache on success so a subsequent useResourceState read is fresh', async () => {
    const savedState = makeState({
      activeLeftTab: 'checks',
      checkOccurrenceRules: { 'JDG 4:3|the the|0': 'suppress' },
    });

    server.use(
      http.put(editorStateUrl(10), () => HttpResponse.json({})),
      http.get(editorStateUrl(10), () => HttpResponse.json(savedState))
    );

    // Share a single QueryClient so the mutation cache update is visible to the query.
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const saveHook = renderHook(() => useSaveResourceState(), { wrapper });
    const stateHook = renderHook(() => useResourceState(10), { wrapper });

    // First, fetch the initial state.
    await waitFor(() => expect(stateHook.result.current.isSuccess).toBe(true));

    // Perform a save with the new fields.
    await act(async () => {
      saveHook.result.current.mutate({
        chapterAssignmentId: 10,
        resourceState: { resources: { ...savedState, bookCode: 'JDG', chapterNumber: 4, verseNumber: 3 } },
      });
    });

    await waitFor(() => expect(saveHook.result.current.isSuccess).toBe(true));

    // The query cache should now reflect the new fields via onSuccess -> setQueryData.
    const cached = queryClient.getQueryData<FetchResourceState | null>(['resource-state', 10]);
    expect(cached?.activeLeftTab).toBe('checks');
    expect(cached?.checkOccurrenceRules).toEqual({ 'JDG 4:3|the the|0': 'suppress' });
  });
});