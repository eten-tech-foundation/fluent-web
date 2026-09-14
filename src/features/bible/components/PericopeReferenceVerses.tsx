import { useTranslation } from 'react-i18next';

import { useAquiferBibleText } from '@/features/resources/hooks/useAquiferResources';
import {
  useYouVersionChapterMeta,
  useYouVersionChapterText,
} from '@/features/resources/hooks/useYouVersion';
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
  const { t } = useTranslation();
  const bible = /^(aq|yv)-(\d+)$/.exec(bibleId);
  const rawId = bible ? Number(bible[2]) : null;
  const isAquifer = bible?.[1] === 'aq';
  const isYouVersion = bible?.[1] === 'yv';
  const aquifer = useAquiferBibleText(isAquifer ? rawId : null, bookCode, chapterNumber, isAquifer);
  const youVersion = useYouVersionChapterMeta(
    isYouVersion ? rawId : null,
    bookCode,
    chapterNumber,
    isYouVersion
  );
  const passages = useYouVersionChapterText(
    isYouVersion ? rawId : null,
    youVersion.data,
    isYouVersion && !youVersion.isLoading
  );
  const loading =
    (isAquifer && aquifer.isLoading) ||
    (isYouVersion && (youVersion.isLoading || passages.some(passage => passage.isLoading)));
  const failed = (isAquifer && aquifer.isError) || (isYouVersion && youVersion.isError);

  // Match the resource panel's plain-text normalization, scoped to this chapter.
  const textByVerse = new Map<number, string>();
  if (isAquifer) {
    aquifer.data?.chapters
      .find(chapter => chapter.number === chapterNumber)
      ?.verses.forEach(verse => textByVerse.set(verse.number, verse.text));
  } else if (isYouVersion) {
    youVersion.data?.verses.forEach((verse, index) => {
      const [, chapter, verseNumber] = verse.passage_id.split('.');
      if (Number(chapter) === chapterNumber && passages[index]?.data) {
        textByVerse.set(parseInt(verseNumber, 10), passages[index].data.content);
      }
    });
  }

  return (
    <>
      {verses
        .filter(verse => verse.chapterNumber === chapterNumber)
        .sort((a, b) => a.verseNumber - b.verseNumber)
        .map(verse => {
          const text = textByVerse.get(verse.verseNumber);
          const unavailable = !text?.trim();
          const content = loading
            ? t('loading', 'Loading...')
            : failed
              ? t('errorLoadingBibleContent', 'Unable to load Bible content.')
              : unavailable
                ? t('noContentAvailable', 'No content available')
                : text;

          return (
            <span key={verse.verseNumber} className='mr-3'>
              <span className='mr-1 font-bold'>
                {showChapter ? `${chapterNumber}:${verse.verseNumber}` : verse.verseNumber}
              </span>
              <span
                className={loading || failed || unavailable ? 'text-muted-foreground text-sm' : ''}
              >
                {content}
              </span>{' '}
            </span>
          );
        })}
    </>
  );
};
