import React from 'react';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { type PericopeGroup, type ProjectItem, type Source, type TargetVerse } from '@/lib/types';
import { useAppStore } from '@/store/store';

interface DraftingGridPericopeProps {
  pericopes: PericopeGroup[];
  sourceVerses: Source[];
  verses: TargetVerse[];
  activeVerseId: number;
  readOnly: boolean;
  selectedPanel: 1 | 2;
  bibleVerseMap: Map<number, string>;
  globalNextUntouchedVerse: Source | null;
  projectItem: ProjectItem;
  isTranslationComplete: boolean;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  verseRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  handleTextChange: (verseNumber: number, text: string) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleNextClick: () => Promise<void>;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isSuggestionsFetched: boolean;
}

interface TargetVersesGroupProps {
  groupVerses: Source[];
  verses: TargetVerse[];
  activeVerseId: number;
  readOnly: boolean;
  globalNextUntouchedVerse: Source | null;
  lastSourceVerseNumber: number;
  isTranslationComplete: boolean;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  handleTextChange: (verseNumber: number, text: string) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleNextClick: () => Promise<void>;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isSuggestionsFetched: boolean;
}

export const TargetVersesGroup: React.FC<TargetVersesGroupProps> = ({
  groupVerses,
  verses,
  activeVerseId,
  readOnly,
  globalNextUntouchedVerse,
  lastSourceVerseNumber,
  isTranslationComplete,
  textareaRefs,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
  handleNextClick,
  aiSuggestions,
  isAiThresholdMet,
  isSuggestionsFetched,
}) => {
  const { t } = useTranslation();
  const activeTargetVerse = verses.find(tv => tv.verseNumber === activeVerseId);
  const isActiveVerseEmpty = !activeTargetVerse?.content.trim();

  const activeIndex = groupVerses.findIndex(gv => gv.verseNumber === activeVerseId);
  const isAnyActive = activeIndex !== -1;
  const currentProjectItem = useAppStore(state => state.currentProjectItem);

  let buttonVerseNumber: number | null = null;
  let showOutOfBoxButton = false;

  const isLastVerseOfChapter = activeVerseId === lastSourceVerseNumber;

  if (!isTranslationComplete && (!isLastVerseOfChapter || globalNextUntouchedVerse)) {
    if (isActiveVerseEmpty) {
      if (isAnyActive) {
        buttonVerseNumber = activeVerseId;
      }
    } else if (globalNextUntouchedVerse) {
      buttonVerseNumber = globalNextUntouchedVerse.verseNumber;
    } else if (isAnyActive) {
      showOutOfBoxButton = true;
    }
  }

  return (
    <>
      {groupVerses.map(v => {
        const currentTargetVerse = verses.find(tv => tv.verseNumber === v.verseNumber);
        const isButtonRow = !readOnly && buttonVerseNumber === v.verseNumber;

        return (
          <div
            key={v.verseNumber}
            className='flex w-full items-start'
            onClick={e => {
              e.stopPropagation();
              const textarea = textareaRefs.current[v.verseNumber];
              if (textarea) {
                textarea.focus();
              }
            }}
          >
            <span className='mt-0.5 mr-3 w-4 text-right text-base font-bold text-slate-900 select-none dark:text-slate-100'>
              {v.verseNumber}
            </span>
            <div className='flex min-h-[24px] flex-1 flex-col items-start justify-center'>
              <div className='relative w-full'>
                {readOnly ? (
                  <p className='w-full text-base leading-relaxed text-slate-800 select-text dark:text-slate-200'>
                    {currentTargetVerse?.content ?? ''}
                  </p>
                ) : (
                  <textarea
                    ref={el => {
                      textareaRefs.current[v.verseNumber] = el;
                    }}
                    aria-label={`Translation for verse ${v.verseNumber}`}
                    autoCapitalize='sentences'
                    autoCorrect='on'
                    className={`text-foreground w-full resize-none overflow-hidden border-none bg-transparent py-0.5 text-base leading-relaxed outline-none ${
                      isButtonRow ? 'pr-16' : ''
                    }`}
                    placeholder={
                      v.verseNumber === activeVerseId &&
                      currentProjectItem?.isAiEnabled &&
                      isAiThresholdMet &&
                      !aiSuggestions[v.verseNumber] &&
                      !currentTargetVerse?.content.trim() &&
                      !isSuggestionsFetched
                        ? t('generatingAiSuggestion', 'Generating...')
                        : t('typeHere', 'Type here...')
                    }
                    rows={1}
                    spellCheck={true}
                    style={
                      {
                        fieldSizing: 'content',
                      } as React.CSSProperties
                    }
                    value={currentTargetVerse?.content ?? ''}
                    onChange={e => handleTextChange(v.verseNumber, e.target.value)}
                    onFocus={() => handleActiveVerseChange(v.verseNumber)}
                    onKeyDown={handleKeyDown}
                  />
                )}

                {isButtonRow && (
                  <Button
                    className='bg-primary hover:bg-primary-hover absolute top-1/2 right-0 z-10 flex h-6 -translate-y-1/2 cursor-pointer items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white shadow-xs transition-all'
                    disabled={isActiveVerseEmpty}
                    onClick={handleNextClick}
                  >
                    {t('nextVerse', 'Next Verse')}
                  </Button>
                )}
              </div>

              {!readOnly &&
                v.verseNumber === activeVerseId &&
                currentProjectItem?.isAiEnabled &&
                isAiThresholdMet &&
                !aiSuggestions[v.verseNumber] &&
                !currentTargetVerse?.content.trim() &&
                isSuggestionsFetched && (
                  <p className='text-destructive mt-1 text-sm font-medium'>
                    {t('aiTranslationNotAvailable', 'AI translation not available.')}
                  </p>
                )}
            </div>
          </div>
        );
      })}
      {showOutOfBoxButton && (
        <div className='flex justify-end pt-2'>
          <Button
            className='bg-primary hover:bg-primary-hover flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white shadow-xs transition-all'
            disabled={isActiveVerseEmpty}
            onClick={handleNextClick}
          >
            {t('nextVerse', 'Next Verse')}
          </Button>
        </div>
      )}
    </>
  );
};

export const DraftingGridPericope: React.FC<DraftingGridPericopeProps> = ({
  pericopes,
  sourceVerses,
  verses,
  activeVerseId,
  readOnly,
  selectedPanel,
  bibleVerseMap,
  globalNextUntouchedVerse,
  projectItem,
  isTranslationComplete,
  textareaRefs,
  verseRefs,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
  handleNextClick,
  aiSuggestions,
  isAiThresholdMet,
  isSuggestionsFetched,
}) => {
  const { t } = useTranslation();
  const lastSourceVerseNumber = sourceVerses[sourceVerses.length - 1]?.verseNumber ?? 0;

  return (
    <>
      {pericopes.map(group => {
        const groupVerses = sourceVerses.filter(sv =>
          group.verses.some(gv => gv.verseNumber === sv.verseNumber)
        );
        if (groupVerses.length === 0) return null;
        const verseNumbers = groupVerses.map(gv => gv.verseNumber);
        const minVerse = Math.min(...verseNumbers);
        const maxVerse = Math.max(...verseNumbers);
        const heading =
          minVerse === maxVerse
            ? `${projectItem.chapterNumber}:${minVerse}`
            : `${projectItem.chapterNumber}:${minVerse}-${maxVerse}`;

        const isGroupActive = groupVerses.some(gv => gv.verseNumber === activeVerseId);

        return (
          <div
            key={group.pericopeNumber}
            ref={el => {
              groupVerses.forEach(gv => {
                verseRefs.current[gv.verseNumber] = el;
              });
            }}
            className='grid w-full items-start py-4'
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            <div className='flex w-full flex-col space-y-2 px-6'>
              <h4 className='text-base font-bold text-slate-800 select-none dark:text-slate-200'>
                {heading}
              </h4>
              <div
                className={`focus-visible:ring-primary dark:bg-card w-full cursor-pointer rounded-[12px] border-2 bg-[#f0f4f9] p-5 shadow-xs transition-all focus:outline-hidden focus-visible:ring-2 ${
                  isGroupActive ? 'border-primary' : 'dark:border-border border-[#cfd8e3]'
                }`}
                role='button'
                tabIndex={0}
                onClick={() => {
                  const isGroupAlreadyActive = groupVerses.some(
                    gv => gv.verseNumber === activeVerseId
                  );
                  if (!isGroupAlreadyActive) {
                    handleActiveVerseChange(groupVerses[0].verseNumber);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const isGroupAlreadyActive = groupVerses.some(
                      gv => gv.verseNumber === activeVerseId
                    );
                    if (!isGroupAlreadyActive) {
                      handleActiveVerseChange(groupVerses[0].verseNumber);
                    }
                  }
                }}
              >
                <p className='text-base leading-relaxed text-slate-800 select-text dark:text-slate-200'>
                  {groupVerses.map(v => {
                    const textToRender =
                      selectedPanel === 1
                        ? v.text
                        : (bibleVerseMap.get(v.verseNumber) ?? t('noContentAvailable'));
                    return (
                      <React.Fragment key={v.verseNumber}>
                        <span className='mr-1.5 font-bold text-slate-900 dark:text-slate-100'>
                          {v.verseNumber}
                        </span>
                        <span
                          className={`mr-3 ${selectedPanel === 2 && !bibleVerseMap.has(v.verseNumber) ? 'text-muted-foreground text-sm' : ''}`}
                        >
                          {textToRender}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </p>
              </div>
            </div>
            <div className='flex w-full flex-col space-y-2 px-6'>
              <h4 className='text-base font-bold text-slate-800 select-none dark:text-slate-200'>
                {heading}
              </h4>
              <div
                className={`dark:bg-card w-full cursor-pointer space-y-1 rounded-[12px] border-2 bg-[#f0f4f9] p-5 transition-all ${
                  isGroupActive ? 'border-primary' : 'dark:border-border border-[#cfd8e3]'
                }`}
                onClick={e => {
                  if (e.target === e.currentTarget) {
                    const isGroupAlreadyActive = groupVerses.some(
                      gv => gv.verseNumber === activeVerseId
                    );
                    if (!isGroupAlreadyActive) {
                      handleActiveVerseChange(groupVerses[0].verseNumber);
                    }
                  }
                }}
              >
                <TargetVersesGroup
                  activeVerseId={activeVerseId}
                  aiSuggestions={aiSuggestions}
                  globalNextUntouchedVerse={globalNextUntouchedVerse}
                  groupVerses={groupVerses}
                  handleActiveVerseChange={handleActiveVerseChange}
                  handleKeyDown={handleKeyDown}
                  handleNextClick={handleNextClick}
                  handleTextChange={handleTextChange}
                  isAiThresholdMet={isAiThresholdMet}
                  isSuggestionsFetched={isSuggestionsFetched}
                  isTranslationComplete={isTranslationComplete}
                  lastSourceVerseNumber={lastSourceVerseNumber}
                  readOnly={readOnly}
                  textareaRefs={textareaRefs}
                  verses={verses}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};
