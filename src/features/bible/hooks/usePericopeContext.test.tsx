import { type ReactNode, useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  targetTextQueryOptions,
  useAddTranslatedVerse,
} from '@/features/bible/hooks/useBibleTarget';
import { bibleTextQueryOptions } from '@/features/bible/hooks/useBibleText';
import { usePericopeContext } from '@/features/bible/hooks/usePericopeContext';
import { translationLoader } from '@/features/bible/TranslationLoader';
import { config } from '@/lib/config';
import { type PericopeGroup, type ProjectItem } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createTestQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const projectItem: ProjectItem = {
  chapterAssignmentId: 2,
  projectId: 7,
  projectName: 'Test project',
  projectUnitId: 8,
  bibleId: 9,
  bibleName: 'Source Bible',
  targetLanguage: 'English',
  targetLangCode: 'eng',
  bookId: 1,
  book: 'Genesis',
  chapterStatus: 'In Progress',
  chapterNumber: 2,
  totalVerses: 1,
  completedVerses: 0,
  submittedTime: null,
  bookCode: 'GEN',
  sourceLangCode: 'eng',
};

const groups: PericopeGroup[] = [
  {
    pericopeNumber: '1',
    pericopeTitle: 'Across the boundary',
    verses: [
      { chapterNumber: 1, verseNumber: 1 },
      { chapterNumber: 2, verseNumber: 1 },
      { chapterNumber: 3, verseNumber: 1 },
    ],
  },
];

const sources = [
  { id: 101, verseNumber: 1, text: 'Previous chapter first verse' },
  { id: 102, verseNumber: 2, text: 'Previous chapter second verse' },
];

const previousTranslation = {
  id: 1001,
  projectUnitId: 8,
  bibleTextId: 101,
  assignedUserId: 1,
  content: 'Previous chapter translation',
  verseNumber: 1,
  markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const previousOnly = [{ ...groups[0], verses: groups[0].verses.slice(0, 2) }];

function servePreviousChapter() {
  server.use(
    http.get(`${config.api.url}/bibles/9/books/1/chapters/1/texts`, () =>
      HttpResponse.json(sources)
    ),
    http.get(`${config.api.url}/translated-verses`, () => HttpResponse.json([previousTranslation]))
  );
}

describe('usePericopeContext', () => {
  it('loads only referenced neighboring chapters and keeps repeated verse numbers separate', async () => {
    const requested: string[] = [];
    server.use(
      http.get(`${config.api.url}/bibles/9/books/1/chapters/:chapter/texts`, ({ params }) => {
        requested.push(`source:${String(params.chapter)}`);
        if (params.chapter === '1') return HttpResponse.json(sources);
        if (params.chapter === '3') {
          return HttpResponse.json([{ id: 301, verseNumber: 1, text: 'Next chapter first verse' }]);
        }
        return new HttpResponse(null, { status: 400 });
      }),
      http.get(`${config.api.url}/translated-verses`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        const chapter = params.get('chapterNumber');
        requested.push(`target:${chapter}`);
        if (params.get('projectUnitId') !== '8' || params.get('bookId') !== '1') {
          return new HttpResponse(null, { status: 400 });
        }
        return HttpResponse.json(
          chapter === '1'
            ? [previousTranslation]
            : [{ ...previousTranslation, id: 3001, bibleTextId: 301, content: 'Next translation' }]
        );
      })
    );

    const { result } = renderHook(
      () => usePericopeContext({ projectItem, pericopes: groups, enabled: true }),
      { wrapper: Wrapper }
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.chapters.size).toBe(2);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.chapters.get(1)).toEqual({
      isLoading: false,
      isError: false,
      sourceIsLoading: false,
      sourceIsError: false,
      sourceVerses: [{ id: 101, verseNumber: 1, text: 'Previous chapter first verse' }],
      targetVerses: [
        {
          id: 1001,
          verseNumber: 1,
          content: 'Previous chapter translation',
          markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
        },
      ],
    });
    expect(result.current.chapters.get(3)?.sourceVerses[0].text).toBe('Next chapter first verse');
    expect(result.current.chapters.get(3)?.targetVerses[0].content).toBe('Next translation');
    expect(requested.sort()).toEqual(['source:1', 'source:3', 'target:1', 'target:3']);
  });

  it('does not request chapter context in verse mode, including manual refetch', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => usePericopeContext({ projectItem, pericopes: groups, enabled: false }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    await act(() => result.current.refetch());

    expect(queryClient.isFetching()).toBe(0);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(result.current.chapters.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('does not attach a translation with another source ID to the same verse number', async () => {
    servePreviousChapter();
    server.use(
      http.get(`${config.api.url}/translated-verses`, () =>
        HttpResponse.json([{ ...previousTranslation, bibleTextId: 901 }])
      )
    );
    const { result } = renderHook(
      () => usePericopeContext({ projectItem, pericopes: previousOnly, enabled: true }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.chapters.get(1)?.targetVerses).toEqual([]);
  });

  it('refilters cached chapter text when the complete pericope references change', async () => {
    servePreviousChapter();
    const { result, rerender } = renderHook(
      ({ pericopes }) => usePericopeContext({ projectItem, pericopes, enabled: true }),
      { wrapper: Wrapper, initialProps: { pericopes: previousOnly } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({
      pericopes: [
        {
          ...groups[0],
          verses: [
            { chapterNumber: 1, verseNumber: 2 },
            { chapterNumber: 2, verseNumber: 1 },
          ],
        },
      ],
    });

    expect(result.current.chapters.get(1)?.sourceVerses).toEqual([
      { id: 102, verseNumber: 2, text: 'Previous chapter second verse' },
    ]);
    expect(result.current.chapters.get(1)?.targetVerses).toEqual([]);
  });

  it('reports a failed context request and allows retry without replacing the active chapter', async () => {
    servePreviousChapter();
    server.use(
      http.get(`${config.api.url}/translated-verses`, () =>
        HttpResponse.json({ message: 'Unavailable' }, { status: 500 })
      )
    );
    const { result } = renderHook(
      () => usePericopeContext({ projectItem, pericopes: previousOnly, enabled: true }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.chapters.get(1)).toEqual({
      sourceVerses: [sources[0]],
      targetVerses: [],
      isLoading: false,
      isError: true,
      sourceIsLoading: false,
      sourceIsError: false,
    });

    let releaseRetry: () => void = () => {};
    const retryReady = new Promise<void>(resolve => {
      releaseRetry = resolve;
    });
    server.use(
      http.get(`${config.api.url}/translated-verses`, async () => {
        await retryReady;
        return HttpResponse.json([previousTranslation]);
      })
    );
    let retry: ReturnType<typeof result.current.refetch>;
    act(() => {
      retry = result.current.refetch();
    });
    await waitFor(() => expect(result.current.chapters.get(1)?.isLoading).toBe(true));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.chapters.get(1)?.sourceVerses).toEqual([sources[0]]);
    expect(result.current.chapters.get(1)?.sourceIsLoading).toBe(false);
    await act(async () => {
      releaseRetry();
      await retry;
    });

    await waitFor(() =>
      expect(result.current.chapters.get(1)?.targetVerses[0].content).toBe(
        'Previous chapter translation'
      )
    );
    expect(result.current.isError).toBe(false);
    expect(result.current.chapters.has(2)).toBe(false);
  });

  it('keeps available context when a successful response omits some requested verses', async () => {
    servePreviousChapter();
    const pericopes = [
      {
        ...groups[0],
        verses: [
          { chapterNumber: 1, verseNumber: 1 },
          { chapterNumber: 1, verseNumber: 3 },
          { chapterNumber: 2, verseNumber: 1 },
        ],
      },
    ];
    const { result } = renderHook(
      () => usePericopeContext({ projectItem, pericopes, enabled: true }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.chapters.get(1)).toEqual({
      sourceVerses: [sources[0]],
      targetVerses: [
        {
          id: previousTranslation.id,
          verseNumber: 1,
          content: previousTranslation.content,
          markers: previousTranslation.markers,
        },
      ],
      isLoading: false,
      isError: false,
      sourceIsLoading: false,
      sourceIsError: false,
    });
  });

  it('treats an empty successful source response as unavailable content without a request error', async () => {
    servePreviousChapter();
    server.use(
      http.get(`${config.api.url}/bibles/9/books/1/chapters/1/texts`, () => HttpResponse.json([]))
    );
    const { result } = renderHook(
      () => usePericopeContext({ projectItem, pericopes: previousOnly, enabled: true }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.chapters.get(1)).toEqual({
      sourceVerses: [],
      targetVerses: [],
      isLoading: false,
      isError: false,
      sourceIsLoading: false,
      sourceIsError: false,
    });
  });

  it('keeps neighboring chapters independent while another chapter loads and fails', async () => {
    servePreviousChapter();
    let releaseNext: () => void = () => {};
    const nextReady = new Promise<void>(resolve => {
      releaseNext = resolve;
    });
    server.use(
      http.get(`${config.api.url}/bibles/9/books/1/chapters/3/texts`, async () => {
        await nextReady;
        return HttpResponse.json({ message: 'Unavailable' }, { status: 500 });
      })
    );
    const { result } = renderHook(
      () => usePericopeContext({ projectItem, pericopes: groups, enabled: true }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.chapters.get(1)?.isLoading).toBe(false));
    expect(result.current.chapters.get(1)?.sourceVerses).toEqual([sources[0]]);
    expect(result.current.chapters.get(1)?.isError).toBe(false);
    expect(result.current.chapters.get(3)).toEqual({
      sourceVerses: [],
      targetVerses: [],
      isLoading: true,
      isError: false,
      sourceIsLoading: true,
      sourceIsError: false,
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      releaseNext();
      await nextReady;
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.chapters.get(1)?.sourceVerses).toEqual([sources[0]]);
    expect(result.current.chapters.get(1)?.isError).toBe(false);
    expect(result.current.chapters.get(3)).toEqual({
      sourceVerses: [],
      targetVerses: [],
      isLoading: false,
      isError: true,
      sourceIsLoading: false,
      sourceIsError: true,
    });
  });

  it('keeps the chapters map and refetch callback stable across unrelated rerenders', async () => {
    servePreviousChapter();
    const { result, rerender } = renderHook(
      () => usePericopeContext({ projectItem, pericopes: previousOnly, enabled: true }),
      { wrapper: Wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const { chapters, refetch } = result.current;

    rerender();

    expect(result.current.chapters).toBe(chapters);
    expect(result.current.refetch).toBe(refetch);
  });

  it('does not expose a late response from a previously selected project unit', async () => {
    servePreviousChapter();
    const queryClient = createTestQueryClient();
    let releaseOldTarget: () => void = () => {};
    const oldTargetReady = new Promise<void>(resolve => {
      releaseOldTarget = resolve;
    });
    let oldRequestStarted = false;
    server.use(
      http.get(`${config.api.url}/translated-verses`, async ({ request }) => {
        if (new URL(request.url).searchParams.get('projectUnitId') === '8') {
          oldRequestStarted = true;
          await oldTargetReady;
          return HttpResponse.json([previousTranslation]);
        }
        return HttpResponse.json([
          { ...previousTranslation, projectUnitId: 18, content: 'New project translation' },
        ]);
      })
    );
    const { result, rerender } = renderHook(
      ({ item }) =>
        usePericopeContext({ projectItem: item, pericopes: previousOnly, enabled: true }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
        initialProps: { item: projectItem },
      }
    );
    await waitFor(() => expect(oldRequestStarted).toBe(true));

    rerender({ item: { ...projectItem, projectUnitId: 18 } });
    expect(result.current.chapters.get(1)?.targetVerses).toEqual([]);
    expect(result.current.chapters.get(1)?.isLoading).toBe(true);
    await waitFor(() =>
      expect(result.current.chapters.get(1)?.targetVerses[0].content).toBe(
        'New project translation'
      )
    );
    await act(async () => {
      releaseOldTarget();
      await oldTargetReady;
    });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(result.current.chapters.get(1)?.targetVerses[0].content).toBe('New project translation');
  });

  it('reuses raw chapter caches when context becomes an assignment and then context again', async () => {
    const requests: string[] = [];
    server.use(
      http.get(`${config.api.url}/bibles/9/books/1/chapters/1/texts`, () => {
        requests.push('source');
        return HttpResponse.json(sources);
      }),
      http.get(`${config.api.url}/translated-verses`, () => {
        requests.push('target');
        return HttpResponse.json([previousTranslation]);
      })
    );
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const first = renderHook(
      () => usePericopeContext({ projectItem, pericopes: previousOnly, enabled: true }),
      { wrapper }
    );
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.chapters.get(1)?.sourceVerses).toEqual([sources[0]]);
    first.unmount();

    useAppStore.setState({ userdetail: { id: 1 } as never, currentProjectItem: null });
    const assignment = await translationLoader({
      context: { queryClient },
      location: {
        state: { projectItem: { ...projectItem, chapterAssignmentId: 1, chapterNumber: 1 } },
      },
    });

    expect(assignment.sourceVerses).toEqual(sources);
    expect(assignment.targetVerses[0]).toEqual({
      id: previousTranslation.id,
      verseNumber: 1,
      content: previousTranslation.content,
      markers: previousTranslation.markers,
    });
    expect(queryClient.getQueryData(targetTextQueryOptions(8, 1, 1).queryKey)).toEqual([
      previousTranslation,
    ]);
    expect(queryClient.getQueryData(bibleTextQueryOptions(9, 1, 1).queryKey)).toEqual(sources);

    const second = renderHook(
      () => usePericopeContext({ projectItem, pericopes: previousOnly, enabled: true }),
      { wrapper }
    );
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.chapters.get(1)?.targetVerses[0].content).toBe(
      previousTranslation.content
    );
    expect(requests.sort()).toEqual(['source', 'target']);
  });

  it('shares source chapters across project units while isolating target and Bible identities', async () => {
    const requests: string[] = [];
    server.use(
      http.get(`${config.api.url}/bibles/:bible/books/1/chapters/1/texts`, ({ params }) => {
        requests.push(`source:${String(params.bible)}`);
        return HttpResponse.json(
          params.bible === '9' ? sources : [{ id: 1901, verseNumber: 1, text: 'Other Bible' }]
        );
      }),
      http.get(`${config.api.url}/translated-verses`, ({ request }) => {
        const unit = new URL(request.url).searchParams.get('projectUnitId');
        requests.push(`target:${unit}`);
        return HttpResponse.json([
          { ...previousTranslation, projectUnitId: Number(unit), content: `Unit ${unit}` },
        ]);
      })
    );
    const { result, rerender } = renderHook(
      ({ item }) =>
        usePericopeContext({ projectItem: item, pericopes: previousOnly, enabled: true }),
      { wrapper: Wrapper, initialProps: { item: projectItem } }
    );
    await waitFor(() =>
      expect(result.current.chapters.get(1)?.targetVerses[0].content).toBe('Unit 8')
    );

    rerender({ item: { ...projectItem, projectId: 17, projectUnitId: 18 } });
    expect(result.current.chapters.get(1)?.targetVerses).toEqual([]);
    await waitFor(() =>
      expect(result.current.chapters.get(1)?.targetVerses[0].content).toBe('Unit 18')
    );
    expect(requests.filter(value => value === 'source:9')).toHaveLength(1);

    rerender({ item: { ...projectItem, bibleId: 19 } });
    expect(result.current.chapters.get(1)?.sourceVerses).toEqual([]);
    await waitFor(() =>
      expect(result.current.chapters.get(1)?.sourceVerses[0].text).toBe('Other Bible')
    );
    expect(result.current.chapters.get(1)?.targetVerses).toEqual([]);
    expect(requests.sort()).toEqual(['source:19', 'source:9', 'target:18', 'target:8']);
  });

  it('refreshes invalidated translations before initializing an assignment after a save', async () => {
    const requests: string[] = [];
    let saved = previousTranslation.content;
    let releaseRefresh: () => void = () => {};
    const refreshReady = new Promise<void>(resolve => {
      releaseRefresh = resolve;
    });
    server.use(
      http.get(`${config.api.url}/bibles/9/books/1/chapters/1/texts`, () => {
        requests.push('source');
        return HttpResponse.json(sources);
      }),
      http.get(`${config.api.url}/translated-verses`, async ({ request }) => {
        const unit = new URL(request.url).searchParams.get('projectUnitId');
        requests.push(`target:${unit}`);
        if (unit === '8' && saved !== previousTranslation.content) await refreshReady;
        return HttpResponse.json([
          {
            ...previousTranslation,
            projectUnitId: Number(unit),
            content: unit === '8' ? saved : 'Other unit',
          },
        ]);
      }),
      http.post(`${config.api.url}/translated-verses`, async ({ request }) => {
        const body = (await request.json()) as { content: string };
        saved = body.content;
        return HttpResponse.json({ ...previousTranslation, content: saved });
      })
    );
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const context = renderHook(
      () => usePericopeContext({ projectItem, pericopes: previousOnly, enabled: true }),
      { wrapper }
    );
    await waitFor(() => expect(context.result.current.isLoading).toBe(false));
    context.unmount();
    await queryClient.fetchQuery(targetTextQueryOptions(18, 1, 1));
    const mutation = renderHook(useAddTranslatedVerse, { wrapper });

    await act(() =>
      mutation.result.current.mutateAsync({
        verseData: {
          projectUnitId: 8,
          bibleTextId: 101,
          assignedUserId: 1,
          content: 'Saved new draft',
        },
      })
    );
    expect(queryClient.getQueryState(targetTextQueryOptions(8, 1, 1).queryKey)?.isInvalidated).toBe(
      true
    );
    expect(
      queryClient.getQueryState(targetTextQueryOptions(18, 1, 1).queryKey)?.isInvalidated
    ).toBe(false);

    useAppStore.setState({ userdetail: { id: 1 } as never, currentProjectItem: null });
    let loaded = false;
    const assignmentPromise = translationLoader({
      context: { queryClient },
      location: {
        state: { projectItem: { ...projectItem, chapterAssignmentId: 1, chapterNumber: 1 } },
      },
    }).then(assignment => {
      loaded = true;
      return assignment;
    });
    await waitFor(() => expect(requests.filter(value => value === 'target:8')).toHaveLength(2));
    expect(loaded).toBe(false);
    releaseRefresh();
    const assignment = await assignmentPromise;

    expect(assignment.targetVerses[0].content).toBe('Saved new draft');
    expect(requests.filter(value => value === 'source')).toHaveLength(1);
    expect(requests.filter(value => value === 'target:18')).toHaveLength(1);
    expect(
      queryClient.getQueryData(targetTextQueryOptions(8, 1, 1).queryKey)?.[0].bibleTextId
    ).toBe(101);
  });
});
