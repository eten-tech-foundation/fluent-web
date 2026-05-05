import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useMatch, useNavigate, useRouter } from '@tanstack/react-router';
import { BookText, ChevronLeft, Loader } from 'lucide-react';

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
import { ResourcePanel } from '@/features/resources/components/ResourcePanel';
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
  { id: 'UWTranslationNotes', name: 'Translation Notes (uW)' },
  { id: 'Images', name: 'Images' },
];

const DraftingUI: React.FC<DraftingUIProps> = ({
  projectItem,
  sourceVerses,
  targetVerses,
  userdetail,
  readOnly = false,
}) => {
  const addVerseMutation = useAddTranslatedVerse();
  const submitChapterMutation = useSubmitChapter();
  const navigate = useNavigate();
  const router = useRouter();

  const [showResources, setShowResources] = useState(false);
  const [currentResource, setCurrentResource] = useState<ResourceName>(RESOURCE_NAMES[0]);
  const [currentLanguage, setCurrentLanguage] = useState('');

  const { data: savedResourceState, isFetched } = useResourceState(
    projectItem.chapterAssignmentId,
    userdetail.email
  );

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
    isCommunityReview || isLinguistCheck || isTheologicalCheck || isConsultantCheck,
    userdetail.email
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
        email: userdetail.email,
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
      const { activeResource, languageCode, tabStatus } = savedResourceState;

      if (typeof tabStatus === 'boolean') {
        setShowResources(tabStatus);
      }

      if (activeResource) {
        const savedResource = RESOURCE_NAMES.find(r => r.id === activeResource);
        setCurrentResource(savedResource ?? RESOURCE_NAMES[0]);
      }

      if (languageCode) {
        setCurrentLanguage(languageCode);
      } else {
        setCurrentLanguage(projectItem.sourceLangCode);
      }

      lastSavedStateRef.current = {
        bookCode: projectItem.book,
        chapterNumber: projectItem.chapterNumber,
        verseNumber: activeVerseId,
        activeResource: activeResource || RESOURCE_NAMES[0].id,
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
        email: userdetail.email,
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
    userdetail.email,
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
      email: userdetail.email,
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
    userdetail.email,
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

  const toggleResources = useCallback(() => {
    setShowResources(prev => !prev);
  }, []);

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
                    ></div>
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

      <div className='flex h-full overflow-hidden'>
        {showResources && isInitializedRef.current && (
          <div className='w-[25%]'>
            <ResourcePanel
              activeVerseId={activeVerseId}
              initialLanguage={currentLanguage}
              initialResource={currentResource}
              resourceNames={RESOURCE_NAMES}
              sourceData={projectItem}
              onLanguageChange={setCurrentLanguage}
              onResourceChange={setCurrentResource}
            />
          </div>
        )}
        <div className={`mx-auto ${showResources ? '' : 'max-w-7xl'} flex-1 overflow-hidden`}>
          <div
            className='ml-2 grid h-full content-start'
            style={{
              gridTemplateColumns: '2rem 1fr 1fr',
              gridTemplateRows: 'auto 1fr',
              scrollbarGutter: 'stable',
            }}
          >
            <div className='sticky top-0 z-10 w-8 px-4 py-3'></div>
            <div className='sticky top-0 z-10 px-6 py-3'>
              <h3 className='text-xl font-semibold'>{projectItem.bibleName}</h3>
            </div>
            <div className='sticky top-0 z-10 px-6 py-3'>
              <h3 className='text-xl font-semibold'>{projectItem.targetLanguage}</h3>
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
                {sourceVerses.map(verse => {
                  const isActive = !readOnly && activeVerseId === verse.verseNumber;
                  const currentTargetVerse = verses.find(v => v.verseNumber === verse.verseNumber);
                  const shouldShowTarget =
                    readOnly || isActive || revealedVerses.has(verse.verseNumber);

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
                        <div
                          className={`bg-card rounded-lg border-2 px-4 py-1 shadow-sm transition-all ${
                            isActive ? 'border-primary' : ''
                          }`}
                        >
                          <p className='min-h-12 leading-relaxed'>{verse.text}</p>
                        </div>
                      </div>

                      <div className={`px-6 ${shouldShowTarget ? 'flex' : 'hidden'}`}>
                        {readOnly ? (
                          <div className='bg-card flex-1 rounded-lg border-2 px-4 py-3 shadow-sm'>
                            <p className='min-h-12 leading-snug'>
                              {currentTargetVerse?.content ?? ''}
                            </p>
                          </div>
                        ) : (
                          <div
                            className={`flex-1 rounded-lg border-2 px-4 py-1 shadow-sm transition-all ${
                              isActive ? 'border-primary' : ''
                            } ${currentTargetVerse?.content.trim() !== '' && !isActive ? 'bg-card' : ''}`}
                            onClick={() => handleActiveVerseChange(verse.verseNumber)}
                          >
                            <textarea
                              ref={el => (textareaRefs.current[verse.verseNumber] = el)}
                              aria-label={`Translation for verse ${verse.verseNumber}`}
                              autoCapitalize='sentences'
                              autoCorrect='on'
                              className='w-full resize-none border-none bg-transparent text-base leading-snug outline-none'
                              placeholder='Enter translation...'
                              spellCheck={true}
                              value={currentTargetVerse?.content ?? ''}
                              onChange={e => handleTextChange(verse.verseNumber, e.target.value)}
                              onFocus={() => handleActiveVerseChange(verse.verseNumber)}
                              onKeyDown={handleKeyDown}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {!readOnly && revealedVerses.size < totalSourceVerses && (
                  <div className='absolute right-4 z-10' style={{ top: buttonTop }}>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className={`bg-primary flex items-center gap-2 px-6 py-2 font-medium shadow-lg transition-all ${
                              lastRevealedVerseHasContent
                                ? 'hover:bg-primary-hover cursor-pointer text-white'
                                : 'cursor-not-allowed bg-gray-300 text-gray-500'
                            }`}
                            disabled={!lastRevealedVerseHasContent}
                            onClick={revealNextVerse}
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
