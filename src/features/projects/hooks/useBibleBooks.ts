import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';

export interface BibleBook {
  bibleId: number;
  bookId: number;
  createdAt: string;
  updatedAt: string;
  book: {
    id: number;
    code: string;
    eng_display_name: string;
  };
  bible: {
    id: number;
    name: string;
  };
}

export interface Bible {
  id: number;
  languageId: number;
  name: string;
  abbreviation: string;
  createdAt: string;
  updatedAt: string;
}

const fetchBibleBooks = async (bibleId: number): Promise<BibleBook[]> => {
  const res = await fetch(`${config.api.url}/bible-books/bible/${bibleId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch bible books');

  const data = (await res.json()) as BibleBook[];
  return data;
};

const fetchBiblesByLanguage = async (languageId: number): Promise<Bible[]> => {
  const res = await fetch(`${config.api.url}/bibles/language/${languageId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch bibles');

  const data = (await res.json()) as Bible[];
  return data;
};

export const useBibleBooks = (bibleId: number | null) => {
  return useQuery({
    queryKey: ['bible-books', bibleId],
    queryFn: () => {
      if (bibleId === null) {
        return Promise.reject(new Error('No bibleId provided'));
      }
      return fetchBibleBooks(bibleId);
    },
    enabled: !!bibleId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useBiblesByLanguage = (languageId: number | null) => {
  return useQuery({
    queryKey: ['bibles', languageId],
    queryFn: () => {
      if (languageId === null) {
        return Promise.reject(new Error('No languageId provided'));
      }
      return fetchBiblesByLanguage(languageId);
    },
    enabled: !!languageId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
