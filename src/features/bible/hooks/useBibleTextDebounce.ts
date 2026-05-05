import { useCallback, useEffect, useRef } from 'react';

interface UseBibleTextDebounceProps {
  onSave: (verseId: number, text: string) => Promise<void>;
  debounceMs?: number;
  retryDelayMs?: number;
}

export const useBibleTextDebounce = ({
  onSave,
  debounceMs = 2000,
  retryDelayMs = 10000,
}: UseBibleTextDebounceProps) => {
  const debounceTimeouts = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const activeSaves = useRef<Map<number, Promise<void>>>(new Map());
  const retryTimeouts = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const lastSavedContent = useRef<Map<number, string>>(new Map());
  const currentContent = useRef<Map<number, string>>(new Map());
  const saveSequence = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const debounceTimeoutsRef = debounceTimeouts.current;
    const retryTimeoutsRef = retryTimeouts.current;

    return () => {
      debounceTimeoutsRef.forEach(timeout => clearTimeout(timeout));
      retryTimeoutsRef.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  // Core save function that handles race conditions and retries
  const executeSave = useCallback(
    async (verseId: number, content: string, sequenceNumber: number): Promise<void> => {
      // Check if this is still the latest save attempt
      const currentSequence = saveSequence.current.get(verseId) ?? 0;
      if (sequenceNumber < currentSequence) {
        return;
      }

      // Don't save if content hasn't changed from last saved version
      const lastSaved = lastSavedContent.current.get(verseId) ?? '';
      if (content === lastSaved) {
        activeSaves.current.delete(verseId);
        return;
      }

      try {
        await onSave(verseId, content);

        // Only update if this is still the latest sequence
        if (sequenceNumber === (saveSequence.current.get(verseId) ?? 0)) {
          lastSavedContent.current.set(verseId, content);
          activeSaves.current.delete(verseId);

          // Clear any pending retry for this verse
          const retryTimeout = retryTimeouts.current.get(verseId);
          if (retryTimeout) {
            clearTimeout(retryTimeout);
            retryTimeouts.current.delete(verseId);
          }
        }
      } catch (error) {
        // Only handle error if this is still the latest sequence
        if (sequenceNumber === (saveSequence.current.get(verseId) ?? 0)) {
          activeSaves.current.delete(verseId);

          // Schedule a single retry after 10 seconds
          const retryTimeout = setTimeout(() => {
            retryTimeouts.current.delete(verseId);
            const retryContent = currentContent.current.get(verseId) ?? '';
            if (retryContent !== lastSavedContent.current.get(verseId)) {
              const newSequence = (saveSequence.current.get(verseId) ?? 0) + 1;
              saveSequence.current.set(verseId, newSequence);
              activeSaves.current.set(verseId, executeSave(verseId, retryContent, newSequence));
            }
          }, retryDelayMs);

          retryTimeouts.current.set(verseId, retryTimeout);
        } else {
          // If this is an outdated sequence that failed, still clean it up
          activeSaves.current.delete(verseId);
        }

        throw error;
      }
    },
    [onSave, retryDelayMs]
  );

  const debouncedSave = useCallback(
    (verseId: number, content: string) => {
      currentContent.current.set(verseId, content);

      // Clear existing debounce timeout
      const existingTimeout = debounceTimeouts.current.get(verseId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Don't schedule save if content hasn't changed from last saved
      const lastSaved = lastSavedContent.current.get(verseId) ?? '';
      if (content === lastSaved) {
        debounceTimeouts.current.delete(verseId);
        return;
      }

      // Schedule new save
      const timeout = setTimeout(() => {
        debounceTimeouts.current.delete(verseId);

        const sequenceNumber = (saveSequence.current.get(verseId) ?? 0) + 1;
        saveSequence.current.set(verseId, sequenceNumber);

        const savePromise = executeSave(verseId, content, sequenceNumber);
        activeSaves.current.set(verseId, savePromise);
      }, debounceMs);

      debounceTimeouts.current.set(verseId, timeout);
    },
    [debounceMs, executeSave]
  );

  // Immediate save - cancels debounce and saves immediately
  const saveImmediately = useCallback(
    async (verseId: number, content: string): Promise<void> => {
      // Update current content
      currentContent.current.set(verseId, content);

      // Clear any pending debounce - this is crucial for preventing the race condition
      const existingTimeout = debounceTimeouts.current.get(verseId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        debounceTimeouts.current.delete(verseId);
      }

      // Don't save if content hasn't changed
      const lastSaved = lastSavedContent.current.get(verseId) ?? '';
      if (content === lastSaved) {
        return;
      }

      // Create new sequence number BEFORE checking existing saves
      const sequenceNumber = (saveSequence.current.get(verseId) ?? 0) + 1;
      saveSequence.current.set(verseId, sequenceNumber);

      // Wait for any existing save to complete first, but ignore errors
      const existingSave = activeSaves.current.get(verseId);
      if (existingSave) {
        await existingSave;
      }

      const savePromise = executeSave(verseId, content, sequenceNumber);
      activeSaves.current.set(verseId, savePromise);

      await savePromise;
    },
    [executeSave]
  );

  const getSaveStatus = useCallback((verseId: number) => {
    const hasPendingDebounce = debounceTimeouts.current.has(verseId);
    const isActivelySaving = activeSaves.current.has(verseId);
    const hasRetryScheduled = retryTimeouts.current.has(verseId);
    const hasUnsavedChanges =
      (currentContent.current.get(verseId) ?? '') !== (lastSavedContent.current.get(verseId) ?? '');

    return {
      hasPendingDebounce,
      isActivelySaving,
      hasRetryScheduled,
      hasUnsavedChanges,
      showLoader: isActivelySaving,
    };
  }, []);

  const setInitialContent = useCallback((verseId: number, content: string) => {
    lastSavedContent.current.set(verseId, content);
    currentContent.current.set(verseId, content);
  }, []);

  return {
    debouncedSave,
    saveImmediately,
    getSaveStatus,
    setInitialContent,
  };
};
