import { useEffect, useRef } from 'react';

import { useAppStore } from '@/store/store';

import { useToggleChapterAi } from './useToggleChapterAi';

export function useSyncGlobalAiSetting(
  chapterAssignmentId: number | undefined,
  projectId: string | number | undefined,
  currentIsAiEnabled: boolean | undefined,
  isReadOnly: boolean
) {
  const { aiAutoEnablePreferences, userdetail, setCurrentProjectItem, currentProjectItem } =
    useAppStore();

  const { mutate: toggleAi } = useToggleChapterAi(chapterAssignmentId ?? 0, projectId ?? 0);

  const hasSyncedRef = useRef<number | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!chapterAssignmentId || !projectId || !userdetail || isReadOnly) return;

    // Only sync once per chapter assignment load
    if (hasSyncedRef.current === chapterAssignmentId) return;

    const userGlobalPreference = aiAutoEnablePreferences[userdetail.id];

    // If user has no preference yet, do not mark as synced so it can react if a preference is loaded late
    if (userGlobalPreference === undefined) {
      return;
    }

    // Only auto-enable if the global preference is true and the current chapter is not enabled
    if (userGlobalPreference === true && !currentIsAiEnabled) {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      toggleAi(userGlobalPreference, {
        onSuccess: () => {
          hasSyncedRef.current = chapterAssignmentId;
          isSyncingRef.current = false;
          if (currentProjectItem?.chapterAssignmentId === chapterAssignmentId) {
            setCurrentProjectItem({ ...currentProjectItem, isAiEnabled: userGlobalPreference });
          }
        },
        onError: () => {
          isSyncingRef.current = false;
          // By not setting hasSyncedRef, we leave it retryable if the component re-renders
        },
      });
    } else {
      // Mark as synced if no action is needed (e.g. they match, or preference is false)
      hasSyncedRef.current = chapterAssignmentId;
    }
  }, [
    chapterAssignmentId,
    projectId,
    currentIsAiEnabled,
    aiAutoEnablePreferences,
    userdetail,
    toggleAi,
    currentProjectItem,
    setCurrentProjectItem,
    isReadOnly,
  ]);
}
