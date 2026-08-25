import type { PericopeVerseText } from './pericope-usj';

const DEFAULT_BLOCK_MARKER = 'p';

const opensBlock = (row: PericopeVerseText): boolean =>
  row.markers?.paragraphs.some(paragraph => paragraph.offset === 0) ?? false;

const midVerseSplits = (row: PericopeVerseText) =>
  row.markers?.paragraphs.filter(paragraph => paragraph.offset > 0) ?? [];

/** The marker of the block a row sits in: its own opener, the nearest one above, or the default. */
function surroundingBlockMarker(rows: PericopeVerseText[], index: number): string {
  for (let i = index; i >= 0; i--) {
    const opening = rows[i].markers?.paragraphs.find(paragraph => paragraph.offset === 0);
    if (opening) return opening.marker;
  }
  return DEFAULT_BLOCK_MARKER;
}

/**
 * Scopes a block format (Poetry Line, Section Heading, Paragraph) to the verse the cursor is in.
 *
 * A fresh chapter is a single paragraph holding every verse, so the editor's own block formatting
 * would restyle the whole chapter at once (#427). Instead: the active verse opens a block with the
 * chosen marker, and the following verse reopens a block with the marker of the paragraph it was
 * in — so formatting one verse inside a poetry block does not silently end the poetry.
 *
 * Returns the full updated row list plus just the rows that changed (what the save path needs), or
 * `null` when the active verse already is a single-verse block — there the editor's own
 * `formatPara` does the same thing while keeping the cursor, so the caller should use it.
 */
export function scopeBlockFormatToVerse(
  rows: PericopeVerseText[],
  activeVerseNumber: number,
  marker: string
): { updated: PericopeVerseText[]; changed: PericopeVerseText[] } | null {
  const index = rows.findIndex(row => row.verseNumber === activeVerseNumber);
  if (index === -1) return null;

  const active = rows[index];
  const next = index + 1 < rows.length ? rows[index + 1] : undefined;
  if (opensBlock(active) && (!next || opensBlock(next))) return null;

  // Resolved before any rewrite: the follower reopens the block the active verse was sitting in.
  const reopenMarker = surroundingBlockMarker(rows, index);

  const updatedActive: PericopeVerseText = {
    ...active,
    markers: {
      ...(active.markers ?? {}),
      paragraphs: [{ marker, offset: 0 }, ...midVerseSplits(active)],
    },
  };

  const updatedNext: PericopeVerseText | undefined =
    next && !opensBlock(next)
      ? {
          ...next,
          markers: {
            ...(next.markers ?? {}),
            paragraphs: [{ marker: reopenMarker, offset: 0 }, ...midVerseSplits(next)],
          },
        }
      : undefined;

  const updated = rows.map(row => {
    if (row === active) return updatedActive;
    if (updatedNext && row === next) return updatedNext;
    return row;
  });

  return {
    updated,
    changed: updatedNext ? [updatedActive, updatedNext] : [updatedActive],
  };
}
