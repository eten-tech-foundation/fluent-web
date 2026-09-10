/**
 * `useSourceTtsPlayback` — everything a source-scripture surface needs to host
 * TTS, so the surface itself only supplies data and refs (T3, §5.1/§5.3).
 *
 * It owns three host responsibilities the queue deliberately refuses:
 *   1. Document-order queue construction for "play from here" (§5.1).
 *   2. Conditional auto-scroll of the active row (§5.3 step 2) — no focus theft.
 *   3. Surfacing a playback failure as a toast (§5.2).
 *
 * The feature flag is not resolved here — the surface owns it (§6.3, T12) and
 * hands the answer down as `enabled`. The surface cannot express that gate by
 * skipping the call, because React forbids a conditional hook, so honouring
 * `enabled` is THIS hook's job.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { buildTtsQueueItems, findTtsQueueIndex, type TtsRowDraft } from '../lib/buildTtsQueueItems';
import { createTtsSegment } from '../lib/createTtsSegment';
import {
  type ScrollableRow,
  scrollRowIntoViewIfNeeded,
  type ScrollViewport,
} from '../lib/scrollRowIntoView';
import { type TtsEngine, type TtsQueueItem, type TtsServedFormat } from '../tts.types';

import { type TtsPlaybackStatus, useTtsPlaybackQueue } from './useTtsPlaybackQueue';

export interface UseSourceTtsPlaybackOptions {
  engine: TtsEngine;
  /** Rows in the order they are read on screen; unplayable ones may be included. */
  rows: readonly TtsRowDraft[];
  /** Resolve a row's DOM node for scroll geometry. */
  getRowElement: (verseRef: string) => ScrollableRow | null | undefined;
  /** The scrolling container; null disables auto-scroll rather than guessing. */
  getViewport: () => ScrollViewport | null | undefined;
  /**
   * Stable page identity: playback state is dropped when this changes.
   * The drafting route swaps chapter data WITHOUT unmounting (no router
   * `remountDeps`), so unmount cleanup alone cannot silence the old chapter.
   * Otherwise its captured items keep playing while `activeVerseRef`
   * highlights the same verse number on the new page.
   */
  pageKey?: string;
  /**
   * The surface's feature-flag answer, already merged with any local override
   * (O3) — pass the same boolean that decides whether controls render.
   *
   * False stops anything already playing. This matters to the listener,
   * because the controls and the Alt+S shortcut disappear WITH the flag, so a
   * queue left running would have nothing left to stop it. Defaults to true so
   * a surface with no flag of its own needs no argument.
   */
  enabled?: boolean;
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
  /**
   * Which container this row's clip was served as (§9.2) — a verification
   * signal, not playback. Undefined until the row has a clip.
   */
  servingFor: (verseRef: string) => TtsServedFormat | undefined;
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
}

export const useSourceTtsPlayback = (
  options: UseSourceTtsPlaybackOptions
): SourceTtsPlaybackApi => {
  const { engine, rows, getRowElement, getViewport, pageKey, enabled = true } = options;
  const { t } = useTranslation();

  // Callbacks handed to the queue must not go stale between clips, and must
  // not re-create the queue session, so the volatile inputs live in refs.
  const latest = useRef({ getRowElement, getViewport, engine, pageKey });
  latest.current = { getRowElement, getViewport, engine, pageKey };
  const [itemServing, setItemServing] = useState<Record<string, TtsServedFormat>>({});
  const segmentFor = useCallback(
    (item: TtsQueueItem) =>
      createTtsSegment(item, {
        engine: latest.current.engine,
        playableKey: JSON.stringify([latest.current.pageKey, item.audioSource, item.verseRef]),
        onServing: (verseRef, servedAs) =>
          setItemServing(previous => ({ ...previous, [verseRef]: servedAs })),
      }),
    []
  );

  const items = useMemo(() => buildTtsQueueItems(rows), [rows]);
  const itemsRef = useRef<TtsQueueItem[]>(items);
  itemsRef.current = items;

  const handleScrollRequest = useCallback((verseRef: string) => {
    const { getRowElement: resolveRow, getViewport: resolveViewport } = latest.current;
    // Scrolls only when the row is off-screen, and never calls focus() —
    // the translator keeps their caret while playback moves (§5.2/§5.3).
    scrollRowIntoViewIfNeeded(resolveRow(verseRef), resolveViewport());
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
    onError: handleError,
    onAutoplayRefused: (_snapshot, segment) =>
      handleError(new Error('Playback requires a user gesture'), segment),
    onScrollRequest: handleScrollRequest,
  });

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const playVerse = useCallback(
    (verseRef: string) => {
      const index = findTtsQueueIndex(itemsRef.current, verseRef);
      if (index < 0) return; // unplayable row: controls are disabled anyway (§5.1)
      // T1: one verse, no advance.
      setItemServing({});
      queueRef.current.playOne(segmentFor(itemsRef.current[index]));
    },
    [segmentFor]
  );

  const playFromVerse = useCallback(
    (verseRef: string) => {
      const index = findTtsQueueIndex(itemsRef.current, verseRef);
      if (index < 0) return;
      // T1: continuous from here through the end of this page's list.
      setItemServing({});
      queueRef.current.playFrom(itemsRef.current.map(segmentFor), index);
    },
    [segmentFor]
  );

  /**
   * G3a: pericope mode reads one group and stops there.
   *
   * No new playback mode was needed for this: `playFrom` stops at the end of
   * whatever array it is handed, so a bounded blob is simply a SHORTER array
   * built from the page's own document-ordered, playability-filtered items.
   */
  const playGroup = useCallback(
    (verseRefs: readonly string[]) => {
      const wanted = new Set(verseRefs);
      const pageItems = itemsRef.current;
      const groupItems = pageItems.filter(item => wanted.has(item.verseRef));
      if (groupItems.length === 0) return; // nothing playable in this group (§5.1)

      setItemServing({});
      const key = JSON.stringify([
        latest.current.pageKey,
        groupItems[0].audioSource,
        groupItems.map(item => item.verseRef),
      ]);
      queueRef.current.playFrom(
        groupItems.map(item => ({ ...segmentFor(item), playableKey: key })),
        0
      );
    },
    [segmentFor]
  );

  const playFromGroup = useCallback(
    (verseRefs: readonly string[]) => {
      const wanted = new Set(verseRefs);
      const pageItems = itemsRef.current;
      // The group's first playable row, located in the PAGE's list so the start
      // index is the queue's index and not a rendered-row count.
      const index = pageItems.findIndex(item => wanted.has(item.verseRef));
      if (index < 0) return; // nothing playable in this group (§5.1)

      // Exactly like playFromVerse: this runs to the end of the page and stops.
      setItemServing({});
      queueRef.current.playFrom(pageItems.map(segmentFor), index);
    },
    [segmentFor]
  );

  const stop = useCallback(() => {
    queueRef.current.stop();
  }, []);

  // The page this host is showing, as of the last commit. Compared rather
  // than depended on, because the queue must be told about a page change
  // exactly once — on the render that changes it.
  const shownPageKeyRef = useRef(pageKey);

  // Nothing outlives the page it belongs to; see pageKey's option doc above.
  useEffect(() => {
    const shown = shownPageKeyRef.current;
    shownPageKeyRef.current = pageKey;

    if (shown !== pageKey) {
      queueRef.current.stop();
    }
  }, [pageKey]);

  // Turning the feature off takes live playback with it. Stopping an idle
  // queue is a no-op, which is the common case (every mount with the flag off).
  useEffect(() => {
    if (enabled) return;
    queueRef.current.stop();
  }, [enabled]);

  const playableRefs = useMemo(() => new Set(items.map(item => item.verseRef)), [items]);

  const isRowPlayable = useCallback(
    (verseRef: string) => playableRefs.has(verseRef),
    [playableRefs]
  );

  const isRowLoading = useCallback(
    (verseRef: string) => queue.itemStates[verseRef] === 'synthesizing',
    [queue.itemStates]
  );

  // The serving wash is a TTS diagnostic, not generic player state.
  useEffect(() => {
    if (queue.status === 'idle') setItemServing({});
  }, [queue.status]);

  const servingFor = useCallback((verseRef: string) => itemServing[verseRef], [itemServing]);

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
    servingFor,
    playVerse,
    playFromVerse,
    playGroup,
    playFromGroup,
    isGroupSpeaking,
    stop,
  };
};
