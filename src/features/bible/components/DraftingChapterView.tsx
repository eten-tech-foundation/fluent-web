import React, { useCallback, useEffect, useMemo } from 'react';

import { Loader2 } from 'lucide-react';

import { ChapterEditor } from '@/features/rte/components/ChapterEditor';
import type { PericopeVerseText } from '@/features/rte/lib/pericope-usj';
import {
  PericopePlayer,
  type PericopePlayerProps,
} from '@/features/tts/components/TtsGroupControls';
import { type ProjectItem, type Source, type TargetVerse } from '@/lib/types';

import { BibleTabList, type ResourceBibleTab } from './BibleTabList';
import { PericopeText } from './PericopeText';

interface DraftingChapterViewProps {
  sourceVerses: Source[];
  verses: TargetVerse[];
  projectItem: ProjectItem;
  readOnly: boolean;
  bibleVerseMap: Map<number, string>;
  selectedPanel: 1 | 2;
  activeBibleTabId: string;
  resourceBibleTabs: ResourceBibleTab[];
  bibleContentLoading: boolean;
  bibleContentError: boolean;
  onBibleTabSelect: (tabId: string) => void;
  onBibleTabClose: (tabId: string) => void;
  handleTextChange: (
    verseNumber: number,
    text: string,
    markers?: PericopeVerseText['markers']
  ) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  chapterVerseRefs?: readonly string[];
  playback?: PericopePlayerProps['playback'];
  activeAudioVerseRef?: string | null;
  sourceVerseRefs?: React.RefObject<Record<number, HTMLElement | null>>;
  sourceViewportRef?: React.Ref<HTMLDivElement>;
  onPlayerMounted?: (mounted: boolean) => void;
}

/**
 * Chapter view (#397): source and target as two continuous documents, side by side.
 *
 * The other two views put source and target in paired rows inside a single scroll container, which
 * is what keeps them level as you scroll. A chapter has no rows to pair, and a translation runs
 * longer or shorter than its source, so that container would only *look* synchronised while the
 * passages drifted apart. Each pane therefore owns its scrollbar, which is also what the ticket
 * asks for.
 */
export const DraftingChapterView: React.FC<DraftingChapterViewProps> = ({
  sourceVerses,
  verses,
  projectItem,
  readOnly,
  bibleVerseMap,
  selectedPanel,
  activeBibleTabId,
  resourceBibleTabs,
  bibleContentLoading,
  bibleContentError,
  onBibleTabSelect,
  onBibleTabClose,
  handleTextChange,
  handleActiveVerseChange,
  chapterVerseRefs,
  playback,
  activeAudioVerseRef,
  sourceVerseRefs,
  sourceViewportRef,
  onPlayerMounted,
}) => {
  const hasPlayer = Boolean(playback && chapterVerseRefs);
  useEffect(() => {
    if (!hasPlayer) return;
    onPlayerMounted?.(true);
    return () => onPlayerMounted?.(false);
  }, [hasPlayer, onPlayerMounted]);

  const hasBibleContent = [...bibleVerseMap.values()].some(text => text.trim());

  const editorVerses = useMemo<PericopeVerseText[]>(
    () =>
      sourceVerses.map(source => {
        const target = verses.find(v => v.verseNumber === source.verseNumber);
        return {
          verseNumber: source.verseNumber,
          text: target?.content ?? '',
          markers: target?.markers ?? null,
        };
      }),
    [sourceVerses, verses]
  );

  const contentKey = useMemo(
    () => `${projectItem.chapterAssignmentId}/${projectItem.chapterNumber}`,
    [projectItem.chapterAssignmentId, projectItem.chapterNumber]
  );

  const handleVersesChange = useCallback(
    (changed: PericopeVerseText[]) => {
      changed.forEach(verse => handleTextChange(verse.verseNumber, verse.text, verse.markers));
    },
    [handleTextChange]
  );

  return (
    <div
      className='grid h-full min-h-0 w-full'
      style={{
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gridTemplateRows: hasPlayer ? 'auto auto 1fr' : 'auto 1fr',
      }}
    >
      <div className='bg-background min-w-0 px-6 py-3'>
        <BibleTabList
          activeTabId={activeBibleTabId}
          resourceTabs={resourceBibleTabs}
          sourceLabel={projectItem.bibleName}
          onClose={onBibleTabClose}
          onSelect={onBibleTabSelect}
        />
      </div>

      {playback && chapterVerseRefs && (
        <div className='bg-background z-10 col-start-1 row-start-2 flex min-w-0 items-center border-b px-6 py-2'>
          <PericopePlayer
            groupLabel={String(projectItem.chapterNumber)}
            kind='chapter'
            playback={playback}
            verseRefs={chapterVerseRefs}
          />
        </div>
      )}

      <div
        ref={sourceViewportRef}
        className='min-h-0 overflow-y-auto px-6 py-4'
        data-testid='chapter-source-viewport'
        style={{ scrollbarGutter: 'stable' }}
      >
        {selectedPanel === 2 && !hasBibleContent && bibleContentLoading ? (
          <div className='flex h-full items-center justify-center'>
            <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
          </div>
        ) : selectedPanel === 2 && !hasBibleContent ? (
          <div className='flex h-full items-start justify-center pt-10'>
            <PericopeText className='px-6 text-center' isError={bibleContentError} />
          </div>
        ) : (
          <>
            <h4 className='mb-3 text-2xl font-bold text-slate-800 dark:text-slate-100'>
              {projectItem.chapterNumber}
            </h4>
            <p className='text-base leading-relaxed text-slate-800 select-text dark:text-slate-200'>
              {sourceVerses.map(verse => (
                <span
                  key={verse.verseNumber}
                  ref={element => {
                    if (sourceVerseRefs?.current)
                      sourceVerseRefs.current[verse.verseNumber] = element;
                  }}
                  className={
                    activeAudioVerseRef === String(verse.verseNumber)
                      ? 'bg-primary/10 rounded-sm'
                      : undefined
                  }
                  data-testid={
                    activeAudioVerseRef === String(verse.verseNumber)
                      ? 'tts-active-chapter-verse'
                      : undefined
                  }
                >
                  <span className='mr-1.5 font-bold text-slate-900 dark:text-slate-100'>
                    {verse.verseNumber}
                  </span>
                  <span className='mr-3'>
                    {selectedPanel === 1
                      ? verse.text
                      : (bibleVerseMap.get(verse.verseNumber) ?? '')}
                  </span>
                </span>
              ))}
            </p>
          </>
        )}
      </div>

      <div
        className={`border-border col-start-2 row-start-1 min-h-0 min-w-0 border-l ${hasPlayer ? 'row-span-3' : 'row-span-2'}`}
        style={{ scrollbarGutter: 'stable' }}
      >
        <ChapterEditor
          bookCode={projectItem.bookCode}
          chapterNumber={projectItem.chapterNumber}
          contentKey={contentKey}
          readOnly={readOnly}
          targetLanguage={projectItem.targetLanguage}
          verses={editorVerses}
          onActiveVerseChange={handleActiveVerseChange}
          onVersesChange={handleVersesChange}
        />
      </div>
    </div>
  );
};
