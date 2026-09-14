import { type ReactNode, useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
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
});
