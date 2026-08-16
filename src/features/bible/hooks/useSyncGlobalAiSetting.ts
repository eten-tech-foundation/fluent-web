import { useEffect, useRef } from 'react';

import { type ProjectItem } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { useToggleChapterAi } from './useToggleChapterAi';

export function useSyncGlobalAiSetting(
  chapterAssignmentId: number | undefined,
  projectId: string | number | undefined,
  currentIsAiEnabled: boolean | undefined,
  isReadOnly: boolean,
  projectItem: ProjectItem | undefined
) {
  const aiAutoEnablePreferences = useAppStore(state => state.aiAutoEnablePreferences);
  const userdetail = useAppStore(state => state.userdetail);
  const setIsAiSyncPending = useAppStore(state => state.setIsAiSyncPending);

  const { mutateAsync: toggleAiAsync } = useToggleChapterAi(
    chapterAssignmentId ?? 0,
    projectId ?? 0
  );

  const hasSyncedRef = useRef<number | null>(null);
  const syncingIdsRef = useRef<Set<number>>(new Set());
  const failedIdsRef = useRef<Set<number>>(new Set());
  const prevChapterRef = useRef<number | undefined>();

  useEffect(() => {
    if (
      chapterAssignmentId == null ||
      projectId == null ||
      !userdetail ||
      isReadOnly ||
      !projectItem
    )
      return;

    // When navigating to a different chapter, allow retry for previously failed chapters
    if (prevChapterRef.current !== undefined && prevChapterRef.current !== chapterAssignmentId) {
      failedIdsRef.current.delete(prevChapterRef.current);
    }
    prevChapterRef.current = chapterAssignmentId;

    // Only sync once per chapter assignment load
    if (hasSyncedRef.current === chapterAssignmentId) return;
    // Don't retry a chapter that already failed in this mount (prevents infinite loop)
    if (failedIdsRef.current.has(chapterAssignmentId)) return;

    const userGlobalPreference = aiAutoEnablePreferences[userdetail.id];

    // If user has no preference yet, do not mark as synced so it can react if a preference is loaded late
    if (userGlobalPreference === undefined) {
      return;
    }

    // Only auto-enable if the global preference is true and the current chapter is not enabled
    if (userGlobalPreference === true && !currentIsAiEnabled) {
      if (syncingIdsRef.current.has(chapterAssignmentId)) return;
      syncingIdsRef.current.add(chapterAssignmentId);

      // Do NOT update store optimistically here! If we do, the UI immediately thinks AI is enabled,
      // and fires a GET/POST to the backend for AI suggestions BEFORE the PATCH completes.
      // The backend sees AI is still disabled and ignores the request, causing suggestions to never load!

      const enableAi = async () => {
        try {
          setIsAiSyncPending(true);
          await toggleAiAsync(true);
          hasSyncedRef.current = chapterAssignmentId;
          syncingIdsRef.current.delete(chapterAssignmentId);

          const latestStore = useAppStore.getState();
          if (latestStore.currentProjectItem?.chapterAssignmentId === chapterAssignmentId) {
            latestStore.setCurrentProjectItem({
              ...latestStore.currentProjectItem,
              isAiEnabled: true,
            });
          }
        } catch {
          syncingIdsRef.current.delete(chapterAssignmentId);
          failedIdsRef.current.add(chapterAssignmentId);
        } finally {
          setIsAiSyncPending(false);
        }
      };

      void enableAi();
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
    toggleAiAsync,
    isReadOnly,
    projectItem,
    setIsAiSyncPending,
  ]);
}
