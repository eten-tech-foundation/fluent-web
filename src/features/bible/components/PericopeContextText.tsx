import { Fragment } from 'react';

import { useTranslation } from 'react-i18next';

import { PericopeText } from '@/features/bible/components/PericopeText';
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

  return chapterNumbers.map((chapter, index) => {
    const data = chapters?.get(chapter);
    // A divider only where the chapter changes, so never above the box's first verse; the
    // source column marks the same places. "read-only" is said to screen readers.
    const changesChapter = side === 'after' || index > 0;
    return (
      <section
        key={chapter}
        aria-label={t('pericopeChapterContext', {
          defaultValue: 'Chapter {{chapter}} context (read-only)',
          chapter,
        })}
        className={`text-muted-foreground space-y-1 ${changesChapter ? 'py-2' : 'pb-2'}`}
      >
        {changesChapter && (
          <p className='text-sm font-medium'>
            {t('pericopeCurrentChapter', { defaultValue: 'Chapter {{chapter}}', chapter })}
          </p>
        )}
        <p className='target-scripture text-foreground text-base leading-relaxed select-text'>
          {refs
            .filter(ref => ref.chapterNumber === chapter)
            .map(ref => {
              const source = data?.sourceVerses.find(v => v.verseNumber === ref.verseNumber);
              const content = data?.targetVerses.find(
                v => v.verseNumber === ref.verseNumber
              )?.content;
              // Only a failed source Bible says the Bible is unavailable. The drafts come from
              // the app's own API, and DraftingUI reports a failed draft request with Retry.
              return (
                <Fragment key={`${chapter}:${ref.verseNumber}`}>
                  <span className='mr-1.5 font-sans font-bold'>{ref.verseNumber}</span>
                  <PericopeText
                    className='mr-3'
                    content={content}
                    emptyState={source ? 'not-drafted' : 'unavailable'}
                    isError={data?.sourceIsError}
                    isLoading={data?.isLoading}
                  />
                </Fragment>
              );
            })}
        </p>
      </section>
    );
  });
};
