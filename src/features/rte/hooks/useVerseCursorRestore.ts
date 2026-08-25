import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import type { SerializedVerseRef } from '@sillsdev/scripture';

/** A reference the plugin has no verse to place the cursor in, which is how a verse is re-announced. */
export const NO_VERSE = 0;

/**
 * Puts the cursor back in a verse after the editor's document has been reloaded.
 *
 * Reloading leaves the editor with no selection at all, and `ScriptureReferencePlugin` places the
 * cursor only when the verse it is handed *changes* — so getting the same verse back means letting
 * go of it first and asking again. Both halves have to wait for the load: `LoadStatePlugin` swaps
 * the document in from a microtask queued off its own effect, so asking during the handler that
 * called `setUsj` selects into the document that is about to be replaced, and the plugin never
 * runs again on its own. Deferring by a task is what puts the ask after the swap.
 *
 * Without this the next click on the format bar falls through to `formatPara`, which has no
 * selection to act on and silently does nothing.
 */
export function useVerseCursorRestore(
  scrRef: SerializedVerseRef,
  setScrRef: Dispatch<SetStateAction<SerializedVerseRef>>
): { restoreAfterLoad: (verseNum: number) => void; cancelRestore: () => void } {
  const pendingVerseRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelRestore = useCallback(() => {
    pendingVerseRef.current = undefined;
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  useEffect(() => cancelRestore, [cancelRestore]);

  useEffect(() => {
    const verseNum = pendingVerseRef.current;
    if (verseNum === undefined) return;
    pendingVerseRef.current = undefined;
    // Anything else that moved the cursor in the meantime already left a usable selection.
    if (scrRef.verseNum === NO_VERSE) setScrRef(current => ({ ...current, verseNum }));
  }, [scrRef, setScrRef]);

  const restoreAfterLoad = useCallback(
    (verseNum: number) => {
      cancelRestore();
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        pendingVerseRef.current = verseNum;
        setScrRef(current => ({ ...current, verseNum: NO_VERSE }));
      }, 0);
    },
    [cancelRestore, setScrRef]
  );

  return { restoreAfterLoad, cancelRestore };
}
