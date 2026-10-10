import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

import type { EditorRef, SelectionRange } from '@eten-tech-foundation/platform-editor';
import type { SerializedVerseRef } from '@sillsdev/scripture';

/** A reference the plugin has no verse to place the cursor in, which is how a verse is re-announced. */
export const NO_VERSE = 0;

/**
 * Puts the selection back after the editor's document has been reloaded.
 * A mapped text selection keeps both offsets; marker positions fall back to the verse reference.
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
  setScrRef: Dispatch<SetStateAction<SerializedVerseRef>>,
  editorRef?: RefObject<EditorRef | null>
): {
  restoreAfterLoad: (verseNum: number, selection?: SelectionRange) => void;
  cancelRestore: () => void;
} {
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
    (verseNum: number, selection?: SelectionRange) => {
      cancelRestore();
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        if (selection && editorRef?.current) {
          editorRef.current.setSelection(selection);
          // Commit the selection-only transaction before the next input/autosave transaction.
          editorRef.current.getSelection();
          return;
        }
        pendingVerseRef.current = verseNum;
        setScrRef(current => ({ ...current, verseNum: NO_VERSE }));
      }, 0);
    },
    [cancelRestore, editorRef, setScrRef]
  );

  return { restoreAfterLoad, cancelRestore };
}
