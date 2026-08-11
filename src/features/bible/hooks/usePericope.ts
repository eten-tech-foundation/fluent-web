import { useCallback, useMemo } from 'react';

import { useChapterPericopes } from '@/features/pericopes/hooks/useChapterPericopes';
import { type ProjectItem, type Source, type TargetVerse } from '@/lib/types';

interface UsePericopeProps {
  projectItem: ProjectItem;
  sourceVerses: Source[];
  verses: TargetVerse[];
  activeVerseId: number;
  revealedVerses: Set<number>;
  lastRevealedVerseHasContent: boolean;
  displayMode: string;
  getSaveStatus: (verseNumber: number) => { hasUnsavedChanges: boolean };
  saveImmediately: (verseNumber: number, content: string) => Promise<void>;
  handleActiveVerseChange: (verseNumber: number) => void;
  revealNextVerse: () => void;
}

export const usePericope = ({
  projectItem,
  sourceVerses,
  verses,
  activeVerseId,
  revealedVerses,
  lastRevealedVerseHasContent,
  displayMode,
  getSaveStatus,
  saveImmediately,
  handleActiveVerseChange,
  revealNextVerse,
}: UsePericopeProps) => {
  const { data: pericopes, isLoading: isPericopeLoading } = useChapterPericopes(
    projectItem.projectId,
    projectItem.bookCode,
    projectItem.chapterNumber
  );

  const pericopeMap = useMemo(() => {
    const map = new Map<number, { title: string | null; number: string; isFirst: boolean }>();
    if (!pericopes || pericopes.length === 0) return map;
    for (const group of pericopes) {
      group.verses.forEach((v, idx) => {
        map.set(v.verseNumber, {
          title: group.pericopeTitle,
          number: group.pericopeNumber,
          isFirst: idx === 0,
        });
      });
    }
    return map;
  }, [pericopes]);

  const isPericopeMode = displayMode === 'pericope' && !!pericopes && pericopes.length > 0;

  const getPericopeStyle = useCallback(
    (verseNumber: number, isActive: boolean, baseClass: string) => {
      const activeClass = isActive ? 'border-primary z-10 relative' : 'border-border';
      if (!isPericopeMode || !pericopeMap.has(verseNumber)) {
        return `${baseClass} rounded-lg border-2 px-4 py-1 shadow-sm transition-all ${activeClass}`;
      }
      const info = pericopeMap.get(verseNumber);
      if (!info) {
        return `${baseClass} rounded-lg border-2 px-4 py-1 shadow-sm transition-all ${activeClass}`;
      }
      const group = pericopes.find(g => g.pericopeNumber === info.number);
      if (!group || group.verses.length <= 1) {
        return `${baseClass} rounded-lg border-2 px-4 py-1 shadow-sm transition-all ${activeClass}`;
      }
      const idx = group.verses.findIndex(v => v.verseNumber === verseNumber);
      if (idx === 0) {
        return `${baseClass} rounded-t-lg border-2 border-b-0 px-4 py-1 shadow-sm transition-all ${activeClass}`;
      }
      if (idx === group.verses.length - 1) {
        return `${baseClass} rounded-b-lg border-2 px-4 py-1 shadow-sm transition-all ${activeClass}`;
      }
      return `${baseClass} rounded-none border-2 border-b-0 px-4 py-1 shadow-sm transition-all ${activeClass}`;
    },
    [isPericopeMode, pericopeMap, pericopes]
  );

  const currentPericopeGroup = useMemo(() => {
    if (!isPericopeMode) return null;
    return (
      pericopes.find(group => group.verses.some(gv => gv.verseNumber === activeVerseId)) ?? null
    );
  }, [isPericopeMode, pericopes, activeVerseId]);

  const globalNextUntouchedVerse = useMemo(() => {
    if (!isPericopeMode) return null;
    return (
      sourceVerses.find(sv => {
        if (sv.verseNumber <= activeVerseId) return false;
        const target = verses.find(tv => tv.verseNumber === sv.verseNumber);
        return !target?.content.trim();
      }) ?? null
    );
  }, [isPericopeMode, sourceVerses, activeVerseId, verses]);

  const resourceVerseId = useMemo(() => {
    return activeVerseId;
  }, [activeVerseId]);

  const effectiveRevealedVerses = useMemo(() => {
    if (!isPericopeMode) {
      if (revealedVerses.size === 0) return revealedVerses;
      const maxRevealed = Math.max(...Array.from(revealedVerses));
      const nextSet = new Set<number>();
      for (let i = 1; i <= maxRevealed; i++) {
        nextSet.add(i);
      }
      return nextSet;
    }
    const nextSet = new Set(revealedVerses);
    for (const group of pericopes) {
      const hasAny = group.verses.some(v => revealedVerses.has(v.verseNumber));
      if (hasAny) {
        group.verses.forEach(v => nextSet.add(v.verseNumber));
      }
    }
    return nextSet;
  }, [isPericopeMode, pericopes, revealedVerses]);

  const isNextButtonEnabled = useMemo(() => {
    if (!isPericopeMode) return lastRevealedVerseHasContent;
    if (!currentPericopeGroup) return false;
    return currentPericopeGroup.verses.every(v => {
      const target = verses.find(tv => tv.verseNumber === v.verseNumber);
      return Boolean(target?.content.trim());
    });
  }, [isPericopeMode, currentPericopeGroup, lastRevealedVerseHasContent, verses]);

  const handleNextClick = useCallback(async () => {
    if (!isPericopeMode) {
      revealNextVerse();
      return;
    }
    if (!currentPericopeGroup) return;

    const currentActiveVerse = verses.find(v => v.verseNumber === activeVerseId);
    if (currentActiveVerse) {
      const status = getSaveStatus(currentActiveVerse.verseNumber);
      if (status.hasUnsavedChanges) {
        await saveImmediately(currentActiveVerse.verseNumber, currentActiveVerse.content);
      }
    }

    if (globalNextUntouchedVerse) {
      handleActiveVerseChange(globalNextUntouchedVerse.verseNumber);
    } else {
      const currentVerseIdx = currentPericopeGroup.verses.findIndex(
        v => v.verseNumber === activeVerseId
      );
      const isAtEndOfGroup = currentVerseIdx === currentPericopeGroup.verses.length - 1;

      if (!isAtEndOfGroup && currentVerseIdx !== -1) {
        const nextVerse = currentPericopeGroup.verses[currentVerseIdx + 1];
        handleActiveVerseChange(nextVerse.verseNumber);
      } else {
        const currentIdx = pericopes.findIndex(
          g => g.pericopeNumber === currentPericopeGroup.pericopeNumber
        );
        if (currentIdx !== -1 && currentIdx < pericopes.length - 1) {
          const nextGroup = pericopes[currentIdx + 1];
          const nextFirstVerse = nextGroup.verses[0];
          handleActiveVerseChange(nextFirstVerse.verseNumber);
        }
      }
    }
  }, [
    isPericopeMode,
    pericopes,
    currentPericopeGroup,
    activeVerseId,
    verses,
    globalNextUntouchedVerse,
    getSaveStatus,
    saveImmediately,
    handleActiveVerseChange,
    revealNextVerse,
  ]);

  /**
   * Advance to the first verse of the next pericope (#314).
   *
   * The rich text surface is one editor per pericope, so drafting moves pericope by pericope
   * rather than verse by verse: there are no verse rows left to step through, and Enter is a
   * paragraph break rather than a way to advance. Unlike `handleNextClick` this never stops at
   * `globalNextUntouchedVerse` — an untouched verse inside the pericope the drafter is leaving is
   * still inside the surface they can see and edit.
   */
  const handleNextPericopeClick = useCallback(async () => {
    if (!isPericopeMode || !currentPericopeGroup) return;

    const currentActiveVerse = verses.find(v => v.verseNumber === activeVerseId);
    if (currentActiveVerse) {
      const status = getSaveStatus(currentActiveVerse.verseNumber);
      if (status.hasUnsavedChanges) {
        await saveImmediately(currentActiveVerse.verseNumber, currentActiveVerse.content);
      }
    }

    const currentIdx = pericopes.findIndex(
      g => g.pericopeNumber === currentPericopeGroup.pericopeNumber
    );
    // The last pericope of the chapter has nowhere to advance to.
    if (currentIdx === -1 || currentIdx >= pericopes.length - 1) return;

    const nextGroup = pericopes[currentIdx + 1];
    if (nextGroup.verses.length === 0) return;

    handleActiveVerseChange(nextGroup.verses[0].verseNumber);
  }, [
    isPericopeMode,
    pericopes,
    currentPericopeGroup,
    activeVerseId,
    verses,
    getSaveStatus,
    saveImmediately,
    handleActiveVerseChange,
  ]);

  return {
    pericopes,
    pericopeMap,
    isPericopeMode,
    isPericopeLoading,
    getPericopeStyle,
    currentPericopeGroup,
    globalNextUntouchedVerse,
    resourceVerseId,
    effectiveRevealedVerses,
    isNextButtonEnabled,
    handleNextClick,
    handleNextPericopeClick,
  };
};
