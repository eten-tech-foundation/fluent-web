import { PARAGRAPH_MARKER } from './block-types';
import { isHeadingMarker } from './heading-markers';
import { deltaLength } from './structural-edits';
import { blockIndex } from './usj-path';

import type { DeltaOp, EditorRef } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

/**
 * Paragraph edits that keep a verse number with its text (#397, #530).
 *
 * The save path stores a verse as text plus paragraph offsets, with the number always at the start
 * of the verse's text. A break between a number and its text has no stored form: the editor would
 * show the number cut off while every other view shows it joined, and its line could not be merged
 * back. So a break never lands there, and words typed into a line that no verse owns yet bring the
 * next verse's number up first. Each edit is one local delta, so it keeps Editorial's undo history.
 */

type UsjNode = string | MarkerObject;
export type CaretLocation = Extract<
  NonNullable<ReturnType<EditorRef['getSelection']>>['start'],
  { offset: number }
>;

/**
 * Two ordinary spaces host the caret right after a verse number with no words yet. Editorial
 * removes a single space in an empty verse; two survive until the translator types, and the save
 * path trims them. A line with no verse number needs no host: Lexical keeps a caret in an empty
 * paragraph, and Editorial drops whitespace at the start of a paragraph anyway.
 */
export const CARET_HOST = '  ';

export const paragraphBreak = (style: string): DeltaOp => ({
  insert: '\n',
  attributes: { para: { style } },
});

export const sumDeltaLength = (nodes: UsjNode[]): number =>
  nodes.reduce((sum, node) => sum + deltaLength(node), 0);

/** Where a top-level block starts, in delta units. */
export const blockStart = (usj: Usj, index: number): number =>
  sumDeltaLength(usj.content.slice(0, index));

export const isVerse = (node: UsjNode | undefined): node is MarkerObject =>
  typeof node === 'object' && node.type === 'verse';

const isBlankText = (node: UsjNode): boolean => typeof node === 'string' && node.trim() === '';

/** A paragraph that holds scripture, as opposed to a heading's own words. */
export const isBodyParagraph = (node: UsjNode | undefined): node is MarkerObject =>
  typeof node === 'object' && node.type === 'para' && !isHeadingMarker(node.marker);

const isHeadingParagraph = (node: UsjNode | undefined): node is MarkerObject =>
  typeof node === 'object' && node.type === 'para' && isHeadingMarker(node.marker);

/** A body paragraph with no words and no markers, such as a line Enter just opened. */
export const isBlankParagraph = (node: UsjNode | undefined): node is MarkerObject =>
  isBodyParagraph(node) && (node.content ?? []).every(isBlankText);

/** The verse whose number is all a body paragraph holds: a number cut off from its text. */
export function loneVerseOf(node: UsjNode | undefined): MarkerObject | undefined {
  if (!isBodyParagraph(node)) return undefined;
  const [first, ...rest] = node.content ?? [];
  return isVerse(first) && rest.every(isBlankText) ? first : undefined;
}

/** Editorial's delta embed for a verse number, rebuilt from its USJ node. */
export function verseEmbed(verse: MarkerObject): DeltaOp {
  const { marker, number, sid, altnumber, pubnumber } = verse;
  return {
    insert: {
      verse: {
        style: marker ?? 'v',
        number,
        ...(sid ? { sid } : {}),
        ...(altnumber ? { altnumber } : {}),
        ...(pubnumber ? { pubnumber } : {}),
      },
    },
  };
}

/** Apply one local transaction and put the caret where the translator continues. */
export function applyAtCaret(editor: EditorRef, ops: DeltaOp[], caret: CaretLocation): true {
  // A local delta keeps undo history and synchronizes USJ immediately. Editorial 0.8.15's
  // insertMarker splits the DOM but can leave getUsj/onUsjChange at the preceding document.
  editor.applyUpdate(ops, 'local');
  editor.setSelection({ start: caret });
  // Commit the selection-only transaction before immediate typing can join it. Editorial
  // excludes selection-tagged updates from onUsjChange, even when they also contain text.
  editor.getSelection();
  return true;
}

/** The selection as a single caret, or undefined for a range. */
export function collapsedCaret(editor: EditorRef): CaretLocation | undefined {
  const selection = editor.getSelection();
  if (!selection || !('offset' in selection.start)) return undefined;
  const { start, end } = selection;
  if (end && (!('offset' in end) || start.jsonPath !== end.jsonPath || start.offset !== end.offset))
    return undefined;
  return start;
}

/** The caret's position in delta units from the start of its block, if the path resolves. */
export function caretOffsetInBlock(block: MarkerObject, caret: CaretLocation): number | undefined {
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

/** The caret's block, its index and the caret's offset inside it. */
export function caretInBlock(
  editor: EditorRef
): { usj: Usj; index: number; block: MarkerObject; offset: number } | undefined {
  const caret = collapsedCaret(editor);
  const usj = editor.getUsj();
  const start = caret && blockIndex(caret.jsonPath);
  if (!caret || !usj || start === undefined) return undefined;
  const index = Number(start);
  const block = usj.content[index];
  if (typeof block !== 'object' || block.type !== 'para') return undefined;
  const offset = caretOffsetInBlock(block, caret);
  return offset === undefined ? undefined : { usj, index, block, offset };
}

/**
 * The child index of a verse number the caret sits right after, with nothing but spaces between
 * them: the start of that verse's text.
 */
export function verseRightBefore(block: MarkerObject, caretOffset: number): number | undefined {
  let offset = 0;
  let found: number | undefined;
  for (const [index, child] of (block.content ?? []).entries()) {
    if (offset >= caretOffset) break;
    if (isVerse(child)) found = index;
    else if (typeof child !== 'string' || child.slice(0, caretOffset - offset).trim() !== '')
      found = undefined;
    offset += deltaLength(child);
  }
  return found;
}

/**
 * Where a break typed at `caretOffset` should go so a word space survives it. Editorial drops the
 * space a new paragraph would start with, so a later merge would glue the two words together.
 * Breaking after the spaces keeps them at the end of the line above, where they are safe.
 */
export function afterWordSpace(block: MarkerObject, caretOffset: number): number | undefined {
  let offset = 0;
  for (const child of block.content ?? []) {
    const length = deltaLength(child);
    if (typeof child === 'string' && caretOffset >= offset && caretOffset < offset + length) {
      const rest = child.slice(caretOffset - offset);
      const spaces = /^\s+/.exec(rest)?.[0].length ?? 0;
      return spaces > 0 && spaces < rest.length ? caretOffset + spaces : undefined;
    }
    offset += length;
  }
  return undefined;
}

/** No verse comes before this block in its section, so words here belong to the next verse. */
export function opensSection(usj: Usj, index: number): boolean {
  for (let i = index - 1; i >= 0; i -= 1) {
    const node = usj.content[i];
    if (typeof node === 'string') continue;
    if (node.content?.some(isVerse)) return false;
    if (node.type === 'chapter' || isHeadingMarker(node.marker)) return true;
  }
  return true;
}

/**
 * The verse number that opens the next body paragraph with content, unless a heading comes first,
 * with its position in delta units.
 */
export function verseAfter(
  usj: Usj,
  index: number
): { verse: MarkerObject; at: number } | undefined {
  for (let i = index + 1; i < usj.content.length; i += 1) {
    const node = usj.content[i];
    if (!isBodyParagraph(node)) return undefined;
    const content = node.content ?? [];
    const childIndex = content.findIndex(child => !isBlankText(child));
    if (childIndex < 0) continue;
    const child = content[childIndex];
    if (!isVerse(child)) return undefined;
    return { verse: child, at: blockStart(usj, i) + sumDeltaLength(content.slice(0, childIndex)) };
  }
  return undefined;
}

/**
 * A new, empty Paragraph under a heading (#397). Adjacent titles stay together, so the line opens
 * after the last of them. The next verse keeps its number; words typed here bring it up first.
 */
export function openParagraphAfterHeading(
  editor: EditorRef,
  usj: Usj,
  headingIndex: number
): boolean {
  let last = headingIndex;
  while (isHeadingParagraph(usj.content[last + 1])) last += 1;
  // Malformed imported titles without a following verse must not create unsaveable body text.
  const hasVerse = usj.content
    .slice(last + 1)
    .some(node => isBodyParagraph(node) && node.content?.some(isVerse));
  if (!hasVerse) return false;
  return applyAtCaret(
    editor,
    [{ retain: blockStart(usj, last + 1) }, paragraphBreak(PARAGRAPH_MARKER)],
    { jsonPath: `$.content[${last + 1}]`, offset: 0 }
  );
}

/**
 * A break typed right after a verse number goes in front of the number, so the number moves down
 * with its text. When the verse opens its block, that leaves a new empty line above it in
 * `emptyStyle`. The caret stays at the start of the verse's text.
 */
export function breakBeforeVerse(
  editor: EditorRef,
  usj: Usj,
  index: number,
  verseIndex: number,
  emptyStyle: string
): true {
  const block = usj.content[index] as MarkerObject;
  const content = block.content ?? [];
  const at = blockStart(usj, index) + sumDeltaLength(content.slice(0, verseIndex));
  const opensBlock = content.slice(0, verseIndex).every(isBlankText);
  const style = opensBlock ? emptyStyle : (block.marker ?? PARAGRAPH_MARKER);
  return applyAtCaret(editor, [{ retain: at }, paragraphBreak(style)], {
    jsonPath: `$.content[${index + 1}]`,
    offset: 1,
  });
}

/**
 * Before words land in a line that no verse owns yet (under a heading, or above the chapter's
 * first verse), bring the next verse's number to the start of it. The words become the start of
 * that verse, which is how the save path stores them, so the editor shows what every other view
 * will. `typed` is inserted in the same transaction, so one undo takes both back.
 */
export function claimNextVerse(editor: EditorRef, typed = ''): boolean {
  const caret = caretInBlock(editor);
  if (!caret) return false;
  const { usj, index, block, offset } = caret;
  if (!isBlankParagraph(block) || !opensSection(usj, index)) return false;
  const next = verseAfter(usj, index);
  if (!next) return false;
  const start = blockStart(usj, index);
  const text = (block.content ?? []).join('');
  const host = text === '' ? CARET_HOST : '';
  const ops: DeltaOp[] = [
    { retain: start },
    verseEmbed(next.verse),
    ...(offset > 0 ? [{ retain: offset }] : []),
    ...(typed + host ? [{ insert: typed + host }] : []),
    { retain: next.at - start - offset },
    { delete: 1 },
  ];
  return applyAtCaret(editor, ops, {
    jsonPath: `$.content[${index}].content[1]`,
    offset: offset + typed.length,
  });
}

/**
 * Move a lone verse number back to the start of its text in the next paragraph, which keeps its
 * own format. `hostLength` counts the invisible caret host Editorial may keep after the number:
 * the delta counts it, though getUsj leaves it out.
 */
export function rejoinVerse(
  editor: EditorRef,
  usj: Usj,
  loneIndex: number,
  hostLength: number
): boolean {
  const verse = loneVerseOf(usj.content[loneIndex]);
  const text = usj.content[loneIndex + 1];
  if (!verse || !isBodyParagraph(text)) return false;
  const first = (text.content ?? []).find(child => !isBlankText(child));
  if (typeof first !== 'string') return false;
  return applyAtCaret(
    editor,
    [
      { retain: blockStart(usj, loneIndex) },
      { delete: deltaLength(usj.content[loneIndex]) + hostLength },
      verseEmbed(verse),
    ],
    { jsonPath: `$.content[${loneIndex}]`, offset: 1 }
  );
}
