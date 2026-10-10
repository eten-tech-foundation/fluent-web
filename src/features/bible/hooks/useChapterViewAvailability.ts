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
    const current = chapterViewAvailabilityFor(useAppStore.getState(), chapterAssignmentId);
    const missing = current?.missingVerseNumbers;
    const nextMissing = availability.missingVerseNumbers;
    const sameMissing =
      missing === nextMissing ||
      (Array.isArray(missing) &&
        Array.isArray(nextMissing) &&
        missing.length === nextMissing.length &&
        missing.every((number, index) => number === nextMissing[index]));
    if (
      current?.available === availability.available &&
      current.expectedVerseCount === availability.expectedVerseCount &&
      sameMissing
    )
      return;

    setAvailability({ chapterAssignmentId, ...availability });
  }, [availability, chapterAssignmentId, setAvailability]);

  // Editing a verse must not briefly clear the shared snapshot. Store subscribers can render
  // synchronously during IME input; clearing and republishing on each render creates a loop.
  useLayoutEffect(() => {
    return () => {
      if (chapterViewAvailabilityFor(useAppStore.getState(), chapterAssignmentId)) {
        setAvailability(null);
      }
    };
  }, [chapterAssignmentId, setAvailability]);

  return availability.available;
}
