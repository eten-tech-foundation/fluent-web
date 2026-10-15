import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chapterAudioQueryKey, type ChapterAudioKey } from '@/features/audio/hooks/useChapterAudio';
import { config } from '@/lib/config';
import { type ChapterAudioResponse, type VerseAudioRecording } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolveConflictArgs {
  key: ChapterAudioKey;
  bibleTextId: number;
  takeId: number;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const resolveConflict = async ({
  key,
  bibleTextId,
  takeId,
}: ResolveConflictArgs): Promise<VerseAudioRecording> => {
  const res = await fetch(
    `${config.api.url}/verse-audio/${key.projectUnitId}/${bibleTextId}/resolve`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ takeId }),
    }
  );

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
 * immediately without a round-trip refetch. Both `chapterAudio` and
 * `chapterAssignments` queries are invalidated so background data and the
 * chapter-list conflict indicator stay fresh.
 */
export const useResolveConflict = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resolveConflict,

    onSuccess: (updatedRecording, variables) => {
      const qk = chapterAudioQueryKey(variables.key);

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
      void queryClient.invalidateQueries({ queryKey: qk });

      // Invalidate chapter assignments so the chapter-list conflict indicator clears
      void queryClient.invalidateQueries({ queryKey: ['chapterAssignments'] });
    },
  });
};
