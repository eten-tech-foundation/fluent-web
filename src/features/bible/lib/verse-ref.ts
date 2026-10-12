export interface VerseReference {
  readonly chapterNumber: number;
  readonly verseNumber: number;
}

const isPositiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

/**
 * Keep current-chapter keys compact while qualifying adjacent chapters.
 * Omitting currentChapterNumber always produces an explicit chapter:verse key.
 */
export const formatVerseRef = (
  { chapterNumber, verseNumber }: VerseReference,
  currentChapterNumber?: number
): string => {
  if (!isPositiveInteger(chapterNumber) || !isPositiveInteger(verseNumber)) {
    throw new Error('A verse reference requires positive integer chapter and verse numbers');
  }
  return chapterNumber === currentChapterNumber
    ? String(verseNumber)
    : `${chapterNumber}:${verseNumber}`;
};

/** Parse a compact current-chapter key or an explicit chapter:verse key. */
export const parseVerseRef = (
  verseRef: string,
  currentChapterNumber: number
): VerseReference | null => {
  if (!isPositiveInteger(currentChapterNumber)) return null;
  const match = /^(?:([1-9]\d*):)?([1-9]\d*)$/.exec(verseRef);
  if (!match) return null;
  const explicitChapter = match.at(1);
  const verse = match.at(2);
  if (verse === undefined) return null;
  const chapterNumber =
    explicitChapter === undefined ? currentChapterNumber : Number(explicitChapter);
  const verseNumber = Number(verse);
  if (!isPositiveInteger(chapterNumber) || !isPositiveInteger(verseNumber)) return null;
  return {
    chapterNumber,
    verseNumber,
  };
};
