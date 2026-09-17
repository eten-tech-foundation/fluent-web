import { type QueryClient } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { targetTextQueryOptions } from '@/features/bible/hooks/useBibleTarget';
import { bibleTextQueryOptions } from '@/features/bible/hooks/useBibleText';
import { translationLoader } from '@/features/bible/TranslationLoader';
import { config } from '@/lib/config';
import type { ProjectItem } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

/**
 * A fresh session has neither `userdetail` nor `currentProjectItem` in the store — that is every
 * deep link, new tab, or shared URL. The loader used to throw plain Errors there, which the route
 * surfaces as the "Something went wrong" boundary (#427, bug 4). A session that cannot resolve
 * its context belongs back on the dashboard instead.
 */
/** Every field the loader reads, so the fetch layer is called with real arguments. */
const projectItem: ProjectItem = {
  chapterAssignmentId: 1,
  projectId: 2,
  projectName: 'Test Project',
  projectUnitId: 3,
  bibleId: 4,
  bibleName: 'Test Bible',
  targetLanguage: 'Hindi',
  targetLangCode: 'hin',
  bookId: 5,
  book: 'Genesis',
  bookCode: 'GEN',
  chapterStatus: 'in_progress',
  chapterNumber: 6,
  totalVerses: 31,
  completedVerses: 0,
  submittedTime: null,
  sourceLangCode: 'eng',
};

describe('translationLoader without in-app navigation state', () => {
  let queryClient: QueryClient;
  let requests: string[];
  beforeEach(() => {
    useAppStore.setState({ userdetail: null, currentProjectItem: null });
    queryClient = createTestQueryClient();
    requests = [];
    server.use(
      http.get(`${config.api.url}/bibles/4/books/5/chapters/6/texts`, () => {
        requests.push('source');
        return HttpResponse.json([{ id: 10, verseNumber: 1, text: 'in the beginning' }]);
      }),
      http.get(`${config.api.url}/translated-verses`, ({ request }) => {
        requests.push('target');
        const params = new URL(request.url).searchParams;
        expect(params.get('projectUnitId')).toBe('3');
        expect(params.get('bookId')).toBe('5');
        expect(params.get('chapterNumber')).toBe('6');
        return HttpResponse.json([
          { id: 20, bibleTextId: 10, projectUnitId: 3, verseNumber: 1, content: 'शुरुआत में' },
        ]);
      })
    );
  });

  it('redirects to the dashboard when user details are missing', async () => {
    const thrown = await translationLoader({ context: { queryClient }, location: {} }).then(
      () => undefined,
      error => error as unknown
    );
    expect(isRedirect(thrown)).toBe(true);
  });

  it('redirects to the dashboard when no project item can be resolved', async () => {
    useAppStore.setState({
      userdetail: { id: 2, email: 't@fluent.local' } as never,
    });
    const thrown = await translationLoader({ context: { queryClient }, location: {} }).then(
      () => undefined,
      error => error as unknown
    );
    expect(isRedirect(thrown)).toBe(true);
  });

  it('still loads normally when navigation state provides the project item', async () => {
    useAppStore.setState({
      userdetail: { id: 2, email: 't@fluent.local' } as never,
    });
    const result = await translationLoader({
      context: { queryClient },
      location: { search: { t: '1700000000' }, state: { projectItem } },
    });

    expect(requests.sort()).toEqual(['source', 'target']);
    expect(result).toEqual({
      projectItem,
      sourceVerses: [{ id: 10, verseNumber: 1, text: 'in the beginning' }],
      // Absent `markers` normalises to null rather than staying undefined.
      targetVerses: [{ id: 20, verseNumber: 1, content: 'शुरुआत में', markers: null }],
      loadedAt: '1700000000',
    });
    // The resolved assignment is what the drafting page reads back out of the store.
    expect(useAppStore.getState().currentProjectItem).toEqual(projectItem);
  });

  /**
   * `location.search` is typed optional, so the loader has to survive its absence rather than
   * assert it away — reading `search.t` off an absent `search` threw a TypeError before.
   */
  it('falls back to a generated cache buster when there is no search', async () => {
    useAppStore.setState({
      userdetail: { id: 2, email: 't@fluent.local' } as never,
    });
    server.use(
      http.get(`${config.api.url}/bibles/4/books/5/chapters/6/texts`, () => HttpResponse.json([])),
      http.get(`${config.api.url}/translated-verses`, () => HttpResponse.json([]))
    );

    const result = await translationLoader({
      context: { queryClient },
      location: { state: { projectItem } },
    });

    expect(result.loadedAt).toMatch(/^\d+$/);
    expect(result.sourceVerses).toEqual([]);
  });

  it('refreshes both raw chapter caches when navigation explicitly supplies a cache buster', async () => {
    useAppStore.setState({ userdetail: { id: 2 } as never });
    const sourceOptions = bibleTextQueryOptions(4, 5, 6);
    const targetOptions = targetTextQueryOptions(3, 5, 6);
    await Promise.all([
      queryClient.fetchQuery(sourceOptions),
      queryClient.fetchQuery(targetOptions),
    ]);
    server.use(
      http.get(`${config.api.url}/bibles/4/books/5/chapters/6/texts`, () => {
        requests.push('source');
        return HttpResponse.json([{ id: 10, verseNumber: 1, text: 'Updated source' }]);
      }),
      http.get(`${config.api.url}/translated-verses`, () => {
        requests.push('target');
        return HttpResponse.json([
          { id: 20, bibleTextId: 10, projectUnitId: 3, verseNumber: 1, content: 'Updated draft' },
        ]);
      })
    );

    const result = await translationLoader({
      context: { queryClient },
      location: { search: { t: 'explicit-refresh' }, state: { projectItem } },
    });

    expect(result.sourceVerses[0].text).toBe('Updated source');
    expect(result.targetVerses[0].content).toBe('Updated draft');
    expect(result.loadedAt).toBe('explicit-refresh');
    expect(requests.sort()).toEqual(['source', 'source', 'target', 'target']);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(queryClient.getQueryData(sourceOptions.queryKey)?.[0].text).toBe('Updated source');
    expect(queryClient.getQueryData(targetOptions.queryKey)?.[0]).toMatchObject({
      bibleTextId: 10,
      content: 'Updated draft',
    });

    // The override is local to this load: ordinary navigation still reuses the refreshed rows.
    const next = await translationLoader({
      context: { queryClient },
      location: { state: { projectItem } },
    });
    expect(next.sourceVerses).toEqual(result.sourceVerses);
    expect(next.targetVerses).toEqual(result.targetVerses);
    expect(requests).toHaveLength(4);
  });

  it.each([undefined, {}])(
    'reuses fresh raw chapter caches without search.t (%j)',
    async search => {
      useAppStore.setState({ userdetail: { id: 2 } as never });
      await Promise.all([
        queryClient.fetchQuery(bibleTextQueryOptions(4, 5, 6)),
        queryClient.fetchQuery(targetTextQueryOptions(3, 5, 6)),
      ]);

      const result = await translationLoader({
        context: { queryClient },
        location: { search, state: { projectItem } },
      });

      expect(requests.sort()).toEqual(['source', 'target']);
      expect(result.sourceVerses[0].text).toBe('in the beginning');
      expect(result.targetVerses[0].content).toBe('शुरुआत में');
      expect(result.loadedAt).toMatch(/^\d+$/);
    }
  );
});
