import { useLayoutEffect, useMemo } from 'react';

import { config } from '@/lib/config';
import { type ProjectItem, type Source, type TargetVerse } from '@/lib/types';
import { chapterViewAvailabilityFor, useAppStore } from '@/store/store';

interface UseChapterViewAvailabilityProps {
  projectItem: ProjectItem;
  sourceVerses: Source[];
  verses: TargetVerse[];
}

/** Share the current editor's live content check with the settings dialog. */
export function useChapterViewAvailability({
  projectItem,
  sourceVerses,
  verses,
}: UseChapterViewAvailabilityProps): boolean {
  const { chapterAssignmentId, totalVerses } = projectItem;
  const setAvailability = useAppStore(state => state.setChapterViewAvailability);
  const availability = useMemo(() => {
    if (
      sourceVerses.length === 0 ||
      sourceVerses.length !== totalVerses ||
      new Set(sourceVerses.map(verse => verse.verseNumber)).size !== totalVerses
    ) {
      return { available: false, expectedVerseCount: totalVerses, missingVerseNumbers: null };
    }
    const targets = new Map(verses.map(verse => [verse.verseNumber, verse.content]));
    if (targets.size !== verses.length) {
      return { available: false, expectedVerseCount: totalVerses, missingVerseNumbers: null };
    }
    const missingVerseNumbers = sourceVerses
      .filter(source => !targets.get(source.verseNumber)?.trim())
      .map(source => source.verseNumber)
      .sort((a, b) => a - b);
    return {
      available: config.features.rtePericope && missingVerseNumbers.length === 0,
      expectedVerseCount: totalVerses,
      missingVerseNumbers,
    };
  }, [sourceVerses, verses, totalVerses]);

  useLayoutEffect(() => {
    setAvailability({ chapterAssignmentId, ...availability });
    return () => {
      if (chapterViewAvailabilityFor(useAppStore.getState(), chapterAssignmentId)) {
        setAvailability(null);
      }
    };
  }, [availability, chapterAssignmentId, setAvailability]);

  return availability.available;
}
