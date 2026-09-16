import { queryOptions, useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type Source } from '@/lib/types';

export const fetchBibleText = async (
  bibleId: number,
  bookId: number,
  chapterNumber: number
): Promise<Source[]> => {
  const res = await fetch(
    `${config.api.url}/bibles/${bibleId}/books/${bookId}/chapters/${chapterNumber}/texts`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) throw new Error('Failed to fetch bible books');

  const data = (await res.json()) as Source[];
  return data;
};

export const bibleTextQueryOptions = (bibleId: number, bookId: number, chapterNumber: number) =>
  queryOptions({
    queryKey: ['bible-text', { bibleId, bookId, chapterNumber }],
    queryFn: () => fetchBibleText(bibleId, bookId, chapterNumber),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

export const useBibleText = (bibleId: number, bookId: number, chapterNumber: number) => {
  return useQuery({
    ...bibleTextQueryOptions(bibleId, bookId, chapterNumber),
    enabled: !!bibleId,
  });
};
