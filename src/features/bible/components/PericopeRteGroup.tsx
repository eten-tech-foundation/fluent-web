import React, { useCallback, useMemo } from 'react';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { SuggestionStatus } from '@/features/bible/hooks/useAiSuggestions';
import { PericopeEditor } from '@/features/rte/components/PericopeEditor';
import type { PericopeVerseText } from '@/features/rte/lib/pericope-usj';
import { type Source, type TargetVerse } from '@/lib/types';

interface PericopeRteGroupProps {
  groupVerses: Source[];
  verses: TargetVerse[];
  /** Identifies the chapter being drafted, so the editor reloads when the assignment changes. */
  chapterAssignmentId: number;
  bookCode: string;
  chapterNumber: number;
  activeVerseId: number;
  readOnly: boolean;
  globalNextUntouchedVerse: Source | null;
  lastSourceVerseNumber: number;
  isTranslationComplete: boolean;
  handleTextChange: (verseNumber: number, text: string) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleNextClick: () => Promise<void>;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isAiActive: boolean;
  suggestionStatus: SuggestionStatus;
}

/**
 * One pericope as a single rich text editing surface (#314), replacing the column of per-verse
 * textareas in `TargetVersesGroup`.
 *
 * The per-verse affordances the drafting flow relies on — the AI suggestion notice and the "Next
 * Verse" button — move below the editor and follow the verse the cursor is in, since there are no
 * longer verse rows to hang them on.
 */
export const PericopeRteGroup: React.FC<PericopeRteGroupProps> = ({
  groupVerses,
  verses,
  chapterAssignmentId,
  bookCode,
  chapterNumber,
  activeVerseId,
  readOnly,
  globalNextUntouchedVerse,
  lastSourceVerseNumber,
  isTranslationComplete,
  handleTextChange,
  handleActiveVerseChange,
  handleNextClick,
  aiSuggestions,
  isAiThresholdMet,
  isAiActive,
  suggestionStatus,
}) => {
  const { t } = useTranslation();

  const editorVerses = useMemo<PericopeVerseText[]>(
    () =>
      groupVerses.map(source => ({
        verseNumber: source.verseNumber,
        text: verses.find(target => target.verseNumber === source.verseNumber)?.content ?? '',
      })),
    [groupVerses, verses]
  );

  // Reload only when the pericope's identity changes, not on every keystroke: the editor owns the
  // document while it is focused. The assignment is part of that identity — chapter 1 verses 1-2
  // exist in every book, so without it a different book could reuse the loaded document.
  const contentKey = useMemo(
    () =>
      `${chapterAssignmentId}/${chapterNumber}:${groupVerses.map(v => v.verseNumber).join(',')}`,
    [chapterAssignmentId, chapterNumber, groupVerses]
  );

  const handleVersesChange = useCallback(
    (changed: PericopeVerseText[]) => {
      changed.forEach(verse => handleTextChange(verse.verseNumber, verse.text));
    },
    [handleTextChange]
  );

  const activeTargetVerse = verses.find(tv => tv.verseNumber === activeVerseId);
  const isActiveVerseEmpty = !activeTargetVerse?.content.trim();
  const isGroupActive = groupVerses.some(gv => gv.verseNumber === activeVerseId);
  const isLastVerseOfChapter = activeVerseId === lastSourceVerseNumber;

  const showNextButton =
    !readOnly &&
    isGroupActive &&
    !isTranslationComplete &&
    (!isLastVerseOfChapter || globalNextUntouchedVerse !== null);

  const aiNotice =
    !readOnly &&
    isGroupActive &&
    isAiActive &&
    isAiThresholdMet &&
    !aiSuggestions[activeVerseId] &&
    isActiveVerseEmpty
      ? suggestionStatus
      : undefined;

  return (
    <div className='flex w-full flex-col gap-2'>
      <PericopeEditor
        bookCode={bookCode}
        chapterNumber={chapterNumber}
        contentKey={contentKey}
        readOnly={readOnly}
        verses={editorVerses}
        onActiveVerseChange={handleActiveVerseChange}
        onVersesChange={handleVersesChange}
      />

      {aiNotice === 'error' && (
        <p className='text-destructive text-sm font-medium'>
          {t('aiTranslationNotAvailable', 'AI translation not available.')}
        </p>
      )}
      {aiNotice === 'unavailable' && (
        <p className='text-destructive text-sm font-medium'>
          {t(
            'aiTranslationNotYetReady',
            'AI translation not yet ready. Please refresh the page to view the AI translation.'
          )}
        </p>
      )}

      {showNextButton && (
        <div className='flex justify-end'>
          <Button
            className='bg-primary hover:bg-primary-hover flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white shadow-xs transition-all'
            disabled={isActiveVerseEmpty}
            onClick={handleNextClick}
          >
            {t('nextVerse', 'Next Verse')}
          </Button>
        </div>
      )}
    </div>
  );
};
