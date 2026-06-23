import { useQueries, useQuery } from '@tanstack/react-query';

import { config, getYouVersionApiHeaders } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

const YOUVERSION_API_BASE_URL = config.api.youversion_url;

export interface YouVersionBible {
  id: number;
  abbreviation: string;
  localized_abbreviation: string;
  title: string;
  localized_title: string;
  language_tag: string;
  info: string;
  copyright: string;
  publisher_url: string;
  promotional_content: string;
  youversion_deep_link: string;
  organization_id: string;
  books: string[];
}
interface YouVersionBiblesResponse {
  data: YouVersionBible[];
  next_page_token: string | null;
  total_size: number;
}

export interface YouVersionVerseMeta {
  id: number;
  passage_id: string;
  title: number;
}

export interface YouVersionChapterResponse {
  id: number;
  passage_id: string;
  title: number;
  verses: YouVersionVerseMeta[];
}

export interface YouVersionPassageResponse {
  id: string;
  content: string;
  reference: string;
}

// Fetch Functions

const fetchYouVersionBibles = async (languageTag: string): Promise<YouVersionBible[]> => {
  const response = await fetch(
    `${YOUVERSION_API_BASE_URL}/bibles?language_tag=${encodeURIComponent(languageTag)}&language_ranges[]=${encodeURIComponent(languageTag)}`,
    {
      method: 'GET',
      mode: 'cors',
      headers: getYouVersionApiHeaders(),
    }
  );

  if (!response.ok) {
    Logger.logException(new Error('Failed to fetch YouVersion bibles'), {
      context: `status=${response.status} languageTag=${languageTag}`,
    });
    return [];
  }

  const json = (await response.json()) as YouVersionBiblesResponse;
  return json.data;
};

const fetchYouVersionChapterMeta = async (
  bibleId: number,
  bookId: string,
  chapterId: number
): Promise<YouVersionChapterResponse> => {
  const response = await fetch(
    `${YOUVERSION_API_BASE_URL}/bibles/${bibleId}/books/${bookId}/chapters/${chapterId}`,
    {
      method: 'GET',
      mode: 'cors',
      headers: getYouVersionApiHeaders(),
    }
  );

  if (response.status === 404) {
    return { id: 0, passage_id: '', title: 0, verses: [] };
  }

  if (!response.ok) {
    Logger.logException(new Error('Failed to fetch YouVersion chapter metadata'), {
      context: `status=${response.status} bibleId=${bibleId} bookId=${bookId} chapterId=${chapterId}`,
    });
    return { id: 0, passage_id: '', title: 0, verses: [] };
  }

  return (await response.json()) as YouVersionChapterResponse;
};

const fetchYouVersionPassage = async (
  bibleId: number,
  passageId: string
): Promise<YouVersionPassageResponse> => {
  const response = await fetch(
    `${YOUVERSION_API_BASE_URL}/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}`,
    {
      method: 'GET',
      mode: 'cors',
      headers: getYouVersionApiHeaders(),
    }
  );

  if (response.status === 404) {
    return { id: passageId, content: '', reference: '' };
  }

  if (!response.ok) {
    Logger.logException(new Error('Failed to fetch YouVersion passage'), {
      context: `status=${response.status} bibleId=${bibleId} passageId=${passageId}`,
    });
    return { id: passageId, content: '', reference: '' };
  }

  return (await response.json()) as YouVersionPassageResponse;
};

// React Query Hooks

export const useYouVersionBibles = (languageTag: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['youversion-bibles', languageTag],
    queryFn: () => fetchYouVersionBibles(languageTag),
    enabled: enabled && !!languageTag,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    throwOnError: false,
  });
};

export const useYouVersionChapterMeta = (
  bibleId: number | null,
  bookId: string,
  chapterId: number,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['youversion-chapter-meta', bibleId, bookId, chapterId],
    queryFn: () => {
      if (bibleId === null) {
        throw new Error('useYouVersionChapterMeta called with null bibleId');
      }
      return fetchYouVersionChapterMeta(bibleId, bookId, chapterId);
    },
    enabled: enabled && bibleId !== null && !!bookId && !!chapterId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
    throwOnError: false,
  });
};

export const useYouVersionChapterText = (
  bibleId: number | null,
  chapterMeta: YouVersionChapterResponse | undefined,
  enabled: boolean = true
): Array<{ data: YouVersionPassageResponse | undefined; isLoading: boolean }> => {
  const verses = chapterMeta === undefined ? [] : chapterMeta.verses;

  const results = useQueries({
    queries: verses.map(verse => ({
      queryKey: ['youversion-passage', bibleId, verse.passage_id],
      queryFn: () => {
        if (bibleId === null) {
          throw new Error('useYouVersionChapterText called with null bibleId');
        }
        return fetchYouVersionPassage(bibleId, verse.passage_id);
      },
      enabled: enabled && bibleId !== null && !!verse.passage_id,
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: false,
      throwOnError: false,
    })),
  });

  return results.map(r => ({
    data: r.data,
    isLoading: r.isLoading,
  }));
};
