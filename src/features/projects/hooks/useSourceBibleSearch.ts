import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';

export interface SourceSearchBible {
  id: number;
  name: string;
  abbreviation: string;
  provider: string;
  languageId?: number;
  languageName?: string;
  languageCode?: string | null;
}

export interface SourceSearchLanguage {
  id: number;
  langName: string;
  langCodeIso6393: string | null;
  bibleCount: number;
  bibles: SourceSearchBible[];
}

export interface SourceSearchResult {
  languages: SourceSearchLanguage[];
  bibles: SourceSearchBible[];
}

const fetchSourceBibleSearch = async (query: string): Promise<SourceSearchResult> => {
  const res = await fetch(`${config.api.url}/bibles/search?q=${encodeURIComponent(query)}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to search source bibles');

  const data = (await res.json()) as SourceSearchResult;
  return data;
};

export const useSourceBibleSearch = (query: string) => {
  return useQuery({
    queryKey: ['source-bible-search', query],
    queryFn: () => fetchSourceBibleSearch(query),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};
