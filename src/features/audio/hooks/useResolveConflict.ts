import { useMutation, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type ChapterAudioResponse, type VerseAudioRecording } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResolveConflictArgs {
  projectUnitId: number;
  bibleTextId: number;
  takeId: number;
  /** For optimistic cache update — identifies which chapterAudio cache entry to patch. */
  cacheKey: {
    projectUnitId: number;
    bibleId: number;
    bookId: number;
    chapterNumber: number;
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const resolveConflict = async ({
  projectUnitId,
  bibleTextId,
  takeId,
}: ResolveConflictArgs): Promise<VerseAudioRecording> => {
  const res = await fetch(`${config.api.url}/verse-audio/${projectUnitId}/${bibleTextId}/resolve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ takeId }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Failed to resolve conflict (${res.status})`);
  }

  return (await res.json()) as VerseAudioRecording;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation that designates a take as the active draft and clears a conflict.
 *
 * On success it patches the cached `chapterAudio` query so the UI updates
 * immediately without a round-trip refetch. The query is also invalidated so
 * background data stays fresh.
 */
export const useResolveConflict = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resolveConflict,

    onSuccess: (updatedRecording, variables) => {
      const { cacheKey } = variables;
      const qk = [
        'chapterAudio',
        cacheKey.projectUnitId,
        cacheKey.bibleId,
        cacheKey.bookId,
        cacheKey.chapterNumber,
      ];

      // Patch the cached chapter audio so the conflict indicator clears immediately
      queryClient.setQueryData<ChapterAudioResponse>(qk, old => {
        if (!old) return old;
        const updatedItems = old.items.map(item =>
          item.id === updatedRecording.id ? updatedRecording : item
        );
        const stillHasConflict = updatedItems.some(i => i.conflictStatus === 'conflict');
        return { items: updatedItems, hasConflict: stillHasConflict };
      });

      // Invalidate in background to refetch fresh pre-signed URLs
      void queryClient.invalidateQueries({ queryKey: qk, refetchType: 'none' });
    },
  });
};
