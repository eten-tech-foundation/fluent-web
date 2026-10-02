import { isHeadingMarker } from './heading-markers';
import { remapTextSelection } from './remap-text-selection';

import type { DeltaOp, EditorRef, SelectionRange } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

/** Editorial delta coordinates count embeds once and terminate each paragraph with an LF. */
export function deltaLength(node: string | MarkerObject): number {
  if (typeof node === 'string') return node.length;
  if (node.type === 'para' || node.type === 'char')
    return (
      (node.content ?? []).reduce((length, child) => length + deltaLength(child), 0) +
      (node.type === 'para' ? 1 : 0)
    );
  return 1;
}

interface VerseLocation {
  number: number;
  block: MarkerObject;
  blockIndex: number;
  childIndex: number;
  startsBlock: boolean;
  offset: number;
  blockEnd: number;
}

function verseLocations(usj: Usj): VerseLocation[] {
  const verses: VerseLocation[] = [];
  let offset = 0;
  let hasPriorVerse = false;
  usj.content.forEach((block, blockIndex) => {
    if (typeof block !== 'string' && block.type === 'para') {
      if (isHeadingMarker(block.marker)) hasPriorVerse = false;
      const blockEnd = offset + deltaLength(block) - 1;
      let childOffset = offset;
      block.content?.forEach((child, childIndex) => {
        if (typeof child !== 'string' && child.type === 'verse') {
          // Text typed before the first milestone belongs to that verse (also after a heading).
          // Keep its prefix with the verse instead of splitting it into an unsaveable paragraph.
          verses.push({
            number: Number(child.number),
            block,
            blockIndex,
            childIndex,
            startsBlock: childIndex === 0 || !hasPriorVerse,
            offset: hasPriorVerse ? childOffset : offset,
            blockEnd,
          });
          hasPriorVerse = true;
        }
        childOffset += deltaLength(child);
      });
    }
    offset += deltaLength(block);
  });
  return verses;
}

const paragraphAttributes = (marker: string) => ({ para: { style: marker } });

/** Local deltas use Editorial's native history and onUsjChange, including undo and redo. */
export function applyStructuralEdit(editor: EditorRef, ops: DeltaOp[]): void {
  // Flush any pending selection-only transaction before adding the document change.
  const selection = editor.getSelection();
  const before = editor.getUsj();
  editor.applyUpdate(ops, 'local');
  const after = editor.getUsj();
  const restored = after && remapTextSelection(before, after, selection);
  if (restored) {
    editor.focus();
    editor.getSelection();
    editor.setSelection(restored);
    editor.getSelection();
  }
}

/** Split only at verse boundaries, preserving all existing text, inline markers and embeds. */
export function formatVerseBlock(editor: EditorRef, verseNumber: number, marker: string): boolean {
  editor.getSelection();
  const usj = editor.getUsj();
  if (!usj) return false;
  const locations = verseLocations(usj);
  const index = locations.findIndex(verse => verse.number === verseNumber);
  if (index < 0) return false;
  const active = locations[index];
  const next = index + 1 < locations.length ? locations[index + 1] : undefined;
  const edits: Array<{ offset: number; operation: DeltaOp }> = [];
  if (!active.startsBlock)
    edits.push({
      offset: active.offset,
      operation: { insert: '\n', attributes: paragraphAttributes(active.block.marker) },
    });

  if (next?.blockIndex === active.blockIndex)
    edits.push({
      offset: next.offset,
      operation: { insert: '\n', attributes: paragraphAttributes(marker) },
    });
  else {
    edits.push({
      offset: active.blockEnd,
      operation: { retain: 1, attributes: { style: marker } },
    });
    // A verse may continue across several paragraphs before sharing its last one with a follower.
    if (next && !next.startsBlock)
      edits.push({
        offset: next.offset,
        operation: { insert: '\n', attributes: paragraphAttributes(next.block.marker) },
      });
  }

  let offset = 0;
  const ops: DeltaOp[] = [];
  for (const edit of edits.sort((a, b) => a.offset - b.offset)) {
    if (edit.offset > offset) ops.push({ retain: edit.offset - offset });
    ops.push(edit.operation);
    offset = edit.offset + (typeof edit.operation.retain === 'number' ? edit.operation.retain : 0);
  }
  applyStructuralEdit(editor, ops);
  return true;
}

/** Insert heading words before the verse, splitting its shared paragraph in the same transaction. */
export function insertSectionHeading(
  editor: EditorRef,
  verseNumber: number,
  marker: string,
  text: string
): SelectionRange | undefined {
  editor.getSelection();
  const usj = editor.getUsj();
  if (!usj) return undefined;
  const verse = verseLocations(usj).find(row => row.number === verseNumber);
  if (!verse) return undefined;
  const ops: DeltaOp[] = verse.offset > 0 ? [{ retain: verse.offset }] : [];
  if (!verse.startsBlock)
    ops.push({ insert: '\n', attributes: paragraphAttributes(verse.block.marker) });
  ops.push({ insert: text }, { insert: '\n', attributes: paragraphAttributes(marker) });
  applyStructuralEdit(editor, ops);
  const after = editor.getUsj();
  const updated = after && verseLocations(after).find(row => row.number === verseNumber);
  if (!updated) return undefined;
  return {
    start: { jsonPath: `$.content[${updated.blockIndex}]`, offset: updated.childIndex + 1 },
  };
}
