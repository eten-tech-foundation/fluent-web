import { Fragment } from 'react';

import { useTranslation } from 'react-i18next';

import type { PericopeContextChapter } from '@/features/bible/hooks/usePericopeContext';
import { orderedPericopeRefs } from '@/features/bible/lib/pericope-display';
import type { PericopeGroup } from '@/lib/types';

/** Adjacent drafts never enter the active assignment's editor, debounce queue or progress. */
export const PericopeContextText = ({
  group,
  currentChapter,
  chapters,
  side,
}: {
  group: PericopeGroup;
  currentChapter: number;
  chapters?: Map<number, PericopeContextChapter>;
  side: 'before' | 'after';
}) => {
  const { t } = useTranslation();
  const refs = orderedPericopeRefs(group).filter(ref =>
    side === 'before' ? ref.chapterNumber < currentChapter : ref.chapterNumber > currentChapter
  );
  const chapterNumbers = [...new Set(refs.map(ref => ref.chapterNumber))];

  return chapterNumbers.map(chapter => {
    const data = chapters?.get(chapter);
    return (
      <section
        key={chapter}
        aria-label={t('pericopeChapterContext', {
          defaultValue: 'Chapter {{chapter}} context (read-only)',
          chapter,
        })}
        className='text-muted-foreground space-y-1 py-2'
      >
        <p className='text-sm font-medium'>
          {t('pericopeChapterContext', {
            defaultValue: 'Chapter {{chapter}} context (read-only)',
            chapter,
          })}
        </p>
        <p className='text-foreground text-base leading-relaxed select-text'>
          {refs
            .filter(ref => ref.chapterNumber === chapter)
            .map(ref => {
              const source = data?.sourceVerses.find(v => v.verseNumber === ref.verseNumber);
              const content = data?.targetVerses.find(
                v => v.verseNumber === ref.verseNumber
              )?.content;
              const placeholder = data?.isLoading
                ? t('loading', 'Loading...')
                : source
                  ? t('pericopeNotDrafted', 'Not drafted')
                  : t('noContentAvailable', 'No content available');
              return (
                <Fragment key={`${chapter}:${ref.verseNumber}`}>
                  <span className='mr-1.5 font-bold'>
                    {chapter}:{ref.verseNumber}
                  </span>
                  <span
                    className={`mr-3 ${!content?.length ? 'text-muted-foreground text-sm' : ''}`}
                  >
                    {content?.length ? content : placeholder}
                  </span>
                </Fragment>
              );
            })}
        </p>
      </section>
    );
  });
};
