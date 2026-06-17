import { useQuery } from '@tanstack/react-query';

import { config, getYouVersionApiHeaders } from '@/lib/config';

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

  if (!response.ok) throw new Error('Failed to fetch YouVersion bibles');

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

  if (!response.ok) throw new Error('Failed to fetch YouVersion chapter metadata');
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

  if (!response.ok) throw new Error(`Failed to fetch YouVersion passage ${passageId}`);
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
  });
};

export const useYouVersionChapterText = (
  bibleId: number | null,
  chapterMeta: YouVersionChapterResponse | undefined,
  enabled: boolean = true
): Array<{ data: YouVersionPassageResponse | undefined; isLoading: boolean }> => {
  const verses = chapterMeta?.verses ?? [];
  const MAX_VERSES = 176;

  const results = Array.from({ length: MAX_VERSES }, (_, i) => {
    const verse = verses[i];
    const passageId = verse.passage_id;
    const shouldFetch = enabled && bibleId !== null && !!passageId;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useQuery({
      queryKey: ['youversion-passage', bibleId, passageId],
      queryFn: () => {
        if (bibleId === null) {
          throw new Error('useYouVersionChapterText called with null bibleId');
        }
        return fetchYouVersionPassage(bibleId, passageId);
      },
      enabled: shouldFetch,
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
    });
  });

  // Return only the slice that corresponds to actual verses
  return results.slice(0, verses.length).map(r => ({
    data: r.data,
    isLoading: r.isLoading,
  }));
};
