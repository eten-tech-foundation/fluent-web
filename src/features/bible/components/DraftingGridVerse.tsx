import React from 'react';

import { useTranslation } from 'react-i18next';

import { type Source, type TargetVerse } from '@/lib/types';

interface DraftingTargetColumnProps {
  verseNumber: number;
  readOnly: boolean;
  activeVerseId: number;
  verses: TargetVerse[];
  effectiveRevealedVerses: Set<number>;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  handleTextChange: (verseNumber: number, text: string) => void;
  handleActiveVerseChange: (verseNumber: number) => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export const DraftingTargetColumn: React.FC<DraftingTargetColumnProps> = ({
  verseNumber,
  readOnly,
  activeVerseId,
  verses,
  effectiveRevealedVerses,
  textareaRefs,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
}) => {
  const isActive = !readOnly && activeVerseId === verseNumber;
  const currentTargetVerse = verses.find(v => v.verseNumber === verseNumber);
  const shouldShowTarget = readOnly || isActive || effectiveRevealedVerses.has(verseNumber);

  return (
    <div className={`px-6 ${shouldShowTarget ? 'flex' : 'hidden'}`}>
      {readOnly ? (
        <div className='bg-card flex-1 rounded-lg border-2 px-4 py-3 shadow-sm'>
          <p className='min-h-12 leading-snug'>{currentTargetVerse?.content ?? ''}</p>
        </div>
      ) : (
        <div
          className={`flex-1 rounded-lg border-2 px-4 py-1 shadow-sm transition-all ${
            isActive ? 'border-primary' : ''
          } ${currentTargetVerse?.content.trim() !== '' && !isActive ? 'bg-card' : ''}`}
          onClick={() => handleActiveVerseChange(verseNumber)}
        >
          <textarea
            ref={el => {
              textareaRefs.current[verseNumber] = el;
            }}
            aria-label={`Translation for verse ${verseNumber}`}
            autoCapitalize='sentences'
            autoCorrect='on'
            className='w-full resize-none border-none bg-transparent text-base leading-snug outline-none'
            placeholder='Enter translation...'
            spellCheck={true}
            value={currentTargetVerse?.content ?? ''}
            onChange={e => handleTextChange(verseNumber, e.target.value)}
            onFocus={() => handleActiveVerseChange(verseNumber)}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}
    </div>
  );
};

interface DraftingGridVerseProps {
  sourceVerses: Source[];
  verses: TargetVerse[];
  activeVerseId: number;
  readOnly: boolean;
  selectedPanel: 1 | 2;
  bibleVerseMap: Map<number, string>;
  effectiveRevealedVerses: Set<number>;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  verseRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  getPericopeStyle: (verseNumber: number, isActive: boolean, baseClass: string) => string;
  handleTextChange: (verseNumber: number, text: string) => void;
  handleActiveVerseChange: (verseNumber: number) => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export const DraftingGridVerse: React.FC<DraftingGridVerseProps> = ({
  sourceVerses,
  verses,
  activeVerseId,
  readOnly,
  selectedPanel,
  bibleVerseMap,
  effectiveRevealedVerses,
  textareaRefs,
  verseRefs,
  getPericopeStyle,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {sourceVerses.map(verse => {
        const isActive = !readOnly && activeVerseId === verse.verseNumber;
        return (
          <div
            key={verse.verseNumber}
            ref={el => {
              verseRefs.current[verse.verseNumber] = el;
            }}
            className='grid items-start py-4'
            style={{ gridTemplateColumns: '2rem 1fr 1fr' }}
          >
            <div className='flex w-8 items-start px-4'>
              <span className='text-lg font-medium'>{verse.verseNumber}</span>
            </div>
            <div className='flex flex-col px-6'>
              {selectedPanel === 1 ? (
                <div className={getPericopeStyle(verse.verseNumber, isActive, 'bg-card')}>
                  <p className='min-h-12 leading-relaxed'>{verse.text}</p>
                </div>
              ) : (
                <div className={getPericopeStyle(verse.verseNumber, false, 'bg-muted')}>
                  {bibleVerseMap.has(verse.verseNumber) ? (
                    <p className='min-h-12 leading-relaxed'>
                      {bibleVerseMap.get(verse.verseNumber)}
                    </p>
                  ) : (
                    <p className='text-muted-foreground min-h-12 leading-relaxed'>
                      {t('noContentAvailable', 'No content available')}
                    </p>
                  )}
                </div>
              )}
            </div>
            <DraftingTargetColumn
              activeVerseId={activeVerseId}
              effectiveRevealedVerses={effectiveRevealedVerses}
              handleActiveVerseChange={handleActiveVerseChange}
              handleKeyDown={handleKeyDown}
              handleTextChange={handleTextChange}
              readOnly={readOnly}
              textareaRefs={textareaRefs}
              verseNumber={verse.verseNumber}
              verses={verses}
            />
          </div>
        );
      })}
    </>
  );
};
