import React, { useCallback, useMemo } from 'react';

import { ChapterEditor } from '@/features/rte/components/ChapterEditor';
import type { PericopeVerseText } from '@/features/rte/lib/pericope-usj';
import { type ProjectItem, type Source, type TargetVerse } from '@/lib/types';

interface DraftingChapterViewProps {
  sourceVerses: Source[];
  verses: TargetVerse[];
  projectItem: ProjectItem;
  readOnly: boolean;
  bibleVerseMap: Map<number, string>;
  selectedPanel: 1 | 2;
  handleTextChange: (
    verseNumber: number,
    text: string,
    markers?: PericopeVerseText['markers']
  ) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
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
  handleTextChange,
  handleActiveVerseChange,
}) => {
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
    <div className='grid h-full min-h-0 w-full' style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className='min-h-0 overflow-y-auto px-6 py-4' style={{ scrollbarGutter: 'stable' }}>
        <h4 className='mb-3 text-2xl font-bold text-slate-800 dark:text-slate-100'>
          {projectItem.chapterNumber}
        </h4>
        <p className='text-base leading-relaxed text-slate-800 select-text dark:text-slate-200'>
          {sourceVerses.map(verse => (
            <React.Fragment key={verse.verseNumber}>
              <span className='mr-1.5 font-bold text-slate-900 dark:text-slate-100'>
                {verse.verseNumber}
              </span>
              <span className='mr-3'>
                {selectedPanel === 1 ? verse.text : (bibleVerseMap.get(verse.verseNumber) ?? '')}
              </span>
            </React.Fragment>
          ))}
        </p>
      </div>

      <div className='border-border min-h-0 border-l' style={{ scrollbarGutter: 'stable' }}>
        <ChapterEditor
          bookCode={projectItem.bookCode}
          chapterNumber={projectItem.chapterNumber}
          contentKey={contentKey}
          readOnly={readOnly}
          verses={editorVerses}
          onActiveVerseChange={handleActiveVerseChange}
          onVersesChange={handleVersesChange}
        />
      </div>
    </div>
  );
};
