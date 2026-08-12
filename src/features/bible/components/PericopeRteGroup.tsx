import React, { useCallback, useMemo } from 'react';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { SuggestionStatus } from '@/features/bible/hooks/useAiSuggestions';
import { PericopeEditor } from '@/features/rte/components/PericopeEditor';
import type { PericopeVerseText } from '@/features/rte/lib/pericope-usj';
import { type Source, type TargetVerse, type VerseMarkers } from '@/lib/types';

interface PericopeRteGroupProps {
  groupVerses: Source[];
  verses: TargetVerse[];
  /** Identifies the chapter being drafted, so the editor reloads when the assignment changes. */
  chapterAssignmentId: number;
  bookCode: string;
  chapterNumber: number;
  activeVerseId: number;
  readOnly: boolean;
  /** Whether a pericope follows this one in the chapter, i.e. whether there is anywhere to go. */
  hasNextPericope: boolean;
  isTranslationComplete: boolean;
  handleTextChange: (verseNumber: number, text: string, markers?: VerseMarkers | null) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleNextPericopeClick: () => Promise<void>;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isAiActive: boolean;
  suggestionStatus: SuggestionStatus;
}

/**
 * One pericope as a single rich text editing surface (#314), replacing the column of per-verse
 * textareas in `TargetVersesGroup`.
 *
 * The per-verse affordances the drafting flow relies on move below the editor, since there are no
 * longer verse rows to hang them on: the AI suggestion notice follows the verse the cursor is in,
 * and the "Next Verse" button becomes a "Next Pericope" button at the bottom of the surface
 * (chadw-eten on #400). Enter is left to the editor as a paragraph break and advances nothing.
 */
export const PericopeRteGroup: React.FC<PericopeRteGroupProps> = ({
  groupVerses,
  verses,
  chapterAssignmentId,
  bookCode,
  chapterNumber,
  activeVerseId,
  readOnly,
  hasNextPericope,
  isTranslationComplete,
  handleTextChange,
  handleActiveVerseChange,
  handleNextPericopeClick,
  aiSuggestions,
  isAiThresholdMet,
  isAiActive,
  suggestionStatus,
}) => {
  const { t } = useTranslation();

  const editorVerses = useMemo<PericopeVerseText[]>(
    () =>
      groupVerses.map(source => {
        const target = verses.find(candidate => candidate.verseNumber === source.verseNumber);
        return {
          verseNumber: source.verseNumber,
          text: target?.content ?? '',
          markers: target?.markers ?? null,
        };
      }),
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
      changed.forEach(verse => handleTextChange(verse.verseNumber, verse.text, verse.markers));
    },
    [handleTextChange]
  );

  const activeTargetVerse = verses.find(tv => tv.verseNumber === activeVerseId);
  const isActiveVerseEmpty = !activeTargetVerse?.content.trim();
  const isGroupActive = groupVerses.some(gv => gv.verseNumber === activeVerseId);

  // The pericope-level reading of the verse button's "don't advance from an empty verse" rule:
  // the whole pericope is on screen, so all of it has to be drafted before moving past it.
  const isPericopeDrafted = groupVerses.every(gv =>
    verses.find(tv => tv.verseNumber === gv.verseNumber)?.content.trim()
  );

  const showNextPericopeButton =
    !readOnly && isGroupActive && !isTranslationComplete && hasNextPericope;

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

      {showNextPericopeButton && (
        <div className='flex justify-end'>
          <Button
            className='bg-primary hover:bg-primary-hover flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white shadow-xs transition-all'
            disabled={!isPericopeDrafted}
            onClick={handleNextPericopeClick}
          >
            {t('nextPericope', 'Next Pericope')}
          </Button>
        </div>
      )}
    </div>
  );
};
