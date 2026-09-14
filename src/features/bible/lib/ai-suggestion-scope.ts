import type { PericopeGroup, Source } from '@/lib/types';

export interface PericopeSuggestionScope {
  verseNumbers: number[];
  nextVerseNumbers: number[];
  pericopeNumbers: string[];
  titleVerseNumbers: Record<string, number>;
}

/** Match the groups the grid can actually render, including gaps in source data. */
export function pericopeSuggestionScope(
  pericopes: PericopeGroup[],
  activeVerseNumber: number,
  sourceVerses: Source[]
): PericopeSuggestionScope {
  const available = new Set(sourceVerses.map(verse => verse.verseNumber));
  const groups = pericopes
    .map(group => ({
      ...group,
      numbers: group.verses.map(verse => verse.verseNumber).filter(number => available.has(number)),
    }))
    .filter(group => group.numbers.length > 0);
  const index = groups.findIndex(group => group.numbers.includes(activeVerseNumber));
  const requested = index === -1 ? [] : groups.slice(index, index + 2);
  return {
    verseNumbers: groups[index]?.numbers ?? [],
    nextVerseNumbers: index === -1 ? [] : (groups[index + 1]?.numbers ?? []),
    pericopeNumbers: requested.map(group => group.pericopeNumber),
    titleVerseNumbers: Object.fromEntries(
      requested
        .filter(group => group.pericopeTitle?.trim())
        .map(group => [group.pericopeNumber, group.numbers[0]])
    ),
  };
}
