/**
 * `useSourceTtsPlayback` — everything a source-scripture surface needs to host
 * recorded audio with TTS fallback, supplying only source identity, data and refs.
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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { isPlayableRow } from '../lib/buildTtsQueueItems';
import { createTtsSegment } from '../lib/createTtsSegment';
import {
  type ScrollableRow,
  scrollRowIntoViewIfNeeded,
  type ScrollViewport,
} from '../lib/scrollRowIntoView';
import { writeRecord } from '../registry/pauseRecord';
import { usePlaybackRegistry } from '../registry/usePlaybackRegistry';
import { ChapterAudioCache } from '../resolver/chapterCache';
import { resolvePlayables, type SourceAudioRow } from '../resolver/resolvePlayables';
import { type ChapterSourceAudioRequest } from '../resolver/sourceAudioClient';
import { type Playable, type Segment } from '../seam/types';
import { RecordedRecoveryStrategy } from '../strategies/recordedRecoveryStrategy';
import { type TtsEngine, type TtsServedFormat } from '../tts.types';

import { type TtsPlaybackStatus, useTtsPlaybackQueue } from './useTtsPlaybackQueue';

export interface UseSourceTtsPlaybackOptions {
  engine: TtsEngine;
  /** Rows in the order they are read on screen; unplayable ones may be included. */
  rows: readonly SourceAudioRow[];
  /** Null for reference-panel text: its provider identity is not a Fluent Bible id. */
  sourceChapter: ChapterSourceAudioRequest | null;
  /** Domain-qualified reference selection identity; never used to select an audio provider. */
  referenceBibleId: string | null;
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
  /** Pause drops all media and keeps only a page-lifetime position. */
  pause: () => void;
  /** Explicit reset retained for surfaces that need Stop rather than Pause. */
  stop: () => void;
  restartVerse: (verseRef: string) => void;
  restartGroup: (verseRefs: readonly string[]) => void;
  verseKey: (verseRef: string) => string | null;
  groupKey: (verseRefs: readonly string[]) => string | null;
}

interface HostRun {
  items: Segment[];
  keys: Set<string>;
  liveKey: string;
}

export const useSourceTtsPlayback = (
  options: UseSourceTtsPlaybackOptions
): SourceTtsPlaybackApi => {
  const {
    engine,
    rows,
    sourceChapter,
    referenceBibleId,
    getRowElement,
    getViewport,
    pageKey,
    enabled = true,
  } = options;
  const { t } = useTranslation();
  const registry = usePlaybackRegistry();
  const runRef = useRef<HostRun | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);

  // Callbacks handed to the queue must not go stale between clips, and must
  // not re-create the queue session, so the volatile inputs live in refs.
  const latest = useRef({
    getRowElement,
    getViewport,
    engine,
    pageKey,
    sourceChapter,
    referenceBibleId,
  });
  latest.current = { getRowElement, getViewport, engine, pageKey, sourceChapter, referenceBibleId };
  const [cache] = useState(() => new ChapterAudioCache());
  const [itemServing, setItemServing] = useState<Record<string, TtsServedFormat>>({});
  const playablesFor = useCallback(
    (sourceRows: readonly SourceAudioRow[], pericopeId?: string): Playable[] => {
      const {
        engine: currentEngine,
        pageKey: currentPage,
        sourceChapter: chapter,
        referenceBibleId: referenceId,
      } = latest.current;
      const construction = {
        engine: currentEngine,
        pageKey: currentPage ?? '',
        onServing: (verseRef: string, servedAs: TtsServedFormat) =>
          setItemServing(previous => ({ ...previous, [verseRef]: servedAs })),
      };
      if (chapter) {
        return resolvePlayables(sourceRows, {
          ...construction,
          ...chapter,
          cache,
          recordedRecovery: RecordedRecoveryStrategy,
          pericopeId,
        });
      }
      // Reference Bibles still use their own text/language. Never resolve their
      // recording using the project's Bible id; provider identity wiring is separate.
      if (referenceId === null) return [];
      const groups = pericopeId === undefined ? sourceRows.map(row => [row]) : [sourceRows];
      return groups
        .filter(group => group.length > 0)
        .map(group => {
          const key = JSON.stringify([
            construction.pageKey,
            'referenceBible',
            referenceId,
            pericopeId ?? group[0].verseRef,
            group.map(row => [row.verseNumber, row.langCode, row.text]),
          ]);
          return {
            key,
            segments: group.map(row =>
              createTtsSegment(
                { ...row, text: (row.text ?? '').trim(), langCode: row.langCode || undefined },
                { ...construction, playableKey: key }
              )
            ),
          };
        });
    },
    [cache]
  );

  // Text holes remain disabled in this text-drafting host. The resolver itself
  // accepts text-free rows for future audio-only surfaces.
  const items = useMemo(() => rows.filter(isPlayableRow), [rows]);
  const itemsRef = useRef<readonly SourceAudioRow[]>(items);
  itemsRef.current = items;

  const handleScrollRequest = useCallback(
    (verseRef: string) => {
      const run = runRef.current;
      const key = run?.items.find(item => item.verseRef === verseRef)?.playableKey;
      if (run && key) {
        // The old playable has naturally completed, even if this run continues.
        if (run.liveKey !== key) registry.clearRecord(run.liveKey);
        run.liveKey = key;
        registry.setLive(key);
      }
      const { getRowElement: resolveRow, getViewport: resolveViewport } = latest.current;
      // Scrolls only when the row is off-screen, and never calls focus().
      scrollRowIntoViewIfNeeded(resolveRow(verseRef), resolveViewport());
    },
    [registry]
  );

  const handleError = useCallback(
    (_error: Error, item: Segment) => {
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
    onError: (error, segment) => {
      finishRun();
      handleError(error, segment);
    },
    onAutoplayRefused: (snapshot, segment) => {
      writeRecord(registry, snapshot);
      finishRun();
      handleError(new Error('Playback requires a user gesture'), segment);
    },
    onRunEnd: aiMarkedKeys => {
      for (const key of runRef.current?.keys ?? []) {
        registry.setLastDynamicAi(key, aiMarkedKeys.has(key));
      }
    },
    onRunComplete: () => finishRun(true),
    onScrollRequest: handleScrollRequest,
  });

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const finishRun = useCallback(
    (completed = false) => {
      const run = runRef.current;
      if (!run) return;
      for (const key of run.keys) {
        if (completed) registry.clearRecord(key);
      }
      // An idle/unmounting host must not clear a different host's live key.
      if (registry.isLive(run.liveKey)) registry.setLive(null);
      releaseRef.current?.();
      releaseRef.current = null;
      runRef.current = null;
    },
    [registry]
  );

  const pause = useCallback(() => {
    const snapshot = queueRef.current.pause();
    if (snapshot) writeRecord(registry, snapshot);
    finishRun();
  }, [finishRun, registry]);

  const stopWithoutRecord = useCallback(() => {
    queueRef.current.stop();
    finishRun();
  }, [finishRun]);

  const startRun = useCallback(
    (playables: Playable[], index = 0, bounded = false) => {
      if (!enabled) return;
      const segments = playables.flatMap(playable => playable.segments);
      const first = segments.at(index);
      if (!first) return;
      // The claim pauses AND records synchronously, before reading resume data.
      releaseRef.current = registry.claim(pause);
      const record = bounded ? registry.getRecord(first.playableKey) : null;
      const startIndex = record?.itemIndex ?? index;
      const keys = new Set(segments.slice(startIndex).map(segment => segment.playableKey));
      runRef.current = { items: segments, keys, liveKey: first.playableKey };
      for (const key of keys) {
        registry.setLastDynamicAi(key, false);
        const chapter = latest.current.sourceChapter;
        registry.setStaticAi(key, !chapter || cache.peek(chapter)?.verseAddressable === false);
      }
      registry.setLive(first.playableKey);
      setItemServing({});
      const seed = record ? { forceTts: record.forceTts } : undefined;
      if (bounded && segments.length === 1) {
        if (record) queueRef.current.playOne(first, record.currentTime, seed);
        else queueRef.current.playOne(first);
      } else if (record) {
        queueRef.current.playFrom(segments, startIndex, record.currentTime, seed);
      } else queueRef.current.playFrom(segments, startIndex);
    },
    [cache, enabled, pause, registry]
  );

  const versePlayable = useCallback(
    (verseRef: string) => {
      const row = itemsRef.current.find(item => item.verseRef === verseRef);
      return row ? playablesFor([row]).at(0) : undefined;
    },
    [playablesFor]
  );

  const groupPlayable = useCallback(
    (verseRefs: readonly string[]) => {
      const wanted = new Set(verseRefs);
      const group = itemsRef.current.filter(item => wanted.has(item.verseRef));
      return playablesFor(group, JSON.stringify(group.map(item => item.verseRef))).at(0);
    },
    [playablesFor]
  );

  const playBounded = useCallback(
    (playable: Playable | undefined) => {
      if (!playable) return;
      // Deliberate reading of the source-audio card: primary pauses, not resets.
      if (registry.isLive(playable.key)) registry.silenceAll();
      else startRun([playable], 0, true);
    },
    [registry, startRun]
  );

  const playVerse = useCallback(
    (verseRef: string) => {
      playBounded(versePlayable(verseRef));
    },
    [playBounded, versePlayable]
  );

  const playFromVerse = useCallback(
    (verseRef: string) => {
      const index = itemsRef.current.findIndex(item => item.verseRef === verseRef);
      if (index < 0) return;
      // A range has no persistent identity; recreate it from the caret.
      startRun(playablesFor(itemsRef.current), index);
    },
    [playablesFor, startRun]
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
      playBounded(groupPlayable(verseRefs));
    },
    [groupPlayable, playBounded]
  );

  const playFromGroup = useCallback(
    (verseRefs: readonly string[]) => {
      const wanted = new Set(verseRefs);
      const pageItems = itemsRef.current;
      // The group's first playable row, located in the PAGE's list so the start
      // index is the queue's index and not a rendered-row count.
      const index = pageItems.findIndex(item => wanted.has(item.verseRef));
      if (index < 0) return; // nothing playable in this group (§5.1)

      startRun(playablesFor(pageItems), index);
    },
    [playablesFor, startRun]
  );

  const restart = useCallback(
    (playable: Playable | undefined) => {
      if (!playable) return;
      const live = registry.isLive(playable.key);
      if (live) registry.silenceAll();
      registry.clearRecord(playable.key);
      if (live) startRun([playable], 0, true);
    },
    [registry, startRun]
  );

  const stop = useCallback(() => {
    const key = runRef.current?.liveKey;
    stopWithoutRecord();
    if (key) registry.clearRecord(key);
  }, [registry, stopWithoutRecord]);

  const restartVerse = useCallback(
    (verseRef: string) => restart(versePlayable(verseRef)),
    [restart, versePlayable]
  );
  const restartGroup = useCallback(
    (verseRefs: readonly string[]) => restart(groupPlayable(verseRefs)),
    [groupPlayable, restart]
  );
  const verseKey = useCallback(
    (verseRef: string) => versePlayable(verseRef)?.key ?? null,
    [versePlayable]
  );
  const groupKey = useCallback(
    (verseRefs: readonly string[]) => groupPlayable(verseRefs)?.key ?? null,
    [groupPlayable]
  );

  // The page this host is showing, as of the last commit. Compared rather
  // than depended on, because the queue must be told about a page change
  // exactly once — on the render that changes it.
  const shownPageKeyRef = useRef(pageKey);

  // Nothing outlives the page it belongs to; see pageKey's option doc above.
  useEffect(() => {
    const shown = shownPageKeyRef.current;
    shownPageKeyRef.current = pageKey;

    if (shown !== pageKey) stopWithoutRecord();
    registry.setPageKey(pageKey ?? '');
  }, [pageKey, registry, stopWithoutRecord]);

  // Release before the Provider's passive unmount silence loop: unmount stops
  // without writing a record, even when the whole app tree is removed together.
  useLayoutEffect(() => () => stopWithoutRecord(), [stopWithoutRecord]);

  // Rebuild static knowledge without fetching availability just for a badge.
  useEffect(() => {
    const knownTts = !sourceChapter || cache.peek(sourceChapter)?.verseAddressable === false;
    for (const playable of playablesFor(items)) registry.setStaticAi(playable.key, knownTts);
  }, [cache, items, pageKey, playablesFor, referenceBibleId, registry, sourceChapter]);

  useEffect(() => {
    if (queue.status === 'idle') finishRun();
  }, [finishRun, queue.status]);

  // A captured chapter response (including its media URLs) never outlives the page.
  useEffect(() => () => cache.clear(), [cache, pageKey]);

  // Turning the feature off takes live playback with it. Stopping an idle
  // queue is a no-op, which is the common case (every mount with the flag off).
  useEffect(() => {
    if (enabled) return;
    stopWithoutRecord();
  }, [enabled, stopWithoutRecord]);

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
    pause,
    stop,
    restartVerse,
    restartGroup,
    verseKey,
    groupKey,
  };
};
