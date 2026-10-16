import { useCallback, type KeyboardEvent, type RefObject } from 'react';

import { EDITOR_SELECTOR, isComposingKey } from '../lib/editor-dom';
import { isHeadingMarker } from '../lib/heading-markers';
import { blockIndex } from '../lib/usj-path';
import { openParagraphAfterHeading } from '../lib/verse-numbers';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

/**
 * Headings are single-line titles. Enter leaves the title intact and opens a new, empty Paragraph
 * under it (#397), after the last of adjacent titles. The next verse keeps its number until words
 * are typed in the new line. Native operations keep the editor's history.
 */
export function useHeadingEnter(editorRef: RefObject<EditorRef | null>, readOnly = false) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      if (
        readOnly ||
        event.defaultPrevented ||
        event.key !== 'Enter' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isComposingKey(event.nativeEvent) ||
        !(event.target instanceof HTMLElement) ||
        !event.target.closest(EDITOR_SELECTOR)
      )
        return false;

      const editor = editorRef.current;
      const selection = editor?.getSelection();
      const usj = editor?.getUsj();
      if (!editor || !selection || !usj) return false;
      const index = blockIndex(selection.start.jsonPath);
      if (index === undefined || (selection.end && blockIndex(selection.end.jsonPath) !== index))
        return false;
      const heading = usj.content[Number(index)];
      if (!heading || typeof heading === 'string' || !isHeadingMarker(heading.marker)) return false;

      // Shift+Enter must also leave the single-line heading: a line break makes its text invalid.
      event.preventDefault();
      event.stopPropagation();
      // A malformed imported title with no verse after it gets no line of unsaveable body text.
      openParagraphAfterHeading(editor, usj, Number(index));
      return true;
    },
    [editorRef, readOnly]
  );
}
