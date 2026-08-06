/**
 * `useNextAssignedChapter` — resolves the "next page" for the TTS end-of-page
 * prompt (T16), or `null` when there is nothing legitimate to continue to.
 *
 * This lives in the drafting feature, not in `features/tts`: what counts as a
 * next page is a paging/assignment question, and the TTS host hook only ever
 * receives the answer as data (T3 keeps the TTS code free of drafting's
 * concepts). If paging later becomes pericope-based, only this hook changes.
 *
 * Two properties matter for safety:
 *   1. **Proven, not synthesized.** The next chapter must be a real assignment
 *      belonging to this user, so continuing can hand the route the same
 *      `projectItem` state the dashboard does — never a fabricated chapter
 *      number that would land the loader without an assignment.
 *   2. **Pending edits flush first.** Drafting saves on a debounce, and the
 *      route drops its cache on navigation, so the caller's flush runs (and is
 *      awaited) before anything unmounts.
 */

import { useMemo, useRef } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { type TtsNextPage } from '@/features/tts';
import { useChapterAssignmentsByUserId } from '@/hooks/useChapterAssignment';
import { type ProjectItem } from '@/lib/types';

export interface UseNextAssignedChapterOptions {
  /**
   * Gate: when false no request is made at all. Callers pass their feature
   * flag here so a disabled feature adds no network traffic (§6.3).
   */
  enabled: boolean;
  userId: number;
  currentItem: Pick<ProjectItem, 'projectUnitId' | 'bookId' | 'chapterNumber'>;
  /** Awaited before navigating — e.g. flushing a debounced save. */
  flushPendingWork?: () => void | Promise<void>;
}

export const useNextAssignedChapter = ({
  enabled,
  userId,
  currentItem,
  flushPendingWork,
}: UseNextAssignedChapterOptions): TtsNextPage | null => {
  const navigate = useNavigate();

  // Kept in a ref so a changing flush callback does not churn the memo below.
  const flushRef = useRef(flushPendingWork);
  flushRef.current = flushPendingWork;

  // No orgId: it is only a cache-key discriminator for the dashboard's org
  // switch, and this hook lives on one chapter of one project.
  const { data } = useChapterAssignmentsByUserId(userId, undefined, { enabled });

  const { projectUnitId, bookId, chapterNumber } = currentItem;

  return useMemo(() => {
    if (!enabled || !data) return null;

    // Only this user's own, still-open drafting work in the same book and
    // project unit. Submitted chapters are excluded deliberately: the
    // dashboard sends those to the read-only `/view` surface, so treating one
    // as a drafting continuation would misrepresent its state.
    const next = data.assignedChapters.find(
      assignment =>
        assignment.projectUnitId === projectUnitId &&
        assignment.bookId === bookId &&
        assignment.chapterNumber === chapterNumber + 1 &&
        assignment.submittedTime === null
    );

    if (!next) return null;

    return {
      label: `${next.book} ${next.chapterNumber}`,
      navigate: async () => {
        // Flush BEFORE the route tears this page down; the drafting page has
        // no unmount flush of its own, so an in-flight debounced edit would
        // otherwise be lost.
        await flushRef.current?.();

        // Same shape as the dashboard's row click, including the `projectItem`
        // route state the loader needs to switch assignments.
        await navigate({
          to: '/translation/$bookId/$chapterNumber',
          params: {
            bookId: next.bookId.toString(),
            chapterNumber: next.chapterNumber.toString(),
          },
          search: { t: Date.now().toString() },
          state: { projectItem: next },
        });
      },
    };
  }, [enabled, data, projectUnitId, bookId, chapterNumber, navigate]);
};
