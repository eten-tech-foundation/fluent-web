import React, { useCallback, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useRouter } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, ChevronLeft, Loader2, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useChapterAudio } from '@/features/audio/hooks/useChapterAudio';
import { useResolveConflict } from '@/features/audio/hooks/useResolveConflict';
import { targetTextQueryOptions } from '@/features/bible/hooks/useBibleTarget';
import { useChapterPericopes } from '@/features/pericopes/hooks/useChapterPericopes';
import { useProjectUsers } from '@/features/projects/hooks/useProjectUsers';
import { getActiveGrants, isProjectManager } from '@/lib/grant-utils';
import { type ProjectItem, type VerseAudioRecording } from '@/lib/types';
import { type DisplayMode, useAppStore } from '@/store/store';

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
  onClick: () => void;
}

const PassageListItem: React.FC<PassageListItemProps> = ({
  label,
  dotState,
  isSelected,
  isResolved,
  onClick,
}) => {
  const resolvedGreen = 'var(--success-subtle-foreground)';

  return (
    <button
      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
        isSelected
          ? 'bg-accent font-semibold'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
      style={isSelected && isResolved ? { color: resolvedGreen } : undefined}
      type='button'
      onClick={onClick}
    >
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
      {dotState === null && <span className='h-2 w-2 shrink-0' />}
      <span style={isResolved ? { color: resolvedGreen } : undefined}>{label}</span>
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
  wasConflicted: boolean;
}

const isPassage = (passage: Passage | null): passage is Passage => passage !== null;

interface AudioReviewPageProps {
  projectItem?: ProjectItem;
}

const AudioReviewPage: React.FC<AudioReviewPageProps> = ({ projectItem: propItem }) => {
  const { t } = useTranslation();
  const loaderData = routeApi.useLoaderData();
  const projectItem = propItem ?? loaderData.projectItem;
  const router = useRouter();
  const initialDisplayMode = useAppStore(state => state.displayMode);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialDisplayMode);
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

  // ---------- Build passage list ----------

  /**
   * A "passage" is either a single verse (verse/chapter mode) or a pericope group.
   * Each entry carries the set of VerseAudioRecording rows that belong to it.
   */
  const passages: Passage[] = useMemo(() => {
    const recordings = audioData?.items ?? [];

    if (displayMode === 'pericope' && pericopes && pericopes.length > 0) {
      return pericopes
        .map((group): Passage | null => {
          const groupVerseNums = new Set(group.verses.map(v => v.verseNumber));
          const groupRecordings = recordings.filter(r => groupVerseNums.has(r.verseNumber));
          if (groupRecordings.length === 0) return null;

          const startVerse = group.verses[0]?.verseNumber;
          const endVerse = group.verses[group.verses.length - 1]?.verseNumber;
          const label =
            startVerse === endVerse
              ? t('verseLabel', 'Verse {{verse}}', { verse: startVerse })
              : t('versesLabel', 'Verses {{start}}–{{end}}', { start: startVerse, end: endVerse });

          const hasConflictNow = groupRecordings.some(isConflict);
          // 'resolved' is set by the API when the conflict was explicitly resolved
          // via PUT /resolve — unambiguous, no heuristic needed.
          const wasConflicted = groupRecordings.some(isResolved);

          return {
            id: `pericope-${group.pericopeNumber}`,
            label,
            verseNumbers: group.verses.map(v => v.verseNumber),
            recordings: groupRecordings,
            hasConflict: hasConflictNow,
            wasConflicted,
          };
        })
        .filter(isPassage);
    }

    // Verse / chapter mode: one row per verse
    return recordings.map(
      (r): Passage => ({
        id: `verse-${r.verseNumber}`,
        label: t('verseLabel', 'Verse {{verse}}', { verse: r.verseNumber }),
        verseNumbers: [r.verseNumber],
        recordings: [r],
        hasConflict: isConflict(r),
        // 'resolved' status is set by the API on successful conflict resolution.
        wasConflicted: isResolved(r),
      })
    );
  }, [audioData, displayMode, pericopes, t]);

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

  // All takes for the selected passage (union of all recordings in the passage).
  // Pericope mode may have multiple recordings — we flatten all their takes.
  const selectedTakes = useMemo(
    () => (selectedPassage?.recordings ?? []).flatMap(r => r.takes),
    [selectedPassage]
  );

  // Map each take.id to its parent recording's bibleTextId
  const takeBibleTextMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const recording of selectedPassage?.recordings ?? []) {
      for (const take of recording.takes) {
        map.set(take.id, recording.bibleTextId);
      }
    }
    return map;
  }, [selectedPassage]);

  // Show contributor names only when the passage has takes from more than one contributor (spec #383)
  const showContributor = useMemo(() => {
    const uniqueUploaders = new Set(selectedTakes.map(t => t.uploadedBy));
    return uniqueUploaders.size > 1;
  }, [selectedTakes]);

  /**
   * Active take id — look across all recordings in the passage.
   * In verse mode there's always exactly one recording; in pericope mode
   * there can be many (one per verse). We find the first take id that is
   * marked active in any of those recordings.
   */
  const activeTakeId = useMemo(() => {
    for (const r of selectedPassage?.recordings ?? []) {
      if (r.activeTakeId !== null) return r.activeTakeId;
    }
    return null;
  }, [selectedPassage]);

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

  const effectivePassage = selectedPassage ?? passages[0];

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
              // Dot: orange = currently in conflict; green = API confirmed 'resolved'; none otherwise
              let dotState: 'conflict' | 'resolved' | null = null;
              if (passage.hasConflict) dotState = 'conflict';
              else if (passage.wasConflicted) dotState = 'resolved';

              const isPassageResolved = dotState === 'resolved';

              return (
                <PassageListItem
                  key={passage.id}
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
                {selectedHasConflict
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
                  {t(
                    'conflictBanner',
                    'This passage has conflicting takes — select one to resolve.'
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
            {/* TODO(fluent-api#377): Spec: "List takes as normal for a pericope recorded as a pericope".
                Currently, recordings are stored at verse grain, so pericope view prompts the user
                to switch to Verse view to review and resolve individual verse takes. Once the upstream
                granularity field lands (fluent-api#377), check recording granularity here to list
                pericope-grain takes directly. */}
            {displayMode === 'pericope' ? (
              <p className='text-muted-foreground text-sm font-normal'>
                {t('recordedByVerse', 'Recorded by verse.')}{' '}
                <button
                  className='text-primary hover:text-primary/80 cursor-pointer font-medium underline'
                  type='button'
                  onClick={() => setDisplayMode('verse')}
                >
                  {t('switchToVerseView', 'Switch to Verse view')}
                </button>{' '}
                {t('toReviewTheseTakes', 'to review these takes.')}
              </p>
            ) : selectedTakes.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t('noAudioDraftsAvailable', 'No audio drafts available.')}
              </p>
            ) : (
              <div className='flex flex-col gap-3'>
                {selectedTakes.map((take, idx) => {
                  const bibleTextId = takeBibleTextMap.get(take.id);
                  const canResolveAsDraft = isPM && selectedHasConflict && take.id !== activeTakeId;

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
