/**
 * `useSourceTtsPlayback` — everything a source-scripture surface needs to host
 * TTS, so the surface itself only supplies data and refs (T3, §5.1/§5.3).
 *
 * It owns four host responsibilities the queue deliberately refuses:
 *   1. Document-order queue construction for "play from here" (§5.1).
 *   2. Conditional auto-scroll of the active row (§5.3 step 2) — no focus theft.
 *   3. The end-of-page decision (T16): pause, ask, and navigate ONLY on
 *      confirmation, and only when the host proved a next page exists.
 *   4. Surfacing a playback failure as a toast (§5.2).
 *
 * Deliberately NOT here: the feature flag. Gating is the surface's job (the
 * surface decides whether to render controls and whether to call this at all),
 * which keeps the fail-closed check next to the UI it hides (§6.3, T12).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { buildTtsQueueItems, findTtsQueueIndex, type TtsRowDraft } from '../lib/buildTtsQueueItems';
import {
  armTtsContinuation,
  claimTtsContinuation,
  disarmTtsContinuation,
} from '../lib/playbackContinuation';
import {
  type ScrollableRow,
  scrollRowIntoViewIfNeeded,
  type ScrollViewport,
} from '../lib/scrollRowIntoView';
import { type TtsEngine, type TtsQueueItem } from '../tts.types';

import { type TtsPlaybackStatus, useTtsPlaybackQueue } from './useTtsPlaybackQueue';

/**
 * The next page, as the HOST has already proven it exists (T16). Absent means
 * "nothing follows" and no prompt is ever shown — reaching the end simply
 * returns to idle.
 */
export interface TtsNextPage {
  /** Human-readable, e.g. "Genesis 2". */
  label: string;
  /**
   * Stable identity of the page `navigate` opens, matched against the next
   * host's own `pageKey` so continued playback starts THERE and nowhere else.
   */
  pageKey: string;
  /**
   * Perform the navigation. May be async so the host can flush pending work
   * (drafting debounces saves) BEFORE the page unmounts.
   */
  navigate: () => void | Promise<void>;
}

export interface UseSourceTtsPlaybackOptions {
  engine: TtsEngine;
  /** Rows in the order they are read on screen; unplayable ones may be included. */
  rows: readonly TtsRowDraft[];
  /** Resolve a row's DOM node for scroll geometry. */
  getRowElement: (verseRef: string) => ScrollableRow | null | undefined;
  /** The scrolling container; null disables auto-scroll rather than guessing. */
  getViewport: () => ScrollViewport | null | undefined;
  /** Omit (or pass null) when nothing follows this page. */
  nextPage?: TtsNextPage | null;
  /**
   * Stable identity of the page this host is showing. Supplying it is what
   * lets a confirmed boundary crossing resume playback on arrival (T16);
   * a host that omits it simply never auto-starts.
   */
  pageKey?: string;
}

export interface SourceTtsPlaybackApi {
  status: TtsPlaybackStatus;
  activeVerseRef: string | null;
  /** Queue-wide: Stop is visible whenever anything is loading or playing (§5.1). */
  isBusy: boolean;
  /** True only for rows that have playable text (§5.1). */
  isRowPlayable: (verseRef: string) => boolean;
  /** This row is fetching its clip (§5.2). */
  isRowLoading: (verseRef: string) => boolean;
  playVerse: (verseRef: string) => void;
  playFromVerse: (verseRef: string) => void;
  /**
   * G3a: play a bounded GROUP of rows and stop at its end — pericope mode's
   * unit of playback is the pericope, not the verse. Refs may be given in any
   * order and may include unplayable rows; document order and playability come
   * from the page's own item list.
   */
  playGroup: (verseRefs: readonly string[]) => void;
  /**
   * G3a: continuous reading from this GROUP to the end of the page — the group
   * analogue of `playFromVerse`. Starts at the group's first PLAYABLE row, not
   * simply its first row, so a group opening on a reference-panel hole still
   * starts where the audio actually does.
   */
  playFromGroup: (verseRefs: readonly string[]) => void;
  /** G3a: true while the playing row is one of these — the group-level highlight. */
  isGroupSpeaking: (verseRefs: readonly string[]) => boolean;
  stop: () => void;
  /** Boundary prompt state — feed straight into `TtsBoundaryPrompt`. */
  boundaryPrompt: {
    open: boolean;
    /** Empty string when there is no next page (prompt stays closed). */
    nextPageLabel: string;
    isContinuing: boolean;
    onContinue: () => void;
    onDismiss: () => void;
  };
}

export const useSourceTtsPlayback = (
  options: UseSourceTtsPlaybackOptions
): SourceTtsPlaybackApi => {
  const { engine, rows, getRowElement, getViewport, nextPage, pageKey } = options;
  const { t } = useTranslation();

  const [isBoundaryOpen, setIsBoundaryOpen] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  // Callbacks handed to the queue must not go stale between clips, and must
  // not re-create the queue session, so the volatile inputs live in refs.
  const latest = useRef({ getRowElement, getViewport, nextPage });
  latest.current = { getRowElement, getViewport, nextPage };

  const items = useMemo(() => buildTtsQueueItems(rows), [rows]);
  const itemsRef = useRef<TtsQueueItem[]>(items);
  itemsRef.current = items;

  const handleScrollRequest = useCallback((verseRef: string) => {
    const { getRowElement: resolveRow, getViewport: resolveViewport } = latest.current;
    // Scrolls only when the row is off-screen, and never calls focus() —
    // the translator keeps their caret while playback moves (§5.2/§5.3).
    scrollRowIntoViewIfNeeded(resolveRow(verseRef), resolveViewport());
  }, []);

  const handleBoundaryReached = useCallback(() => {
    // T16: pause and ask. Opening a prompt is the ONLY thing that happens
    // here; if nothing follows this page we stay silent and idle.
    if (latest.current.nextPage) setIsBoundaryOpen(true);
  }, []);

  const handleError = useCallback(
    (_error: Error, item: TtsQueueItem) => {
      // §5.2: a failure the listener can see, in their language, naming the
      // verse — not a silent stop and not a raw engine message. The engine's
      // own message is deliberately unused: it is diagnostic, not user-facing.
      toast.error(
        t('ttsPlaybackFailed', 'Could not play audio for verse {{verseRef}}. Please try again.', {
          verseRef: item.verseRef,
        })
      );
    },
    [t]
  );

  const queue = useTtsPlaybackQueue({
    engine,
    onBoundaryReached: handleBoundaryReached,
    onError: handleError,
    onScrollRequest: handleScrollRequest,
  });

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const playVerse = useCallback((verseRef: string) => {
    const index = findTtsQueueIndex(itemsRef.current, verseRef);
    if (index < 0) return; // unplayable row: controls are disabled anyway (§5.1)
    // T1: one verse, no advance, no boundary signal.
    queueRef.current.playOne(itemsRef.current[index]);
  }, []);

  const playFromVerse = useCallback((verseRef: string) => {
    const index = findTtsQueueIndex(itemsRef.current, verseRef);
    if (index < 0) return;
    // T1: continuous from here through the end of this page's list.
    queueRef.current.playFrom(itemsRef.current, index);
  }, []);

  /**
   * G3a: pericope mode reads one group and stops there.
   *
   * No new playback mode was needed for this: `playFrom` stops at the end of
   * whatever array it is handed, so a bounded blob is simply a SHORTER array
   * built from the page's own document-ordered, playability-filtered items.
   *
   * The one thing that does need saying explicitly is the boundary. Reaching
   * the end of a list normally raises T16's "Continue on the next page?", which
   * is a lie for a group that ends mid-chapter — there is more of this page. So
   * the signal is emitted only when this group's last row is also the PAGE's
   * last row, which is exactly the case where the listener really has reached
   * the end of the page.
   */
  const playGroup = useCallback((verseRefs: readonly string[]) => {
    const wanted = new Set(verseRefs);
    const pageItems = itemsRef.current;
    const groupItems = pageItems.filter(item => wanted.has(item.verseRef));
    if (groupItems.length === 0) return; // nothing playable in this group (§5.1)

    const lastOfGroup = groupItems[groupItems.length - 1];
    const lastOfPage = pageItems[pageItems.length - 1];
    const reachesPageEnd = lastOfGroup.verseRef === lastOfPage.verseRef;

    queueRef.current.playFrom(groupItems, 0, reachesPageEnd);
  }, []);

  const playFromGroup = useCallback((verseRefs: readonly string[]) => {
    const wanted = new Set(verseRefs);
    const pageItems = itemsRef.current;
    // The group's first playable row, located in the PAGE's list so the start
    // index is the queue's index and not a rendered-row count.
    const index = pageItems.findIndex(item => wanted.has(item.verseRef));
    if (index < 0) return; // nothing playable in this group (§5.1)

    // Unbounded, exactly like playFromVerse: this runs to the end of the page,
    // so reaching that end really is the end of the page and T16's prompt is
    // the honest thing to raise.
    queueRef.current.playFrom(pageItems, index);
  }, []);

  const stop = useCallback(() => {
    queueRef.current.stop();
  }, []);

  const dismissBoundary = useCallback(() => {
    // Declining is inert by design (T16): no navigation, no playback.
    setIsBoundaryOpen(false);
  }, []);

  const continueToNextPage = useCallback(() => {
    const target = latest.current.nextPage;
    if (!target) {
      setIsBoundaryOpen(false);
      return;
    }
    setIsContinuing(true);
    // Armed BEFORE navigating, because the destination can mount while
    // `navigate` is still settling — arming afterwards would arrive too late
    // for the page it is meant for.
    armTtsContinuation(target.pageKey);
    void (async () => {
      try {
        // The host flushes pending saves inside `navigate` before it moves —
        // this await is what keeps a debounced edit from being dropped.
        await target.navigate();
      } catch {
        // Staying put on a failed navigation is the safe outcome; the host
        // owns any messaging about why it could not move. Nothing moved, so
        // the promise of continued playback is withdrawn with it.
        disarmTtsContinuation();
      } finally {
        setIsContinuing(false);
        setIsBoundaryOpen(false);
      }
    })();
  }, []);

  // The page this host is showing, as of the last commit. Compared rather
  // than depended on, because the queue must be told about a page change
  // exactly once — on the render that changes it.
  const shownPageKeyRef = useRef(pageKey);

  // A page change under a live queue, and the arrival half of T16 — one
  // effect, because they are one event seen from both sides.
  //
  // §5.2 (nothing outlives the page it belongs to): the drafting route swaps
  // its chapter data WITHOUT unmounting — the router is configured with no
  // `remountDeps`, so a Back/Forward or any chapter change re-renders this
  // host in place. The queue's unmount cleanup therefore never runs, and a
  // session started on the old chapter keeps reading its captured items while
  // `activeVerseRef` highlights whatever row now carries that verse number.
  // Stopping is the only honest outcome: the listener asked for that page.
  //
  // T16's second half: the prompt says "Continue on the next page?", so
  // turning the page without resuming keeps half of the bargain. Playback
  // restarts at the first playable row — continuing means from the top of
  // what was just opened, and `items` is already document-ordered and
  // filtered. The claim is what keeps this from firing on an ordinary visit:
  // it succeeds only for the promised page, only once, and only inside the
  // arming window. Stop-then-start is also the right order for the confirmed
  // crossing, which is the one case where both halves fire on one render.
  useEffect(() => {
    const shown = shownPageKeyRef.current;
    shownPageKeyRef.current = pageKey;

    if (shown !== pageKey) {
      queueRef.current.stop();
      // A prompt raised by the session just stopped has nothing left to
      // continue from, and it names a page the listener has already left.
      setIsBoundaryOpen(false);
    }

    if (!pageKey || items.length === 0) return;
    if (!claimTtsContinuation(pageKey)) return;
    queueRef.current.playFrom(items, 0);
  }, [pageKey, items]);

  const playableRefs = useMemo(() => new Set(items.map(item => item.verseRef)), [items]);

  const isRowPlayable = useCallback(
    (verseRef: string) => playableRefs.has(verseRef),
    [playableRefs]
  );

  const isRowLoading = useCallback(
    (verseRef: string) => queue.itemStates[verseRef] === 'synthesizing',
    [queue.itemStates]
  );

  /**
   * G3a: the group-level highlight, derived from the SAME `activeVerseRef` the
   * row highlight uses — which is what makes a display-mode switch mid-playback
   * safe to leave running: each layout can render the playing verse in its own
   * idiom without the queue knowing which layout is on screen.
   */
  const isGroupSpeaking = useCallback(
    (verseRefs: readonly string[]) =>
      queue.activeVerseRef !== null && verseRefs.includes(queue.activeVerseRef),
    [queue.activeVerseRef]
  );

  return {
    status: queue.status,
    activeVerseRef: queue.activeVerseRef,
    isBusy: queue.status !== 'idle',
    isRowPlayable,
    isRowLoading,
    playVerse,
    playFromVerse,
    playGroup,
    playFromGroup,
    isGroupSpeaking,
    stop,
    boundaryPrompt: {
      open: isBoundaryOpen,
      nextPageLabel: nextPage?.label ?? '',
      isContinuing,
      onContinue: continueToNextPage,
      onDismiss: dismissBoundary,
    },
  };
};
