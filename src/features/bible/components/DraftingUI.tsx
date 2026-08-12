import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate, useRouter } from '@tanstack/react-router';
import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAiSuggestionToast } from '@/features/ai-translation/hooks/useAiSuggestionToast';
import { useAiSuggestions, useTrackAiUsage } from '@/features/bible/hooks/useAiSuggestions';
import { useAddTranslatedVerse, useSubmitChapter } from '@/features/bible/hooks/useBibleTarget';
import { type SavePayload } from '@/features/bible/hooks/useBibleTextDebounce';
import { useChapterPresence } from '@/features/bible/hooks/useChapterPresence';
import { useDrafting } from '@/features/bible/hooks/useDrafting';
import { usePericope } from '@/features/bible/hooks/usePericope';
import {
  type LeftTab,
  useResourceState,
  useSaveResourceState,
} from '@/features/bible/hooks/useResourceStatePersistence';
import { pendingAiAutoFills } from '@/features/bible/lib/ai-autofill';
import { type OccurrenceRules } from '@/features/checks/checks.types';
import { ChecksPanel } from '@/features/checks/components/ChecksPanel';
import { useRepeatedWordsCheck } from '@/features/checks/hooks/useRepeatedWordsCheck';
import { useResolvedFindings } from '@/features/checks/hooks/useResolvedFindings';
import { useSuppressions } from '@/features/checks/hooks/useSuppressions';
import { useFeatureFlag } from '@/features/flags';
import { type BibleVerse } from '@/features/resources/hooks/hooks';
import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import {
  ChapterAssignmentStatus,
  ChapterAssignmentStatusNextAction,
  type DraftingUIProps,
  type ResourceName,
  type Source,
  type VerseMarkers,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

import { DraftingGridPericope, PericopeTargetGroup } from './DraftingGridPericope';
import { DraftingGridVerse, DraftingTargetColumn } from './DraftingGridVerse';
import { DraftingHeader } from './DraftingHeader';
import { DraftingResourceSidebar } from './DraftingResourceSidebar';

const DraftingChapterView = lazy(() =>
  import('./DraftingChapterView').then(module => ({ default: module.DraftingChapterView }))
);

/**
 * Stable empty snapshot for renders before the first check result settles —
 * a module-level constant so the `ChecksPanel` prop reference doesn't change
 * (and re-render) on every DraftingUI render. FindingRow falls back to
 * `finding.surf` on a miss, so "empty" is always safe.
 */
const EMPTY_VERSE_TEXT_SNAPSHOT: ReadonlyMap<string, string> = new Map<string, string>();

const RESOURCE_NAMES: ResourceName[] = [
  { id: 'UWTranslationNotes', name: 'TN' },
  { id: 'Images', name: 'Images & Maps' },
  { id: 'Bibles', name: 'Bibles' },
  { id: 'UWTranslationQuestions', name: 'TQ' },
  { id: 'UWTranslationWords', name: 'TW' },
  { id: 'TyndaleStudyNotes', name: 'OSN' },
];

export const DraftingUI: React.FC<DraftingUIProps> = ({
  projectItem,
  sourceVerses,
  targetVerses,
  userdetail,
  readOnly = false,
}) => {
  const { t } = useTranslation();
  const displayMode = useAppStore(state => state.displayMode);
  // Chapter view owns its own two-pane layout: the shared scroll container below is what keeps the
  // other views' rows level, and a chapter has no rows to keep level (#397).
  const isChapterMode = config.features.rtePericope && displayMode === 'chapter';

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

  // Which left-panel tab is showing (Resources | Checks). Persisted in the
  // editor-state blob as `activeLeftTab` (W11, §6.6).
  const [activeLeftTab, setActiveLeftTab] = useState<LeftTab>('resources');
  // Occurrence-level suppression rules for the Repeated Word Check (cascade
  // layer 2). Held here so they ride the existing debounced editor-state save
  // — the single writer for the blob (§7.1).
  const [occurrenceRules, setOccurrenceRules] = useState<OccurrenceRules>({});
  // Increments on every successful verse auto-save; part of the check query key
  // so the check re-fires exactly on the auto-save event (W3, card #172).
  const [saveCounter, setSaveCounter] = useState(0);

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
    activeLeftTab: LeftTab;
    checkOccurrenceRules: OccurrenceRules;
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

  const trackAiUsageMutation = useTrackAiUsage();

  const saveVerse = useCallback(
    async (verse: number, payload: SavePayload) => {
      const sourceVerse = sourceVerses.find((v: Source) => v.verseNumber === verse);
      if (!sourceVerse) {
        Logger.warn(`Source verse ${verse} not found in sourceVerses.`);
        return;
      }
      // Marker offsets are positions in the exact string the caller measured, so that string has
      // to be what is stored: trimming underneath them shifts every nonzero offset and can leave
      // one past the end of the content. The textarea path carries no offsets and keeps its trim.
      const content = payload.markers === undefined ? payload.content.trim() : payload.content;

      await addVerseMutation.mutateAsync({
        verseData: {
          projectUnitId: projectItem.projectUnitId,
          content,
          bibleTextId: sourceVerse.id,
          assignedUserId: userdetail.id,
          // Only when the caller derived markers (the RTE): the API overwrites stored markers
          // with whatever the upsert says, and an omitted field nulls them (fluent-api#264).
          ...(payload.markers !== undefined ? { markers: payload.markers } : {}),
        },
      });

      if (projectItem.isAiEnabled) {
        trackAiUsageMutation.mutate({
          bibleTextId: sourceVerse.id,
          projectUnitId: projectItem.projectUnitId,
          wasUsed: true,
        });
      }

      // Bump on the successful auto-save event so the Repeated Word Check
      // re-fires (W3, card #172). `useAddTranslatedVerse` doesn't forward
      // mutate-time `onSuccess`, so we bump after the awaited resolve.
      setSaveCounter(c => c + 1);
    },
    [
      addVerseMutation,
      projectItem.projectUnitId,
      sourceVerses,
      userdetail,
      projectItem.isAiEnabled,
      trackAiUsageMutation,
    ]
  );

  const {
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
  } = useDrafting({
    sourceVerses,
    targetVerses,
    readOnly,
    onSave: saveVerse,
  });

  const verseMapping = useMemo(() => {
    const mapping: Record<number, number> = {};
    sourceVerses.forEach((v: Source) => {
      mapping[v.id] = v.verseNumber;
    });
    return mapping;
  }, [sourceVerses]);

  const {
    suggestions: aiSuggestions,
    isAiThresholdMet,
    suggestionStatus,
  } = useAiSuggestions(
    projectItem.projectUnitId,
    projectItem.bibleId,
    projectItem.bookCode,
    projectItem.chapterNumber,
    verseMapping,
    activeVerseId,
    projectItem.isAiEnabled && isDraft
  );

  const fireToast = useAiSuggestionToast();

  useEffect(() => {
    if (isAiThresholdMet && !projectItem.isAiEnabled && isDraft && !readOnly) {
      fireToast(projectItem.targetLanguage);
    }
  }, [
    isAiThresholdMet,
    fireToast,
    projectItem.targetLanguage,
    projectItem.isAiEnabled,
    isDraft,
    readOnly,
  ]);

  const {
    pericopes,
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

  // --- Repeated Word Check wiring (Phase 4, §6.2/§6.6, W3/W10/W11) ----------

  // Feature flag: is the Repeated Word Check enabled in this environment? The
  // whole Checks feature depends on fluent-ai, which isn't hosted everywhere,
  // so the flag lets this code ship hidden until AI is wired (feature-flags
  // proposal D6/D7). Fail-closed: `useFeatureFlag` returns false while loading
  // or on endpoint error, so the tab and the AI query stay off by default. This
  // is the single consumption point — the flag is threaded down as booleans so
  // the leaf components stay flag-agnostic.
  const checksEnabled = useFeatureFlag('repeatedWordCheck');

  // The single writer for the occurrence-rule map: `useSuppressions` does the
  // read-modify-write and hands the next full map back here; updating state
  // makes it ride the existing debounced editor-state save (one writer, §7.1).
  const saveOccurrenceRules = useCallback((next: OccurrenceRules) => {
    setOccurrenceRules(next);
  }, []);

  const {
    occurrenceRules: liveOccurrenceRules,
    globalRules,
    globalIgnoresAvailable,
    settingsProbeResolved,
    ignoreHere,
    ignoreEverywhere,
    undoOccurrence,
    stopIgnoringEverywhere,
    // Gate the once-per-session `GET /self/settings` probe on the same feature
    // flag as the check query: when the Repeated Word Check is off (or still
    // loading / errored — fail-closed) the Checks UI is hidden, so there is no
    // reason to fetch user settings for it (W2, feature-flags proposal D5/D7).
  } = useSuppressions({ occurrenceRules, saveOccurrenceRules, enabled: checksEnabled });

  // What the translator currently sees is what gets checked (§6.2) — feed the
  // live drafting verses, not a refetch.
  const checkVerses = verses.map(v => ({ verseNumber: v.verseNumber, content: v.content }));
  const hasContent = checkVerses.some(v => v.content.trim() !== '');

  const checkQuery = useRepeatedWordsCheck({
    projectItem,
    verses: checkVerses,
    saveCounter,
    // Wait for the settings probe so the first render is cascade-correct, and
    // never run in read-only `/view` or when the chapter is empty (W10/§9.1).
    // Also gate on the feature flag: when the Repeated Word Check is off (or
    // still loading / errored — fail-closed) we suppress the query entirely so
    // no known-failing POST to /ai/tools/... fires in environments where
    // fluent-ai isn't wired (feature-flags proposal D5/D7).
    enabled: checksEnabled && !readOnly && hasContent && settingsProbeResolved,
  });

  const resolved = useResolvedFindings({
    findings: checkQuery.data?.result?.findings ?? [],
    occurrenceRules: liveOccurrenceRules,
    globalRules,
  });

  // As-checked verse-text snapshot, hydrated onto the settled check result by
  // useRepeatedWordsCheck (NOT derived from live `verses` — the findings'
  // offsets are relative to the text as it was checked, so the two must travel
  // together and update only when a new result arrives). `checkQuery.data` is
  // referentially stable per settled result, so this reference only changes
  // when new findings do.
  const verseTextBySntId = checkQuery.data?.verseTextBySntId ?? EMPTY_VERSE_TEXT_SNAPSHOT;

  // Active-finding count drives both notification dots; computed once here and
  // threaded to the tab and the closed-panel toggle button (S5, §6.4). When the
  // Checks feature is disabled it is forced to 0 so neither dot can flash while
  // the flag is resolving (the query is already suppressed above; this guards
  // the count explicitly).
  const activeFindingsCount = checksEnabled ? resolved.active.length : 0;

  // When the Checks tab is hidden (feature off), a persisted `activeLeftTab ===
  // 'checks'` must not strand the panel on an empty/absent tab — fall back to
  // Resources for rendering. The persisted value itself is left untouched, so
  // if the feature is later enabled the translator's last tab is restored.
  const effectiveActiveLeftTab: LeftTab = checksEnabled ? activeLeftTab : 'resources';

  const handleTabChange = useCallback((tab: LeftTab) => {
    setActiveLeftTab(tab);
  }, []);

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
      const { languageCode, tabStatus, activeLeftTab: savedTab } = savedResourceState;
      const savedOccurrenceRules = savedResourceState.checkOccurrenceRules ?? {};

      if (typeof tabStatus === 'boolean') {
        setShowResources(tabStatus);
      }

      if (savedTab === 'resources' || savedTab === 'checks') {
        setActiveLeftTab(savedTab);
      }

      setOccurrenceRules(savedOccurrenceRules);

      setCurrentLanguage(languageCode || projectItem.sourceLangCode);

      lastSavedStateRef.current = {
        bookCode: projectItem.book,
        chapterNumber: projectItem.chapterNumber,
        verseNumber: activeVerseId,
        activeResource: RESOURCE_NAMES[0].id,
        languageCode: languageCode || projectItem.sourceLangCode,
        tabStatus: typeof tabStatus === 'boolean' ? tabStatus : false,
        activeLeftTab: savedTab === 'checks' ? 'checks' : 'resources',
        checkOccurrenceRules: savedOccurrenceRules,
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
        activeLeftTab: 'resources',
        checkOccurrenceRules: {},
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
      activeLeftTab,
      checkOccurrenceRules: occurrenceRules,
    };

    if (lastSavedStateRef.current) {
      const hasChanged =
        lastSavedStateRef.current.bookCode !== currentState.bookCode ||
        lastSavedStateRef.current.chapterNumber !== currentState.chapterNumber ||
        lastSavedStateRef.current.verseNumber !== currentState.verseNumber ||
        lastSavedStateRef.current.activeResource !== currentState.activeResource ||
        lastSavedStateRef.current.languageCode !== currentState.languageCode ||
        lastSavedStateRef.current.tabStatus !== currentState.tabStatus ||
        lastSavedStateRef.current.activeLeftTab !== currentState.activeLeftTab ||
        // Occurrence rules are replaced by-reference on every write (the hook
        // returns a fresh map), so an identity check is sufficient and cheap.
        lastSavedStateRef.current.checkOccurrenceRules !== currentState.checkOccurrenceRules;

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
    activeLeftTab,
    occurrenceRules,
    activeVerseId,
    projectItem.chapterAssignmentId,
    projectItem.book,
    projectItem.chapterNumber,
    projectItem.sourceLangCode,
    saveResourceStateMutation,
  ]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      updateButtonPosition();
    });
    return () => cancelAnimationFrame(handle);
  }, [selectedPanel, bibleContentLoading, bibleVerses.length, updateButtonPosition]);

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
      .map(verse =>
        saveImmediately(verse.verseNumber, { content: verse.content, markers: verse.markers })
      );

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

  // Keep track of verses that the user has manually typed in or that have been
  // auto-populated, so we never auto-populate a verse the user is working on.
  const userTouchedVersesRef = useRef<Set<number>>(new Set());

  const handleTextChangeWithTracking = useCallback(
    (verseNumber: number, text: string, markers?: VerseMarkers | null) => {
      userTouchedVersesRef.current.add(verseNumber);
      handleTextChange(verseNumber, text, markers);
    },
    [handleTextChange]
  );

  useEffect(() => {
    if (!projectItem.isAiEnabled || !isDraft || readOnly) return;

    // Which verses a suggestion may land in. The textarea path shows one verse at a time, so it
    // fills the verse in focus. The pericope editor shows the whole pericope at once, so the
    // pericope populates progressively, verse by verse, as each suggestion arrives (#314).
    const candidateVerseNumbers =
      config.features.rtePericope && currentPericopeGroup
        ? currentPericopeGroup.verses.map(verse => verse.verseNumber)
        : [activeVerseId];

    pendingAiAutoFills({
      candidateVerseNumbers,
      verses,
      suggestions: aiSuggestions,
      touchedVerseNumbers: userTouchedVersesRef.current,
    }).forEach(fill => {
      userTouchedVersesRef.current.add(fill.verseNumber);
      // The verse's own markers ride along: a fill that dropped them would null the paragraph
      // structure of a verse the translator laid out and left empty (#400 review).
      handleTextChange(fill.verseNumber, fill.text, fill.markers);
    });
  }, [
    activeVerseId,
    currentPericopeGroup,
    aiSuggestions,
    verses,
    handleTextChange,
    projectItem.isAiEnabled,
    isDraft,
    readOnly,
  ]);

  // Recalculate floating button position when AI suggestions load or fail (which changes row height)
  useEffect(() => {
    updateButtonPosition();
  }, [suggestionStatus, aiSuggestions, updateButtonPosition]);

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

  const renderPanelTwoPlaceholder = useCallback(
    (middleContent: React.ReactNode, isCenter = true) => {
      if (isPericopeMode && pericopes) {
        return (
          <div className='grid h-full items-start py-4' style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className={`flex h-full justify-center px-6 ${isCenter ? 'items-center' : ''}`}>
              <div
                className={`bg-muted flex h-full w-full justify-center rounded-lg border-2 ${isCenter ? 'items-center' : 'pt-10'}`}
              >
                {middleContent}
              </div>
            </div>
            <div className='flex flex-col space-y-4 px-6'>
              {pericopes.map((group, groupIndex) => {
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

                const isGroupActive = groupVerses.some(gv => gv.verseNumber === activeVerseId);

                return (
                  <div key={group.pericopeNumber} className='flex w-full flex-col space-y-2'>
                    <h4 className='text-base font-bold text-slate-800 select-none dark:text-slate-200'>
                      {heading}
                    </h4>
                    <div
                      className={`dark:bg-card w-full cursor-pointer space-y-1 rounded-[12px] border-2 bg-[#f0f4f9] p-5 transition-all ${
                        isGroupActive ? 'border-primary' : 'dark:border-border border-[#cfd8e3]'
                      }`}
                      onClick={e => {
                        if (e.target === e.currentTarget) {
                          const isGroupAlreadyActive = groupVerses.some(
                            gv => gv.verseNumber === activeVerseId
                          );
                          if (!isGroupAlreadyActive) {
                            handleActiveVerseChange(groupVerses[0].verseNumber);
                          }
                        }
                      }}
                    >
                      <PericopeTargetGroup
                        activeVerseId={activeVerseId}
                        aiSuggestions={aiSuggestions}
                        globalNextUntouchedVerse={globalNextUntouchedVerse}
                        groupIndex={groupIndex}
                        groupVerses={groupVerses}
                        handleActiveVerseChange={handleActiveVerseChange}
                        handleKeyDown={handleKeyDown}
                        handleNextClick={handleNextClick}
                        handleNextPericopeClick={handleNextPericopeClick}
                        handleTextChange={handleTextChangeWithTracking}
                        isAiActive={!!(projectItem.isAiEnabled && isDraft)}
                        isAiThresholdMet={isAiThresholdMet ?? false}
                        isTranslationComplete={isTranslationComplete}
                        pericopes={pericopes}
                        projectItem={projectItem}
                        readOnly={readOnly}
                        sourceVerses={sourceVerses}
                        suggestionStatus={suggestionStatus}
                        textareaRefs={textareaRefs}
                        verses={verses}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div
          className='grid h-full items-start py-4'
          style={{ gridTemplateColumns: '2rem 1fr 1fr' }}
        >
          <div className='w-8' />
          <div className={`flex h-full justify-center px-6 ${isCenter ? 'items-center' : ''}`}>
            <div
              className={`bg-muted flex h-full w-full justify-center rounded-lg border-2 ${isCenter ? 'items-center' : 'pt-10'}`}
            >
              {middleContent}
            </div>
          </div>
          <div className='flex flex-col'>
            {sourceVerses.map(verse => (
              <div
                key={verse.verseNumber}
                ref={el => {
                  verseRefs.current[verse.verseNumber] = el;
                }}
                className='py-4'
              >
                <DraftingTargetColumn
                  activeVerseId={activeVerseId}
                  aiSuggestions={aiSuggestions}
                  effectiveRevealedVerses={effectiveRevealedVerses}
                  handleActiveVerseChange={handleActiveVerseChange}
                  handleKeyDown={handleKeyDown}
                  handleTextChange={handleTextChangeWithTracking}
                  isAiActive={!!(projectItem.isAiEnabled && isDraft)}
                  isAiThresholdMet={isAiThresholdMet ?? false}
                  readOnly={readOnly}
                  suggestionStatus={suggestionStatus}
                  textareaRefs={textareaRefs}
                  verseNumber={verse.verseNumber}
                  verses={verses}
                />
              </div>
            ))}
          </div>
        </div>
      );
    },
    [
      isPericopeMode,
      pericopes,
      sourceVerses,
      projectItem,
      activeVerseId,
      globalNextUntouchedVerse,
      handleActiveVerseChange,
      handleKeyDown,
      handleNextClick,
      handleNextPericopeClick,
      handleTextChangeWithTracking,
      isTranslationComplete,
      isDraft,
      readOnly,
      textareaRefs,
      verses,
      aiSuggestions,
      effectiveRevealedVerses,
      isAiThresholdMet,
      suggestionStatus,
      verseRefs,
    ]
  );

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <DraftingHeader
        activeFindingsCount={activeFindingsCount}
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
            activeFindingsCount={activeFindingsCount}
            activeLeftTab={effectiveActiveLeftTab}
            checksContent={
              <ChecksPanel
                globalIgnoresAvailable={globalIgnoresAvailable}
                isError={checkQuery.isError}
                resolved={resolved}
                verseTextBySntId={verseTextBySntId}
                onIgnoreEverywhere={ignoreEverywhere}
                onIgnoreHere={ignoreHere}
                onStopIgnoringEverywhere={stopIgnoringEverywhere}
                onUndo={undoOccurrence}
              />
            }
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
            showChecksTab={checksEnabled}
            onTabChange={handleTabChange}
          />
        )}

        <div className='w-full flex-1 overflow-hidden'>
          {isChapterMode ? (
            <Suspense fallback={null}>
              <DraftingChapterView
                bibleVerseMap={bibleVerseMap}
                handleActiveVerseChange={handleActiveVerseChange}
                handleTextChange={handleTextChangeWithTracking}
                projectItem={projectItem}
                readOnly={readOnly}
                selectedPanel={selectedPanel}
                sourceVerses={sourceVerses}
                verses={verses}
              />
            </Suspense>
          ) : (
            <div
              className={`${showResources ? 'ml-0' : 'ml-2'} grid h-full w-full content-start`}
              style={{
                gridTemplateColumns: isPericopeMode ? '1fr 1fr' : '2rem 1fr 1fr',
                gridTemplateRows: 'auto 1fr',
                scrollbarGutter: 'stable',
              }}
            >
              {!isPericopeMode && <div className='bg-background sticky top-0 z-10 w-8 px-4 py-3' />}
              <div className='bg-background sticky top-0 z-10 flex items-center gap-1 px-6 py-3'>
                <button
                  className={`dark:text-foreground cursor-pointer text-2xl font-bold text-slate-800 transition-colors ${
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
                    <span className='dark:text-foreground mx-2 text-2xl font-bold text-slate-800 select-none'>
                      |
                    </span>
                    <button
                      className={`cursor-pointer text-2xl font-bold transition-colors ${
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
                <h3 className='dark:text-foreground text-2xl font-bold text-slate-800'>
                  {projectItem.targetLanguage}
                </h3>
              </div>

              <div
                className={`col-span-full flex flex-col overflow-hidden ${showResources ? 'h-full rounded-md border' : ''}`}
              >
                <div
                  ref={targetScrollRef}
                  className='relative flex h-full flex-col overflow-y-auto'
                  style={{ scrollbarGutter: 'stable' }}
                  onScroll={() => !readOnly && updateButtonPosition()}
                >
                  {selectedPanel === 2 &&
                    bibleContentLoading &&
                    renderPanelTwoPlaceholder(
                      <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />,
                      true
                    )}

                  {selectedPanel === 2 &&
                    !bibleContentLoading &&
                    bibleVerses.length === 0 &&
                    renderPanelTwoPlaceholder(
                      <p className='text-muted-foreground px-6 text-center text-sm'>
                        {t('noContentAvailable')}
                      </p>,
                      false
                    )}

                  {!(selectedPanel === 2 && (bibleContentLoading || bibleVerses.length === 0)) && (
                    <>
                      {displayMode === 'pericope' && isPericopeLoading ? (
                        <div className='flex h-full items-center justify-center py-12'>
                          <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
                        </div>
                      ) : isPericopeMode && pericopes ? (
                        <DraftingGridPericope
                          activeVerseId={activeVerseId}
                          aiSuggestions={aiSuggestions}
                          bibleVerseMap={bibleVerseMap}
                          globalNextUntouchedVerse={globalNextUntouchedVerse}
                          handleActiveVerseChange={handleActiveVerseChange}
                          handleKeyDown={handleKeyDown}
                          handleNextClick={handleNextClick}
                          handleNextPericopeClick={handleNextPericopeClick}
                          handleTextChange={handleTextChangeWithTracking}
                          isAiActive={!!(projectItem.isAiEnabled && isDraft)}
                          isAiThresholdMet={isAiThresholdMet ?? false}
                          isTranslationComplete={isTranslationComplete}
                          pericopes={pericopes}
                          projectItem={projectItem}
                          readOnly={readOnly}
                          selectedPanel={selectedPanel}
                          sourceVerses={sourceVerses}
                          suggestionStatus={suggestionStatus}
                          textareaRefs={textareaRefs}
                          verseRefs={verseRefs}
                          verses={verses}
                        />
                      ) : (
                        <DraftingGridVerse
                          activeVerseId={activeVerseId}
                          aiSuggestions={aiSuggestions}
                          bibleVerseMap={bibleVerseMap}
                          effectiveRevealedVerses={effectiveRevealedVerses}
                          getPericopeStyle={getPericopeStyle}
                          handleActiveVerseChange={handleActiveVerseChange}
                          handleKeyDown={handleKeyDown}
                          handleTextChange={handleTextChangeWithTracking}
                          isAiActive={!!(projectItem.isAiEnabled && isDraft)}
                          isAiThresholdMet={isAiThresholdMet ?? false}
                          readOnly={readOnly}
                          selectedPanel={selectedPanel}
                          sourceVerses={sourceVerses}
                          suggestionStatus={suggestionStatus}
                          textareaRefs={textareaRefs}
                          verseRefs={verseRefs}
                          verses={verses}
                        />
                      )}
                    </>
                  )}

                  {!readOnly &&
                    !isPericopeMode &&
                    !isPericopeLoading &&
                    lastRevealedVerseNumber < totalSourceVerses && (
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
                                {t('nextVerse', 'Next Verse')}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent
                              align='center'
                              className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
                              side='top'
                              sideOffset={8}
                            >
                              <div className='flex items-center gap-2'>
                                <span>{t('nextVerse', 'Next Verse')}</span>
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
          )}
        </div>
      </div>
    </div>
  );
};
