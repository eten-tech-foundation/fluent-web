import React from 'react';

import { useTranslation } from 'react-i18next';

import type { SuggestionStatus } from '@/features/bible/hooks/useAiSuggestions';
import {
  type SourceTtsPlaybackApi,
  TTS_CONTROL_ROW_CLASS,
  type TtsServedFormat,
  ttsServingWashClass,
  TtsVerseControls,
} from '@/features/tts';
import { type Source, type TargetVerse } from '@/lib/types';

/**
 * Source-TTS wiring for the grid (source-tts §5.1). The drafting page owns the
 * playback state and the panel-aware text selection; this component only
 * renders per-row controls and marks the row that is speaking.
 *
 * `verseRefFor` keeps the queue's row identity a host decision (T3) — the grid
 * never invents the ref format.
 */
export interface DraftingGridVerseTts extends Pick<
  SourceTtsPlaybackApi,
  | 'activeVerseRef'
  | 'isBusy'
  | 'isRowPlayable'
  | 'isRowLoading'
  | 'playVerse'
  | 'playFromVerse'
  | 'stop'
> {
  verseRefFor: (verseNumber: number) => string;
  /**
   * Present only while a deployment is being verified — DraftingUI gates this
   * on a force-on override, so the wash is untouched for everyone else. See
   * `ttsServingWashClass`.
   */
  servingFor?: (verseRef: string) => TtsServedFormat | undefined;
}

interface DraftingTargetColumnProps {
  verseNumber: number;
  readOnly: boolean;
  activeVerseId: number;
  verses: TargetVerse[];
  effectiveRevealedVerses: Set<number>;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  handleTextChange: (verseNumber: number, text: string) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isAiActive: boolean;
  suggestionStatus: SuggestionStatus;
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
  aiSuggestions,
  isAiThresholdMet,
  isAiActive,
  suggestionStatus,
}) => {
  const isActive = !readOnly && activeVerseId === verseNumber;
  const currentTargetVerse = verses.find(v => v.verseNumber === verseNumber);
  const shouldShowTarget = readOnly || isActive || effectiveRevealedVerses.has(verseNumber);
  const { t } = useTranslation();

  const isAiActiveNoSuggestion =
    isActive &&
    isAiActive &&
    isAiThresholdMet &&
    !aiSuggestions[verseNumber] &&
    !currentTargetVerse?.content.trim();

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
            placeholder={
              isAiActiveNoSuggestion && suggestionStatus === 'generating'
                ? t('generatingAiSuggestion', 'Generating...')
                : t('enterTranslation', 'Enter translation...')
            }
            spellCheck={true}
            value={currentTargetVerse?.content ?? ''}
            onChange={e => handleTextChange(verseNumber, e.target.value)}
            onFocus={() => handleActiveVerseChange(verseNumber)}
            onKeyDown={handleKeyDown}
          />
          {isAiActiveNoSuggestion &&
            (() => {
              switch (suggestionStatus) {
                case 'error':
                  return (
                    <p className='text-destructive pb-1 text-sm font-medium'>
                      {t('aiTranslationNotAvailable', 'AI translation not available.')}
                    </p>
                  );
                case 'unavailable':
                  return (
                    <p className='text-destructive pb-1 text-sm font-medium'>
                      {t(
                        'aiTranslationNotYetReady',
                        'AI translation not yet ready. Please refresh the page to view the AI translation.'
                      )}
                    </p>
                  );
                default:
                  return null;
              }
            })()}
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
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isAiActive: boolean;
  suggestionStatus: SuggestionStatus;
  /** Absent when the source-TTS feature is off — the grid renders as before. */
  tts?: DraftingGridVerseTts;
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
  aiSuggestions,
  isAiThresholdMet,
  isAiActive,
  suggestionStatus,
  tts,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {sourceVerses.map(verse => {
        const isActive = !readOnly && activeVerseId === verse.verseNumber;
        const ttsVerseRef = tts?.verseRefFor(verse.verseNumber);
        const isSpeaking = tts !== undefined && ttsVerseRef === tts.activeVerseRef;
        // Only the row being read has an answer worth showing.
        const ttsServed =
          isSpeaking && ttsVerseRef !== undefined ? tts?.servingFor?.(ttsVerseRef) : undefined;
        return (
          <div
            key={verse.verseNumber}
            ref={el => {
              verseRefs.current[verse.verseNumber] = el;
            }}
            // The playback marker is a LEFT RAIL plus a wash, chosen so it
            // cannot be confused with the two highlights already on this page:
            // the active editor's `border-primary` box (target column) and the
            // repeated-word check's inline red text. The transparent rail on
            // every other row keeps the grid from shifting as playback moves.
            className={`grid items-start border-l-4 py-4 ${
              isSpeaking
                ? (ttsServingWashClass(ttsServed) ?? 'border-l-primary bg-primary/5')
                : 'border-l-transparent'
            }`}
            data-testid={isSpeaking ? 'tts-active-row' : undefined}
            data-tts-served={isSpeaking ? ttsServed : undefined}
            data-verse-number={verse.verseNumber}
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
                      {t('noContentAvailable')}
                    </p>
                  )}
                </div>
              )}
              {tts !== undefined && ttsVerseRef !== undefined && (
                // Tucked under THIS verse's source box and overlapping the
                // row's own bottom padding — see `TTS_CONTROL_ROW_CLASS` for
                // why the strip costs ~18px here rather than 48px.
                <div className={TTS_CONTROL_ROW_CLASS}>
                  <TtsVerseControls
                    hasPlayableText={tts.isRowPlayable(ttsVerseRef)}
                    isLoading={tts.isRowLoading(ttsVerseRef)}
                    isPlaying={isSpeaking}
                    showStop={tts.isBusy}
                    verseRef={ttsVerseRef}
                    onPlayFromHere={() => tts.playFromVerse(ttsVerseRef)}
                    onPlayVerse={() => tts.playVerse(ttsVerseRef)}
                    onStop={tts.stop}
                  />
                </div>
              )}
            </div>
            <DraftingTargetColumn
              activeVerseId={activeVerseId}
              aiSuggestions={aiSuggestions}
              effectiveRevealedVerses={effectiveRevealedVerses}
              handleActiveVerseChange={handleActiveVerseChange}
              handleKeyDown={handleKeyDown}
              handleTextChange={handleTextChange}
              isAiActive={isAiActive}
              isAiThresholdMet={isAiThresholdMet}
              readOnly={readOnly}
              suggestionStatus={suggestionStatus}
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
