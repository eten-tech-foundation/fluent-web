import { hasWords } from './editor-dom';
import { isHeadingMarker } from './heading-markers';
import { applyStructuralEdit, deltaLength } from './structural-edits';
import { blockIndex } from './usj-path';
import { applyAtCaret, blockStart, isVerse, type CaretLocation } from './verse-numbers';

import type { DeltaOp, EditorRef, SelectionRange } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

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

const isHeadingParagraph = (node: Usj['content'][number] | undefined): node is MarkerObject =>
  typeof node === 'object' && node.type === 'para' && isHeadingMarker(node.marker);

/** A heading with no words left, as deleting all of them leaves it. */
export const isEmptyHeading = (node: Usj['content'][number] | undefined): boolean =>
  isHeadingParagraph(node) &&
  (node.content ?? []).every(child => typeof child === 'string' && !hasWords(child));

/**
 * Where typing continues once the block before `line` is gone: at the start of its text, in the
 * text itself. With the caret on the paragraph after a verse number instead, Editorial lands the
 * next typed letters in the right place but leaves them out of onUsjChange, so they aren't saved.
 * A verse with no words yet has no text to hold the caret; words typed after its number are saved.
 */
function startOfText(index: number, line: MarkerObject): CaretLocation {
  const [first, second] = line.content ?? [];
  if (isVerse(first) && typeof second === 'string')
    return { jsonPath: `$.content[${index}].content[1]`, offset: 0 };
  if (typeof first === 'string') return { jsonPath: `$.content[${index}].content[0]`, offset: 0 };
  return { jsonPath: `$.content[${index}]`, offset: isVerse(first) ? 1 : 0 };
}

/**
 * Removes the heading at `index`, its words and its line, in one local transaction that undo
 * takes back. A heading put in the wrong place can't be merged away instead: Backspace at its
 * start or Delete at its end would fold its words into scripture, and a body format would turn
 * them into verse text. The line under it keeps its paragraph, and the caret goes to the start of
 * that line's text.
 *
 * A heading with no words is left to `removeEmptyHeadingLine`: in Editorial 0.8.15 a delta that
 * deletes an empty paragraph leaves an empty line with no marker, and words typed there are lost.
 */
export function removeHeadingAt(editor: EditorRef, usj: Usj, index: number): boolean {
  const heading = usj.content[index];
  const next = usj.content[index + 1];
  if (
    !isHeadingParagraph(heading) ||
    isEmptyHeading(heading) ||
    heading.content?.some(isVerse) ||
    // A malformed imported title with nothing after it has no line to take the caret.
    typeof next !== 'object' ||
    next.type !== 'para'
  )
    return false;

  const start = blockStart(usj, index);
  const ops: DeltaOp[] = [
    ...(start > 0 ? [{ retain: start }] : []),
    { delete: deltaLength(heading) },
  ];
  // From the format bar, focus can be on the button; the editor takes it back first.
  editor.focus();
  editor.getSelection();
  return applyAtCaret(editor, ops, startOfText(index, next));
}

/**
 * Takes an empty heading's line away the way Delete does there, through the editor's own key
 * handling, which keeps the next line's format and history (see `removeHeadingAt` for why not a
 * delta). The caret then goes to the start of the next line's text, as after `removeHeadingAt`,
 * rather than in front of its verse number. `root` is the editable element of `editor`.
 */
export function removeEmptyHeadingLine(editor: EditorRef, root: HTMLElement, index: number): void {
  // Only from the format bar's button: refocusing a focused editor can move its caret.
  if (!root.contains(document.activeElement)) editor.focus();
  editor.getSelection();
  editor.setSelection({ start: { jsonPath: `$.content[${index}]`, offset: 0 } });
  editor.getSelection();
  root.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true, cancelable: true })
  );
  // Reading the selection commits the editor's update before the document is read back.
  editor.getSelection();
  const line = editor.getUsj()?.content[index];
  if (typeof line !== 'object' || line.type !== 'para' || isEmptyHeading(line)) return;
  editor.setSelection({ start: startOfText(index, line) });
  editor.getSelection();
}

/**
 * Remove heading in the format bar: the heading the caret or a selection inside it is in, with
 * its words, or its line once they are all deleted. `root` is the editable element of `editor`.
 */
export function removeHeading(editor: EditorRef, root: HTMLElement | null | undefined): boolean {
  const selection = editor.getSelection();
  const usj = editor.getUsj();
  const start = selection && blockIndex(selection.start.jsonPath);
  if (!usj || start === undefined || selectionSpansBlocks(selection)) return false;
  const index = Number(start);
  if (!isEmptyHeading(usj.content[index])) return removeHeadingAt(editor, usj, index);
  if (!root) return false;
  removeEmptyHeadingLine(editor, root, index);
  return true;
}
