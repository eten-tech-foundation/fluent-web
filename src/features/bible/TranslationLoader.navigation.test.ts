import { type QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translationLoader } from '@/features/bible/TranslationLoader';
import { config } from '@/lib/config';
import type { ProjectItem } from '@/lib/types';
import { Route as TranslationRoute } from '@/routes/_authenticated/translation/$bookId/$chapterNumber';
import { Route as ViewRoute } from '@/routes/_authenticated/view/$bookId/$chapterNumber';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

vi.mock('@/features/bible/components/DraftingPage', () => ({ default: () => null }));

const project: ProjectItem = {
  chapterAssignmentId: 1,
  projectId: 1,
  projectName: 'First assignment',
  projectUnitId: 1,
  bibleId: 1,
  bibleName: 'Source',
  targetLanguage: 'English',
  targetLangCode: 'eng',
  bookId: 1,
  book: 'Genesis',
  bookCode: 'GEN',
  chapterNumber: 1,
  chapterStatus: 'draft',
  totalVerses: 1,
  completedVerses: 1,
  submittedTime: null,
  sourceLangCode: 'eng',
};

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.each([
  { path: '/translation/$bookId/$chapterNumber' as const, options: TranslationRoute.options },
  { path: '/view/$bookId/$chapterNumber' as const, options: ViewRoute.options },
])('assignment navigation on $path', ({ path, options }) => {
  beforeEach(() => {
    useAppStore.setState({ userdetail: { id: 1 } as never, currentProjectItem: null });
  });

  it('keeps the selected assignment when a cancelled response arrives after it', async () => {
    const held = deferred();
    const oldStarted = deferred();
    const oldReturned = deferred();
    const queryClient = createTestQueryClient();
    const nextProject = { ...project, chapterAssignmentId: 2, projectUnitId: 2 };
    server.use(
      http.get(`${config.api.url}/bibles/1/books/1/chapters/1/texts`, () =>
        HttpResponse.json([{ id: 10, verseNumber: 1, text: 'Source verse' }])
      ),
      http.get(`${config.api.url}/translated-verses`, async ({ request }) => {
        const id = new URL(request.url).searchParams.get('projectUnitId');
        if (id === '1') {
          oldStarted.resolve();
          await held.promise;
        }
        return HttpResponse.json([
          { id: Number(id), verseNumber: 1, content: id === '1' ? 'Old draft' : 'Selected draft' },
        ]);
      })
    );
    const root = createRootRouteWithContext<{ queryClient: QueryClient }>()();
    const home = createRoute({ getParentRoute: () => root, path: '/' });
    const drafting = createRoute({
      getParentRoute: () => root,
      path,
      validateSearch: options.validateSearch,
      loaderDeps: ({ search }) => options.loaderDeps?.({ search }) ?? {},
      gcTime: options.gcTime,
      staleTime: options.staleTime,
      loader: async context => {
        const result = await translationLoader(context);
        if (result.projectItem.chapterAssignmentId === 1) oldReturned.resolve();
        return result;
      },
    });
    const router = createRouter({
      routeTree: root.addChildren([home, drafting]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { queryClient },
    });
    try {
      await router.load();
      const pendingOld = router.navigate({
        to: path,
        params: { bookId: '1', chapterNumber: '1' },
        search: { t: 'first' },
        state: { projectItem: project },
      });
      await oldStarted.promise;
      await router.navigate({ to: '/' });
      await router.navigate({
        to: path,
        params: { bookId: '1', chapterNumber: '1' },
        search: { t: 'second' },
        state: { projectItem: nextProject },
      });
      held.resolve();
      await oldReturned.promise;
      await pendingOld;
      // Drain the cancelled loader's router updates before inspecting the active match.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(router.state.matches.at(-1)?.loaderData).toMatchObject({
        projectItem: { chapterAssignmentId: 2 },
        targetVerses: [{ content: 'Selected draft' }],
      });
      expect(useAppStore.getState().currentProjectItem?.chapterAssignmentId).toBe(2);
    } finally {
      held.resolve();
      queryClient.clear();
    }
  });
});
