import { PARAGRAPH_MARKER } from './block-types';
import { isHeadingMarker } from './heading-markers';
import { deltaLength } from './structural-edits';
import {
  CARET_HOST,
  afterWordSpace,
  applyAtCaret,
  caretInBlock,
  isVerse,
  openParagraphAfterHeading,
  paragraphBreak,
  sumDeltaLength,
  verseRightBefore,
} from './verse-numbers';

import type { DeltaOp, EditorRef } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

/** A new, empty `p` starting at `at`, for a caret that sits after a whole block. */
const emptyParagraphAt = (at: number): DeltaOp[] => [
  { retain: at },
  { insert: CARET_HOST },
  paragraphBreak(PARAGRAPH_MARKER),
];

/** Where the next verse marker at or after `from` starts in its block, in delta units. */
function nextVerseOffset(block: MarkerObject, from: number): number | undefined {
  let offset = 0;
  for (const child of block.content ?? []) {
    if (offset >= from && isVerse(child)) return offset;
    offset += deltaLength(child);
  }
  return undefined;
}

/**
 * Splits a non-`p` block such as Poetry. Only the rest of the caret's verse becomes prose; a
 * later verse in the same block keeps
 * the block's original closing newline, and with it the Poetry style, so its saved row (which
 * continues the current paragraph when it has no markers) still reloads as Poetry. A split in
 * front of a verse number passes `from` past that number, so its own verse becomes the prose.
 */
function poetrySplitOps(
  block: MarkerObject,
  blockStart: number,
  caretOffset: number,
  from = caretOffset
): DeltaOp[] {
  const caret = blockStart + caretOffset;
  const lineStyle = block.marker ?? PARAGRAPH_MARKER;
  const nextVerse = nextVerseOffset(block, from);
  if (nextVerse !== undefined) {
    const movedToProse = nextVerse - caretOffset;
    return [
      { retain: caret },
      paragraphBreak(lineStyle),
      movedToProse ? { retain: movedToProse } : { insert: CARET_HOST },
      paragraphBreak(PARAGRAPH_MARKER),
    ];
  }
  const restOfBlock = deltaLength(block) - 1 - caretOffset;
  if (restOfBlock === 0) return emptyParagraphAt(caret + 1);
  return [
    { retain: caret },
    paragraphBreak(lineStyle),
    { retain: restOfBlock },
    { delete: 1 },
    paragraphBreak(PARAGRAPH_MARKER),
  ];
}

function insertInBody(
  editor: EditorRef,
  usj: Usj,
  index: number,
  block: MarkerObject,
  caret: number
): boolean {
  if (caret > deltaLength(block) - 1) return false;
  const blockStart = sumDeltaLength(usj.content.slice(0, index));
  // Right after a verse number, the number goes down with its text: the paragraph starts at the
  // number, and a verse that opens its block gets a new empty paragraph above it instead.
  const verseIndex = verseRightBefore(block, caret);
  if (verseIndex !== undefined) {
    const verseOffset = sumDeltaLength((block.content ?? []).slice(0, verseIndex));
    const ops: DeltaOp[] =
      verseOffset === 0
        ? [{ retain: blockStart }, paragraphBreak(PARAGRAPH_MARKER)]
        : block.marker === PARAGRAPH_MARKER
          ? [{ retain: blockStart + verseOffset }, paragraphBreak(PARAGRAPH_MARKER)]
          : poetrySplitOps(block, blockStart, verseOffset, verseOffset + 1);
    return applyAtCaret(editor, ops, { jsonPath: `$.content[${index + 1}]`, offset: 1 });
  }
  const at = afterWordSpace(block, caret) ?? caret;
  const ops =
    block.marker === PARAGRAPH_MARKER
      ? [{ retain: blockStart + at }, paragraphBreak(PARAGRAPH_MARKER)]
      : poetrySplitOps(block, blockStart, at);
  return applyAtCaret(editor, ops, { jsonPath: `$.content[${index + 1}]`, offset: 0 });
}

/** Insert at a caret only: a toolbar action must never replace selected scripture. */
export function insertParagraph(editor: EditorRef): boolean {
  const caret = caretInBlock(editor);
  if (!caret) return false;
  const { usj, index, block, offset } = caret;
  // A title is not verse text: the new paragraph goes under it, and the title stays whole.
  return isHeadingMarker(block.marker)
    ? openParagraphAfterHeading(editor, usj, index)
    : insertInBody(editor, usj, index, block, offset);
}
