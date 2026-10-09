import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type ChapterAudioResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fetch function
// ---------------------------------------------------------------------------

const fetchChapterAudio = async (
  projectUnitId: number,
  bibleId: number,
  bookId: number,
  chapterNumber: number
): Promise<ChapterAudioResponse> => {
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
  projectUnitId: number | undefined | null,
  bibleId: number | undefined | null,
  bookId: number | undefined | null,
  chapterNumber: number | undefined | null,
  options?: { enabled?: boolean }
) => {
  return useQuery<ChapterAudioResponse>({
    queryKey: ['chapterAudio', projectUnitId, bibleId, bookId, chapterNumber],
    queryFn: () => {
      if (!projectUnitId || !bibleId || !bookId || !chapterNumber) {
        throw new Error('projectUnitId, bibleId, bookId and chapterNumber are required');
      }
      return fetchChapterAudio(projectUnitId, bibleId, bookId, chapterNumber);
    },
    enabled:
      (options?.enabled ?? true) && !!projectUnitId && !!bibleId && !!bookId && !!chapterNumber,
    // Refetch every 10 min to get fresh pre-signed URLs before the 15-min R2 expiry
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};
