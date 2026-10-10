import { isHeadingMarker } from './heading-markers';
import { blockIndex } from './usj-path';

import type { DeltaOp, EditorRef } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

type UsjNode = string | MarkerObject;
type CaretLocation = Extract<
  NonNullable<ReturnType<EditorRef['getSelection']>>['start'],
  { offset: number }
>;

/** Length in editor-delta units: an embed counts as 1 and a paragraph adds 1 for its newline. */
function deltaLength(node: UsjNode): number {
  if (typeof node === 'string') return node.length;
  if (node.type === 'para' || node.type === 'char')
    return sumDeltaLength(node.content ?? []) + (node.type === 'para' ? 1 : 0);
  return 1;
}

function sumDeltaLength(nodes: UsjNode[]): number {
  return nodes.reduce((sum, node) => sum + deltaLength(node), 0);
}

const isVerse = (node: UsjNode) => typeof node !== 'string' && node.type === 'verse';

const paragraphBreak = (style: string): DeltaOp => ({
  insert: '\n',
  attributes: { para: { style } },
});

// Two temporary spaces host the caret in an otherwise empty paragraph; the save path trims them
// once the translator adds text.
const CARET_HOST: DeltaOp = { insert: '  ' };

/** A new, empty `p` starting at `at`, for a caret that sits after a heading or a whole block. */
const emptyParagraphAt = (at: number): DeltaOp[] => [
  { retain: at },
  CARET_HOST,
  paragraphBreak('p'),
];

/** Flush a selection-only update before immediate typing can be grouped under its tag. */
function flushSelection(editor: EditorRef): void {
  editor.getSelection();
}

function applyAndPlaceCaret(
  editor: EditorRef,
  ops: DeltaOp[],
  caretPath: CaretLocation['jsonPath']
): true {
  // A local delta keeps undo history and synchronizes USJ immediately. Editorial 0.8.15's
  // insertMarker splits the DOM but can leave getUsj/onUsjChange at the preceding document.
  editor.applyUpdate(ops, 'local');
  editor.setSelection({ start: { jsonPath: caretPath, offset: 0 } });
  flushSelection(editor);
  return true;
}

function collapsedCaret(editor: EditorRef): CaretLocation | undefined {
  const selection = editor.getSelection();
  if (!selection || !('offset' in selection.start)) return undefined;
  const { start, end } = selection;
  if (end && (!('offset' in end) || start.jsonPath !== end.jsonPath || start.offset !== end.offset))
    return undefined;
  return start;
}

/** The caret's position in delta units from the start of its block, if the path resolves. */
function caretOffsetInBlock(block: MarkerObject, caret: CaretLocation): number | undefined {
  const childIndices = [...caret.jsonPath.matchAll(/\.content\[(\d+)\]/g)]
    .map(match => Number(match[1]))
    .slice(1);
  let node: UsjNode = block;
  let offset = 0;
  for (const childIndex of childIndices) {
    if (typeof node === 'string' || !node.content?.[childIndex]) return undefined;
    offset += sumDeltaLength(node.content.slice(0, childIndex));
    node = node.content[childIndex];
  }
  if (typeof node === 'string') return offset + caret.offset;
  if (node.type === 'para' || node.type === 'char')
    return offset + sumDeltaLength((node.content ?? []).slice(0, caret.offset));
  return undefined;
}

/** Where the next verse marker at or after `from` starts in its block, in delta units. */
function nextVerseOffset(block: MarkerObject, from: number): number | undefined {
  let offset = 0;
  for (const child of block.content ?? []) {
    if (offset >= from && isVerse(child)) return offset;
    offset += deltaLength(child);
  }
  return undefined;
}

/** A title is not verse text. Insert in its following verse without splitting the title. */
function insertAfterHeading(editor: EditorRef, usj: Usj, headingIndex: number): boolean {
  const bodyIndex = usj.content.findIndex(
    (node, i) =>
      i > headingIndex &&
      typeof node !== 'string' &&
      node.type === 'para' &&
      !isHeadingMarker(node.marker) &&
      node.content?.some(isVerse)
  );
  const body = usj.content[bodyIndex];
  if (!body || typeof body === 'string' || !body.content) return false;
  const verseIndex = body.content.findIndex(isVerse);
  const afterVerse =
    sumDeltaLength(usj.content.slice(0, bodyIndex)) +
    sumDeltaLength(body.content.slice(0, verseIndex + 1));
  // The verse number moves into the new paragraph; the following Poetry keeps its own newline.
  return applyAndPlaceCaret(
    editor,
    emptyParagraphAt(afterVerse),
    `$.content[${bodyIndex}].content[${verseIndex + 1}]`
  );
}

/**
 * Splits a non-`p` block such as Poetry. Only the rest of the caret's verse becomes prose; a
 * later verse in the same block keeps
 * the block's original closing newline, and with it the Poetry style, so its saved row (which
 * continues the current paragraph when it has no markers) still reloads as Poetry.
 */
function poetrySplitOps(block: MarkerObject, blockStart: number, caretOffset: number): DeltaOp[] {
  const caret = blockStart + caretOffset;
  const lineStyle = block.marker ?? 'p';
  const nextVerse = nextVerseOffset(block, caretOffset);
  if (nextVerse !== undefined) {
    const movedToProse = nextVerse - caretOffset;
    return [
      { retain: caret },
      paragraphBreak(lineStyle),
      movedToProse ? { retain: movedToProse } : CARET_HOST,
      paragraphBreak('p'),
    ];
  }
  const restOfBlock = deltaLength(block) - 1 - caretOffset;
  if (restOfBlock === 0) return emptyParagraphAt(caret + 1);
  return [
    { retain: caret },
    paragraphBreak(lineStyle),
    { retain: restOfBlock },
    { delete: 1 },
    paragraphBreak('p'),
  ];
}

function insertInBody(
  editor: EditorRef,
  usj: Usj,
  index: number,
  block: MarkerObject,
  caret: CaretLocation
): boolean {
  const caretOffset = caretOffsetInBlock(block, caret);
  if (caretOffset === undefined || caretOffset > deltaLength(block) - 1) return false;
  const blockStart = sumDeltaLength(usj.content.slice(0, index));
  const ops =
    block.marker === 'p'
      ? [{ retain: blockStart + caretOffset }, paragraphBreak('p')]
      : poetrySplitOps(block, blockStart, caretOffset);
  return applyAndPlaceCaret(editor, ops, `$.content[${index + 1}]`);
}

/** Insert at a caret only: a toolbar action must never replace selected scripture. */
export function insertParagraph(editor: EditorRef): boolean {
  const caret = collapsedCaret(editor);
  const usj = editor.getUsj();
  const start = caret && blockIndex(caret.jsonPath);
  if (!caret || !usj || start === undefined) return false;
  const index = Number(start);
  const block = usj.content[index];
  if (!block || typeof block === 'string' || block.type !== 'para') return false;
  return isHeadingMarker(block.marker)
    ? insertAfterHeading(editor, usj, index)
    : insertInBody(editor, usj, index, block, caret);
}
