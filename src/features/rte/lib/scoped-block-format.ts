import { PARAGRAPH_MARKER } from './block-types';

import type { PericopeVerseText } from './pericope-usj';

const opensBlock = (row: PericopeVerseText): boolean =>
  Boolean(row.markers?.headings?.length) ||
  (row.markers?.paragraphs?.some(paragraph => paragraph.offset === 0) ?? false);

const midVerseSplits = (row: PericopeVerseText) =>
  row.markers?.paragraphs?.filter(paragraph => paragraph.offset > 0) ?? [];

/**
 * The marker of the block that is open at the *end* of a row — which is what the row after it
 * continues. That is the row's own furthest paragraph if it has any (a verse can open a block at
 * offset 0 and then split into another one mid-text), otherwise the nearest one above, otherwise
 * the classic default. Looking only at offset-0 openers would miss a block a verse opened inside
 * itself and end it by mistake.
 */
function openBlockMarkerAfter(rows: PericopeVerseText[], index: number): string {
  for (let i = index; i >= 0; i--) {
    const paragraphs = rows[i].markers?.paragraphs ?? [];
    if (paragraphs.length === 0 && rows[i].markers?.headings?.length) return PARAGRAPH_MARKER;
    if (paragraphs.length === 0) continue;
    return paragraphs.reduce((furthest, paragraph) =>
      paragraph.offset > furthest.offset ? paragraph : furthest
    ).marker;
  }
  return PARAGRAPH_MARKER;
}

/** The marker of the block a row's verse starts in. */
function blockMarkerAt(rows: PericopeVerseText[], index: number): string {
  const row = rows[index];
  const opening = row.markers?.paragraphs?.find(paragraph => paragraph.offset === 0);
  if (opening) return opening.marker;
  if (row.markers?.headings?.length) return PARAGRAPH_MARKER;
  return openBlockMarkerAfter(rows, index - 1);
}

/**
 * Scopes body formatting (Poetry Line, Paragraph) to the verse the cursor is in.
 *
 * A fresh chapter is a single paragraph holding every verse, so the editor's own block formatting
 * would restyle the whole chapter at once (#427). Instead: the active verse opens a block with the
 * chosen marker, and the following verse reopens a block with the marker of the paragraph it was
 * in — so formatting one verse inside a poetry block does not silently end the poetry. A verse
 * already in a block of the chosen format only starts a new one, and the verses after it stay in
 * it, as a paragraph marker in front of a verse means (#530 QA).
 *
 * Returns the full updated row list plus just the rows that changed (what the save path needs), or
 * `null` when the active verse already is a single-verse block or already starts a block of that
 * format — there the editor's own
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
  const sameFormat = blockMarkerAt(rows, index) === marker;
  if (sameFormat && opensBlock(active)) return null;

  // Resolved before any rewrite: the follower reopens the block that was open where it starts.
  // The active verse keeps its own mid-text splits, so that block is the same before and after.
  const reopenMarker = openBlockMarkerAfter(rows, index);

  const updatedActive: PericopeVerseText = {
    ...active,
    markers: { ...active.markers, paragraphs: [{ marker, offset: 0 }, ...midVerseSplits(active)] },
  };

  const updatedNext: PericopeVerseText | undefined =
    next && !opensBlock(next) && !sameFormat
      ? {
          ...next,
          markers: {
            ...next.markers,
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
