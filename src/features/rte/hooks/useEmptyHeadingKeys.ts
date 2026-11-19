import { useCallback, type KeyboardEvent, type RefObject } from 'react';

import {
  BLOCK_SELECTOR,
  EDITOR_SELECTOR,
  elementAt,
  hasWords,
  isComposingKey,
} from '../lib/editor-dom';
import { isEmptyHeading, isOwnDelete, removeEmptyHeadingLine } from '../lib/format-heading';
import { isHeadingMarker } from '../lib/heading-markers';
import { caretInBlock } from '../lib/verse-numbers';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

/**
 * A heading line with no words, as the DOM shows the line the caret is in. This runs on every
 * Backspace and Delete, so it comes before any call that reads the document. Without a DOM caret
 * in the editor it can't tell, and the editor's own selection decides.
 */
function mayBeEmptyHeading(root: HTMLElement): boolean {
  const node = window.getSelection()?.anchorNode;
  const block = node ? elementAt(node)?.closest(BLOCK_SELECTOR) : null;
  if (!block || !root.contains(block)) return true;
  return (
    isHeadingMarker(block.getAttribute('data-marker') ?? undefined) && !hasWords(block.textContent)
  );
}

/**
 * Backspace and Delete in an empty heading take its line away and leave the caret where the
 * heading was, at the start of the verse text under it. Deleting a heading's words leaves this
 * empty line, the way an editor keeps an emptied title for new words; the save path already drops
 * it.
 *
 * Lexical's own Delete there leaves its caret between the blocks, on the editor root: the pane
 * jumped to the end of the chapter, the format bar stayed on the heading, and words typed next
 * could land in the verse before (#625 QA). Backspace right under the chapter number would merge
 * the line into the chapter number, which useProtectedVerseMarkers blocks. Both go through
 * `removeEmptyHeadingLine`. Backspace under any other line stays the editor's, which removes the
 * line and keeps the caret at the end of the line above.
 */
export function useEmptyHeadingKeys(editorRef: RefObject<EditorRef | null>, readOnly = false) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      const target = event.target;
      const root =
        target instanceof HTMLElement ? target.closest<HTMLElement>(EDITOR_SELECTOR) : null;
      const forward = event.key === 'Delete';
      if (
        readOnly ||
        event.defaultPrevented ||
        (!forward && event.key !== 'Backspace') ||
        isComposingKey(event.nativeEvent) ||
        // The Delete removeEmptyHeadingLine sends is for the editor itself.
        isOwnDelete(event.nativeEvent) ||
        !root ||
        !mayBeEmptyHeading(root)
      )
        return false;

      const editor = editorRef.current;
      const caret = editor && caretInBlock(editor);
      if (!editor || !caret || !isEmptyHeading(caret.block)) return false;
      const { usj, index } = caret;
      const above = usj.content[index - 1];
      if (!forward && (typeof above !== 'object' || above.type !== 'chapter')) return false;

      event.preventDefault();
      event.stopPropagation();
      removeEmptyHeadingLine(editor, root, index);
      return true;
    },
    [editorRef, readOnly]
  );
}
