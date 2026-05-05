import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';

export interface Language {
  id: number;
  langName: string;
  langNameLocalized: string;
  langCodeIso6393: string;
  scriptDirection: string;
  createdAt: string;
  updatedAt: string;
}

const fetchLanguages = async (): Promise<Language[]> => {
  const res = await fetch(`${config.api.url}/languages`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch languages');

  const data = (await res.json()) as Language[];
  return data;
};

export const useLanguages = () => {
  return useQuery({
    queryKey: ['languages'],
    queryFn: fetchLanguages,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
