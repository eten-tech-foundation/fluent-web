import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate, useRouter } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
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
import { usePericopeContext } from '@/features/bible/hooks/usePericopeContext';
import {
  type LeftTab,
  useResourceState,
  useSaveResourceState,
} from '@/features/bible/hooks/useResourceStatePersistence';
import { pendingAiAutoFills } from '@/features/bible/lib/ai-autofill';
import { pericopeSuggestionScope } from '@/features/bible/lib/ai-suggestion-scope';
import {
  canSetPericopeTitle,
  getPericopeTitle,
  withPericopeTitle,
} from '@/features/bible/lib/pericope-title';
import { type OccurrenceRules } from '@/features/checks/checks.types';
import { ChecksPanel } from '@/features/checks/components/ChecksPanel';
import { useRepeatedWordsCheck } from '@/features/checks/hooks/useRepeatedWordsCheck';
import { useResolvedFindings } from '@/features/checks/hooks/useResolvedFindings';
import { useSuppressions } from '@/features/checks/hooks/useSuppressions';
import { useFeatureFlag, useFeatureFlags } from '@/features/flags';
import { type BibleVerse } from '@/features/resources/hooks/hooks';
import { isValidHeadingText } from '@/features/rte/lib/heading-markers';
import {
  ServerTtsEngine,
  type TtsRowDraft,
  useSourceTtsPlayback,
  useTtsKeyboardShortcuts,
} from '@/features/tts';
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

import { BibleTabList, type ResourceBibleTab, SOURCE_BIBLE_TAB_ID } from './BibleTabList';
import { DraftingGridPericope } from './DraftingGridPericope';
import { DraftingGridVerse, DraftingTargetColumn } from './DraftingGridVerse';
import { DraftingHeader } from './DraftingHeader';
import { DraftingResourceSidebar } from './DraftingResourceSidebar';
import { PericopeText } from './PericopeText';

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
const EMPTY_BIBLE_VERSES: BibleVerse[] = [];

const BIBLES_RESOURCE: ResourceName = { id: 'Bibles', name: 'Bibles' };

const RESOURCE_NAMES: ResourceName[] = [
  { id: 'UWTranslationNotes', name: 'TN' },
  { id: 'Images', name: 'Images & Maps' },
  BIBLES_RESOURCE,
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
  const roleChangeWarning = useAppStore(state => state.roleChangeWarning);
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

  // The source tab is permanent; every Resources Bible keeps its own keyed
  // content so selecting another one cannot replace either the source or a
  // previously opened resource Bible (#471).
  const [activeBibleTabId, setActiveBibleTabId] = useState(SOURCE_BIBLE_TAB_ID);
  const [resourceBibleTabs, setResourceBibleTabs] = useState<ResourceBibleTab[]>([]);
  const [resourcePanelSelectedBibleId, setResourcePanelSelectedBibleId] = useState<string | null>(
    null
  );

  const activeResourceBibleTab = resourceBibleTabs.find(tab => tab.id === activeBibleTabId);
  const selectedPanel: 1 | 2 = activeResourceBibleTab ? 2 : 1;
  const bibleVerses = activeResourceBibleTab?.verses ?? EMPTY_BIBLE_VERSES;
  const bibleContentLoading = activeResourceBibleTab?.isLoading ?? false;
  const bibleContentError = activeResourceBibleTab?.isError ?? false;

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
  const trackAiUsage = trackAiUsageMutation.mutate;

  // Only scripture actually filled from AI can be recorded as an accepted verse draft.
  const aiFilledVersesRef = useRef(new Set<string>());
  const aiUsageInFlightRef = useRef(new Set<string>());

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

      try {
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
      } catch (err: unknown) {
        throw err;
      }

      const aiFillKey = `${projectItem.chapterAssignmentId}/${verse}`;
      if (!content.trim()) {
        aiFilledVersesRef.current.delete(aiFillKey);
      } else if (
        aiFilledVersesRef.current.has(aiFillKey) &&
        !aiUsageInFlightRef.current.has(aiFillKey)
      ) {
        aiUsageInFlightRef.current.add(aiFillKey);
        void trackAiUsageMutation
          .mutateAsync({
            bibleTextId: sourceVerse.id,
            projectUnitId: projectItem.projectUnitId,
            wasUsed: true,
          })
          .then(() => aiFilledVersesRef.current.delete(aiFillKey))
          .catch(() => {
            // The mutation logs the error; retain the marker so a later save can retry.
          })
          .finally(() => aiUsageInFlightRef.current.delete(aiFillKey));
      }

      // Bump on the successful auto-save event so the Repeated Word Check
      // re-fires (W3, card #172). `useAddTranslatedVerse` doesn't forward
      // mutate-time `onSuccess`, so we bump after the awaited resolve.
      setSaveCounter(c => c + 1);
    },
    [
      addVerseMutation,
      projectItem.projectUnitId,
      projectItem.chapterAssignmentId,
      sourceVerses,
      userdetail,
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
    pericopes,
    fullPericopes,
    isPericopeMode,
    isPericopeLoading,
    isPericopeError,
    refetchPericopes,
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

  const aiScope = useMemo(
    () =>
      isPericopeMode && pericopes
        ? pericopeSuggestionScope(pericopes, activeVerseId, sourceVerses, targetVerses)
        : undefined,
    [isPericopeMode, pericopes, activeVerseId, sourceVerses, targetVerses]
  );

  // Remember translator-owned inputs even when they are intentionally cleared, so AI does not
  // immediately request and refill them while the translator is still working.
  const userTouchedVersesRef = useRef<Set<number>>(new Set());
  const touchedTitlesRef = useRef(new Set<number>());
  const wasAiEnabledRef = useRef(projectItem.isAiEnabled);
  const isAiJustEnabled = projectItem.isAiEnabled && !wasAiEnabledRef.current;

  const {
    suggestions: aiSuggestions,
    headingSuggestions = {},
    isAiThresholdMet,
    suggestionStatus,
  } = useAiSuggestions(
    projectItem.projectUnitId,
    projectItem.bibleId,
    projectItem.bookCode,
    projectItem.chapterNumber,
    verseMapping,
    activeVerseId,
    projectItem.isAiEnabled && isDraft && !readOnly,
    {
      pericope: aiScope,
      canSuggest: isDraft && !readOnly && !(displayMode === 'pericope' && isPericopeLoading),
      titledVerseNumbers: verses
        .filter(
          verse => Boolean(getPericopeTitle(verse.markers)) || !canSetPericopeTitle(verse.markers)
        )
        .map(verse => verse.verseNumber),
      touchedTitleVerseNumbers: isAiJustEnabled ? [] : [...touchedTitlesRef.current],
      draftedVerseNumbers: verses
        .filter(verse => verse.content.trim())
        .map(verse => verse.verseNumber),
    }
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
  // Pericope mode handles missing resource content inside each group, so a crossing
  // group can still show its available neighboring chapter.
  const showResourceBiblePlaceholder =
    selectedPanel === 2 && !isPericopeMode && !bibleVerses.some(verse => verse.text.trim());
  const pericopeContext = usePericopeContext({
    projectItem,
    pericopes: fullPericopes,
    enabled: isPericopeMode,
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

  // Feature flag: is Source-Text TTS enabled here? Same reasoning as the
  // Checks flag above — synthesis depends on fluent-ai, which isn't hosted
  // everywhere, so this ships hidden until the audio path is wired
  // (source-tts §6.3, T12). Fail-closed by construction: `useFeatureFlag`
  // returns false while loading and on endpoint error, so no controls render
  // and no assignment lookup runs until the API positively says yes. Local
  // overrides are NOT consulted here for GATING — they are applied once inside
  // `useFeatureFlags`, so a forced-on flag reaches this boolean unchanged.
  //
  // `useFeatureFlags` rather than `useFeatureFlag` because the verification
  // tint below needs the raw override too, and `flagOverrides.ts` permits
  // exactly ONE site to consult overrides. Taking both from this one call
  // keeps that invariant; a second `useFlagOverrides()` here would be the
  // drift it warns about.
  const { features: ttsFeatures, overrides: ttsOverrides } = useFeatureFlags();
  const ttsEnabled = ttsFeatures.sourceAudio;

  // Verification affordance, NOT a product feature (§9.2): tint the playback
  // wash when a clip came from the artifact store, so a deployer can see that
  // R2 is really serving rather than every listen silently paying for a fresh
  // synthesis — the two are indistinguishable by ear.
  //
  // Keyed to a FORCE-ON override rather than to the flag itself, so ordinary
  // listeners never meet a colour they cannot interpret. Forcing on a flag
  // that is already on is a no-op for everything else, which makes this an
  // easy switch to reach for while verifying. Costs nothing to compute — the
  // container is read off the clip URL the engine already has — so only the
  // DISPLAY is gated, not the recording.
  const ttsShowServing = ttsOverrides.sourceAudio === true;

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

  // Reset assignment-local state without remounting and discarding pending verse saves.
  useEffect(() => {
    setActiveBibleTabId(SOURCE_BIBLE_TAB_ID);
    setResourceBibleTabs([]);
    setResourcePanelSelectedBibleId(null);
    setCurrentResource(RESOURCE_NAMES[0]);
    setCurrentLanguage('');
    setShowResources(false);
    setActiveLeftTab('resources');
    setOccurrenceRules({});
    isInitializedRef.current = false;
    lastSavedStateRef.current = null;
    userTouchedVersesRef.current.clear();
    touchedTitlesRef.current.clear();
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, [projectItem.chapterAssignmentId]);

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
    projectItem.chapterAssignmentId,
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

    try {
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
    } catch {
      // Permission errors (403/401/404) are handled centrally
      // by useBibleTarget.ts mutation onError handlers.
    }
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

  const handleTextChangeWithTracking = useCallback(
    (verseNumber: number, text: string, markers?: VerseMarkers | null) => {
      userTouchedVersesRef.current.add(verseNumber);
      handleTextChange(verseNumber, text, markers);
    },
    [handleTextChange]
  );

  const handleTitleChange = useCallback(
    (verseNumber: number, title: string) => {
      touchedTitlesRef.current.add(verseNumber);
      if (title.trim() && !isValidHeadingText(title)) return;
      const target = verses.find(verse => verse.verseNumber === verseNumber);
      if (!target || readOnly || (title.trim() && !canSetPericopeTitle(target.markers))) return;
      handleTextChange(verseNumber, target.content, withPericopeTitle(target.markers, title));
    },
    [verses, readOnly, handleTextChange]
  );

  useEffect(() => {
    const justEnabled = projectItem.isAiEnabled && !wasAiEnabledRef.current;
    wasAiEnabledRef.current = projectItem.isAiEnabled;
    if (!projectItem.isAiEnabled || !isDraft || readOnly) return;

    // An explicit opt-in is a new request for every empty input. While AI stays
    // on, clearing a verse still leaves it alone so the drafter can type.
    if (justEnabled) {
      verses.forEach(verse => {
        if (!verse.content.trim()) userTouchedVersesRef.current.delete(verse.verseNumber);
        if (!getPericopeTitle(verse.markers)) touchedTitlesRef.current.delete(verse.verseNumber);
      });
    }

    // Both pericope surfaces display the whole group, independent of cursor focus.
    const candidateVerseNumbers = currentPericopeGroup
      ? sourceVerses
          .filter(source =>
            currentPericopeGroup.verses.some(
              verse =>
                verse.chapterNumber === projectItem.chapterNumber &&
                verse.verseNumber === source.verseNumber
            )
          )
          .map(verse => verse.verseNumber)
      : [activeVerseId];

    const fills = pendingAiAutoFills({
      candidateVerseNumbers,
      verses,
      suggestions: aiSuggestions,
      touchedVerseNumbers: userTouchedVersesRef.current,
    });
    const firstSource = sourceVerses.find(verse => verse.verseNumber === candidateVerseNumbers[0]);
    const firstTarget = verses.find(verse => verse.verseNumber === firstSource?.verseNumber);
    const heading = currentPericopeGroup && headingSuggestions[currentPericopeGroup.pericopeNumber];
    const titleFill =
      currentPericopeGroup?.pericopeTitle?.trim() &&
      firstTarget &&
      firstSource &&
      !getPericopeTitle(firstTarget.markers) &&
      canSetPericopeTitle(firstTarget.markers) &&
      !touchedTitlesRef.current.has(firstTarget.verseNumber) &&
      heading?.bibleTextId === firstSource.id &&
      isValidHeadingText(heading.suggestedText)
        ? {
            verseNumber: firstTarget.verseNumber,
            markers: withPericopeTitle(firstTarget.markers, heading.suggestedText),
          }
        : undefined;
    if (titleFill) touchedTitlesRef.current.add(titleFill.verseNumber);

    fills.forEach(fill => {
      aiFilledVersesRef.current.add(`${projectItem.chapterAssignmentId}/${fill.verseNumber}`);
      userTouchedVersesRef.current.add(fill.verseNumber);
      // The verse's own markers ride along: a fill that dropped them would null the paragraph
      // structure of a verse the translator laid out and left empty (#400 review).
      handleTextChange(
        fill.verseNumber,
        fill.text,
        titleFill?.verseNumber === fill.verseNumber ? titleFill.markers : fill.markers
      );
      const source = sourceVerses.find(verse => verse.verseNumber === fill.verseNumber);
      if (source) {
        trackAiUsage({
          bibleTextId: source.id,
          projectUnitId: projectItem.projectUnitId,
          wasUsed: false,
        });
      }
    });
    if (titleFill && firstTarget && firstSource && currentPericopeGroup) {
      if (!fills.some(fill => fill.verseNumber === titleFill.verseNumber)) {
        handleTextChange(titleFill.verseNumber, firstTarget.content, titleFill.markers);
      }
      trackAiUsage({
        bibleTextId: firstSource.id,
        projectUnitId: projectItem.projectUnitId,
        pericopeNumber: currentPericopeGroup.pericopeNumber,
        wasUsed: false,
      });
    }
  }, [
    activeVerseId,
    headingSuggestions,
    currentPericopeGroup,
    aiSuggestions,
    verses,
    handleTextChange,
    projectItem.isAiEnabled,
    projectItem.projectUnitId,
    projectItem.chapterAssignmentId,
    projectItem.chapterNumber,
    sourceVerses,
    trackAiUsage,
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

  const handleBibleSelect = useCallback(
    (bible: { id: string; label: string; language: string }) => {
      setResourcePanelSelectedBibleId(bible.id);
      setResourceBibleTabs(currentTabs => {
        const existing = currentTabs.find(tab => tab.id === bible.id);
        if (existing) {
          if (existing.label === bible.label && existing.language === bible.language)
            return currentTabs;
          return currentTabs.map(tab => (tab.id === bible.id ? { ...tab, ...bible } : tab));
        }

        return [...currentTabs, { ...bible, verses: [], isLoading: true, isError: false }];
      });
      setActiveBibleTabId(bible.id);
    },
    []
  );

  const handleBibleTabSelect = useCallback(
    (tabId: string) => {
      setActiveBibleTabId(tabId);
      if (tabId === SOURCE_BIBLE_TAB_ID) return;

      setResourcePanelSelectedBibleId(tabId);
      const tab = resourceBibleTabs.find(tab => tab.id === tabId);
      if (tab) setCurrentLanguage(tab.language);
      if (tab?.isLoading) {
        setCurrentResource(BIBLES_RESOURCE);
        setActiveLeftTab('resources');
        setShowResources(true);
      }
    },
    [resourceBibleTabs]
  );

  const handleBibleVersesChange = useCallback((bibleId: string, nextVerses: BibleVerse[]) => {
    setResourceBibleTabs(currentTabs =>
      currentTabs.map(tab => (tab.id === bibleId ? { ...tab, verses: nextVerses } : tab))
    );
  }, []);

  const handleBibleLoadingChange = useCallback((bibleId: string, isLoading: boolean) => {
    setResourceBibleTabs(currentTabs =>
      currentTabs.map(tab => (tab.id === bibleId ? { ...tab, isLoading } : tab))
    );
  }, []);

  const handleBibleErrorChange = useCallback((bibleId: string, isError: boolean) => {
    setResourceBibleTabs(currentTabs =>
      currentTabs.map(tab => (tab.id === bibleId ? { ...tab, isError } : tab))
    );
  }, []);

  const toggleResources = useCallback(() => {
    setShowResources(prev => !prev);
  }, []);

  const handleBibleTabClose = useCallback(
    (bibleId: string) => {
      setResourceBibleTabs(currentTabs => currentTabs.filter(tab => tab.id !== bibleId));
      setActiveBibleTabId(currentId => (currentId === bibleId ? SOURCE_BIBLE_TAB_ID : currentId));

      if (resourcePanelSelectedBibleId === bibleId) {
        clearBibleRef.current?.();
        setResourcePanelSelectedBibleId(null);
      }
    },
    [resourcePanelSelectedBibleId]
  );

  // O(1) verse lookup for the bible panel left column
  const bibleVerseMap = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    bibleVerses.forEach(v => map.set(v.verseNumber, v.text));
    return map;
  }, [bibleVerses]);

  // ─── Source-Text TTS (source-tts §5.1/§5.3) ────────────────────────────────
  //
  // T17: BOTH source panels are listenable, and each is read in ITS OWN
  // language. Panel 1 is the project's source text, so it carries
  // `sourceLangCode`; panel 2 is whichever reference Bible the user opened, so
  // it carries that Bible's language as reported by the resource panel. Using
  // the project's source code for someone else's Bible would ask the engine to
  // read, say, Hindi text as Greek. A panel-2 row with no verse simply has no
  // text, which is what makes its controls disabled (§5.1) — the row is not
  // silently skipped-over-and-clickable.
  const ttsRows = useMemo<TtsRowDraft[]>(
    () =>
      sourceVerses.map(verse => ({
        verseRef: String(verse.verseNumber),
        text: selectedPanel === 1 ? verse.text : bibleVerseMap.get(verse.verseNumber),
        // T18: sent when known. `currentLanguage` is the reference Bible's
        // code and already falls back to the source code when unknown.
        langCode: selectedPanel === 1 ? projectItem.sourceLangCode : currentLanguage,
        // Provenance travels with the item rather than being re-derived from
        // panel state later (T17).
        audioSource: selectedPanel === 1 ? 'projectSource' : 'referenceBible',
      })),
    [sourceVerses, selectedPanel, bibleVerseMap, projectItem.sourceLangCode, currentLanguage]
  );

  // A single engine for the page: a thin seam over the API route (§6.1), no
  // per-verse state, so it must not be rebuilt on every render.
  const ttsEngine = useMemo(() => new ServerTtsEngine(), []);

  // Playback highlight geometry: the row elements the grid already registers,
  // measured against the target column's scroll container.
  const getTtsRowElement = useCallback(
    (verseRef: string) => verseRefs.current[Number(verseRef)],
    [verseRefs]
  );
  const getTtsViewport = useCallback(() => targetScrollRef.current, [targetScrollRef]);

  const tts = useSourceTtsPlayback({
    engine: ttsEngine,
    rows: ttsRows,
    getRowElement: getTtsRowElement,
    getViewport: getTtsViewport,
    // Page-lifetime playback state is dropped on this key: the drafting route
    // swaps chapters without unmounting. Read-only `/view` uses the same guard.
    pageKey: String(projectItem.chapterAssignmentId),
    // The hook cannot be skipped when the flag is off (React forbids a
    // conditional hook call), so the gate is passed in. This is the MERGED
    // flag, so a local force-on keeps playback enabled (O3/O4).
    enabled: ttsEnabled,
  });

  // Row identity for the queue is the verse number as a string; the grid asks
  // for it rather than assuming a format (T3).
  const ttsVerseRefFor = useCallback((verseNumber: number) => String(verseNumber), []);

  // Alt+P / Alt+Shift+P / Alt+S (§12.1 Keyboard). Mounted HERE, and only here,
  // because the shortcuts act on the host's notion of the active verse (T2) —
  // the row the caret is in — which is drafting's state, not the queue's. The
  // playing row and the active row are deliberately different things: a
  // translator keeps typing in verse 4 while verse 2 is being read aloud, and
  // Alt+P then plays 4.
  //
  // `enabled` is the flag gate, not an activity gate: Stop must work whenever
  // the feature is on, including while a clip is still loading.
  useTtsKeyboardShortcuts({
    enabled: ttsEnabled,
    onPlayVerse: () => tts.playVerse(ttsVerseRefFor(activeVerseId)),
    onPlayFromHere: () => tts.playFromVerse(ttsVerseRefFor(activeVerseId)),
    onStop: tts.stop,
  });

  // G3a: pericope mode's own props. A different shape from the verse grid's on
  // purpose — that surface has no per-row control and no "play from here", so
  // handing it the row API would advertise behaviour it does not offer.
  // Undefined when the flag is off, exactly like the verse-mode props.
  const ttsPericopeGridProps = useMemo(
    () =>
      ttsEnabled
        ? {
            isBusy: tts.isBusy,
            isRowPlayable: tts.isRowPlayable,
            isRowLoading: tts.isRowLoading,
            activeVerseRef: tts.activeVerseRef,
            isGroupSpeaking: tts.isGroupSpeaking,
            playGroup: tts.playGroup,
            playFromGroup: tts.playFromGroup,
            stop: tts.stop,
            verseRefFor: ttsVerseRefFor,
            servingFor: ttsShowServing ? tts.servingFor : undefined,
          }
        : undefined,
    [
      ttsEnabled,
      tts.isBusy,
      tts.isRowPlayable,
      tts.isRowLoading,
      tts.activeVerseRef,
      tts.isGroupSpeaking,
      ttsShowServing,
      tts.servingFor,
      tts.playGroup,
      tts.playFromGroup,
      tts.stop,
      ttsVerseRefFor,
    ]
  );

  // Undefined when the flag is off — the grid then renders exactly as before.
  const ttsGridProps = useMemo(
    () =>
      ttsEnabled
        ? {
            activeVerseRef: tts.activeVerseRef,
            isBusy: tts.isBusy,
            isRowPlayable: tts.isRowPlayable,
            isRowLoading: tts.isRowLoading,
            playVerse: tts.playVerse,
            playFromVerse: tts.playFromVerse,
            stop: tts.stop,
            verseRefFor: ttsVerseRefFor,
            servingFor: ttsShowServing ? tts.servingFor : undefined,
          }
        : undefined,
    [
      ttsEnabled,
      tts.activeVerseRef,
      tts.isBusy,
      tts.isRowPlayable,
      tts.isRowLoading,
      tts.playVerse,
      tts.playFromVerse,
      tts.stop,
      ttsVerseRefFor,
      ttsShowServing,
      tts.servingFor,
    ]
  );

  const renderPanelTwoPlaceholder = useCallback(
    (middleContent: React.ReactNode, isCenter = true) => {
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
      sourceVerses,
      projectItem,
      activeVerseId,
      handleActiveVerseChange,
      handleKeyDown,
      handleTextChangeWithTracking,
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
            key={projectItem.chapterAssignmentId}
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
            selectedBibleId={resourcePanelSelectedBibleId}
            setCurrentLanguage={setCurrentLanguage}
            setCurrentResource={setCurrentResource}
            showChecksTab={checksEnabled}
            onBibleErrorChange={handleBibleErrorChange}
            onBibleLoadingChange={handleBibleLoadingChange}
            onBibleSelect={handleBibleSelect}
            onBibleVersesChange={handleBibleVersesChange}
            onTabChange={handleTabChange}
          />
        )}

        <div className='w-full flex-1 overflow-hidden'>
          {isChapterMode ? (
            <Suspense
              fallback={
                <div
                  className='flex h-full items-center justify-center'
                  data-testid='chapter-view-loading'
                >
                  <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
                </div>
              }
            >
              <DraftingChapterView
                activeBibleTabId={activeBibleTabId}
                bibleContentError={bibleContentError}
                bibleContentLoading={bibleContentLoading}
                bibleVerseMap={bibleVerseMap}
                handleActiveVerseChange={handleActiveVerseChange}
                handleTextChange={handleTextChangeWithTracking}
                projectItem={projectItem}
                readOnly={readOnly}
                resourceBibleTabs={resourceBibleTabs}
                selectedPanel={selectedPanel}
                sourceVerses={sourceVerses}
                verses={verses}
                onBibleTabClose={handleBibleTabClose}
                onBibleTabSelect={handleBibleTabSelect}
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
              <div className='bg-background sticky top-0 z-10 min-w-0 px-6 py-3'>
                <BibleTabList
                  activeTabId={activeBibleTabId}
                  resourceTabs={resourceBibleTabs}
                  sourceLabel={projectItem.bibleName}
                  onClose={handleBibleTabClose}
                  onSelect={handleBibleTabSelect}
                />
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
                  {displayMode === 'pericope' && (isPericopeError || pericopeContext.isError) && (
                    <div className='flex items-center gap-3 px-6 py-3 text-sm' role='alert'>
                      <span>
                        {t('pericopeContextLoadError', 'Could not load the complete pericope.')}
                      </span>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          if (isPericopeError) void refetchPericopes();
                          if (pericopeContext.isError) void pericopeContext.refetch();
                        }}
                      >
                        {t('retry', 'Retry')}
                      </Button>
                    </div>
                  )}
                  {isPericopeMode && pericopeContext.isLoading && (
                    <p className='text-muted-foreground px-6 py-2 text-sm' role='status'>
                      {t('pericopeContextLoading', 'Loading the rest of the pericope...')}
                    </p>
                  )}
                  {showResourceBiblePlaceholder &&
                    bibleContentLoading &&
                    renderPanelTwoPlaceholder(
                      <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />,
                      true
                    )}

                  {showResourceBiblePlaceholder &&
                    !bibleContentLoading &&
                    renderPanelTwoPlaceholder(
                      <PericopeText className='px-6 text-center' isError={bibleContentError} />,
                      false
                    )}

                  {!showResourceBiblePlaceholder && (
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
                          contextChapters={pericopeContext.chapters}
                          fullPericopes={fullPericopes}
                          globalNextUntouchedVerse={globalNextUntouchedVerse}
                          handleActiveVerseChange={handleActiveVerseChange}
                          handleKeyDown={handleKeyDown}
                          handleNextClick={handleNextClick}
                          handleNextPericopeClick={handleNextPericopeClick}
                          handleTextChange={handleTextChangeWithTracking}
                          handleTitleChange={handleTitleChange}
                          isAiActive={!!(projectItem.isAiEnabled && isDraft)}
                          isAiThresholdMet={isAiThresholdMet ?? false}
                          isTranslationComplete={isTranslationComplete}
                          pericopes={pericopes}
                          projectItem={projectItem}
                          readOnly={readOnly}
                          resourceBibleId={activeResourceBibleTab?.id}
                          resourceBibleLoading={bibleContentLoading}
                          selectedPanel={selectedPanel}
                          sourceVerses={sourceVerses}
                          suggestionStatus={suggestionStatus}
                          textareaRefs={textareaRefs}
                          tts={ttsPericopeGridProps}
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
                          tts={ttsGridProps}
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
                                  isNextButtonEnabled && !roleChangeWarning
                                    ? 'hover:bg-primary-hover cursor-pointer text-white'
                                    : 'cursor-not-allowed bg-gray-300 text-gray-500'
                                }`}
                                disabled={!isNextButtonEnabled || roleChangeWarning}
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
