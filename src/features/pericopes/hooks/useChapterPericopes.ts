import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import type { PericopeGroup } from '@/lib/types';

const fetchChapterPericopes = async (
  projectId: number,
  bookCode: string,
  chapter: number
): Promise<PericopeGroup[]> => {
  const res = await fetch(
    `${config.api.url}/projects/${projectId}/pericopes/${bookCode}/${chapter}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) throw new Error('Failed to fetch chapter pericopes');

  const data = (await res.json()) as PericopeGroup[];
  return data;
};

export const useChapterPericopes = (
  projectId: number | undefined | null,
  bookCode: string | undefined | null,
  chapter: number | undefined | null
) => {
  return useQuery({
    queryKey: ['pericopes', projectId, bookCode, chapter],
    queryFn: () => {
      if (!projectId || !bookCode || !chapter) {
        throw new Error('Project ID, Book Code, and Chapter are required');
      }
      return fetchChapterPericopes(projectId, bookCode, chapter);
    },
    enabled: !!projectId && !!bookCode && !!chapter,
  });
};
