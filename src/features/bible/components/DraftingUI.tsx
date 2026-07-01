import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate, useRouter } from '@tanstack/react-router';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAddTranslatedVerse, useSubmitChapter } from '@/features/bible/hooks/useBibleTarget';
import { useChapterPresence } from '@/features/bible/hooks/useChapterPresence';
import { useDrafting } from '@/features/bible/hooks/useDrafting';
import { usePericope } from '@/features/bible/hooks/usePericope';
import {
  useResourceState,
  useSaveResourceState,
} from '@/features/bible/hooks/useResourceStatePersistence';
import { type BibleVerse } from '@/features/resources/hooks/hooks';
import {
  ChapterAssignmentStatus,
  ChapterAssignmentStatusNextAction,
  type DraftingUIProps,
  type ResourceName,
  type Source,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

import { DraftingGridPericope } from './DraftingGridPericope';
import { DraftingGridVerse, DraftingTargetColumn } from './DraftingGridVerse';
import { DraftingHeader } from './DraftingHeader';
import { DraftingResourceSidebar } from './DraftingResourceSidebar';

const RESOURCE_NAMES: ResourceName[] = [
  { id: 'UWTranslationNotes', name: 'TN' },
  { id: 'Images', name: 'Images & Maps' },
  { id: 'Bibles', name: 'Bibles' },
  { id: 'UWTranslationQuestions', name: 'TQ' },
  { id: 'UWTranslationWords', name: 'TW' },
];

export const DraftingUI: React.FC<DraftingUIProps> = ({
  projectItem,
  sourceVerses,
  targetVerses,
  userdetail,
  readOnly = false,
}) => {
  const displayMode = useAppStore(state => state.displayMode);

  const addVerseMutation = useAddTranslatedVerse();
  const submitChapterMutation = useSubmitChapter();
  const navigate = useNavigate();
  const router = useRouter();

  const [showResources, setShowResources] = useState(false);
  const [currentResource, setCurrentResource] = useState<ResourceName>(RESOURCE_NAMES[0]);
  const [currentLanguage, setCurrentLanguage] = useState('');

  // Bible tab state
  const [selectedPanel, setSelectedPanel] = useState<1 | 2>(1);
  const [openResourcePanel, setOpenResourcePanel] = useState(false);
  const [bibleTabLabel, setBibleTabLabel] = useState('');
  const [bibleVerses, setBibleVerses] = useState<BibleVerse[]>([]);
  const [bibleContentLoading, setBibleContentLoading] = useState(false);

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

  const {
    pericopes,
    isPericopeMode,
    isPericopeLoading,
    getPericopeStyle,
    globalNextUntouchedVerse,
    resourceVerseId,
    effectiveRevealedVerses,
    isNextButtonEnabled,
    handleNextClick,
  } = usePericope({
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
  });

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
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        moveToNextVerse();
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

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <DraftingHeader
        buttonText={buttonText}
        hasAnyError={hasAnyError}
        isAnythingSaving={isAnythingSaving}
        isComplete={isComplete}
        isDraft={isDraft}
        isTranslationComplete={isTranslationComplete}
        progressPercentage={progressPercentage}
        projectItem={projectItem}
        readOnly={readOnly}
        showResources={showResources}
        onBack={handleBack}
        onSubmit={handleSubmit}
        onToggleResources={toggleResources}
      />

      <div ref={containerRef} className='flex h-full overflow-hidden'>
        {showResources && isInitializedRef.current && (
          <DraftingResourceSidebar
            clearBibleRef={clearBibleRef}
            containerRef={containerRef}
            currentLanguage={currentLanguage}
            currentResource={currentResource}
            projectItem={projectItem}
            resourceNames={RESOURCE_NAMES}
            resourceVerseId={resourceVerseId}
            setBibleContentLoading={setBibleContentLoading}
            setBibleTabLabel={setBibleTabLabel}
            setBibleVerses={setBibleVerses}
            setCurrentLanguage={setCurrentLanguage}
            setCurrentResource={setCurrentResource}
            setOpenResourcePanel={setOpenResourcePanel}
            setSelectedPanel={setSelectedPanel}
          />
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
                          <DraftingTargetColumn
                            activeVerseId={activeVerseId}
                            effectiveRevealedVerses={effectiveRevealedVerses}
                            handleActiveVerseChange={handleActiveVerseChange}
                            handleKeyDown={handleKeyDown}
                            handleTextChange={handleTextChange}
                            readOnly={readOnly}
                            textareaRefs={textareaRefs}
                            verseNumber={verse.verseNumber}
                            verses={verses}
                          />
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
                          <DraftingTargetColumn
                            activeVerseId={activeVerseId}
                            effectiveRevealedVerses={effectiveRevealedVerses}
                            handleActiveVerseChange={handleActiveVerseChange}
                            handleKeyDown={handleKeyDown}
                            handleTextChange={handleTextChange}
                            readOnly={readOnly}
                            textareaRefs={textareaRefs}
                            verseNumber={verse.verseNumber}
                            verses={verses}
                          />
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
                  {displayMode === 'pericope' && isPericopeLoading ? (
                    <div className='flex h-full items-center justify-center py-12'>
                      <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
                    </div>
                  ) : isPericopeMode && pericopes ? (
                    <DraftingGridPericope
                      activeVerseId={activeVerseId}
                      bibleVerseMap={bibleVerseMap}
                      globalNextUntouchedVerse={globalNextUntouchedVerse}
                      handleActiveVerseChange={handleActiveVerseChange}
                      handleKeyDown={handleKeyDown}
                      handleNextClick={handleNextClick}
                      handleTextChange={handleTextChange}
                      pericopes={pericopes}
                      projectItem={projectItem}
                      readOnly={readOnly}
                      selectedPanel={selectedPanel}
                      sourceVerses={sourceVerses}
                      textareaRefs={textareaRefs}
                      verseRefs={verseRefs}
                      verses={verses}
                    />
                  ) : (
                    <DraftingGridVerse
                      activeVerseId={activeVerseId}
                      bibleVerseMap={bibleVerseMap}
                      effectiveRevealedVerses={effectiveRevealedVerses}
                      getPericopeStyle={getPericopeStyle}
                      handleActiveVerseChange={handleActiveVerseChange}
                      handleKeyDown={handleKeyDown}
                      handleTextChange={handleTextChange}
                      readOnly={readOnly}
                      selectedPanel={selectedPanel}
                      sourceVerses={sourceVerses}
                      textareaRefs={textareaRefs}
                      verseRefs={verseRefs}
                      verses={verses}
                    />
                  )}
                </div>

                {!readOnly &&
                  !isPericopeMode &&
                  !isPericopeLoading &&
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
                              Next Verse
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent
                            align='center'
                            className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
                            side='top'
                            sideOffset={8}
                          >
                            <div className='flex items-center gap-2'>
                              <span>Next Verse</span>
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
