import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  useBibleTextDebounce,
  type SavePayload,
} from '@/features/bible/hooks/useBibleTextDebounce';
import { type Source, type TargetVerse, type VerseMarkers } from '@/lib/types';

interface UseDraftingProps {
  sourceVerses: Source[];
  targetVerses: TargetVerse[];
  readOnly: boolean;
  onSave: (verse: number, payload: SavePayload) => Promise<void>;
}

export const useDrafting = ({ sourceVerses, targetVerses, readOnly, onSave }: UseDraftingProps) => {
  const [verses, setVerses] = useState<TargetVerse[]>(targetVerses);
  const [activeVerseId, setActiveVerseId] = useState(1);
  const [revealedVerses, setRevealedVerses] = useState<Set<number>>(new Set());
  const [buttonTop, setButtonTop] = useState<number>(0);

  const targetScrollRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const verseRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const initializedRef = useRef(false);
  const pendingInitScrollRef = useRef<number | null>(null);

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
    if (textarea.offsetParent === null) return;
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
    const activeRow = verseRefs.current[verseNumber];
    if (!container || !activeRow) return;

    const containerRect = container.getBoundingClientRect();
    const activeRowRect = activeRow.getBoundingClientRect();
    const activeRowTopRelative = activeRowRect.top - containerRect.top;

    // Always scroll to keep the active verse in a consistent focal point position

    const prevId = Math.max(1, verseNumber - 1);
    const prevRow = verseRefs.current[prevId];

    if (prevRow) {
      const prevRowRect = prevRow.getBoundingClientRect();
      const prevRowTopRelative = prevRowRect.top - containerRect.top;

      const activeRowBottomRelativeToPrevTop = activeRowRect.bottom - prevRowRect.top;
      let newScrollTop = container.scrollTop + prevRowTopRelative;

      if (activeRowBottomRelativeToPrevTop > containerRect.height) {
        newScrollTop = container.scrollTop + activeRowTopRelative;
      }
      container.scrollTo({ top: newScrollTop, behavior: 'smooth' });
    } else {
      const newScrollTop = container.scrollTop + activeRowTopRelative;
      container.scrollTo({ top: newScrollTop, behavior: 'smooth' });
    }
  }, []);

  const handleTextChange = useCallback(
    // `markers` undefined means the caller derived none — the textarea path. It replaces whatever
    // the verse carried, deliberately: keeping stored markers against text edited elsewhere would
    // leave offsets pointing past the new content. The RTE always passes a concrete value.
    (verseId: number, text: string, markers?: VerseMarkers | null) => {
      if (readOnly) return;
      setVerses(currentVerses => {
        const exists = currentVerses.some(v => v.verseNumber === verseId);
        if (!exists) {
          return [...currentVerses, { verseNumber: verseId, content: text, markers }];
        }
        return currentVerses.map(verse =>
          verse.verseNumber === verseId ? { ...verse, content: text, markers } : verse
        );
      });
      // Reveal follows the content, not the cursor. The verse column hides whatever is not
      // revealed, and the pericope editor is one surface over the whole group, so it writes
      // verses that were never the active one — those stayed hidden until a reload (#434).
      // Clearing the text does not take the reveal back; the row is being edited.
      if (text.trim()) {
        setRevealedVerses(prev => (prev.has(verseId) ? prev : new Set(prev).add(verseId)));
      }
      debouncedSave(verseId, { content: text, markers });
      const textarea = textareaRefs.current[verseId];
      if (textarea) autoResizeTextarea(textarea);
      updateButtonPosition();
    },
    [readOnly, debouncedSave, autoResizeTextarea, updateButtonPosition]
  );

  const handleActiveVerseChange = useCallback(
    (newVerseId: number) => {
      if (readOnly) return;
      if (activeVerseId !== newVerseId) {
        const previousVerse = verses.find(v => v.verseNumber === activeVerseId);
        if (previousVerse) {
          const status = getSaveStatus(activeVerseId);
          if (status.hasUnsavedChanges) {
            void saveImmediately(activeVerseId, {
              content: previousVerse.content,
              markers: previousVerse.markers,
            });
          }
        }
      }
      const exists = verses.some(v => v.verseNumber === newVerseId);
      if (!exists) {
        setInitialContent(newVerseId, { content: '' });
        setVerses(prev => [...prev, { verseNumber: newVerseId, content: '' }]);
      }
      setActiveVerseId(newVerseId);
      requestAnimationFrame(() => scrollVerseToTop(newVerseId));
    },
    [
      readOnly,
      verses,
      activeVerseId,
      getSaveStatus,
      saveImmediately,
      setInitialContent,
      scrollVerseToTop,
    ]
  );

  const advanceToVerse = useCallback(
    (
      nextVerseId: number,
      verseToSave?: { verseNumber: number; content: string; markers?: VerseMarkers | null }
    ) => {
      if (readOnly || nextVerseId > sourceVerses.length) return;
      const nextVerseExists = verses.find(v => v.verseNumber === nextVerseId);
      if (!nextVerseExists) {
        setVerses(prev => [...prev, { verseNumber: nextVerseId, content: '' }]);
        setInitialContent(nextVerseId, { content: '' });
      }
      if (verseToSave) {
        const status = getSaveStatus(verseToSave.verseNumber);
        if (status.hasUnsavedChanges) {
          // Flush unsaved changes immediately without blocking navigation.
          // The cursor moves to the next verse right away; the save completes
          // in the background and retries automatically on failure.
          void saveImmediately(verseToSave.verseNumber, {
            content: verseToSave.content,
            markers: verseToSave.markers,
          });
        }
      }
      setActiveVerseId(nextVerseId);
      requestAnimationFrame(() => scrollVerseToTop(nextVerseId));
    },
    [
      verses,
      sourceVerses.length,
      saveImmediately,
      setInitialContent,
      getSaveStatus,
      scrollVerseToTop,
      readOnly,
    ]
  );

  const moveToNextVerse = useCallback(() => {
    if (readOnly) return;
    const currentVerse = verses.find(v => v.verseNumber === activeVerseId);
    if (!currentVerse || currentVerse.content.trim() === '') return;
    advanceToVerse(activeVerseId + 1, currentVerse);
  }, [activeVerseId, verses, advanceToVerse, readOnly]);

  const revealNextVerse = useCallback(() => {
    if (readOnly || !lastRevealedVerseHasContent || !lastRevealedVerse) return;
    advanceToVerse(lastRevealedVerseNumber + 1, lastRevealedVerse);
  }, [
    lastRevealedVerseNumber,
    lastRevealedVerseHasContent,
    lastRevealedVerse,
    advanceToVerse,
    readOnly,
  ]);

  // Initialize verses and revealed state
  useEffect(() => {
    if (targetVerses.length === 0 || initializedRef.current) return;
    initializedRef.current = true;
    if (!readOnly) {
      targetVerses.forEach(verse =>
        setInitialContent(verse.verseNumber, { content: verse.content, markers: verse.markers })
      );
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
    if (!allVersesCompleted && !readOnly) {
      pendingInitScrollRef.current = activeVerseNumber;
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
        if (textarea) autoResizeTextarea(textarea);
      });
    }
  }, [verses, readOnly, autoResizeTextarea]);

  useEffect(() => {
    if (readOnly) return;

    const resizeAll = () => {
      Object.values(textareaRefs.current).forEach(textarea => {
        if (textarea) {
          autoResizeTextarea(textarea);
        }
      });
      updateButtonPosition();
      if (pendingInitScrollRef.current !== null) {
        scrollVerseToTop(pendingInitScrollRef.current);
        pendingInitScrollRef.current = null;
      }
    };

    const timer = setTimeout(resizeAll, 100);
    window.addEventListener('resize', resizeAll);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && targetScrollRef.current) {
      observer = new ResizeObserver(() => {
        requestAnimationFrame(resizeAll);
      });
      observer.observe(targetScrollRef.current);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', resizeAll);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [readOnly, autoResizeTextarea, updateButtonPosition, scrollVerseToTop]);

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
    lastRevealedVerseNumber,
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
