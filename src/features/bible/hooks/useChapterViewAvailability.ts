import { useLayoutEffect, useMemo } from 'react';

import { config } from '@/lib/config';
import { type ProjectItem, type Source, type TargetVerse } from '@/lib/types';
import { useAppStore } from '@/store/store';

interface ChapterViewProps {
  projectItem: ProjectItem;
  sourceVerses: Source[];
  verses: TargetVerse[];
}

/** Share the current editor's live content check with the settings dialog. */
export function useChapterViewAvailability({
  projectItem,
  sourceVerses,
  verses,
}: ChapterViewProps): boolean {
  const { chapterAssignmentId, totalVerses } = projectItem;
  const setAvailability = useAppStore(state => state.setChapterViewAvailability);
  const available = useMemo(() => {
    if (
      !config.features.rtePericope ||
      sourceVerses.length === 0 ||
      sourceVerses.length !== totalVerses ||
      new Set(sourceVerses.map(verse => verse.verseNumber)).size !== totalVerses
    ) {
      return false;
    }
    const targets = new Map(verses.map(verse => [verse.verseNumber, verse.content]));
    if (targets.size !== verses.length) return false;
    return sourceVerses.every(source => Boolean(targets.get(source.verseNumber)?.trim()));
  }, [sourceVerses, verses, totalVerses]);

  useLayoutEffect(() => {
    setAvailability({ chapterAssignmentId, available });
    return () => {
      if (
        useAppStore.getState().chapterViewAvailability?.chapterAssignmentId === chapterAssignmentId
      ) {
        setAvailability(null);
      }
    };
  }, [available, chapterAssignmentId, setAvailability]);

  return available;
}
