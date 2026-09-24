import { useCallback, type KeyboardEvent, type RefObject } from 'react';

import { isHeadingMarker } from '../lib/heading-markers';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject } from '@eten-tech-foundation/scripture-utilities';

// Fluent builds the editor from chapter/verse embeds, paragraphs, headings and inline text.
// In Editorial's delta coordinates an embed occupies one unit and a paragraph ends with one LF.
function deltaLength(node: string | MarkerObject): number {
  if (typeof node === 'string') return node.length;
  if (node.type === 'para' || node.type === 'char')
    return (
      (node.content ?? []).reduce((sum, child) => sum + deltaLength(child), 0) +
      (node.type === 'para' ? 1 : 0)
    );
  return 1;
}

const blockIndex = (path: string) => /^\$\.content\[(\d+)\]/.exec(path)?.[1];

/**
 * Headings are single-line titles. Enter leaves the title intact and continues in the next verse.
 * Reuse an existing paragraph; before poetry, split off a paragraph that owns the verse marker so
 * its new text survives the verse-based save path. Native operations keep the editor's history.
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
        event.nativeEvent.isComposing ||
        event.nativeEvent.keyCode === 229 ||
        !(event.target instanceof HTMLElement) ||
        !event.target.closest('.editor-input')
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
      for (let nextIndex = Number(index) + 1; nextIndex < usj.content.length; nextIndex += 1) {
        const body = usj.content[nextIndex];
        if (typeof body === 'string' || body.type !== 'para' || isHeadingMarker(body.marker))
          continue;
        const content = body.content;
        if (!content) continue;
        const verseIndex = content.findIndex(
          item => typeof item !== 'string' && item.type === 'verse'
        );
        if (verseIndex < 0) continue;
        const start = { jsonPath: `$.content[${nextIndex}]`, offset: verseIndex + 1 } as const;
        if (body.marker !== 'p') {
          // Delta LF attributes belong to the block before the split; the existing block's marker
          // stays on the following text. One local transaction preserves both formatting and undo.
          const offset =
            usj.content.slice(0, nextIndex).reduce((sum, node) => sum + deltaLength(node), 0) +
            content.slice(0, verseIndex + 1).reduce((sum, node) => sum + deltaLength(node), 0);
          // Two ordinary spaces host the caret after the number without that extra history entry.
          // Editorial removes a single space in an empty verse; two survive until the user types.
          // The save path trims them, keeping actual text in this verse and before its poetry.
          // applyUpdate synchronizes USJ directly and works in both wrappers without a scrRef.
          editor.applyUpdate(
            [
              { retain: offset },
              { insert: '  ' },
              { insert: '\n', attributes: { para: { style: 'p' } } },
            ],
            'local'
          );
          editor.setSelection({
            start: { jsonPath: `$.content[${nextIndex}].content[${verseIndex + 1}]`, offset: 0 },
          });
        } else editor.setSelection({ start });
        return true;
      }
      // Malformed imported titles without a following verse must not create unsaveable body text.
      return true;
    },
    [editorRef, readOnly]
  );
}
