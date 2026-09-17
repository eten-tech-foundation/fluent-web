import { type ReactNode, useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { useChapterPericopes } from '@/features/pericopes/hooks/useChapterPericopes';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createTestQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useChapterPericopes', () => {
  it('keeps complete pericopes separate from the default chapter response', async () => {
    server.use(
      http.get(`${config.api.url}/projects/7/pericopes/GEN/2`, ({ request }) => {
        const complete = new URL(request.url).searchParams.get('includeFullPericopes') === 'true';
        return HttpResponse.json([
          {
            pericopeNumber: '2',
            pericopeTitle: 'The seventh day',
            verses: complete
              ? [
                  { chapterNumber: 1, verseNumber: 31 },
                  { chapterNumber: 2, verseNumber: 1 },
                ]
              : [{ chapterNumber: 2, verseNumber: 1 }],
          },
        ]);
      })
    );

    const { result } = renderHook(
      () => ({
        chapter: useChapterPericopes(7, 'GEN', 2),
        complete: useChapterPericopes(7, 'GEN', 2, true),
      }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.complete.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.chapter.isSuccess).toBe(true));
    expect(result.current.complete.data?.[0].verses).toEqual([
      { chapterNumber: 1, verseNumber: 31 },
      { chapterNumber: 2, verseNumber: 1 },
    ]);
    expect(result.current.chapter.data?.[0].verses).toEqual([{ chapterNumber: 2, verseNumber: 1 }]);
  });
  it('keeps each response cached across mode switches while refreshing in the background', async () => {
    let requests = 0;
    let release = () => {};
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    server.use(
      http.get(`${config.api.url}/projects/7/pericopes/GEN/2`, async ({ request }) => {
        requests++;
        if (requests > 2) await pending;
        const complete = new URL(request.url).searchParams.get('includeFullPericopes') === 'true';
        return HttpResponse.json([
          {
            pericopeNumber: '2',
            pericopeTitle: null,
            verses: complete
              ? [
                  { chapterNumber: 1, verseNumber: 31 },
                  { chapterNumber: 2, verseNumber: 1 },
                ]
              : [{ chapterNumber: 2, verseNumber: 1 }],
          },
        ]);
      })
    );
    const { result, rerender, unmount } = renderHook(
      ({ complete }) => useChapterPericopes(7, 'GEN', 2, complete),
      {
        initialProps: { complete: false },
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );
    try {
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      rerender({ complete: true });
      await waitFor(() => expect(result.current.data?.[0].verses).toHaveLength(2));
      rerender({ complete: false });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data?.[0].verses).toHaveLength(1);
      await waitFor(() => expect(requests).toBe(3));
      expect(result.current.isFetching).toBe(true);
      rerender({ complete: true });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data?.[0].verses).toHaveLength(2);
      await waitFor(() => expect(requests).toBe(4));
      expect(result.current.isFetching).toBe(true);
    } finally {
      release();
      unmount();
      queryClient.clear();
    }
  });
});
