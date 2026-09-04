import { type ReactNode, useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  type BookDetails,
  useBookDetails,
  useUpdateBookDetails,
} from '@/features/projects/hooks/useBookDetails';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createTestQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const genesis: BookDetails = {
  bookId: 1,
  bookCode: 'GEN',
  bookName: 'Genesis',
  runningHeader: null,
  bookTitle: null,
  tocLongName: null,
  tocShortName: null,
  tocAbbreviation: null,
};

const listUrl = `${config.api.url}/project-units/7/book-details`;

describe('useBookDetails', () => {
  it('fetches the book details of a project unit', async () => {
    server.use(http.get(listUrl, () => HttpResponse.json([genesis])));

    const { result } = renderHook(() => useBookDetails(7), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([genesis]);
  });

  it('does not fetch without a project unit id', () => {
    const { result } = renderHook(() => useBookDetails(null), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('surfaces the API message when the request fails', async () => {
    server.use(
      http.get(listUrl, () => HttpResponse.json({ message: 'Project not found' }, { status: 404 }))
    );

    const { result } = renderHook(() => useBookDetails(7), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Project not found');
  });
});

describe('useUpdateBookDetails', () => {
  it('patches one book and updates the cached list in place', async () => {
    let received: unknown;
    server.use(
      http.get(listUrl, () => HttpResponse.json([genesis])),
      http.patch(`${listUrl}/1`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ ...genesis, tocLongName: 'Genesis' });
      })
    );

    const { result } = renderHook(
      () => ({ details: useBookDetails(7), update: useUpdateBookDetails() }),
      { wrapper: Wrapper }
    );
    await waitFor(() => expect(result.current.details.isSuccess).toBe(true));

    await result.current.update.mutateAsync({
      projectUnitId: 7,
      bookId: 1,
      fields: { tocLongName: 'Genesis' },
    });

    expect(received).toEqual({ tocLongName: 'Genesis' });
    await waitFor(() => expect(result.current.details.data?.[0]?.tocLongName).toBe('Genesis'));
  });

  it('rejects with the validation message from the API', async () => {
    server.use(
      http.patch(`${listUrl}/1`, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              issues: [{ code: 'invalid_string', path: ['tocLongName'], message: 'no pipes' }],
              name: 'ZodError',
            },
          },
          { status: 422 }
        )
      )
    );

    const { result } = renderHook(() => useUpdateBookDetails(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({ projectUnitId: 7, bookId: 1, fields: { tocLongName: 'a|b' } })
    ).rejects.toThrow('no pipes');
  });
});
