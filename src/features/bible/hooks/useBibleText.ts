import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type ProjectItem } from '@/lib/types';

export const fetchBibleText = async (
  bibleId: number,
  bookId: number,
  chapterNumber: number
): Promise<ProjectItem[]> => {
  const res = await fetch(
    `${config.api.url}/bibles/${bibleId}/books/${bookId}/chapters/${chapterNumber}/texts`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) throw new Error('Failed to fetch bible books');

  const data = (await res.json()) as ProjectItem[];
  return data;
};

export const useBibleText = (bibleId: number, bookId: number, chapterNumber: number) => {
  return useQuery({
    queryKey: ['bible-text', { bibleId, bookId, chapterNumber }],
    queryFn: () => {
      return fetchBibleText(bibleId, bookId, chapterNumber);
    },
    enabled: !!bibleId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
