import React, { useCallback, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useRouter } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, ChevronLeft, Loader2, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useChapterAudio } from '@/features/audio/hooks/useChapterAudio';
import { useResolveConflict } from '@/features/audio/hooks/useResolveConflict';
import {
  isPericopeRecording,
  pericopeCoversVerse,
  resolvePericopeBounds,
  useStitchedAudio,
} from '@/features/audio/hooks/useStitchedAudio';
import { targetTextQueryOptions } from '@/features/bible/hooks/useBibleTarget';
import { useChapterPericopes } from '@/features/pericopes/hooks/useChapterPericopes';
import { useProjectUsers } from '@/features/projects/hooks/useProjectUsers';
import { getActiveGrants, isProjectManager } from '@/lib/grant-utils';
import { type ProjectItem, type VerseAudioRecording, type VerseAudioTake } from '@/lib/types';
import { type DisplayMode, useAppStore } from '@/store/store';

import StitchedAudioPlayer from './StitchedAudioPlayer';
import TakeCard, { SelectAsDraftButton } from './TakeCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isConflict(r: VerseAudioRecording) {
  return r.conflictStatus === 'conflict';
}

function isResolved(r: VerseAudioRecording) {
  return r.conflictStatus === 'resolved';
}

// ---------------------------------------------------------------------------
// Sub-component: Passage list item
// ---------------------------------------------------------------------------

interface PassageListItemProps {
  label: string;
  /** null = no dot; 'conflict' = orange dot; 'resolved' = green dot */
  dotState: 'conflict' | 'resolved' | null;
  isSelected: boolean;
  /** True if this passage was previously conflicted but is now resolved */
  isResolved: boolean;
  /** Cross-view conflict warning label, e.g. "Conflict in verse 6" or "Conflict in pericope vv. 1-5" */
  crossViewConflict?: string | null;
  onClick: () => void;
}

const PassageListItem: React.FC<PassageListItemProps> = ({
  label,
  dotState,
  isSelected,
  isResolved,
  crossViewConflict,
  onClick,
}) => {
  const resolvedGreen = 'var(--success-subtle-foreground)';
  const warningColor = 'var(--warning-subtle-foreground)';

  return (
    <button
      className={`flex w-full cursor-pointer flex-col rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
        isSelected
          ? 'bg-accent font-semibold'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
      type='button'
      onClick={onClick}
    >
      <div className='flex items-center gap-2'>
        {dotState !== null && (
          <span
            className='h-2 w-2 shrink-0 rounded-full'
            style={{
              backgroundColor:
                dotState === 'conflict'
                  ? 'var(--warning-subtle-foreground)'
                  : 'var(--success-subtle-foreground)',
            }}
          />
        )}
        {dotState === null && !crossViewConflict && <span className='h-2 w-2 shrink-0' />}
        <span style={isResolved ? { color: resolvedGreen } : undefined}>{label}</span>
      </div>

      {crossViewConflict && (
        <div
          className='mt-1 flex items-center gap-1.5 text-xs font-normal'
          style={{ color: warningColor }}
        >
          <AlertTriangle className='h-3.5 w-3.5 shrink-0' style={{ color: warningColor }} />
          <span>{crossViewConflict}</span>
        </div>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const routeApi = getRouteApi('/_authenticated/audio/$bookId/$chapterNumber');

interface Passage {
  id: string;
  label: string;
  verseNumbers: number[];
  recordings: VerseAudioRecording[];
  hasConflict: boolean;
  hasDirectConflict: boolean;
  wasConflicted: boolean;
  crossViewConflict?: string | null;
  isOppositeModeConflict?: boolean;
  conflictRecordedMode?: 'verse' | 'pericope';
  continuationNote?: string;
  conflictedVerses?: number[];
}

const isPassage = (passage: Passage | null): passage is Passage => passage !== null;

const EMPTY_VERSE_NUMBERS: number[] = [];

interface AudioReviewPageProps {
  projectItem?: ProjectItem;
}

const AudioReviewPage: React.FC<AudioReviewPageProps> = ({ projectItem: propItem }) => {
  const { t } = useTranslation();
  const loaderData = routeApi.useLoaderData();
  const projectItem = propItem ?? loaderData.projectItem;
  const router = useRouter();
  const globalDisplayMode = useAppStore(state => state.displayMode);
  const [pageDisplayModeOverride, setPageDisplayModeOverride] = useState<DisplayMode | null>(null);
  const [prevGlobalDisplayMode, setPrevGlobalDisplayMode] = useState(globalDisplayMode);

  if (prevGlobalDisplayMode !== globalDisplayMode) {
    setPrevGlobalDisplayMode(globalDisplayMode);
    setPageDisplayModeOverride(null);
  }

  const displayMode = pageDisplayModeOverride ?? globalDisplayMode;
  const setDisplayMode = setPageDisplayModeOverride;
  const userdetail = useAppStore(state => state.userdetail);

  // Only PMs may resolve conflicts (spec #383).
  const isPM = isProjectManager(
    getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId),
    projectItem.projectId
  );

  // ---------- Data fetching ----------

  const { data: audioData, isLoading: audioLoading } = useChapterAudio(projectItem);

  const { data: projectUsers } = useProjectUsers(projectItem.projectId);

  const { data: pericopes } = useChapterPericopes(
    projectItem.projectId,
    projectItem.bookCode,
    projectItem.chapterNumber,
    displayMode === 'pericope'
  );

  const { data: targetVerses } = useQuery(
    targetTextQueryOptions(projectItem.projectUnitId, projectItem.bookId, projectItem.chapterNumber)
  );

  // ---------- Resolve conflict mutation ----------

  const resolveMutation = useResolveConflict();
  const [resolvingTakeId, setResolvingTakeId] = useState<number | null>(null);

  // ---------- User display name map ----------

  const userMap = useMemo(
    () => new Map((projectUsers ?? []).map(u => [u.userId, u.displayName])),
    [projectUsers]
  );

  interface ReviewTake extends VerseAudioTake {
    displayLabel?: string;
    bibleTextId?: number;
    isCoveringPericope?: boolean;
  }

  // ---------- Build passage list ----------

  /**
   * A "passage" is either a single verse (verse/chapter mode) or a pericope group.
   * Each entry carries the set of VerseAudioRecording rows that belong to it,
   * plus cross-view conflict metadata.
   */
  const passages: Passage[] = useMemo(() => {
    const recordings = audioData?.items ?? [];
    const pericopeRecordings = recordings.filter(isPericopeRecording);
    const verseRecordings = recordings.filter(r => !isPericopeRecording(r));

    if (displayMode === 'pericope' && pericopes && pericopes.length > 0) {
      return pericopes
        .map((group): Passage | null => {
          // Only include verses belonging to the current chapter
          const chapterVerses = group.verses.filter(
            v => v.chapterNumber === projectItem.chapterNumber
          );
          if (chapterVerses.length === 0) return null;

          const groupVerseNums = new Set(chapterVerses.map(v => v.verseNumber));
          const startVerse = chapterVerses[0]?.verseNumber;
          const endVerse = chapterVerses[chapterVerses.length - 1]?.verseNumber;

          // Direct pericope recordings
          const directPericopeRecs = pericopeRecordings.filter(r => {
            const bounds = resolvePericopeBounds(r);
            if (!bounds) return false;

            const firstVerse = group.verses.at(0);
            const lastVerse = group.verses.at(-1);

            if (
              bounds.startChapter != null &&
              bounds.endChapter != null &&
              firstVerse &&
              lastVerse
            ) {
              return (
                bounds.startChapter === firstVerse.chapterNumber &&
                bounds.startVerse === firstVerse.verseNumber &&
                bounds.endChapter === lastVerse.chapterNumber &&
                bounds.endVerse === lastVerse.verseNumber
              );
            }

            return bounds.startVerse === startVerse && bounds.endVerse === endVerse;
          });

          // Verse recordings for verses in this pericope
          const groupVerseRecs = verseRecordings.filter(r => groupVerseNums.has(r.verseNumber));

          if (directPericopeRecs.length === 0 && groupVerseRecs.length === 0) return null;

          const baseLabel =
            startVerse === endVerse
              ? t('verseLabel', 'Verse {{verse}}', { verse: startVerse })
              : t('versesLabel', 'Verses {{start}}–{{end}}', { start: startVerse, end: endVerse });

          const prevChapterVerses = group.verses.filter(
            v => v.chapterNumber < projectItem.chapterNumber
          );
          const nextChapterVerses = group.verses.filter(
            v => v.chapterNumber > projectItem.chapterNumber
          );

          let continuationNote: string | undefined;
          if (prevChapterVerses.length > 0 && nextChapterVerses.length > 0) {
            const prevCh = prevChapterVerses[prevChapterVerses.length - 1]?.chapterNumber;
            const nextCh = nextChapterVerses[0]?.chapterNumber;
            continuationNote = t(
              'pericopeContFromAndInNote',
              '(cont. from ch. {{prevCh}}, in ch. {{nextCh}})',
              { prevCh, nextCh }
            );
          } else if (nextChapterVerses.length > 0) {
            const nextCh = nextChapterVerses[0]?.chapterNumber;
            continuationNote = t('pericopeContInNextNote', '(cont. in ch. {{nextCh}})', {
              nextCh,
            });
          } else if (prevChapterVerses.length > 0) {
            const prevCh = prevChapterVerses[prevChapterVerses.length - 1]?.chapterNumber;
            continuationNote = t('pericopeContFromPrevNote', '(cont. from ch. {{prevCh}})', {
              prevCh,
            });
          }

          const label = continuationNote ? `${baseLabel} ${continuationNote}` : baseLabel;

          const hasDirectConflict = directPericopeRecs.some(isConflict);
          const conflictedVerses = groupVerseRecs
            .filter(isConflict)
            .map(r => r.verseNumber)
            .sort((a, b) => a - b);
          const hasVerseConflict = conflictedVerses.length > 0;

          const hasConflictNow = hasDirectConflict || hasVerseConflict;
          const wasConflicted =
            directPericopeRecs.some(isResolved) || groupVerseRecs.some(isResolved);

          let crossViewConflict: string | null = null;
          let isOppositeModeConflict = false;
          let conflictRecordedMode: 'verse' | 'pericope' | undefined;

          if (hasVerseConflict) {
            conflictRecordedMode = 'verse';
            crossViewConflict =
              conflictedVerses.length === 1
                ? t('conflictInVerse', 'Conflict in verse {{verse}}', {
                    verse: conflictedVerses[0],
                  })
                : t('conflictInVerses', 'Conflict in verses {{verses}}', {
                    verses: conflictedVerses.join(', '),
                  });
            if (!hasDirectConflict) {
              isOppositeModeConflict = true;
            }
          }

          const passageRecs = directPericopeRecs.length > 0 ? directPericopeRecs : groupVerseRecs;

          return {
            id: `pericope-${group.pericopeNumber}`,
            label,
            verseNumbers: chapterVerses.map(v => v.verseNumber),
            recordings: passageRecs,
            hasConflict: hasConflictNow,
            hasDirectConflict,
            wasConflicted,
            crossViewConflict,
            isOppositeModeConflict,
            conflictRecordedMode,
            continuationNote,
            conflictedVerses,
          };
        })
        .filter(isPassage);
    }

    // Verse / chapter mode:
    // Collect all verse numbers that have verse recordings or are covered by pericope recordings
    const verseNumSet = new Set<number>();
    for (const r of verseRecordings) {
      verseNumSet.add(r.verseNumber);
    }

    // Collect available verses in this chapter from targetVerses or pericopes
    const chapterVerseNumbers = new Set<number>();
    if (targetVerses) {
      for (const tv of targetVerses) {
        chapterVerseNumbers.add(tv.verseNumber);
      }
    }
    if (pericopes) {
      for (const p of pericopes) {
        for (const v of p.verses) {
          if (v.chapterNumber === projectItem.chapterNumber) {
            chapterVerseNumbers.add(v.verseNumber);
          }
        }
      }
    }

    for (const pr of pericopeRecordings) {
      const bounds = resolvePericopeBounds(pr);
      if (!bounds) continue;
      if (chapterVerseNumbers.size > 0) {
        for (const v of chapterVerseNumbers) {
          if (pericopeCoversVerse(bounds, v, projectItem.chapterNumber)) {
            verseNumSet.add(v);
          }
        }
      } else {
        // Fallback when neither targetVerses nor pericopes have loaded yet
        if (
          bounds.startChapter == null ||
          bounds.endChapter == null ||
          bounds.startChapter === bounds.endChapter
        ) {
          for (let v = bounds.startVerse; v <= bounds.endVerse; v++) {
            verseNumSet.add(v);
          }
        } else if (bounds.startChapter === projectItem.chapterNumber) {
          verseNumSet.add(bounds.startVerse);
        } else if (bounds.endChapter === projectItem.chapterNumber) {
          for (let v = 1; v <= bounds.endVerse; v++) {
            verseNumSet.add(v);
          }
        }
      }
    }

    const sortedVerses = Array.from(verseNumSet).sort((a, b) => a - b);

    return sortedVerses.map((v): Passage => {
      const r = verseRecordings.find(rec => rec.verseNumber === v);

      // Check if this verse is covered by a pericope recording
      const coveringPericope = pericopeRecordings.find(pr => {
        const bounds = resolvePericopeBounds(pr);
        if (!bounds) return false;
        return pericopeCoversVerse(bounds, v, projectItem.chapterNumber);
      });

      const hasDirectConflict = Boolean(r && isConflict(r));
      const hasPericopeConflict = Boolean(coveringPericope && isConflict(coveringPericope));
      const hasConflictNow = hasDirectConflict || hasPericopeConflict;
      const wasConflicted =
        Boolean(r && isResolved(r)) || Boolean(coveringPericope && isResolved(coveringPericope));

      let crossViewConflict: string | null = null;
      let isOppositeModeConflict = false;
      let conflictRecordedMode: 'verse' | 'pericope' | undefined;

      if (hasPericopeConflict && coveringPericope) {
        const bounds = resolvePericopeBounds(coveringPericope);
        if (bounds) {
          conflictRecordedMode = 'pericope';
          const isCrossChapter =
            bounds.startChapter != null &&
            bounds.endChapter != null &&
            bounds.startChapter !== bounds.endChapter;
          const range = isCrossChapter
            ? `ch. ${bounds.startChapter}:${bounds.startVerse}–ch. ${bounds.endChapter}:${bounds.endVerse}`
            : `${bounds.startVerse}-${bounds.endVerse}`;
          crossViewConflict = t('conflictInPericope', 'Conflict in pericope vv. {{range}}', {
            range,
          });
          if (!hasDirectConflict) {
            isOppositeModeConflict = true;
          }
        }
      }

      return {
        id: `verse-${v}`,
        label: t('verseLabel', 'Verse {{verse}}', { verse: v }),
        verseNumbers: [v],
        recordings: r ? [r] : [],
        hasConflict: hasConflictNow,
        hasDirectConflict,
        wasConflicted,
        crossViewConflict,
        isOppositeModeConflict,
        conflictRecordedMode,
      };
    });
  }, [audioData, displayMode, pericopes, projectItem.chapterNumber, t, targetVerses]);

  // ---------- All-resolved chip ----------

  const allConflictsResolved = useMemo(() => {
    const wasAnyConflicted = passages.some(p => p.wasConflicted);
    const stillHasConflict = passages.some(p => p.hasConflict);
    return wasAnyConflicted && !stillHasConflict;
  }, [passages]);

  // ---------- Selection state ----------

  const [selectedPassageId, setSelectedPassageId] = useState<string | null>(null);

  const selectedPassage = useMemo(() => {
    if (!passages.length) return null;
    return passages.find(p => p.id === selectedPassageId) ?? passages[0];
  }, [passages, selectedPassageId]);

  const effectivePassage = selectedPassage ?? passages[0];

  const handleSwitchToVerseView = () => {
    const targetVerse = effectivePassage.conflictedVerses?.[0] ?? effectivePassage.verseNumbers[0];
    if (typeof targetVerse === 'number') {
      setSelectedPassageId(`verse-${targetVerse}`);
    }
    setDisplayMode('verse');
  };

  const handleSwitchToPericopeView = () => {
    const v = effectivePassage.verseNumbers[0];
    if (typeof v === 'number' && pericopes) {
      const coveringGroup = pericopes.find(group =>
        group.verses.some(
          gv => gv.chapterNumber === projectItem.chapterNumber && gv.verseNumber === v
        )
      );
      if (coveringGroup) {
        setSelectedPassageId(`pericope-${coveringGroup.pericopeNumber}`);
      }
    }
    setDisplayMode('pericope');
  };

  // ---------- Stitched audio calculation for pericope mode ----------

  const stitchedAudio = useStitchedAudio({
    verseNumbers: selectedPassage?.verseNumbers ?? EMPTY_VERSE_NUMBERS,
    recordings: audioData?.items ?? [],
    currentChapter: projectItem.chapterNumber,
  });

  // Map each take.id to its parent recording's bibleTextId
  const takeBibleTextMap = useMemo(() => {
    const map = new Map<number, number>();
    const recordings = audioData?.items ?? [];
    for (const recording of recordings) {
      for (const take of recording.takes) {
        map.set(take.id, recording.bibleTextId);
      }
    }
    return map;
  }, [audioData]);

  // All takes for the selected passage
  const selectedTakes = useMemo((): ReviewTake[] => {
    if (!selectedPassage) return [];
    const recordings = audioData?.items ?? [];
    const pericopeRecordings = recordings.filter(isPericopeRecording);

    if (displayMode !== 'pericope') {
      const v = selectedPassage.verseNumbers[0];
      const verseTakes: ReviewTake[] = (selectedPassage.recordings[0]?.takes ?? []).map(t => ({
        ...t,
        bibleTextId: selectedPassage.recordings[0]?.bibleTextId,
        isCoveringPericope: false,
      }));

      // Find pericope recordings covering this verse
      const coveringPericopes = pericopeRecordings.filter(pr => {
        const bounds = resolvePericopeBounds(pr);
        if (!bounds) return false;
        return pericopeCoversVerse(bounds, v, projectItem.chapterNumber);
      });

      const pericopeTakes: ReviewTake[] = [];
      for (const pr of coveringPericopes) {
        // "When that pericope is in conflict, do not list its takes under the verses;
        // the cross-view conflict indicator and message apply instead."
        if (isConflict(pr)) continue;

        const bounds = resolvePericopeBounds(pr);
        if (!bounds) continue;
        const isCrossChapter =
          bounds.startChapter != null &&
          bounds.endChapter != null &&
          bounds.startChapter !== bounds.endChapter;
        const range = isCrossChapter
          ? `ch. ${bounds.startChapter}:${bounds.startVerse}–ch. ${bounds.endChapter}:${bounds.endVerse}`
          : `${bounds.startVerse}-${bounds.endVerse}`;
        if (pr.activeTakeId === null) continue;
        const takeIndex = pr.takes.findIndex(t => t.id === pr.activeTakeId);
        if (takeIndex < 0) continue;
        const take = pr.takes[takeIndex];
        pericopeTakes.push({
          ...take,
          displayLabel: t('takePericopeLabel', 'Take {{takeNumber}} - Pericope - vv. {{range}}', {
            takeNumber: takeIndex + 1,
            range,
          }),
          bibleTextId: pr.bibleTextId,
          isCoveringPericope: true,
        });
      }

      return [...verseTakes, ...pericopeTakes];
    }

    // Pericope mode
    return selectedPassage.recordings.flatMap(r => r.takes);
  }, [selectedPassage, displayMode, audioData, projectItem.chapterNumber, t]);

  // Show contributor names only when the passage has takes from more than one contributor (spec #383)
  const showContributor = useMemo(() => {
    const uniqueUploaders = new Set(selectedTakes.map(t => t.uploadedBy));
    return uniqueUploaders.size > 1;
  }, [selectedTakes]);

  /**
   * Active take id — look across all recordings in the passage.
   */
  const activeTakeId = useMemo(() => {
    if (displayMode === 'pericope') {
      if (stitchedAudio.hasActivePericopeTake && stitchedAudio.activePericopeTake) {
        return stitchedAudio.activePericopeTake.id;
      }
      for (const r of selectedPassage?.recordings ?? []) {
        if (r.activeTakeId !== null) return r.activeTakeId;
      }
      return null;
    }

    // Verse mode
    const vRec = selectedPassage?.recordings[0];
    if (vRec && vRec.activeTakeId !== null) return vRec.activeTakeId;

    // Check if covering pericope has active take
    const pericopeRecordings = (audioData?.items ?? []).filter(isPericopeRecording);
    const v = selectedPassage?.verseNumbers[0];
    if (v !== undefined) {
      const coveringPericope = pericopeRecordings.find(pr => {
        const bounds = resolvePericopeBounds(pr);
        if (!bounds) return false;
        return pericopeCoversVerse(bounds, v, projectItem.chapterNumber) && !isConflict(pr);
      });
      if (coveringPericope && coveringPericope.activeTakeId !== null) {
        return coveringPericope.activeTakeId;
      }
    }
    return null;
  }, [selectedPassage, displayMode, stitchedAudio, audioData, projectItem.chapterNumber]);

  const selectedHasConflict = selectedPassage?.hasConflict ?? false;

  // ---------- Draft text ----------

  const selectedTargetText = useMemo(() => {
    if (!targetVerses || !selectedPassage) return null;
    const verseNums = new Set(selectedPassage.verseNumbers);
    return targetVerses.filter(v => verseNums.has(v.verseNumber));
  }, [targetVerses, selectedPassage]);

  // ---------- Conflict resolution ----------

  const handleSelectAsDraft = useCallback(
    (take: { id: number; bibleTextId: number }) => {
      setResolvingTakeId(take.id);
      resolveMutation.mutate(
        {
          key: projectItem,
          bibleTextId: take.bibleTextId,
          takeId: take.id,
        },
        {
          onSettled: () => setResolvingTakeId(null),
        }
      );
    },
    [resolveMutation, projectItem]
  );

  // ---------- Back navigation ----------

  const handleBack = useCallback(() => {
    router.history.back();
  }, [router]);

  // ---------- Render ----------

  if (audioLoading) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
      </div>
    );
  }

  if (!audioData || passages.length === 0) {
    return (
      <div className='text-muted-foreground flex h-screen flex-col items-center justify-center gap-3'>
        <MicOff className='h-10 w-10' />
        <p className='text-sm'>
          {t('noRecordedTakesFound', 'No recorded takes found for this chapter.')}
        </p>
      </div>
    );
  }

  return (
    <div className='bg-background flex h-full flex-col overflow-hidden'>
      {/* ── Page header ─────────────────────────────────────── */}
      <header className='border-border flex shrink-0 items-center gap-3 border-b px-6 py-4'>
        <button
          aria-label={t('back', 'Back')}
          className='text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors'
          type='button'
          onClick={handleBack}
        >
          <ChevronLeft className='h-5 w-5' />
        </button>

        <h1 className='text-foreground text-xl font-bold'>
          {t('audioReviewHeader', 'Audio — {{book}} {{chapter}}', {
            book: projectItem.book,
            chapter: projectItem.chapterNumber,
          })}
        </h1>

        {/* All Resolved chip */}
        {allConflictsResolved && (
          <span
            className='flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold'
            style={{
              backgroundColor: 'var(--success-subtle)',
              color: 'var(--success-subtle-foreground)',
              border: '1px solid var(--success-subtle-border)',
            }}
          >
            <CheckCircle2 className='h-3.5 w-3.5' />
            {t('allResolved', 'All Resolved')}
          </span>
        )}
      </header>

      {/* ── Three-column body ────────────────────────────────── */}
      {/* Flexbox — each column is height-bounded by the flex container (flex-1 min-h-0),
          so overflow-y-auto on the inner scroll div fires correctly. CSS Grid min-height:auto
          on rows caused the row to exceed the viewport and broke scrolling. */}
      <div className='flex min-h-0 flex-1 overflow-hidden'>
        {/* ── Left: passage list ─────────────────────────── */}
        <aside className='border-border flex w-[200px] shrink-0 flex-col overflow-hidden border-r'>
          <div className='shrink-0 px-6 pt-6 pb-2'>
            <p className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
              {t('units', 'Units')}
            </p>
          </div>
          <div
            className='min-h-0 flex-1 overflow-y-auto px-3 pb-4'
            style={{ scrollbarGutter: 'stable' }}
          >
            {passages.map(passage => {
              // Dot: orange = currently in direct conflict in this view; green = API confirmed 'resolved'; none otherwise
              let dotState: 'conflict' | 'resolved' | null = null;
              if (passage.hasDirectConflict) {
                dotState = 'conflict';
              } else if (passage.wasConflicted && !passage.hasConflict) {
                dotState = 'resolved';
              }

              const isPassageResolved = dotState === 'resolved';

              return (
                <PassageListItem
                  key={passage.id}
                  crossViewConflict={passage.crossViewConflict}
                  dotState={dotState}
                  isResolved={isPassageResolved}
                  isSelected={effectivePassage.id === passage.id}
                  label={passage.label}
                  onClick={() => setSelectedPassageId(passage.id)}
                />
              );
            })}
          </div>
        </aside>

        {/* ── Middle: takes list ────────────────────────── */}
        <section className='border-border flex min-w-0 flex-1 flex-col overflow-hidden border-r'>
          {/* Column heading & alert banner — pinned, never scrolls */}
          <div className='flex shrink-0 flex-col gap-4 px-6 pt-6 pb-4'>
            <div>
              <h2 className='text-foreground text-base font-semibold'>
                {selectedHasConflict
                  ? t('conflictingTakes', 'Conflicting Takes')
                  : t('recordedTakes', 'Recorded Takes')}
              </h2>
              <p className='text-muted-foreground mt-0.5 text-sm'>
                {displayMode === 'pericope' && stitchedAudio.hasOnlyPerVerseRecordings
                  ? t('recordedByVersePlayedAsOne', 'Recorded by verse. Played as one recording.')
                  : selectedHasConflict
                    ? t(
                        'conflictingTakesDesc',
                        'Select one take as the active draft. All recordings are retained.'
                      )
                    : effectivePassage.wasConflicted
                      ? t(
                          'resolvedTakesDesc',
                          'This conflict has been resolved. All recordings are retained.'
                        )
                      : t('recordedTakesDesc', 'Listen to every recorded take for this passage.')}
              </p>
            </div>

            {/* Conflict banner — shown only while still in conflict */}
            {selectedHasConflict && (
              <div
                className='flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium'
                role='alert'
                style={{
                  backgroundColor: 'var(--warning-surface)',
                  borderColor: 'var(--warning-border)',
                  color: 'var(--warning-banner-foreground)',
                }}
              >
                <AlertTriangle
                  className='mt-0.5 h-4 w-4 shrink-0'
                  style={{ color: 'var(--warning-border)' }}
                />
                <span>
                  {effectivePassage.hasDirectConflict ? (
                    <>
                      {t(
                        'conflictBanner',
                        'This passage has conflicting takes — select one to resolve.'
                      )}
                      {effectivePassage.crossViewConflict && (
                        <span className='mt-1 block text-xs font-normal opacity-90'>
                          {effectivePassage.conflictRecordedMode === 'verse' ? (
                            <>
                              {t(
                                'conflictAlsoRecordedByVerse',
                                'There is also a conflict recorded by verse.'
                              )}{' '}
                              <button
                                className='cursor-pointer font-medium underline hover:opacity-80'
                                type='button'
                                onClick={handleSwitchToVerseView}
                              >
                                {t('switchToVerseView', 'Switch to Verse view')}
                              </button>{' '}
                              {t('toResolveIt', 'to resolve it.')}
                            </>
                          ) : (
                            <>
                              {t(
                                'conflictAlsoRecordedAsPericope',
                                'There is also a conflict recorded as a pericope.'
                              )}{' '}
                              <button
                                className='cursor-pointer font-medium underline hover:opacity-80'
                                type='button'
                                onClick={handleSwitchToPericopeView}
                              >
                                {t('switchToPericopeView', 'Switch to Pericope view')}
                              </button>{' '}
                              {t('toResolveIt', 'to resolve it.')}
                            </>
                          )}
                        </span>
                      )}
                    </>
                  ) : effectivePassage.conflictRecordedMode === 'verse' ? (
                    <>
                      {t('conflictRecordedByVerseLead', 'This conflict was recorded by verse.')}{' '}
                      <button
                        className='cursor-pointer font-medium underline hover:opacity-80'
                        type='button'
                        onClick={handleSwitchToVerseView}
                      >
                        {t('switchToVerseView', 'Switch to Verse view')}
                      </button>{' '}
                      {t('toResolveIt', 'to resolve it.')}
                    </>
                  ) : (
                    <>
                      {t(
                        'conflictRecordedAsPericopeLead',
                        'This conflict was recorded as a pericope.'
                      )}{' '}
                      <button
                        className='cursor-pointer font-medium underline hover:opacity-80'
                        type='button'
                        onClick={handleSwitchToPericopeView}
                      >
                        {t('switchToPericopeView', 'Switch to Pericope view')}
                      </button>{' '}
                      {t('toResolveIt', 'to resolve it.')}
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Takes list — scrollable */}
          <div
            className='min-h-0 flex-1 overflow-y-auto px-6 pb-6'
            style={{ scrollbarGutter: 'stable' }}
          >
            {displayMode === 'pericope' && stitchedAudio.hasOnlyPerVerseRecordings ? (
              <StitchedAudioPlayer
                label={t(
                  'stitchedFromVerseRecordings',
                  'Stitched from verse recordings, vv. {{range}}{{continuation}}',
                  {
                    range:
                      effectivePassage.verseNumbers[0] ===
                      effectivePassage.verseNumbers[effectivePassage.verseNumbers.length - 1]
                        ? `${effectivePassage.verseNumbers[0]}`
                        : `${effectivePassage.verseNumbers[0]}-${effectivePassage.verseNumbers[effectivePassage.verseNumbers.length - 1]}`,
                    continuation: effectivePassage.continuationNote
                      ? ` ${effectivePassage.continuationNote}`
                      : '',
                  }
                )}
                skippedVerses={stitchedAudio.skippedVerses}
                totalDuration={stitchedAudio.totalDuration}
                tracks={stitchedAudio.tracks}
              />
            ) : selectedTakes.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t('noAudioDraftsAvailable', 'No audio drafts available.')}
              </p>
            ) : (
              <div className='flex flex-col gap-3'>
                {selectedTakes.map((take, idx) => {
                  const bibleTextId = take.bibleTextId ?? takeBibleTextMap.get(take.id);
                  const canResolveAsDraft =
                    isPM &&
                    selectedHasConflict &&
                    !effectivePassage.isOppositeModeConflict &&
                    !take.isCoveringPericope;

                  return (
                    <TakeCard
                      key={take.id}
                      action={
                        canResolveAsDraft ? (
                          <SelectAsDraftButton
                            disabled={bibleTextId === undefined}
                            isResolving={resolvingTakeId === take.id}
                            onSelect={() => {
                              if (bibleTextId !== undefined) {
                                handleSelectAsDraft({
                                  id: take.id,
                                  bibleTextId,
                                });
                              }
                            }}
                          />
                        ) : undefined
                      }
                      contributorName={
                        showContributor
                          ? (userMap.get(take.uploadedBy) ?? t('unknown', 'Unknown'))
                          : undefined
                      }
                      isActiveDraft={take.id === activeTakeId}
                      label={take.displayLabel}
                      take={take}
                      takeNumber={idx + 1}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── Right: draft text ────────────────────────── */}
        <section className='flex min-w-0 flex-1 flex-col overflow-hidden'>
          {/* Column heading — pinned, never scrolls */}
          <div className='shrink-0 px-6 pt-6 pb-4'>
            <h2 className='text-foreground text-base font-semibold'>
              {t('draftText', 'Draft Text')}
            </h2>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              {t('draftTextSubtitle', 'Target-language draft for this passage')}
            </p>
          </div>

          {/* Draft text — scrollable */}
          <div
            className='min-h-0 flex-1 overflow-y-auto px-6 pb-6'
            style={{ scrollbarGutter: 'stable' }}
          >
            {selectedTargetText && selectedTargetText.length > 0 ? (
              <div className='text-foreground text-sm leading-relaxed'>
                <p
                  className='mb-2 text-xs font-bold tracking-wide uppercase'
                  style={{ color: 'var(--primary)' }}
                >
                  {effectivePassage.label.toUpperCase()}
                </p>
                <p className='leading-8 select-text'>
                  {selectedTargetText.map(v => (
                    <React.Fragment key={v.verseNumber}>
                      <span className='mr-1.5 font-bold'>{v.verseNumber}</span>
                      <span className='mr-3'>{v.content}</span>
                    </React.Fragment>
                  ))}
                </p>
              </div>
            ) : (
              <p className='text-muted-foreground text-sm italic'>
                {t('noDraftTextYet', 'No draft text yet for this passage.')}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AudioReviewPage;
