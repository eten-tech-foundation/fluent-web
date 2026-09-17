import type { PericopeGroup, PericopeVerseRef, Source } from '@/lib/types';

export const orderedPericopeRefs = (group: PericopeGroup): PericopeVerseRef[] =>
  [...group.verses].sort(
    (a, b) => a.chapterNumber - b.chapterNumber || a.verseNumber - b.verseNumber
  );

export const pericopeHeading = (group: PericopeGroup): string => {
  const refs = orderedPericopeRefs(group);
  const first = refs.at(0);
  const last = refs.at(-1);
  if (!first || !last) return '';
  const start = `${first.chapterNumber}:${first.verseNumber}`;
  if (first.chapterNumber !== last.chapterNumber)
    return `${start}–${last.chapterNumber}:${last.verseNumber}`;
  return first.verseNumber === last.verseNumber ? start : `${start}-${last.verseNumber}`;
};

export const chapterGroupSources = (
  group: PericopeGroup,
  sourceVerses: Source[],
  chapterNumber: number
): Source[] =>
  sourceVerses.filter(source =>
    group.verses.some(
      ref => ref.chapterNumber === chapterNumber && ref.verseNumber === source.verseNumber
    )
  );
