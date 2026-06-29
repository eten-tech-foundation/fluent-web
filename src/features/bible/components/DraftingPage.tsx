import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMatch, useNavigate, useRouter } from '@tanstack/react-router';
import { BookText, ChevronLeft, GripVertical, Loader, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAddTranslatedVerse, useSubmitChapter } from '@/features/bible/hooks/useBibleTarget';
import { useChapterPresence } from '@/features/bible/hooks/useChapterPresence';
import { useDrafting } from '@/features/bible/hooks/useDrafting';
import {
  useResourceState,
  useSaveResourceState,
} from '@/features/bible/hooks/useResourceStatePersistence';
import { type translationLoader } from '@/features/bible/TranslationLoader';
import { useChapterPericopes } from '@/features/pericopes/hooks/useChapterPericopes';
import { ResourcePanel } from '@/features/resources/components/ResourcePanel';
import { type BibleVerse } from '@/features/resources/hooks/hooks';
import { getStatusDisplay } from '@/lib/formatters';
import {
  ChapterAssignmentStatus,
  ChapterAssignmentStatusNextAction,
  type ChapterAssignmentStatus as ChapterAssignmentStatusType,
  type DraftingUIProps,
  type ResourceName,
  type Source,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

type LoaderData = Awaited<ReturnType<typeof translationLoader>>;

const RESOURCE_NAMES: ResourceName[] = [
  { id: 'UWTranslationNotes', name: 'TN' },
  { id: 'Images', name: 'Images & Maps' },
  { id: 'Bibles', name: 'Bibles' },
  { id: 'UWTranslationQuestions', name: 'TQ' },
  { id: 'UWTranslationWords', name: 'TW' },
  // { id: 'AOSN', name: 'AOSN' }, // Uncomment when AOSN resources are available
];

const DraftingUI: React.FC<DraftingUIProps> = ({
  projectItem,
  sourceVerses,
  targetVerses,
  userdetail,
  readOnly = false,
}) => {
  const { t } = useTranslation();
  const displayMode = useAppStore(state => state.displayMode);
  const { data: pericopes } = useChapterPericopes(
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

  const isPericopeMode = displayMode === 'pericope' && pericopes && pericopes.length > 0;

  const getPericopeStyle = useCallback(
    (verseNumber: number, isActive: boolean, baseClass: string) => {
      const activeClass = isActive ? 'border-primary z-10 relative' : 'border-border';
      if (!isPericopeMode || !pericopeMap.has(verseNumber)) {
        return `${baseClass} rounded-lg border-2 px-4 py-1 shadow-sm transition-all ${activeClass}`;
      }
      const info = pericopeMap.get(verseNumber)!;
      const group = pericopes?.find(g => g.pericopeNumber === info.number);
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

  const addVerseMutation = useAddTranslatedVerse();
  const submitChapterMutation = useSubmitChapter();
  const navigate = useNavigate();
  const router = useRouter();

  const [showResources, setShowResources] = useState(false);
  const [currentResource, setCurrentResource] = useState<ResourceName>(RESOURCE_NAMES[0]);
  const [currentLanguage, setCurrentLanguage] = useState('');
  const [resourcePanelWidth, setResourcePanelWidth] = useState(25); // percentage

  // Bible tab state
  const [selectedPanel, setSelectedPanel] = useState<1 | 2>(1);
  const [openResourcePanel, setOpenResourcePanel] = useState(false);
  const [bibleTabLabel, setBibleTabLabel] = useState('');
  const [bibleVerses, setBibleVerses] = useState<BibleVerse[]>([]);
  const [bibleContentLoading, setBibleContentLoading] = useState(false);

  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearBibleRef = useRef<(() => void) | null>(null);

  const { data: savedResourceState, isFetched } = useResourceState(projectItem.chapterAssignmentId);

  const saveResourceStateMutation = useSaveResourceState();

  const isInitializedRef = useRef(false);
  const lastSavedStateRef = useRef<{
    bookCode: string;
    chapterNumber: number;
    verseNumber: number;
    activeResource: string;
    languageCode: string;
    tabStatus: boolean;
  } | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearCurrentProjectItem = useAppStore(state => state.clearCurrentProjectItem);
  const setPresenceWarning = useAppStore(state => state.setPresenceWarning);
  const isDraft = projectItem.chapterStatus === ChapterAssignmentStatus.DRAFT;
  const isCommunityReview = projectItem.chapterStatus === ChapterAssignmentStatus.COMMUNITY_REVIEW;
  const isLinguistCheck = projectItem.chapterStatus === ChapterAssignmentStatus.LINGUIST_CHECK;
  const isTheologicalCheck =
    projectItem.chapterStatus === ChapterAssignmentStatus.THEOLOGICAL_CHECK;
  const isConsultantCheck = projectItem.chapterStatus === ChapterAssignmentStatus.CONSULTANT_CHECK;
  const isComplete = projectItem.chapterStatus === ChapterAssignmentStatus.COMPLETE;

  const { editorName } = useChapterPresence(
    projectItem.chapterAssignmentId,
    isCommunityReview || isLinguistCheck || isTheologicalCheck || isConsultantCheck
  );

  useEffect(() => {
    setPresenceWarning(editorName);
    return () => setPresenceWarning(null);
  }, [editorName, setPresenceWarning]);

  const saveVerse = useCallback(
    async (verse: number, text: string) => {
      const sourceVerse = sourceVerses.find((v: Source) => v.verseNumber === verse);
      const trimmedText = text.trim();

      await addVerseMutation.mutateAsync({
        verseData: {
          projectUnitId: projectItem.projectUnitId,
          content: trimmedText,
          bibleTextId: (sourceVerse as Source).id,
          assignedUserId: userdetail.id,
        },
      });
    },
    [addVerseMutation, projectItem.projectUnitId, sourceVerses, userdetail]
  );

  const {
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
  } = useDrafting({
    sourceVerses,
    targetVerses,
    readOnly,
    onSave: saveVerse,
  });

  const currentPericopeGroup = useMemo(() => {
    if (!isPericopeMode || !pericopes) return null;
    return pericopes.find(group => group.verses.some(gv => gv.verseNumber === activeVerseId));
  }, [isPericopeMode, pericopes, activeVerseId]);

  const globalNextUntouchedVerse = useMemo(() => {
    if (!isPericopeMode || !pericopes) return null;
    return (
      sourceVerses.find(sv => {
        if (sv.verseNumber <= activeVerseId) return false;
        const target = verses.find(tv => tv.verseNumber === sv.verseNumber);
        return !target?.content.trim();
      }) || null
    );
  }, [isPericopeMode, pericopes, sourceVerses, activeVerseId, verses]);

  const resourceVerseId = useMemo(() => {
    if (isPericopeMode && currentPericopeGroup && currentPericopeGroup.verses.length > 0) {
      return currentPericopeGroup.verses[0].verseNumber;
    }
    return activeVerseId;
  }, [isPericopeMode, currentPericopeGroup, activeVerseId]);

  const effectiveRevealedVerses = useMemo(() => {
    if (!isPericopeMode || !pericopes) return revealedVerses;
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
    if (!isPericopeMode || !pericopes) return lastRevealedVerseHasContent;
    if (!currentPericopeGroup) return false;
    return currentPericopeGroup.verses.every(v => {
      const target = verses.find(tv => tv.verseNumber === v.verseNumber);
      return Boolean(target?.content.trim());
    });
  }, [isPericopeMode, pericopes, currentPericopeGroup, lastRevealedVerseHasContent, verses]);

  const handleNextClick = useCallback(async () => {
    if (!isPericopeMode || !pericopes) {
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
          if (nextFirstVerse) {
            await handleActiveVerseChange(nextFirstVerse.verseNumber);
          }
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

  const handleBack = useCallback(() => {
    clearCurrentProjectItem();

    if (window.history.length <= 2) {
      void navigate({ to: '/' });
      return;
    }

    router.history.back();
  }, [clearCurrentProjectItem, navigate, router]);

  // Initialize resource state from saved data
  useEffect(() => {
    if (!isFetched || isInitializedRef.current) return;

    if (savedResourceState) {
      const { languageCode, tabStatus } = savedResourceState;

      if (typeof tabStatus === 'boolean') {
        setShowResources(tabStatus);
      }

      setCurrentLanguage(languageCode || projectItem.sourceLangCode);

      lastSavedStateRef.current = {
        bookCode: projectItem.book,
        chapterNumber: projectItem.chapterNumber,
        verseNumber: activeVerseId,
        activeResource: RESOURCE_NAMES[0].id,
        languageCode: languageCode || projectItem.sourceLangCode,
        tabStatus: typeof tabStatus === 'boolean' ? tabStatus : false,
      };
    } else {
      setCurrentLanguage(projectItem.sourceLangCode);

      lastSavedStateRef.current = {
        bookCode: projectItem.book,
        chapterNumber: projectItem.chapterNumber,
        verseNumber: activeVerseId,
        activeResource: RESOURCE_NAMES[0].id,
        languageCode: projectItem.sourceLangCode,
        tabStatus: false,
      };
    }

    isInitializedRef.current = true;
  }, [
    isFetched,
    savedResourceState,
    projectItem.sourceLangCode,
    projectItem.book,
    projectItem.chapterNumber,
    activeVerseId,
  ]);

  // Save resource state with debouncing
  useEffect(() => {
    if (!isInitializedRef.current) return;

    const currentState = {
      bookCode: projectItem.book,
      chapterNumber: projectItem.chapterNumber,
      verseNumber: activeVerseId,
      activeResource: currentResource.id,
      languageCode: currentLanguage || projectItem.sourceLangCode,
      tabStatus: showResources,
    };

    if (lastSavedStateRef.current) {
      const hasChanged =
        lastSavedStateRef.current.bookCode !== currentState.bookCode ||
        lastSavedStateRef.current.chapterNumber !== currentState.chapterNumber ||
        lastSavedStateRef.current.verseNumber !== currentState.verseNumber ||
        lastSavedStateRef.current.activeResource !== currentState.activeResource ||
        lastSavedStateRef.current.languageCode !== currentState.languageCode ||
        lastSavedStateRef.current.tabStatus !== currentState.tabStatus;

      if (!hasChanged) return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveResourceStateMutation.mutate({
        chapterAssignmentId: projectItem.chapterAssignmentId,
        resourceState: { resources: currentState },
      });
      lastSavedStateRef.current = currentState;
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    currentResource.id,
    currentLanguage,
    showResources,
    activeVerseId,
    projectItem.chapterAssignmentId,
    projectItem.book,
    projectItem.chapterNumber,
    projectItem.sourceLangCode,
    saveResourceStateMutation,
  ]);

  const totalSourceVerses = sourceVerses.length;
  const versesWithText = verses.filter(v => v.content.trim() !== '').length;
  const progressPercentage = (versesWithText / totalSourceVerses) * 100;
  const isTranslationComplete = versesWithText === totalSourceVerses;

  const isAnythingSaving = !readOnly && verses.some(v => getSaveStatus(v.verseNumber).showLoader);
  const hasAnyError = !readOnly && verses.some(v => getSaveStatus(v.verseNumber).hasRetryScheduled);

  const buttonText =
    ChapterAssignmentStatusNextAction[projectItem.chapterStatus as ChapterAssignmentStatus];

  const handleSubmit = useCallback(async () => {
    if (!isTranslationComplete) return;

    const savePromises = verses
      .filter(verse => getSaveStatus(verse.verseNumber).hasUnsavedChanges)
      .map(verse => saveImmediately(verse.verseNumber, verse.content));

    await Promise.all(savePromises);

    await submitChapterMutation.mutateAsync({
      chapterAssignmentId: projectItem.chapterAssignmentId,
    });
    clearCurrentProjectItem();
    router.history.back();
  }, [
    isTranslationComplete,
    verses,
    getSaveStatus,
    saveImmediately,
    submitChapterMutation,
    projectItem.chapterAssignmentId,
    clearCurrentProjectItem,
    router,
  ]);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await moveToNextVerse();
      }
    },
    [moveToNextVerse]
  );

  const resetBibleState = useCallback(() => {
    clearBibleRef.current?.();
    setSelectedPanel(1);
    setOpenResourcePanel(false);
    setBibleTabLabel('');
    setBibleVerses([]);
    setBibleContentLoading(false);
  }, []);

  const toggleResources = useCallback(() => {
    setShowResources(prev => {
      const nextShow = !prev;

      // When hiding the resource panel, ResourcePanel unmounts and loses its
      // internal hook state (selectedBible resets to null).
      if (!nextShow) {
        resetBibleState();
      }

      return nextShow;
    });
  }, [resetBibleState]);

  const handleResizeDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidthPx = moveEvent.clientX - containerRect.left;
      const newWidthPct = (newWidthPx / containerRect.width) * 100;
      setResourcePanelWidth(Math.min(40, Math.max(20, newWidthPct)));
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }, []);

  // Close Tab 2: reset all bible-related state, revert to panel 1
  const handleBibleTabClose = useCallback(() => {
    resetBibleState();
  }, [resetBibleState]);

  // O(1) verse lookup for the bible panel left column
  const bibleVerseMap = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    bibleVerses.forEach(v => map.set(v.verseNumber, v.text));
    return map;
  }, [bibleVerses]);

  // Shared target column renderer
  const renderTargetColumn = (verseNumber: number) => {
    const isActive = !readOnly && activeVerseId === verseNumber;
    const currentTargetVerse = verses.find(v => v.verseNumber === verseNumber);
    const shouldShowTarget = readOnly || isActive || effectiveRevealedVerses.has(verseNumber);

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
              ref={el => (textareaRefs.current[verseNumber] = el)}
              aria-label={`Translation for verse ${verseNumber}`}
              autoCapitalize='sentences'
              autoCorrect='on'
              className='w-full resize-none border-none bg-transparent text-base leading-snug outline-none'
              placeholder='Enter translation...'
              spellCheck={true}
              value={currentTargetVerse?.content ?? ''}
              onChange={e => handleTextChange(verseNumber, e.target.value)}
              onFocus={() => handleActiveVerseChange(verseNumber)}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}
      </div>
    );
  };

  // Back button
  const backButton = (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <ChevronLeft
              className='shrink-0 cursor-pointer'
              size={'24px'}
              strokeWidth={'2px'}
              onClick={handleBack}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent
          align='start'
          className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
          side='top'
        >
          Back
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  // Render

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <div className='shrink-0'>
        <div className='flex items-center justify-between py-4 pr-0.5'>
          <div className='flex shrink-0 items-center gap-4'>
            {backButton}
            <h2 className='text-3xl font-bold'>
              {projectItem.book} {projectItem.chapterNumber}
            </h2>
            <Badge
              className='rounded-full border-2 px-3 py-1 text-sm font-bold whitespace-nowrap text-(--text-disabled)'
              variant='outline'
            >
              {getStatusDisplay(projectItem.chapterStatus as ChapterAssignmentStatusType)}
            </Badge>
          </div>

          {!readOnly && (
            <div className='flex flex-1 items-center justify-end gap-4'>
              <div className='flex items-center gap-2'>
                {isAnythingSaving && <Loader className='text-primary h-4 w-4 animate-spin' />}
                {hasAnyError && <span className='text-sm text-red-500'>Auto-save failed</span>}
              </div>

              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-pressed={showResources}
                      className='bg-primary flex cursor-pointer items-center gap-2'
                      type='button'
                      onClick={toggleResources}
                    >
                      <BookText color='#ffffff' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    align='start'
                    className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
                    side='top'
                  >
                    {showResources ? 'Hide Resources' : 'Show Resources'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {!isComplete && isDraft && (
                <div className='bg-input rounded-lg border sm:w-40 md:w-50 lg:w-76 xl:w-105'>
                  <div className='h-4 overflow-hidden rounded-full'>
                    <div
                      className='bg-primary h-full rounded-full transition-all duration-300'
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>
              )}

              {!isComplete && (
                <Button
                  className={`shrink-0 px-6 py-2 font-medium transition-all ${
                    isTranslationComplete
                      ? 'bg-primary hover:bg-primary-hover cursor-pointer text-white'
                      : 'cursor-not-allowed bg-gray-300 text-gray-500'
                  }`}
                  disabled={!isTranslationComplete}
                  onClick={handleSubmit}
                >
                  {buttonText}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={containerRef} className='flex h-full overflow-hidden'>
        {showResources && isInitializedRef.current && (
          <>
            <div
              className='min-w-0 shrink-0 overflow-hidden'
              style={{ width: `${resourcePanelWidth}%` }}
            >
              <ResourcePanel
                activeVerseId={resourceVerseId}
                bibleResourceName={setBibleTabLabel}
                initialLanguage={currentLanguage}
                initialResource={currentResource}
                openResourceBiblePanel={setOpenResourcePanel}
                registerClearBible={fn => {
                  clearBibleRef.current = fn;
                }}
                resourceNames={RESOURCE_NAMES}
                selectPanel={panel => setSelectedPanel(panel as 1 | 2)}
                sourceData={projectItem}
                onBibleLoadingChange={setBibleContentLoading}
                onBibleVersesChange={setBibleVerses}
                onLanguageChange={setCurrentLanguage}
                onResourceChange={setCurrentResource}
              />
            </div>
            {/* Drag handle */}
            <div
              aria-label='Resize resource panel'
              aria-orientation='vertical'
              aria-valuemax={40}
              aria-valuemin={20}
              aria-valuenow={Math.round(resourcePanelWidth)}
              className='group flex h-full w-5 shrink-0 cursor-col-resize items-center justify-center'
              role='separator'
              onPointerDown={handleResizeDragStart}
            >
              <GripVertical className='text-muted-foreground/80 group-hover:text-primary/70 h-5 w-5 transition-colors duration-150' />
            </div>
          </>
        )}
        <div className='w-full flex-1 overflow-hidden px-8'>
          <div
            className={`${showResources ? 'ml-0' : 'ml-2'} grid h-full content-start`}
            style={{
              gridTemplateColumns: isPericopeMode ? '1fr 1fr' : '2rem 1fr 1fr',
              gridTemplateRows: 'auto 1fr',
              scrollbarGutter: 'stable',
            }}
          >
            {!isPericopeMode && <div className='bg-background sticky top-0 z-10 w-8 px-4 py-3' />}
            <div className='bg-background sticky top-0 z-10 flex items-center gap-1 px-6 py-3'>
              <button
                className={`cursor-pointer text-2xl font-bold text-slate-800 transition-colors ${
                  openResourcePanel
                    ? selectedPanel === 1
                      ? 'border-primary border-b-2 pb-1'
                      : 'text-muted-foreground'
                    : ''
                }`}
                disabled={!openResourcePanel}
                onClick={() => setSelectedPanel(1)}
              >
                {projectItem.bibleName}
              </button>

              {openResourcePanel && (
                <>
                  <button
                    className={`ml-4 cursor-pointer text-2xl font-bold transition-colors ${
                      selectedPanel === 2
                        ? 'border-primary border-b-2 pb-1'
                        : 'text-muted-foreground'
                    }`}
                    onClick={() => setSelectedPanel(2)}
                  >
                    {bibleTabLabel}
                  </button>
                  <X
                    className='text-muted-foreground hover:text-foreground ml-1 h-4 w-4 cursor-pointer transition-colors'
                    onClick={handleBibleTabClose}
                  />
                </>
              )}
            </div>

            <div className='bg-background sticky top-0 z-10 px-6 py-3'>
              <h3 className='text-2xl font-bold text-slate-800'>{projectItem.targetLanguage}</h3>
            </div>
            <div
              className={`col-span-3 flex flex-col overflow-hidden ${showResources ? 'h-full rounded-md border' : ''}`}
            >
              <div
                ref={targetScrollRef}
                className='relative flex h-full flex-col overflow-y-auto'
                style={{ scrollbarGutter: 'stable' }}
                onScroll={() => !readOnly && updateButtonPosition()}
              >
                {selectedPanel === 2 && bibleContentLoading && (
                  <div
                    className='grid h-full items-start py-4'
                    style={{ gridTemplateColumns: '2rem 1fr 1fr' }}
                  >
                    <div className='w-8' />
                    <div className='flex h-full items-center justify-center px-6'>
                      <div className='bg-muted flex h-full w-full items-center justify-center rounded-lg border-2'>
                        <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
                      </div>
                    </div>
                    <div className='flex flex-col px-6'>
                      {sourceVerses.map(verse => (
                        <div key={verse.verseNumber} className='py-4'>
                          {renderTargetColumn(verse.verseNumber)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPanel === 2 && !bibleContentLoading && bibleVerses.length === 0 && (
                  <div
                    className='grid h-full items-start py-4'
                    style={{ gridTemplateColumns: '2rem 1fr 1fr' }}
                  >
                    <div className='w-8' />
                    <div className='flex h-full justify-center px-6'>
                      <div className='bg-muted flex h-full w-full justify-center rounded-lg border-2 pt-10'>
                        <p className='text-muted-foreground text-sm'>No content available</p>
                      </div>
                    </div>
                    <div className='flex flex-col px-6'>
                      {sourceVerses.map(verse => (
                        <div key={verse.verseNumber} className='py-4'>
                          {renderTargetColumn(verse.verseNumber)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={
                    selectedPanel === 2 && (bibleContentLoading || bibleVerses.length === 0)
                      ? 'hidden'
                      : undefined
                  }
                >
                  {isPericopeMode
                    ? pericopes.map(group => {
                        const groupVerses = sourceVerses.filter(sv =>
                          group.verses.some(gv => gv.verseNumber === sv.verseNumber)
                        );
                        if (groupVerses.length === 0) return null;
                        const verseNumbers = groupVerses.map(gv => gv.verseNumber);
                        const minVerse = Math.min(...verseNumbers);
                        const maxVerse = Math.max(...verseNumbers);
                        const heading =
                          minVerse === maxVerse
                            ? `${projectItem.chapterNumber}:${minVerse}`
                            : `${projectItem.chapterNumber}:${minVerse}-${maxVerse}`;

                        const isGroupActive = groupVerses.some(
                          gv => gv.verseNumber === activeVerseId
                        );

                        return (
                          <div
                            key={group.pericopeNumber}
                            ref={el => {
                              const firstVerseNum = groupVerses[0].verseNumber;
                              verseRefs.current[firstVerseNum] = el;
                            }}
                            className='grid w-full items-start py-4'
                            style={{ gridTemplateColumns: '1fr 1fr' }}
                          >
                            <div className='flex w-full flex-col space-y-2 px-6'>
                              <h4 className='text-base font-bold text-slate-800 select-none'>
                                {projectItem.book} {heading}
                              </h4>
                              <div
                                className={`w-full cursor-pointer rounded-[12px] border-2 bg-[#f0f4f9] p-5 shadow-xs transition-all ${
                                  isGroupActive ? 'border-primary' : 'border-[#cfd8e3]'
                                }`}
                                onClick={() => handleActiveVerseChange(groupVerses[0].verseNumber)}
                              >
                                <p className='text-base leading-relaxed text-slate-800 select-text'>
                                  {groupVerses.map(v => {
                                    const textToRender =
                                      selectedPanel === 1
                                        ? v.text
                                        : bibleVerseMap.get(v.verseNumber) ||
                                          t('noContentAvailable', 'No content available');
                                    return (
                                      <React.Fragment key={v.verseNumber}>
                                        <span className='mr-1.5 font-bold text-slate-900'>
                                          {v.verseNumber}
                                        </span>
                                        <span
                                          className={`mr-3 ${selectedPanel === 2 && !bibleVerseMap.has(v.verseNumber) ? 'text-muted-foreground text-sm' : ''}`}
                                        >
                                          {textToRender}
                                        </span>
                                      </React.Fragment>
                                    );
                                  })}
                                </p>
                              </div>
                            </div>
                            <div className='flex w-full flex-col space-y-2 px-6'>
                              <h4 className='text-base font-bold text-slate-800 select-none'>
                                {projectItem.book} {heading}
                              </h4>
                              <div
                                className={`w-full cursor-pointer space-y-1 rounded-[12px] border-2 bg-[#f0f4f9] p-5 transition-all ${
                                  isGroupActive ? 'border-primary' : 'border-[#cfd8e3]'
                                }`}
                                onClick={e => {
                                  if (e.target === e.currentTarget) {
                                    void handleActiveVerseChange(groupVerses[0].verseNumber);
                                  }
                                }}
                              >
                                {(() => {
                                  const activeTargetVerse = verses.find(
                                    tv => tv.verseNumber === activeVerseId
                                  );
                                  const isActiveVerseEmpty = !activeTargetVerse?.content.trim();

                                  const activeIndex = groupVerses.findIndex(
                                    gv => gv.verseNumber === activeVerseId
                                  );
                                  const isAnyActive = activeIndex !== -1;

                                  let buttonVerseNumber: number | null = null;
                                  let showOutOfBoxButton = false;

                                  if (isActiveVerseEmpty) {
                                    if (isAnyActive) {
                                      buttonVerseNumber = activeVerseId;
                                    }
                                  } else if (globalNextUntouchedVerse) {
                                    buttonVerseNumber = globalNextUntouchedVerse.verseNumber;
                                  } else if (isAnyActive) {
                                    showOutOfBoxButton = true;
                                  }

                                  return (
                                    <>
                                      {groupVerses.map(v => {
                                        const currentTargetVerse = verses.find(
                                          tv => tv.verseNumber === v.verseNumber
                                        );
                                        const isButtonRow =
                                          !readOnly && buttonVerseNumber === v.verseNumber;

                                        return (
                                          <div
                                            key={v.verseNumber}
                                            className='relative flex w-full items-start'
                                            onClick={e => e.stopPropagation()}
                                          >
                                            <span className='mt-0.5 mr-3 w-4 text-right text-base font-bold text-slate-900 select-none'>
                                              {v.verseNumber}
                                            </span>
                                            <div className='flex min-h-[24px] flex-1 items-center'>
                                              {readOnly ? (
                                                <p className='w-full text-base leading-relaxed text-slate-800 select-text'>
                                                  {currentTargetVerse?.content ?? ''}
                                                </p>
                                              ) : (
                                                <textarea
                                                  ref={el =>
                                                    (textareaRefs.current[v.verseNumber] = el)
                                                  }
                                                  aria-label={`Translation for verse ${v.verseNumber}`}
                                                  autoCapitalize='sentences'
                                                  autoCorrect='on'
                                                  className={`text-foreground w-full resize-none overflow-hidden border-none bg-transparent py-0.5 text-base leading-relaxed outline-none ${
                                                    isButtonRow ? 'pr-16' : ''
                                                  }`}
                                                  placeholder={t('typeHere', 'Type here...')}
                                                  rows={1}
                                                  spellCheck={true}
                                                  style={
                                                    {
                                                      fieldSizing: 'content',
                                                    } as React.CSSProperties
                                                  }
                                                  value={currentTargetVerse?.content ?? ''}
                                                  onChange={e =>
                                                    handleTextChange(v.verseNumber, e.target.value)
                                                  }
                                                  onFocus={() =>
                                                    handleActiveVerseChange(v.verseNumber)
                                                  }
                                                  onKeyDown={handleKeyDown}
                                                />
                                              )}
                                            </div>

                                            {isButtonRow && (
                                              <Button
                                                className='bg-primary hover:bg-primary-hover absolute top-1/2 right-0 z-10 flex h-6 -translate-y-1/2 cursor-pointer items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white shadow-xs transition-all'
                                                disabled={isActiveVerseEmpty}
                                                onClick={handleNextClick}
                                              >
                                                {t('nextVerse', 'Next Verse')}
                                              </Button>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {showOutOfBoxButton && (
                                        <div className='flex justify-end pt-2'>
                                          <Button
                                            className='bg-primary hover:bg-primary-hover flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white shadow-xs transition-all'
                                            disabled={isActiveVerseEmpty}
                                            onClick={handleNextClick}
                                          >
                                            {t('nextVerse', 'Next Verse')}
                                          </Button>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    : sourceVerses.map(verse => {
                        const isActive = !readOnly && activeVerseId === verse.verseNumber;
                        return (
                          <div
                            key={verse.verseNumber}
                            ref={el => (verseRefs.current[verse.verseNumber] = el)}
                            className='grid items-start py-4'
                            style={{ gridTemplateColumns: '2rem 1fr 1fr' }}
                          >
                            <div className='flex w-8 items-start px-4'>
                              <span className='text-lg font-medium'>{verse.verseNumber}</span>
                            </div>
                            <div className='flex flex-col px-6'>
                              {selectedPanel === 1 ? (
                                <div
                                  className={getPericopeStyle(
                                    verse.verseNumber,
                                    isActive,
                                    'bg-card'
                                  )}
                                >
                                  <p className='min-h-12 leading-relaxed'>{verse.text}</p>
                                </div>
                              ) : (
                                <div
                                  className={getPericopeStyle(verse.verseNumber, false, 'bg-muted')}
                                >
                                  {bibleVerseMap.has(verse.verseNumber) ? (
                                    <p className='min-h-12 leading-relaxed'>
                                      {bibleVerseMap.get(verse.verseNumber)}
                                    </p>
                                  ) : (
                                    <p className='text-muted-foreground min-h-12 leading-relaxed'>
                                      No content available
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            {renderTargetColumn(verse.verseNumber)}
                          </div>
                        );
                      })}
                </div>

                {!readOnly &&
                  !isPericopeMode &&
                  effectiveRevealedVerses.size < totalSourceVerses && (
                    <div className='absolute right-4 z-10' style={{ top: buttonTop }}>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              className={`bg-primary flex items-center gap-2 px-6 py-2 font-medium shadow-lg transition-all ${
                                isNextButtonEnabled
                                  ? 'hover:bg-primary-hover cursor-pointer text-white'
                                  : 'cursor-not-allowed bg-gray-300 text-gray-500'
                              }`}
                              disabled={!isNextButtonEnabled}
                              onClick={handleNextClick}
                            >
                              {isPericopeMode ? 'Next Pericope' : 'Next Verse'}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent
                            align='center'
                            className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
                            side='top'
                            sideOffset={8}
                          >
                            <div className='flex items-center gap-2'>
                              <span>{isPericopeMode ? 'Next Pericope' : 'Next Verse'}</span>
                              <span className='bg-muted text-muted-foreground flex h-5 items-center rounded border px-1.5 font-mono text-[10px]'>
                                Enter ↵
                              </span>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// DraftingPage

const DraftingPage: React.FC = () => {
  const { userdetail } = useAppStore();

  const translationMatch = useMatch({
    from: '/_authenticated/translation/$bookId/$chapterNumber',
    shouldThrow: false,
  });

  const viewMatch = useMatch({
    from: '/_authenticated/view/$bookId/$chapterNumber',
    shouldThrow: false,
  });

  const rawLoaderData = translationMatch
    ? translationMatch.loaderData
    : viewMatch
      ? viewMatch.loaderData
      : undefined;

  const loaderData = rawLoaderData as LoaderData | undefined;
  const isReadOnly = !!viewMatch;

  if (!loaderData || !userdetail) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader className='h-8 w-8 animate-spin' />
      </div>
    );
  }

  return (
    <DraftingUI
      projectItem={loaderData.projectItem}
      readOnly={isReadOnly}
      sourceVerses={loaderData.sourceVerses}
      targetVerses={loaderData.targetVerses}
      userdetail={userdetail}
    />
  );
};

export default DraftingPage;
