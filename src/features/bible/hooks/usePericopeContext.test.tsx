import { type ReactNode, useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { usePericopeContext } from '@/features/bible/hooks/usePericopeContext';
import { config } from '@/lib/config';
import { type PericopeGroup, type ProjectItem } from '@/lib/types';
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
      sourceVerses: [],
      targetVerses: [],
      isLoading: false,
      isError: true,
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
    expect(result.current.chapters.get(1)?.sourceVerses).toEqual([]);
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
});
