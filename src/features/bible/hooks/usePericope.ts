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
  handleActiveVerseChange: (verseNumber: number) => Promise<void>;
  revealNextVerse: () => Promise<void>;
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
    if (isPericopeMode && currentPericopeGroup && currentPericopeGroup.verses.length > 0) {
      return currentPericopeGroup.verses[0].verseNumber;
    }
    return activeVerseId;
  }, [isPericopeMode, currentPericopeGroup, activeVerseId]);

  const effectiveRevealedVerses = useMemo(() => {
    if (!isPericopeMode) return revealedVerses;
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
      await revealNextVerse();
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
      await handleActiveVerseChange(globalNextUntouchedVerse.verseNumber);
    } else {
      const lastVerseOfGroup = currentPericopeGroup.verses[currentPericopeGroup.verses.length - 1];
      const isAtEndOfGroup = activeVerseId === lastVerseOfGroup.verseNumber;

      if (!isAtEndOfGroup) {
        await handleActiveVerseChange(activeVerseId + 1);
      } else {
        const currentIdx = pericopes.findIndex(
          g => g.pericopeNumber === currentPericopeGroup.pericopeNumber
        );
        if (currentIdx !== -1 && currentIdx < pericopes.length - 1) {
          const nextGroup = pericopes[currentIdx + 1];
          const nextFirstVerse = nextGroup.verses[0];
          await handleActiveVerseChange(nextFirstVerse.verseNumber);
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
  };
};
