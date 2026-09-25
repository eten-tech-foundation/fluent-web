import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type Book } from '@/lib/types';

const fetchProjectBooks = async (projectId: string): Promise<Book[]> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/books`, {
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

export const useProjectBooks = (projectId: string) => {
  return useQuery<Book[]>({
    queryKey: ['project-unit-books', projectId], // keeping queryKey the same for cache hit, but parameter name updated
    queryFn: () => fetchProjectBooks(projectId),
    enabled: !!projectId,
  });
};
