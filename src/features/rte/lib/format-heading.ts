import { isHeadingMarker } from './heading-markers';
import { applyStructuralEdit, deltaLength } from './structural-edits';
import { blockIndex } from './usj-path';

import type { EditorRef, SelectionRange } from '@eten-tech-foundation/platform-editor';

/** Block formats must not sweep a heading and scripture into the same paragraph kind. */
export function selectionSpansBlocks(selection: SelectionRange | undefined): boolean {
  return Boolean(
    selection?.end && blockIndex(selection.start.jsonPath) !== blockIndex(selection.end.jsonPath)
  );
}

/** Change one heading's level without formatting scripture in a multi-paragraph selection. */
export function formatHeadingLevel(editor: EditorRef, marker: string): SelectionRange | undefined {
  const selection = editor.getSelection();
  if (!selection) return undefined;
  const start = blockIndex(selection.start.jsonPath);
  if (start === undefined || selectionSpansBlocks(selection)) return undefined;
  const usj = editor.getUsj();
  const index = Number(start);
  const heading = usj?.content[index];
  if (
    !usj ||
    !heading ||
    typeof heading === 'string' ||
    !isHeadingMarker(heading.marker) ||
    heading.content?.some(item => typeof item !== 'string' && item.type === 'verse')
  )
    return undefined;
  if (heading.marker === marker) return undefined;

  const offset =
    usj.content.slice(0, index + 1).reduce((length, node) => length + deltaLength(node), 0) - 1;
  // Apply a local paragraph attribute change. Unlike setUsj this retains the history entry,
  // and applyUpdate reports paragraph-only changes even when the text leaves are unchanged.
  applyStructuralEdit(editor, [{ retain: offset }, { retain: 1, attributes: { style: marker } }]);
  return selection;
}
