/** A page-local player: L2 chooses sources; this queue owns runs, media and recovery machinery. */
import { useEffect, useRef, useState } from 'react';

import { type ClipAudioElement, createClipAudioElement, onClipEvent } from '../lib/audioElement';
import { supervisePlayback, type PlaybackRecovery } from '../lib/playbackRecovery';
import {
  PlaybackTiming,
  type PlaybackStart,
  type PlaybackTimingReport,
  resolvePlaybackStart,
} from '../lib/playbackTiming';
import { areAdjacentSources, watchPlaybackWindow } from '../lib/windowPlayback';

import type {
  BudgetKey,
  PlaybackRunState,
  PlayableKey,
  RecoveryRequests,
  Segment,
  Source,
} from '../seam/types';

/**
 * Lazy prefetch starts only during playback, one segment ahead, at most two,
 * never chapter-wide. The pericope press produces its verses lazily; verse and
 * pericope playback share the same artifacts. Recovery may also spend. There is
 * no eager synthesis or speculative sidecar pass (requirements: prefetch/cache).
 */
export const TTS_PREFETCH_DEPTH = 1;
export const TTS_MAX_PREFETCH_DEPTH = 2;
export type TtsPlaybackStatus = 'idle' | 'loading' | 'playing';
export type TtsQueueItemState = 'synthesizing' | 'buffered' | 'playing';

/** A report for the host's registry, not a retained player or a resume store. */
export interface PauseSnapshot {
  playableKey: PlayableKey;
  /** Index within the sounding playable, not within a multi-playable run. */
  itemIndex: number;
  verseRef: string;
  /** File-absolute element time, with no window start subtracted. */
  currentTime: number;
  /** Fractional intent retained until a lazy source/metadata resolves it. */
  pendingFraction?: number;
  forceTts: boolean;
}

export interface UseTtsPlaybackQueueOptions {
  onError?: (error: Error, segment: Segment) => void;
  onAutoplayRefused?: (snapshot: PauseSnapshot, segment: Segment) => void;
  onRunComplete?: () => void;
  /** Final latch values, synchronously reported before the host handles termination. */
  onRunEnd?: (aiMarkedKeys: ReadonlySet<PlayableKey>) => void;
  onScrollRequest?: (verseRef: string) => void;
  /** Reports the resolved source before the first physical play, including replacements. */
  onSourceReady?: (source: Source, segment: Segment) => void;
  /** Reports the sounding source without interpreting its resource metadata. */
  onSourcePlaying?: (source: Source, segment: Segment) => void;
  onTiming?: (report: PlaybackTimingReport) => void;
  prefetchDepth?: number;
  createElement?: (src: string) => ClipAudioElement;
  maxRetriesPerClass?: number;
  maxStallPolls?: number;
}

export interface TtsPlaybackQueueApi {
  status: TtsPlaybackStatus;
  activeVerseRef: string | null;
  itemStates: Readonly<Record<string, TtsQueueItemState>>;
  /** This run's latch; the host owns persistence of its last value. */
  aiMarkedKeys: ReadonlySet<PlayableKey>;
  playbackRate: number;
  playOne: (segment: Segment, startOffset?: number, inheritedRunState?: PlaybackRunState) => void;
  playFrom: (
    segments: Segment[],
    startIndex: number,
    startOffset?: PlaybackStart,
    inheritedRunState?: PlaybackRunState
  ) => void;
  /** No snapshot while idle or before any source position is known; always cancels the run. */
  pause: () => PauseSnapshot | null;
  /** Temporarily silence the live element without ending its run or losing its position. */
  hold: () => boolean;
  /** Continue a run previously silenced with `hold`. */
  resumeHeld: () => void;
  stop: () => void;
  setPlaybackRate: (rate: number) => void;
}

type ResolutionAction = (requests: RecoveryRequests) => void;
interface SourceEntry {
  source?: Source;
  element?: ClipAudioElement;
  failed: boolean;
  error?: unknown;
  promise: Promise<void>;
  controller: AbortController;
  /** Requests are queued until adoption; a prefetch never changes the sounding segment. */
  actions: ResolutionAction[];
  detachWatch: () => void;
  detachTiming: () => void;
  dispose: () => void;
}

interface PlaybackSession {
  controller: AbortController;
  items: Segment[];
  timing: PlaybackTiming;
  index: number;
  budgets: Map<BudgetKey, number>;
  aiMarked: Set<PlayableKey>;
  /** Storage only. L2 reads this through its resolution context; L3 never selects from it. */
  resolutionState: PlaybackRunState;
  current?: { segment: Segment; source: Source; startOffset: number };
  prefetches: Map<number, SourceEntry>;
  activeElement?: ClipAudioElement;
  activePlayback?: PlaybackRecovery;
  clipCleanups: Array<() => void>;
  segmentCleanups: Array<() => void>;
  startOffset?: number;
  pendingFraction?: number;
  /** Start-of-segment intent before a lazy source reveals its absolute window. */
  pendingLogicalStart: boolean;
}

const teardownSegment = (session: PlaybackSession): void => {
  for (const cleanup of session.segmentCleanups) cleanup();
  session.segmentCleanups = [];
};

const teardownActiveClip = (session: PlaybackSession): void => {
  teardownSegment(session);
  for (const cleanup of session.clipCleanups) cleanup();
  session.clipCleanups = [];
  session.activeElement?.pause();
  session.activeElement = undefined;
  session.activePlayback = undefined;
  session.current = undefined;
};

const disposeSession = (session: PlaybackSession): void => {
  teardownActiveClip(session);
  session.controller.abort();
  for (const entry of session.prefetches.values()) entry.dispose();
  session.prefetches.clear();
};

export const useTtsPlaybackQueue = (options: UseTtsPlaybackQueueOptions): TtsPlaybackQueueApi => {
  const [status, setStatus] = useState<TtsPlaybackStatus>('idle');
  const [activeVerseRef, setActiveVerseRef] = useState<string | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, TtsQueueItemState>>({});
  const [aiMarkedKeys, setAiMarkedKeys] = useState<ReadonlySet<PlayableKey>>(new Set());
  const [playbackRate, setPlaybackRateState] = useState(1);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const rateRef = useRef(1);
  const optionsRef = useRef(options);
  const holdRequestedRef = useRef(false);
  optionsRef.current = options;

  const isCurrent = (session: PlaybackSession): boolean =>
    sessionRef.current === session && !session.controller.signal.aborted;

  const setItemState = (verseRef: string, state: TtsQueueItemState | undefined): void => {
    setItemStates(previous => {
      const next = { ...previous };
      if (state === undefined) delete next[verseRef];
      else next[verseRef] = state;
      return next;
    });
  };

  const reportTiming = (session: PlaybackSession): void => {
    if (!isCurrent(session)) return;
    optionsRef.current.onTiming?.({
      ...session.timing.report(
        session.index,
        session.activeElement?.currentTime ?? session.startOffset ?? 0
      ),
      pendingFraction: session.pendingFraction,
    });
  };

  const goIdle = (session: PlaybackSession): void => {
    reportTiming(session);
    disposeSession(session);
    if (sessionRef.current === session) sessionRef.current = null;
    setStatus('idle');
    setActiveVerseRef(null);
    setItemStates({});
    // React may not have rendered the last mark before a refusal or pause.
    // Report data from the ending run, never the host's previous render.
    optionsRef.current.onRunEnd?.(new Set(session.aiMarked));
  };

  const stop = (): void => {
    if (sessionRef.current) goIdle(sessionRef.current);
  };

  const snapshotOf = (session: PlaybackSession): PauseSnapshot | null => {
    const segment = session.items[session.index];
    const currentTime = session.current
      ? (session.activeElement?.currentTime ?? session.current.startOffset)
      : session.startOffset;
    const pendingFraction =
      session.pendingFraction ?? (session.pendingLogicalStart ? 0 : undefined);
    // No file position exists before lazy resolution. Zero would fabricate a
    // resume offset outside a yet-unknown window; pausing still cancels the run.
    if (currentTime === undefined && pendingFraction === undefined) return null;
    return {
      playableKey: segment.playableKey,
      itemIndex: session.items
        .slice(0, session.index)
        .filter(item => item.playableKey === segment.playableKey).length,
      verseRef: segment.verseRef,
      currentTime: currentTime ?? 0,
      ...(pendingFraction === undefined ? {} : { pendingFraction }),
      // Copy the run instruction and this key's latch; never choose media from them.
      forceTts: session.resolutionState.forceTts || session.aiMarked.has(segment.playableKey),
    };
  };

  const pause = (): PauseSnapshot | null => {
    const session = sessionRef.current;
    if (!session?.items[session.index]) return null;
    const snapshot = snapshotOf(session);
    goIdle(session);
    return snapshot;
  };

  const giveUp = (session: PlaybackSession, error: Error, segment: Segment): void => {
    if (!isCurrent(session)) return;
    goIdle(session);
    optionsRef.current.onError?.(error, segment);
  };

  const hold = (): boolean => {
    holdRequestedRef.current = true;
    const session = sessionRef.current;
    session?.activePlayback?.hold();
    session?.activeElement?.pause();
    return session !== null;
  };

  const resumeHeld = (): void => {
    if (!holdRequestedRef.current) return;
    holdRequestedRef.current = false;
    const session = sessionRef.current;
    session?.activePlayback?.resume();
  };

  const markAi = (session: PlaybackSession, key: PlayableKey): void => {
    if (!isCurrent(session)) return;
    session.aiMarked.add(key);
    setAiMarkedKeys(new Set(session.aiMarked));
  };

  const createEntry = (session: PlaybackSession, index: number): SourceEntry => {
    const segment = session.items[index];
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    session.controller.signal.addEventListener('abort', abort, { once: true });
    const entry: SourceEntry = {
      controller,
      failed: false,
      actions: [],
      promise: Promise.resolve(),
      detachWatch: () => {},
      detachTiming: () => {},
      dispose: () => {
        controller.abort();
        entry.detachWatch();
        entry.detachTiming();
        entry.element?.pause();
        session.controller.signal.removeEventListener('abort', abort);
      },
    };
    entry.promise = (async () => {
      try {
        const next = segment.source;
        const source = await (typeof next === 'function'
          ? next({
              signal: controller.signal,
              run: session.resolutionState,
              requests: {
                attach: strategy => {
                  entry.actions.push(requests => requests.attach(strategy));
                },
                markAi: () => {
                  entry.actions.push(requests => requests.markAi());
                },
              },
            })
          : next);
        if (!isCurrent(session) || controller.signal.aborted) return;
        entry.source = source;
        const element = (optionsRef.current.createElement ?? createClipAudioElement)(source.url);
        entry.element = element;
        session.timing.source(index, source);
        const measure = () => {
          if (!isCurrent(session) || controller.signal.aborted) return;
          session.timing.measure(index, element.duration);
          reportTiming(session);
        };
        const detachMetadata = onClipEvent(element, 'loadedmetadata', measure);
        const detachDuration = onClipEvent(element, 'durationchange', measure);
        entry.detachTiming = () => {
          detachMetadata();
          detachDuration();
        };
        measure();
        // A failed early load cannot be adopted as buffered media.
        entry.detachWatch = onClipEvent(element, 'error', () => {
          entry.failed = true;
          if (session.prefetches.get(index) === entry) setItemState(segment.verseRef, undefined);
        });
        if (session.prefetches.get(index) === entry) setItemState(segment.verseRef, 'buffered');
      } catch (error) {
        entry.failed = true;
        entry.error = error;
      }
    })();
    return entry;
  };

  const schedulePrefetch = (session: PlaybackSession, playingIndex: number): void => {
    if (!isCurrent(session) || session.index !== playingIndex) return;
    const depth = Math.min(
      Math.max(optionsRef.current.prefetchDepth ?? TTS_PREFETCH_DEPTH, 0),
      TTS_MAX_PREFETCH_DEPTH
    );
    for (let ahead = 1; ahead <= depth; ahead += 1) {
      const index = playingIndex + ahead;
      const segment = session.items[index] as Segment | undefined;
      if (!segment || session.prefetches.has(index)) continue;
      setItemState(segment.verseRef, 'synthesizing');
      session.prefetches.set(index, createEntry(session, index));
    }
  };

  const clearPrefetches = (session: PlaybackSession): void => {
    for (const [index, entry] of session.prefetches) {
      entry.dispose();
      setItemState(session.items[index].verseRef, undefined);
    }
    session.prefetches.clear();
  };

  const handOff = (session: PlaybackSession, segment: Segment, next: Segment['source']): void => {
    session.resolutionState.forceTts = true;
    segment.source = next;
    // The downgrade covers the remaining RUN, even across playable boundaries.
    // Cancel all speculative choices; the same L2 thunks resolve them afresh.
    clearPrefetches(session);
  };

  const activate = (
    session: PlaybackSession,
    index: number,
    entry: SourceEntry & { source: Source },
    element: ClipAudioElement,
    startOffset?: PlaybackStart,
    continuing = false
  ): void => {
    const segment = session.items[index];
    session.index = index;
    session.pendingLogicalStart = false;
    session.budgets.clear();
    const initialOffset = resolvePlaybackStart(
      startOffset,
      entry.source,
      session.timing.duration(index)
    );
    session.startOffset = initialOffset ?? entry.source.window?.[0] ?? 0;
    session.activeElement = element;
    let loaded = false;
    session.pendingFraction =
      typeof startOffset === 'object' && session.timing.duration(index) === null
        ? Math.max(0, Math.min(1, startOffset.fraction))
        : undefined;
    const sample = () => {
      if (!isCurrent(session) || session.index !== index) return;
      session.timing.measure(index, element.duration);
      reportTiming(session);
    };
    const metadata = () => {
      if (!isCurrent(session) || session.index !== index) return;
      session.timing.measure(index, element.duration);
      if (session.pendingFraction !== undefined && session.current) {
        element.currentTime =
          resolvePlaybackStart(
            { fraction: session.pendingFraction },
            session.current.source,
            session.timing.duration(index)
          ) ?? 0;
        session.pendingFraction = undefined;
      }
      reportTiming(session);
    };
    const finish = (canContinue = true): void => {
      if (!isCurrent(session) || session.index !== index) return;
      session.timing.measure(index, element.duration, element.currentTime);
      reportTiming(session);
      const next = session.prefetches.get(index + 1);
      const current = session.current?.source;
      // Re-read the live items and resolved sources at every boundary. Never
      // capture a stretch's count or endpoint across recovery/source replacement.
      if (
        canContinue &&
        session.items[index + 1] &&
        current &&
        next?.source &&
        !next.failed &&
        areAdjacentSources(current, next.source)
      ) {
        session.prefetches.delete(index + 1);
        next.detachWatch();
        next.detachTiming();
        next.element?.pause(); // Only the unused speculative element, not the sounding one.
        teardownSegment(session);
        setItemState(segment.verseRef, undefined);
        activate(session, index + 1, { ...next, source: next.source }, element, undefined, true);
        // The adopted policy may retain its resolution signal for later recovery.
        // Keep that signal alive until this logical segment is detached.
        session.segmentCleanups.push(next.dispose);
      } else {
        // Halt now, before any asynchronous resolution of the next segment.
        element.pause();
        void advance(session, index + 1);
      }
    };
    const window = watchPlaybackWindow(element, finish);
    const supervision = supervisePlayback({
      element,
      source: entry.source,
      recovery: segment.recovery,
      initialLoadFailed: entry.failed,
      signal: session.controller.signal,
      run: session.resolutionState,
      budgets: session.budgets,
      maxRetriesPerClass: optionsRef.current.maxRetriesPerClass ?? 2,
      maxStallPolls: optionsRef.current.maxStallPolls ?? 30,
      shouldHold: () => holdRequestedRef.current,
      onGiveUp: reason => giveUp(session, new Error(reason), segment),
      onAutoplayRefused: () => {
        if (!isCurrent(session)) return;
        const snapshot = pause();
        if (snapshot) optionsRef.current.onAutoplayRefused?.(snapshot, segment);
      },
      onMarkAi: () => markAi(session, segment.playableKey),
      onHandOff: next => handOff(session, segment, next),
      onAttach: recovery => {
        segment.recovery = recovery;
      },
      onSource: (source, offset) => {
        optionsRef.current.onSourceReady?.(source, segment);
        // A healed chapter can change every window, even under the same URL.
        // Drop speculative descriptors; their lazy resolvers consult the healed cache.
        if (
          loaded &&
          (session.current?.source.window ||
            source.window ||
            session.current?.source.url !== source.url)
        )
          clearPrefetches(session);
        if (loaded) session.pendingFraction = undefined;
        session.timing.source(index, source);
        session.current = { segment, source, startOffset: offset };
        reportTiming(session);
        window.setSource(source, continuing && !loaded);
        loaded = true;
      },
      onPlayed: () => schedulePrefetch(session, index),
      onRecovering: () => {
        window.suspend();
        element.pause();
        setStatus('loading');
      },
      // End-of-file is a physical stop even if the next descriptor looks adjacent.
      onEnded: () => finish(false),
    });
    session.activePlayback = supervision;
    session.segmentCleanups.push(
      window.detach,
      supervision.detach,
      onClipEvent(element, 'loadedmetadata', metadata),
      onClipEvent(element, 'durationchange', sample),
      onClipEvent(element, 'timeupdate', sample),
      onClipEvent(element, 'seeked', sample),
      onClipEvent(element, 'playing', () => {
        if (!isCurrent(session)) return;
        // Accept the initial landing; a later duration correction must not seek again.
        session.pendingFraction = undefined;
        reportTiming(session);
        setStatus('playing');
        if (session.current) optionsRef.current.onSourcePlaying?.(session.current.source, segment);
        setItemState(segment.verseRef, 'playing');
      })
    );
    for (const action of entry.actions) action(supervision.requests);
    if (continuing) {
      setActiveVerseRef(segment.verseRef);
      optionsRef.current.onScrollRequest?.(segment.verseRef);
      setItemState(segment.verseRef, 'playing');
      optionsRef.current.onSourcePlaying?.(entry.source!, segment);
      supervision.continue();
    } else {
      element.playbackRate = rateRef.current;
      supervision.start(initialOffset);
    }
  };

  const advance = async (
    session: PlaybackSession,
    index: number,
    startOffset?: PlaybackStart
  ): Promise<void> => {
    if (!isCurrent(session)) return;
    teardownActiveClip(session);
    session.index = index;
    session.startOffset = typeof startOffset === 'number' ? startOffset : undefined;
    session.pendingFraction =
      typeof startOffset === 'object' ? Math.max(0, Math.min(1, startOffset.fraction)) : undefined;
    session.pendingLogicalStart =
      startOffset === undefined && typeof session.items[index]?.source === 'function';
    session.budgets.clear();
    const segment = session.items[index] as Segment | undefined;
    if (!segment) {
      goIdle(session);
      optionsRef.current.onRunComplete?.();
      return;
    }
    if (startOffset === undefined && typeof segment.source !== 'function') {
      session.startOffset = segment.source.window?.[0] ?? 0;
    }
    setActiveVerseRef(segment.verseRef);
    optionsRef.current.onScrollRequest?.(segment.verseRef);
    setStatus('loading');
    // Publish the new segment/seek before awaiting source resolution. A stopped
    // run's last report must never animate another pericope or flash under a drag.
    reportTiming(session);
    let entry = session.prefetches.get(index);
    session.prefetches.delete(index);
    for (const [key, old] of session.prefetches) {
      if (key < index) {
        old.dispose();
        session.prefetches.delete(key);
      }
    }
    if (entry) {
      // Keep its early-error watch until adoption, including while it resolves.
      session.clipCleanups.push(entry.dispose);
      await entry.promise;
      if (!isCurrent(session) || session.index !== index) return;
      if (entry.failed) {
        entry.dispose();
        entry = undefined;
      }
    }
    if (!entry) {
      setItemState(segment.verseRef, 'synthesizing');
      entry = createEntry(session, index);
      session.clipCleanups.push(entry.dispose);
      await entry.promise;
    }
    if (!isCurrent(session) || session.index !== index) return;
    if (!entry.source || !entry.element) {
      giveUp(
        session,
        entry.error instanceof Error
          ? entry.error
          : new Error(String(entry.error ?? 'Source unavailable')),
        segment
      );
      return;
    }
    entry.detachWatch();
    entry.detachTiming();
    activate(session, index, { ...entry, source: entry.source }, entry.element, startOffset);
  };

  const startSession = (
    items: Segment[],
    startIndex: number,
    startOffset?: PlaybackStart,
    inheritedRunState: PlaybackRunState = { forceTts: false }
  ): void => {
    stop();
    const copiedItems = items.map(item => ({ ...item }));
    const session: PlaybackSession = {
      controller: new AbortController(),
      items: copiedItems,
      timing: new PlaybackTiming(copiedItems),
      index: startIndex,
      budgets: new Map(),
      aiMarked: new Set(),
      resolutionState: { ...inheritedRunState },
      prefetches: new Map(),
      clipCleanups: [],
      segmentCleanups: [],
      pendingLogicalStart: false,
    };
    sessionRef.current = session;
    setAiMarkedKeys(new Set());
    setStatus('loading');
    void advance(session, startIndex, startOffset);
  };

  const setPlaybackRate = (rate: number): void => {
    rateRef.current = rate;
    setPlaybackRateState(rate);
    const active = sessionRef.current?.activeElement;
    if (active) active.playbackRate = rate;
  };

  useEffect(
    () => () => {
      if (sessionRef.current) disposeSession(sessionRef.current);
      sessionRef.current = null;
    },
    []
  );

  return {
    status,
    activeVerseRef,
    itemStates,
    aiMarkedKeys,
    playbackRate,
    playOne: (segment, startOffset, inheritedRunState) =>
      startSession([segment], 0, startOffset, inheritedRunState),
    playFrom: startSession,
    pause,
    hold,
    resumeHeld,
    stop,
    setPlaybackRate,
  };
};
