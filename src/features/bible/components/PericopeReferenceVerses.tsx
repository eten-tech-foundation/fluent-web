import { PericopeText } from '@/features/bible/components/PericopeText';
import { useAquiferBibleText } from '@/features/resources/hooks/useAquiferResources';
import { useYouVersionChapterText } from '@/features/resources/hooks/useYouVersion';
import type { PericopeVerseRef } from '@/lib/types';

interface PericopeReferenceVersesProps {
  bibleId: string;
  bookCode: string;
  chapterNumber: number;
  verses: PericopeVerseRef[];
  showChapter: boolean;
}

export const PericopeReferenceVerses = ({
  bibleId,
  bookCode,
  chapterNumber,
  verses,
  showChapter,
}: PericopeReferenceVersesProps) => {
  const bible = /^(aq|yv)-(\d+)$/.exec(bibleId);
  const rawId = bible ? Number(bible[2]) : null;
  const isAquifer = bible?.[1] === 'aq';
  const isYouVersion = bible?.[1] === 'yv';
  const aquifer = useAquiferBibleText(isAquifer ? rawId : null, bookCode, chapterNumber, isAquifer);
  const youVersion = useYouVersionChapterText(
    isYouVersion ? rawId : null,
    bookCode,
    chapterNumber,
    isYouVersion
  );

  // Match the resource panel's plain-text normalization, scoped to this chapter.
  const textByVerse = new Map<number, string>();
  if (isAquifer) {
    aquifer.data?.chapters
      .find(chapter => chapter.number === chapterNumber)
      ?.verses.forEach(verse => textByVerse.set(verse.number, verse.text));
  } else if (isYouVersion) {
    youVersion.data?.verses.forEach(v => {
      textByVerse.set(v.verseNumber, v.content);
    });
  }

  return (
    <>
      {verses
        .filter(verse => verse.chapterNumber === chapterNumber)
        .sort((a, b) => a.verseNumber - b.verseNumber)
        .map(verse => {
          const text = textByVerse.get(verse.verseNumber);
          const loading =
            (isAquifer && aquifer.isLoading) || (isYouVersion && youVersion.isLoading);
          const failed =
            (isAquifer && aquifer.isError) ||
            (isYouVersion && (youVersion.isError || youVersion.data?.verses.length === 0));

          return (
            <span key={verse.verseNumber} className='mr-3'>
              <span className='mr-1 font-bold'>
                {showChapter ? `${chapterNumber}:${verse.verseNumber}` : verse.verseNumber}
              </span>
              <PericopeText content={text} isError={!!failed} isLoading={!!loading} />{' '}
            </span>
          );
        })}
    </>
  );
};
