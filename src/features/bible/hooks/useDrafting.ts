import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useBibleTextDebounce } from '@/features/bible/hooks/useBibleTextDebounce';
import { type Source, type TargetVerse } from '@/lib/types';

interface UseDraftingProps {
  sourceVerses: Source[];
  targetVerses: TargetVerse[];
  readOnly: boolean;
  onSave: (verse: number, text: string) => Promise<void>;
}

export const useDrafting = ({ sourceVerses, targetVerses, readOnly, onSave }: UseDraftingProps) => {
  const [verses, setVerses] = useState<TargetVerse[]>(targetVerses);
  const [activeVerseId, setActiveVerseId] = useState(1);
  const [previousActiveVerseId, setPreviousActiveVerseId] = useState<number | null>(null);
  const [revealedVerses, setRevealedVerses] = useState<Set<number>>(new Set());
  const [buttonTop, setButtonTop] = useState<number>(0);

  const targetScrollRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const verseRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const { debouncedSave, saveImmediately, getSaveStatus, setInitialContent } = useBibleTextDebounce(
    {
      onSave,
      debounceMs: 2000,
      retryDelayMs: 10000,
    }
  );

  const lastRevealedVerseNumber = useMemo(
    () => (revealedVerses.size > 0 ? Math.max(...Array.from(revealedVerses)) : 1),
    [revealedVerses]
  );

  const lastRevealedVerse = useMemo(
    () => verses.find(v => v.verseNumber === lastRevealedVerseNumber),
    [verses, lastRevealedVerseNumber]
  );

  const lastRevealedVerseHasContent = useMemo(
    () => Boolean(lastRevealedVerse?.content.trim()),
    [lastRevealedVerse]
  );

  const autoResizeTextarea = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(20, textarea.scrollHeight) + 'px';
  }, []);

  const updateButtonPosition = useCallback(() => {
    if (readOnly) return;
    const container = targetScrollRef.current;
    if (!container) return;
    const lastRevealedVerseDiv = verseRefs.current[lastRevealedVerseNumber];
    if (!lastRevealedVerseDiv) return;
    const containerRect = container.getBoundingClientRect();
    const verseRect = lastRevealedVerseDiv.getBoundingClientRect();
    const top = container.scrollTop + (verseRect.bottom - containerRect.top);
    setButtonTop(top);
  }, [lastRevealedVerseNumber, readOnly]);

  const scrollVerseToTop = useCallback((verseNumber: number) => {
    const container = targetScrollRef.current;
    const row = verseRefs.current[verseNumber];
    if (!container || !row) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const newScrollTop = container.scrollTop + (rowRect.top - containerRect.top);
    container.scrollTo({ top: newScrollTop, behavior: 'smooth' });
  }, []);

  const handleTextChange = useCallback(
    (verseId: number, text: string) => {
      if (readOnly) return;
      setVerses(currentVerses =>
        currentVerses.map(verse =>
          verse.verseNumber === verseId ? { ...verse, content: text } : verse
        )
      );
      debouncedSave(verseId, text);
      const textarea = textareaRefs.current[verseId];
      if (textarea) autoResizeTextarea(textarea);
      updateButtonPosition();
    },
    [readOnly, debouncedSave, autoResizeTextarea, updateButtonPosition]
  );

  const handleActiveVerseChange = useCallback(
    async (newVerseId: number) => {
      if (readOnly) return;
      if (previousActiveVerseId !== null && previousActiveVerseId !== newVerseId) {
        const previousVerse = verses.find(v => v.verseNumber === previousActiveVerseId);
        if (previousVerse) {
          const status = getSaveStatus(previousActiveVerseId);
          if (status.hasUnsavedChanges) {
            await saveImmediately(previousActiveVerseId, previousVerse.content);
          }
        }
      }
      setPreviousActiveVerseId(activeVerseId);
      setActiveVerseId(newVerseId);
      const prevId = Math.max(1, newVerseId - 1);
      requestAnimationFrame(() => scrollVerseToTop(prevId));
    },
    [
      readOnly,
      previousActiveVerseId,
      verses,
      activeVerseId,
      getSaveStatus,
      saveImmediately,
      scrollVerseToTop,
    ]
  );

  const advanceToVerse = useCallback(
    async (nextVerseId: number, verseToSave?: { verseNumber: number; content: string }) => {
      if (readOnly || nextVerseId > sourceVerses.length) return;
      const nextVerseExists = verses.find(v => v.verseNumber === nextVerseId);
      if (!nextVerseExists) {
        setVerses(prev => [...prev, { verseNumber: nextVerseId, content: '' }]);
        setInitialContent(nextVerseId, '');
      }
      if (verseToSave) {
        const status = getSaveStatus(verseToSave.verseNumber);
        if (status.hasUnsavedChanges) {
          await saveImmediately(verseToSave.verseNumber, verseToSave.content);
        }
      }
      setPreviousActiveVerseId(activeVerseId);
      setActiveVerseId(nextVerseId);
      const prevId = Math.max(1, nextVerseId - 1);
      requestAnimationFrame(() => scrollVerseToTop(prevId));
    },
    [
      activeVerseId,
      verses,
      sourceVerses.length,
      saveImmediately,
      setInitialContent,
      getSaveStatus,
      scrollVerseToTop,
      readOnly,
    ]
  );

  const moveToNextVerse = useCallback(async () => {
    if (readOnly) return;
    const currentVerse = verses.find(v => v.verseNumber === activeVerseId);
    if (!currentVerse || currentVerse.content.trim() === '') return;
    await advanceToVerse(activeVerseId + 1, currentVerse);
  }, [activeVerseId, verses, advanceToVerse, readOnly]);

  const revealNextVerse = useCallback(async () => {
    if (readOnly || !lastRevealedVerseHasContent || !lastRevealedVerse) return;
    await advanceToVerse(lastRevealedVerseNumber + 1, lastRevealedVerse);
  }, [
    lastRevealedVerseNumber,
    lastRevealedVerseHasContent,
    lastRevealedVerse,
    advanceToVerse,
    readOnly,
  ]);

  // Initialize verses and revealed state
  useEffect(() => {
    if (targetVerses.length === 0) return;
    if (!readOnly) {
      targetVerses.forEach(verse => setInitialContent(verse.verseNumber, verse.content));
    }
    const lastVerseWithContent = (() => {
      for (let i = targetVerses.length - 1; i >= 0; i--) {
        if (targetVerses[i].content.trim() !== '') return targetVerses[i];
      }
      return targetVerses[0];
    })();
    const allVersesCompleted = sourceVerses.every(sourceVerse => {
      const targetVerse = targetVerses.find(tv => tv.verseNumber === sourceVerse.verseNumber);
      return targetVerse && targetVerse.content.trim() !== '';
    });
    const activeVerseNumber = allVersesCompleted ? 1 : lastVerseWithContent.verseNumber;
    setActiveVerseId(activeVerseNumber);
    if (!allVersesCompleted && activeVerseNumber > 1 && !readOnly) {
      const verseDiv = verseRefs.current[activeVerseNumber];
      if (verseDiv) verseDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const initiallyRevealed = new Set<number>();
    if (readOnly) {
      sourceVerses.forEach(v => initiallyRevealed.add(v.verseNumber));
    } else {
      targetVerses
        .filter(v => v.verseNumber <= lastVerseWithContent.verseNumber)
        .forEach(v => initiallyRevealed.add(v.verseNumber));
      initiallyRevealed.add(activeVerseNumber);
    }
    setRevealedVerses(initiallyRevealed);
  }, [targetVerses, sourceVerses, setInitialContent, readOnly]);

  useEffect(() => {
    if (!readOnly) {
      setRevealedVerses(prev => {
        if (prev.has(activeVerseId)) return prev;
        const next = new Set(prev);
        next.add(activeVerseId);
        return next;
      });
    }
  }, [activeVerseId, readOnly]);

  useEffect(() => {
    if (!readOnly) {
      revealedVerses.forEach(verseNumber => {
        const textarea = textareaRefs.current[verseNumber];
        if (textarea) autoResizeTextarea(textarea);
      });
    }
  }, [revealedVerses, readOnly, autoResizeTextarea]);

  useEffect(() => {
    if (verses.length === 0) {
      setVerses([{ verseNumber: 1, content: '' }]);
    } else if (!readOnly) {
      verses.forEach(verse => {
        const textarea = textareaRefs.current[verse.verseNumber];
        if (textarea && verse.content) autoResizeTextarea(textarea);
      });
    }
  }, [verses, readOnly, autoResizeTextarea]);

  useLayoutEffect(() => {
    if (readOnly) return;
    const textarea = textareaRefs.current[activeVerseId];
    if (textarea) {
      if (document.activeElement !== textarea) {
        textarea.focus();
        const len = textarea.value.length;
        try {
          textarea.setSelectionRange(len, len);
        } catch {}
      }
      autoResizeTextarea(textarea);
    }
    updateButtonPosition();
  }, [activeVerseId, revealedVerses, updateButtonPosition, readOnly, autoResizeTextarea]);

  return {
    verses,
    activeVerseId,
    revealedVerses,
    buttonTop,
    lastRevealedVerseHasContent,
    targetScrollRef,
    textareaRefs,
    verseRefs,
    getSaveStatus,
    saveImmediately,
    handleTextChange,
    handleActiveVerseChange,
    moveToNextVerse,
    revealNextVerse,
    updateButtonPosition,
  };
};
