import { useCallback, type KeyboardEvent, type RefObject } from 'react';

import { EDITOR_SELECTOR, isComposingKey } from '../lib/editor-dom';
import { isEmptyHeading, removeEmptyHeadingLine } from '../lib/format-heading';
import { caretInBlock } from '../lib/verse-numbers';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

/**
 * Backspace in an empty heading right under the chapter number takes the line away, as it does
 * under any other line. Lexical would merge the line into the block above, and here that block is
 * the chapter number, so useProtectedVerseMarkers blocks the merge and only Delete removed the
 * line; this does what Delete does. Deleting a heading's words leaves this empty line, the way an
 * editor keeps an emptied title for new words; the save path already drops it.
 */
export function useEmptyHeadingBackspace(editorRef: RefObject<EditorRef | null>, readOnly = false) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      const target = event.target;
      const root =
        target instanceof HTMLElement ? target.closest<HTMLElement>(EDITOR_SELECTOR) : null;
      if (
        readOnly ||
        event.defaultPrevented ||
        event.key !== 'Backspace' ||
        isComposingKey(event.nativeEvent) ||
        !root
      )
        return false;

      const editor = editorRef.current;
      const caret = editor && caretInBlock(editor);
      if (!editor || !caret) return false;
      const { usj, index, block } = caret;
      const above = usj.content[index - 1];
      if (!isEmptyHeading(block) || typeof above !== 'object' || above.type !== 'chapter')
        return false;

      event.preventDefault();
      event.stopPropagation();
      removeEmptyHeadingLine(editor, root, index);
      return true;
    },
    [editorRef, readOnly]
  );
}
