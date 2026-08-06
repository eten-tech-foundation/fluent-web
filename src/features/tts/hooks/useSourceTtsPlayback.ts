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

import { useCallback, useMemo, useRef, useState } from 'react';

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { buildTtsQueueItems, findTtsQueueIndex, type TtsRowDraft } from '../lib/buildTtsQueueItems';
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
  const { engine, rows, getRowElement, getViewport, nextPage } = options;
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
    void (async () => {
      try {
        // The host flushes pending saves inside `navigate` before it moves —
        // this await is what keeps a debounced edit from being dropped.
        await target.navigate();
      } catch {
        // Staying put on a failed navigation is the safe outcome; the host
        // owns any messaging about why it could not move.
      } finally {
        setIsContinuing(false);
        setIsBoundaryOpen(false);
      }
    })();
  }, []);

  const playableRefs = useMemo(() => new Set(items.map(item => item.verseRef)), [items]);

  const isRowPlayable = useCallback(
    (verseRef: string) => playableRefs.has(verseRef),
    [playableRefs]
  );

  const isRowLoading = useCallback(
    (verseRef: string) => queue.itemStates[verseRef] === 'synthesizing',
    [queue.itemStates]
  );

  return {
    status: queue.status,
    activeVerseRef: queue.activeVerseRef,
    isBusy: queue.status !== 'idle',
    isRowPlayable,
    isRowLoading,
    playVerse,
    playFromVerse,
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
