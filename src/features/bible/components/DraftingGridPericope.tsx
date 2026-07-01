import React from 'react';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { type PericopeGroup, type ProjectItem, type Source, type TargetVerse } from '@/lib/types';

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
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  verseRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  handleTextChange: (verseNumber: number, text: string) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleNextClick: () => Promise<void>;
}

interface TargetVersesGroupProps {
  groupVerses: Source[];
  verses: TargetVerse[];
  activeVerseId: number;
  readOnly: boolean;
  globalNextUntouchedVerse: Source | null;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  handleTextChange: (verseNumber: number, text: string) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleNextClick: () => Promise<void>;
}

const TargetVersesGroup: React.FC<TargetVersesGroupProps> = ({
  groupVerses,
  verses,
  activeVerseId,
  readOnly,
  globalNextUntouchedVerse,
  textareaRefs,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
  handleNextClick,
}) => {
  const { t } = useTranslation();
  const activeTargetVerse = verses.find(tv => tv.verseNumber === activeVerseId);
  const isActiveVerseEmpty = !activeTargetVerse?.content.trim();

  const activeIndex = groupVerses.findIndex(gv => gv.verseNumber === activeVerseId);
  const isAnyActive = activeIndex !== -1;

  let buttonVerseNumber: number | null = null;
  let showOutOfBoxButton = false;

  if (isActiveVerseEmpty) {
    if (isAnyActive) {
      buttonVerseNumber = activeVerseId;
    }
  } else if (globalNextUntouchedVerse) {
    buttonVerseNumber = globalNextUntouchedVerse.verseNumber;
  } else if (isAnyActive) {
    showOutOfBoxButton = true;
  }

  return (
    <>
      {groupVerses.map(v => {
        const currentTargetVerse = verses.find(tv => tv.verseNumber === v.verseNumber);
        const isButtonRow = !readOnly && buttonVerseNumber === v.verseNumber;

        return (
          <div
            key={v.verseNumber}
            className='relative flex w-full items-start'
            onClick={e => e.stopPropagation()}
          >
            <span className='mt-0.5 mr-3 w-4 text-right text-base font-bold text-slate-900 select-none'>
              {v.verseNumber}
            </span>
            <div className='flex min-h-[24px] flex-1 items-center'>
              {readOnly ? (
                <p className='w-full text-base leading-relaxed text-slate-800 select-text'>
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
                  placeholder={t('typeHere', 'Type here...')}
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
            </div>

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
  textareaRefs,
  verseRefs,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
  handleNextClick,
}) => {
  const { t } = useTranslation();

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
              <h4 className='text-base font-bold text-slate-800 select-none'>
                {projectItem.book} {heading}
              </h4>
              <div
                className={`focus-visible:ring-primary w-full cursor-pointer rounded-[12px] border-2 bg-[#f0f4f9] p-5 shadow-xs transition-all focus:outline-hidden focus-visible:ring-2 ${
                  isGroupActive ? 'border-primary' : 'border-[#cfd8e3]'
                }`}
                role='button'
                tabIndex={0}
                onClick={() => void handleActiveVerseChange(groupVerses[0].verseNumber)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleActiveVerseChange(groupVerses[0].verseNumber);
                  }
                }}
              >
                <p className='text-base leading-relaxed text-slate-800 select-text'>
                  {groupVerses.map(v => {
                    const textToRender =
                      selectedPanel === 1
                        ? v.text
                        : (bibleVerseMap.get(v.verseNumber) ??
                          t('noContentAvailable', 'No content available'));
                    return (
                      <React.Fragment key={v.verseNumber}>
                        <span className='mr-1.5 font-bold text-slate-900'>{v.verseNumber}</span>
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
              <h4 className='text-base font-bold text-slate-800 select-none'>
                {projectItem.book} {heading}
              </h4>
              <div
                className={`w-full cursor-pointer space-y-1 rounded-[12px] border-2 bg-[#f0f4f9] p-5 transition-all ${
                  isGroupActive ? 'border-primary' : 'border-[#cfd8e3]'
                }`}
                onClick={e => {
                  if (e.target === e.currentTarget) {
                    void handleActiveVerseChange(groupVerses[0].verseNumber);
                  }
                }}
              >
                <TargetVersesGroup
                  activeVerseId={activeVerseId}
                  globalNextUntouchedVerse={globalNextUntouchedVerse}
                  groupVerses={groupVerses}
                  handleActiveVerseChange={handleActiveVerseChange}
                  handleKeyDown={handleKeyDown}
                  handleNextClick={handleNextClick}
                  handleTextChange={handleTextChange}
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
