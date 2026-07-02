import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import type { PericopeSet } from '@/lib/types';

const fetchPericopeSets = async (): Promise<PericopeSet[]> => {
  const res = await fetch(`${config.api.url}/pericope-sets`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch pericope sets');

  const data = (await res.json()) as PericopeSet[];
  return data;
};

export const usePericopeSets = () => {
  return useQuery({
    queryKey: ['pericope-sets'],
    queryFn: fetchPericopeSets,
    staleTime: Infinity, // Static list of pericope sets
  });
};
