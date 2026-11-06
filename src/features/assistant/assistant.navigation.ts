import { pericopeHeading } from '@/features/bible/lib/pericope-display';
import { type PericopeGroup } from '@/lib/types';

import { type PassageBriefingContext } from './assistant.types';

export interface PassageBriefingSelection {
  context: PassageBriefingContext;
  reference: string;
}

/**
 * Match Fluent API's canonical resolution: every verse in a pericope uses its first ordered
 * reference as browser identity. Only a successfully loaded list with no covering group falls
 * back to the exact active verse.
 */
export function canonicalPassageBriefingSelection(
  context: PassageBriefingContext,
  pericopes: PericopeGroup[],
  bookLabel = context.bookCode
): PassageBriefingSelection {
  const group = pericopes.find(candidate =>
    candidate.verses.some(
      verse => verse.chapterNumber === context.chapter && verse.verseNumber === context.activeVerse
    )
  );
  if (!group) {
    return { context, reference: `${bookLabel} ${context.chapter}:${context.activeVerse}` };
  }
  const first = [...group.verses]
    .sort(
      (left, right) =>
        left.chapterNumber - right.chapterNumber || left.verseNumber - right.verseNumber
    )
    .at(0);
  if (!first) {
    return { context, reference: `${bookLabel} ${context.chapter}:${context.activeVerse}` };
  }
  return {
    context: { ...context, chapter: first.chapterNumber, activeVerse: first.verseNumber },
    reference: `${bookLabel} ${pericopeHeading(group)}`,
  };
}

/** Returns exactly one following canonical pericope selector, or no speculative touch. */
export function nextPassageBriefingContext(
  context: PassageBriefingContext,
  pericopes: PericopeGroup[] | undefined
): PassageBriefingContext | null {
  const currentIndex =
    pericopes?.findIndex(group =>
      group.verses.some(
        verse =>
          verse.chapterNumber === context.chapter && verse.verseNumber === context.activeVerse
      )
    ) ?? -1;
  if (!pericopes || currentIndex < 0 || currentIndex >= pericopes.length - 1) return null;
  const next = pericopes[currentIndex + 1].verses.at(0);
  if (next === undefined) return null;
  return { ...context, chapter: next.chapterNumber, activeVerse: next.verseNumber };
}
