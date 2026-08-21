import { type PericopeGroup, type Source } from '@/lib/types';

/**
 * Whether a pericope has any verse the chapter's source actually provides.
 *
 * `DraftingGridPericope` renders nothing for a pericope whose verses are all absent from the
 * source, so such a pericope is not somewhere a drafter can be sent. Navigation and the Next
 * Pericope button's visibility both have to agree with what is on screen, or the button appears,
 * moves the active verse into a pericope that renders no box, and then disappears with the
 * drafter stranded.
 */
export const hasSourceBackedVerse = (group: PericopeGroup, sourceVerses: Source[]): boolean =>
  group.verses.some(groupVerse =>
    sourceVerses.some(source => source.verseNumber === groupVerse.verseNumber)
  );

/**
 * The verse to land on when advancing past `currentIdx`: the first verse of the next pericope that
 * actually renders, skipping any that do not. `null` when nothing further renders.
 *
 * The verse is picked in source order, which is the order `DraftingGridPericope` lays the box out
 * in, so this is the first verse the drafter sees there.
 */
export const nextRenderablePericopeVerse = (
  pericopes: PericopeGroup[],
  currentIdx: number,
  sourceVerses: Source[]
): number | null => {
  const nextGroup = pericopes
    .slice(currentIdx + 1)
    .find(group => hasSourceBackedVerse(group, sourceVerses));
  if (!nextGroup) return null;

  const firstRendered = sourceVerses.find(source =>
    nextGroup.verses.some(groupVerse => groupVerse.verseNumber === source.verseNumber)
  );
  return firstRendered?.verseNumber ?? null;
};
