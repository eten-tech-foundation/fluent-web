import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type ChapterAudioResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChapterAudioKey {
  projectUnitId: number;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
}

export const chapterAudioQueryKey = (key: Partial<ChapterAudioKey> | null | undefined) => [
  'chapterAudio',
  key?.projectUnitId,
  key?.bibleId,
  key?.bookId,
  key?.chapterNumber,
];

// ---------------------------------------------------------------------------
// Fetch function
// ---------------------------------------------------------------------------

const fetchChapterAudio = async ({
  projectUnitId,
  bibleId,
  bookId,
  chapterNumber,
}: ChapterAudioKey): Promise<ChapterAudioResponse> => {
  const params = new URLSearchParams({
    projectUnitId: projectUnitId.toString(),
    bibleId: bibleId.toString(),
    bookId: bookId.toString(),
    chapterNumber: chapterNumber.toString(),
  });

  const res = await fetch(`${config.api.url}/verse-audio?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) throw new Error('Failed to fetch chapter audio');

  return (await res.json()) as ChapterAudioResponse;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches all verse-audio recordings (with takes) for a chapter.
 *
 * R2 pre-signed URLs expire in ~15 min; staleTime is set to 10 min so TanStack
 * Query refetches before they go stale and the audio player gets a 403.
 */
export const useChapterAudio = (
  key: Partial<ChapterAudioKey> | null | undefined,
  options?: { enabled?: boolean }
) => {
  const isCompleteKey = Boolean(
    key?.projectUnitId && key.bibleId && key.bookId && key.chapterNumber
  );

  return useQuery<ChapterAudioResponse>({
    queryKey: chapterAudioQueryKey(key),
    queryFn: () => {
      if (!key?.projectUnitId || !key.bibleId || !key.bookId || !key.chapterNumber) {
        throw new Error('projectUnitId, bibleId, bookId and chapterNumber are required');
      }
      return fetchChapterAudio(key as ChapterAudioKey);
    },
    enabled: (options?.enabled ?? true) && isCompleteKey,
    // Refetch every 10 min to get fresh pre-signed URLs before the 15-min R2 expiry
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};
