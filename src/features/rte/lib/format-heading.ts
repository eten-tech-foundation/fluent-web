import { isHeadingMarker } from './heading-markers';

import type { EditorRef, SelectionRange } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

const blockIndex = (path: string) => /^\$\.content\[(\d+)\]/.exec(path)?.[1];

/** Block formats must not sweep a heading and scripture into the same paragraph kind. */
export function selectionSpansBlocks(selection: SelectionRange | undefined): boolean {
  return Boolean(
    selection?.end && blockIndex(selection.start.jsonPath) !== blockIndex(selection.end.jsonPath)
  );
}

/** Change one heading's level without formatting scripture in a multi-paragraph selection. */
export function formatHeadingLevel(
  editor: EditorRef,
  marker: string,
  onChange: (usj: Usj) => void
): SelectionRange | undefined {
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

  editor.formatPara(marker);
  // Editorial's delta fast path can miss a paragraph-only change. An empty local update commits
  // the pending format and synchronizes its USJ before typing, preserving the caret and history.
  // setUsj reloads asynchronously and can race with typing or delayed selection restoration.
  editor.applyUpdate([], 'local');
  const updated = editor.getUsj();
  if (updated) onChange(updated);
  return selection;
}
