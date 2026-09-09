import type { PericopeGroup, Source } from '@/lib/types';

export interface PericopeSuggestionScope {
  verseNumbers: number[];
  nextVerseNumbers: number[];
}

/** Match the groups the grid can actually render, including gaps in source data. */
export function pericopeSuggestionScope(
  pericopes: PericopeGroup[],
  activeVerseNumber: number,
  sourceVerses: Source[]
): PericopeSuggestionScope {
  const available = new Set(sourceVerses.map(verse => verse.verseNumber));
  const groups = pericopes
    .map(group =>
      group.verses.map(verse => verse.verseNumber).filter(verse => available.has(verse))
    )
    .filter(group => group.length > 0);
  const index = groups.findIndex(group => group.includes(activeVerseNumber));
  return {
    verseNumbers: groups[index] ?? [],
    nextVerseNumbers: index === -1 ? [] : (groups[index + 1] ?? []),
  };
}
