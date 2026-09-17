import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface YouVersionBible {
  id: number;
  abbreviation: string;
  localized_abbreviation: string;
  title: string;
  localized_title: string;
  language_tag: string;
  info?: string;
  copyright?: string;
  publisher_url?: string;
  promotional_content?: string;
  youversion_deep_link?: string;
  organization_id?: string;
  books?: string[];
}

/** One verse returned by the server-side batch chapter-text endpoint. */
export interface YouVersionBibleVerse {
  verseNumber: number;
  passageId: string;
  content: string;
}

/**
 * Response for GET /youversion/bibles/{bibleId}/chapters/{chapterId}/text.
 * The server fans out all passage fetches internally — one request per chapter.
 */
export interface YouVersionChapterText {
  bibleId: number;
  bookId: string;
  chapterId: number;
  verses: YouVersionBibleVerse[];
}

// ─── Fetch functions ──────────────────────────────────────────────────────────

/**
 * Fetches the list of YouVersion Bibles for a language tag.
 * Calls fluent-api's /youversion/bibles proxy — the API key never leaves the server.
 */
export const fetchYouVersionBibles = async (languageTag: string): Promise<YouVersionBible[]> => {
  const url = new URL(`${config.api.url}/youversion/bibles`);
  url.searchParams.set('language_tag', languageTag);

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    Logger.logException(new Error('Failed to fetch YouVersion bibles'), {
      context: `status=${response.status} languageTag=${languageTag}`,
    });
    return [];
  }

  return (await response.json()) as YouVersionBible[];
};

/**
 * Fetches all verse texts for a chapter via the server-side batch endpoint.
 * Calls fluent-api's /youversion/bibles/{bibleId}/chapters/{chapterId}/text proxy.
 * The server fans out the per-verse passage fetches using the server-held API key.
 */
export const fetchYouVersionChapterText = async (
  bibleId: number,
  bookId: string,
  chapterId: number
): Promise<YouVersionChapterText> => {
  const url = new URL(`${config.api.url}/youversion/bibles/${bibleId}/chapters/${chapterId}/text`);
  url.searchParams.set('bookId', bookId);

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    Logger.logException(new Error('Failed to fetch YouVersion chapter text'), {
      context: `status=${response.status} bibleId=${bibleId} bookId=${bookId} chapterId=${chapterId}`,
    });
    return { bibleId, bookId, chapterId, verses: [] };
  }

  return (await response.json()) as YouVersionChapterText;
};

// ─── React Query hooks ────────────────────────────────────────────────────────

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

/**
 * Fetches all verse texts for a YouVersion bible chapter.
 * Replaces the old two-step useYouVersionChapterMeta + useYouVersionChapterText(useQueries)
 * fan-out — the server now handles the fan-out internally.
 */
export const useYouVersionChapterText = (
  bibleId: number | null,
  bookId: string,
  chapterId: number,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['youversion-chapter-text', bibleId, bookId, chapterId],
    queryFn: () => {
      if (bibleId === null) {
        throw new Error('useYouVersionChapterText called with null bibleId');
      }
      return fetchYouVersionChapterText(bibleId, bookId, chapterId);
    },
    enabled: enabled && bibleId !== null && !!bookId && !!chapterId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
    throwOnError: false,
  });
};
