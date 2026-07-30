/**
 * `useTtsPlaybackQueue` — the continuous-mode playback queue (§5.3, T1/T7).
 *
 * Feature-agnostic: items carry their own text/langCode/refs, so the hook is
 * reusable on any source-scripture surface (T3). It never navigates — at the
 * end of the supplied list it emits `boundaryReached` and the HOST decides
 * (T16: the chapter-boundary prompt is entirely frontend-host-owned).
 */

import { useEffect, useRef, useState } from 'react';

import {
  type FetchLike,
  superviseClipPlayback,
  type TtsRecoveryTiming,
} from '../engines/serverTtsEngine';
import { type ClipAudioElement, createClipAudioElement, onClipEvent } from '../lib/audioElement';
import { type TtsClip, type TtsEngine, type TtsQueueItem } from '../tts.types';

/**
 * §5.3 (CB1): prefetch depth stays capped at the next verse, AT MOST two,
 * ahead of the play position — never chapter-wide fan-out. Chapter-wide
 * speculative requests multiplied by concurrent users invites admission
 * pressure (§9.2) for audio that may never be heard.
 */
export const TTS_PREFETCH_DEPTH = 1;
export const TTS_MAX_PREFETCH_DEPTH = 2;

/** Queue-level playback status driving the controls (§5.2). */
export type TtsPlaybackStatus = 'idle' | 'loading' | 'playing';

/** Per-item state (§5.3 names these explicitly; a union, not booleans). */
export type TtsQueueItemState = 'synthesizing' | 'buffered' | 'playing';

export interface UseTtsPlaybackQueueOptions {
  engine: TtsEngine;
  /** End of the supplied list reached — host prompts/navigates, hook never does (T16). */
  onBoundaryReached?: () => void;
  /** Toast-worthy failure of the PLAYING clip (§5.2); fired once per failure. */
  onError?: (error: Error, item: TtsQueueItem) => void;
  /** §5.3 step 2 — host scrolls the active row into view when needed. */
  onScrollRequest?: (verseRef: string) => void;
  /** Prefetch depth; clamped to `TTS_MAX_PREFETCH_DEPTH` (§5.3, CB1). */
  prefetchDepth?: number;
  /** Element factory — injectable because jsdom has no media elements. */
  createElement?: (src: string) => ClipAudioElement;
  /** Passed through to `superviseClipPlayback` HEAD probes (§6.1). */
  fetchFn?: FetchLike;
  timing?: Partial<TtsRecoveryTiming>;
}

export interface TtsPlaybackQueueApi {
  status: TtsPlaybackStatus;
  /** The playback-highlighted row, or null when idle (§5.3 step 1). */
  activeVerseRef: string | null;
  /** Per-item states keyed by verseRef (§5.3). */
  itemStates: Readonly<Record<string, TtsQueueItemState>>;
  playbackRate: number;
  /** T1: play one verse; stops at clip end, never advances. */
  playOne: (item: TtsQueueItem) => void;
  /** T1: play from here; advances through the list on `ended` (§6.2). */
  playFrom: (items: TtsQueueItem[], startIndex: number) => void;
  /** §5.1: cancel queue, pause element, clear prefetch intent + highlight. */
  stop: () => void;
  /** §6.2 (T11): element passthrough only — NEVER triggers synthesis. */
  setPlaybackRate: (rate: number) => void;
}

interface PrefetchEntry {
  state: 'pending' | 'ready' | 'failed';
  audioUrl?: string;
  element?: ClipAudioElement;
  promise: Promise<void>;
}

interface PlaybackSession {
  controller: AbortController;
  items: TtsQueueItem[];
  index: number;
  /** playFrom emits boundaryReached at list end; playOne just goes idle (T1/T16). */
  emitBoundary: boolean;
  /** Prefetched clips keyed by ABSOLUTE item index — pruning keeps it ≤ depth. */
  prefetches: Map<number, PrefetchEntry>;
  activeElement?: ClipAudioElement;
  /** Teardown for the active clip: supervision detach + event unsubscribes. */
  clipCleanups: Array<() => void>;
}

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

export const useTtsPlaybackQueue = (options: UseTtsPlaybackQueueOptions): TtsPlaybackQueueApi => {
  const [status, setStatus] = useState<TtsPlaybackStatus>('idle');
  const [activeVerseRef, setActiveVerseRef] = useState<string | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, TtsQueueItemState>>({});
  const [playbackRate, setPlaybackRateState] = useState(1);

  const sessionRef = useRef<PlaybackSession | null>(null);
  const rateRef = useRef(1);
  // Options live in a ref so session callbacks never capture stale closures.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isCurrent = (session: PlaybackSession): boolean =>
    sessionRef.current === session && !session.controller.signal.aborted;

  const setItemState = (verseRef: string, state: TtsQueueItemState | undefined): void => {
    setItemStates(previous => {
      const next = { ...previous };
      if (state === undefined) {
        delete next[verseRef];
      } else {
        next[verseRef] = state;
      }
      return next;
    });
  };

  const teardownActiveClip = (session: PlaybackSession): void => {
    for (const cleanup of session.clipCleanups) cleanup();
    session.clipCleanups = [];
    session.activeElement?.pause();
    session.activeElement = undefined;
  };

  /** Return to idle with NO stale highlight (§5.2). */
  const goIdle = (session: PlaybackSession): void => {
    teardownActiveClip(session);
    session.controller.abort(); // kills prefetch fetches + retry/watchdog timers (CB1)
    session.prefetches.clear();
    if (sessionRef.current === session) sessionRef.current = null;
    setStatus('idle');
    setActiveVerseRef(null);
    setItemStates({});
  };

  const stop = (): void => {
    const session = sessionRef.current;
    if (session) goIdle(session);
  };

  /** Failure of the playing clip: toast once via host, back to idle (§5.2). */
  const failSession = (session: PlaybackSession, error: Error, item: TtsQueueItem): void => {
    if (!isCurrent(session)) return;
    goIdle(session);
    optionsRef.current.onError?.(error, item);
  };

  const synthesizeItem = (session: PlaybackSession, item: TtsQueueItem): Promise<TtsClip> =>
    optionsRef.current.engine.synthesize(
      { text: item.text, langCode: item.langCode },
      session.controller.signal
    );

  /**
   * §5.3 step 4: while verse N plays, request N+1 — `generate` plus an EARLY
   * element (`preload="auto"` + `load()`; §6.1). Prefetch failures stay
   * SILENT (§6.1): the clip simply synthesizes fresh when its turn arrives.
   */
  const schedulePrefetch = (session: PlaybackSession, playingIndex: number): void => {
    const depth = Math.min(
      Math.max(optionsRef.current.prefetchDepth ?? TTS_PREFETCH_DEPTH, 0),
      TTS_MAX_PREFETCH_DEPTH
    );
    const createElement = optionsRef.current.createElement ?? createClipAudioElement;
    for (let ahead = 1; ahead <= depth; ahead += 1) {
      const index = playingIndex + ahead;
      const item = session.items[index] as TtsQueueItem | undefined;
      if (!item || item.text.trim() === '' || session.prefetches.has(index)) continue;
      const entry: PrefetchEntry = { state: 'pending', promise: Promise.resolve() };
      entry.promise = (async () => {
        try {
          const clip = await synthesizeItem(session, item);
          if (!isCurrent(session)) return;
          entry.audioUrl = clip.audioUrl;
          entry.element = createElement(clip.audioUrl);
          entry.state = 'ready';
          if (session.prefetches.get(index) === entry) {
            setItemState(item.verseRef, 'buffered');
          }
        } catch {
          entry.state = 'failed'; // silent — §6.1
        }
      })();
      session.prefetches.set(index, entry);
      setItemState(item.verseRef, 'synthesizing');
    }
  };

  /**
   * §5.3 per-clip transition sequence, in the proposal's order: mark active
   * row → request scroll → play buffered clip or show loading → request the
   * following clip → stop cleanly on missing text or Stop. Advance happens on
   * `ended` ONLY — never a duration countdown (§6.2: streaming clips have
   * indeterminate duration).
   */
  const advance = async (session: PlaybackSession, index: number): Promise<void> => {
    if (!isCurrent(session)) return;
    teardownActiveClip(session);
    session.index = index;

    const item = session.items[index] as TtsQueueItem | undefined;
    if (!item) {
      // End of the supplied list: emit boundaryReached (playFrom) and go
      // idle — navigation belongs to the host (T16), never to this hook.
      const emit = session.emitBoundary;
      goIdle(session);
      if (emit) optionsRef.current.onBoundaryReached?.();
      return;
    }
    if (item.text.trim() === '') {
      // §5.3 step 5: no playable text ⇒ stop cleanly (no boundary signal).
      goIdle(session);
      return;
    }

    // §5.3 steps 1–2: mark the active row, ask the host to scroll it into view.
    setActiveVerseRef(item.verseRef);
    optionsRef.current.onScrollRequest?.(item.verseRef);

    // Consume (then prune) the prefetch window behind/at the play position.
    const prefetched = session.prefetches.get(index);
    for (const key of [...session.prefetches.keys()]) {
      if (key <= index) session.prefetches.delete(key);
    }

    let audioUrl: string;
    let element: ClipAudioElement | undefined;
    if (prefetched) {
      await prefetched.promise;
      if (!isCurrent(session)) return;
    }
    if (prefetched?.state === 'ready' && prefetched.audioUrl !== undefined) {
      // §5.3 step 3: start the already-buffered clip.
      audioUrl = prefetched.audioUrl;
      element = prefetched.element;
      setStatus('loading');
    } else {
      // First-listen miss: synthesize now and show the loading state (§5.2).
      setStatus('loading');
      setItemState(item.verseRef, 'synthesizing');
      try {
        const clip = await synthesizeItem(session, item);
        audioUrl = clip.audioUrl;
      } catch (error) {
        if (isAbortError(error) || !isCurrent(session)) return;
        failSession(session, error instanceof Error ? error : new Error(String(error)), item);
        return;
      }
      if (!isCurrent(session)) return;
    }

    const createElement = optionsRef.current.createElement ?? createClipAudioElement;
    element ??= createElement(audioUrl);
    session.activeElement = element;
    element.playbackRate = rateRef.current; // §6.2: passthrough only (T11)

    // §6.1 recovery ladder guards the playing clip; its timers all live under
    // the session signal, so Stop/advance cancels them immediately (CB1).
    const detachSupervision = superviseClipPlayback({
      element,
      audioUrl,
      signal: session.controller.signal,
      regenerate: () => synthesizeItem(session, item).then(clip => clip.audioUrl),
      onFailure: error => {
        failSession(session, error, item);
      },
      fetchFn: optionsRef.current.fetchFn,
      timing: optionsRef.current.timing,
    });
    session.clipCleanups.push(
      detachSupervision,
      // §6.2: advance on `ended` ONLY — streaming-era clips report NaN/∞
      // duration, so a countdown would be wrong by construction.
      onClipEvent(element, 'ended', () => {
        void advance(session, index + 1);
      }),
      onClipEvent(element, 'playing', () => {
        if (!isCurrent(session)) return;
        setStatus('playing');
        setItemState(item.verseRef, 'playing');
      })
    );

    try {
      await element.play();
    } catch (error) {
      if (isAbortError(error) || !isCurrent(session)) return;
      // Autoplay refusal or immediate element failure the ladder cannot see.
      failSession(session, error instanceof Error ? error : new Error(String(error)), item);
      return;
    }

    // §5.3 step 4: request the following clip(s) while this one plays.
    schedulePrefetch(session, index);
  };

  const startSession = (items: TtsQueueItem[], startIndex: number, emitBoundary: boolean): void => {
    stop(); // one active session at a time; Stop semantics cover replacement
    const session: PlaybackSession = {
      controller: new AbortController(),
      items,
      index: startIndex,
      emitBoundary,
      prefetches: new Map(),
      clipCleanups: [],
    };
    sessionRef.current = session;
    setStatus('loading');
    void advance(session, startIndex);
  };

  const playOne = (item: TtsQueueItem): void => {
    // T1: single-verse play — stops at clip end, no boundary signal.
    startSession([item], 0, false);
  };

  const playFrom = (items: TtsQueueItem[], startIndex: number): void => {
    startSession(items, startIndex, true);
  };

  const setPlaybackRate = (rate: number): void => {
    rateRef.current = rate;
    setPlaybackRateState(rate);
    const active = sessionRef.current?.activeElement;
    if (active) {
      active.playbackRate = rate; // §6.2: never a synthesis parameter
    }
  };

  // Unmount: abort timers/fetches and silence the element without setState.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session) {
        for (const cleanup of session.clipCleanups) cleanup();
        session.activeElement?.pause();
        session.controller.abort();
        sessionRef.current = null;
      }
    },
    []
  );

  return {
    status,
    activeVerseRef,
    itemStates,
    playbackRate,
    playOne,
    playFrom,
    stop,
    setPlaybackRate,
  };
};
