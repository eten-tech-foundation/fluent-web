import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type Book } from '@/lib/types';

const fetchProjectUnitBooks = async (projectUnitId: string): Promise<Book[]> => {
  const res = await fetch(`${config.api.url}/projects/${projectUnitId}/books`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error('Failed to fetch project unit books');

  const data = (await res.json()) as Book[];
  return data;
};

export const useProjectUnitBooks = (projectUnitId: string) => {
  return useQuery<Book[]>({
    queryKey: ['project-unit-books', projectUnitId],
    queryFn: () => fetchProjectUnitBooks(projectUnitId),
    enabled: !!projectUnitId,
  });
};
