import { type ClipAudioElement, onClipEvent, resetClipElement } from './audioElement';

import type {
  BudgetKey,
  ExhaustionAction,
  PlaybackFailure,
  PlaybackOptions,
  PlaybackRunState,
  PollRequests,
  RecoveryRequests,
  RecoveryStrategy,
  Segment,
  Source,
} from '../seam/types';

/** Segment supervision under the queue's run: all media, timers and budget arbitration stay here. */
export interface PlaybackRecoveryOptions {
  element: ClipAudioElement;
  source: Source;
  recovery: RecoveryStrategy;
  signal: AbortSignal;
  maxRetriesPerClass: number;
  maxStallPolls: number;
  onGiveUp: (reason: string, charge?: BudgetKey) => void;
  onAutoplayRefused: () => void;
  onMarkAi?: () => void;
  budgets: Map<BudgetKey, number>;
  run: Readonly<PlaybackRunState>;
  onHandOff?: (source: Segment['source']) => void;
  onAttach?: (recovery: RecoveryStrategy) => void;
  onSource?: (source: Source, startOffset: number) => void;
  onPlayed?: () => void;
  onRecovering?: () => void;
  onEnded?: () => void;
  /** An early element error observed before this controller could subscribe. */
  initialLoadFailed?: boolean;
  /** A host-owned modal hold may defer every physical play without ending recovery. */
  shouldHold?: () => boolean;
}

export interface PlaybackRecovery {
  detach: () => void;
  requests: RecoveryRequests;
  /** Suspend supervision while the host deliberately holds the media. */
  hold: () => void;
  /** Initial playback uses the same scheduled path and load identity as retries. */
  start: (startOffset?: number) => void;
  /** Adopt a sounding adjacent slice without seeking, reloading or calling play again. */
  continue: () => void;
  /** Resume the current load through the same supervised physical-play path. */
  resume: () => void;
}

/** Player-owned arbitration: policy receives neither the media element nor budget results. */
export const supervisePlayback = (options: PlaybackRecoveryOptions): PlaybackRecovery => {
  const { element } = options;
  const controller = new AbortController();
  const signal = controller.signal;
  // AbortSignal can change across an await even though its property is readonly.
  const isDetached = (): boolean => signal.aborted;
  let source = options.source;
  let strategy = options.recovery;
  let playbackStarted = false;
  let recovering = false;
  let epoch = 0;
  let loadEpoch = 0;
  let replacementEpoch = 0;
  let lastCharge: BudgetKey | undefined;
  let loadPrepared = false;
  const retries = options.budgets;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const cleanups: Array<() => void> = [];

  const disarmWatchdog = (): void => {
    if (watchdog !== undefined) {
      clearTimeout(watchdog);
      timers.delete(watchdog);
      watchdog = undefined;
    }
  };

  const detach = (): void => {
    if (signal.aborted) return;
    controller.abort();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const cleanup of cleanups) cleanup();
    options.signal.removeEventListener('abort', detach);
  };

  const giveUp = (reason: string): void => {
    if (signal.aborted) return;
    detach();
    options.onGiveUp(reason, lastCharge);
  };

  // A microtask for zero delay preserves immediate heals without re-entering a
  // failing element's event handler. Positive delays remain cancellable timers.
  const schedule = (action: () => void | Promise<void>, afterMs = 0, token = epoch): void => {
    const run = (): void => {
      if (isDetached() || token !== epoch) return;
      void Promise.resolve()
        .then(() => {
          if (!signal.aborted && token === epoch) return action();
        })
        .catch(() => {
          if (!signal.aborted && token === epoch) giveUp('Playback recovery failed unexpectedly');
        });
    };
    if (afterMs <= 0) {
      queueMicrotask(run);
    } else {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, afterMs);
      timers.add(timer);
    }
  };

  const armWatchdog = (): void => {
    disarmWatchdog();
    const timeout = strategy.supervision.stallWatchdogMs;
    if (timeout === null || playbackStarted || signal.aborted || options.shouldHold?.()) return;
    watchdog = setTimeout(() => {
      if (watchdog !== undefined) timers.delete(watchdog);
      watchdog = undefined;
      observe({ on: 'stall', source, positionMs: element.currentTime * 1000 });
    }, timeout);
    timers.add(watchdog);
  };

  const reload = async (next: Segment['source'], opts: PlaybackOptions = {}): Promise<void> => {
    const token = epoch;
    const replacement = replacementEpoch;
    let resolved: Source;
    try {
      resolved =
        typeof next === 'function'
          ? await next({ signal, run: options.run, requests: makeRequests(token, () => {}) })
          : next;
    } catch (error) {
      // A resolving policy can request a hand-off or give-up instead. Neither a
      // late result nor its rejection may override that already scheduled action.
      if (isDetached() || token !== epoch || replacement !== replacementEpoch) return;
      throw error;
    }
    if (isDetached() || token !== epoch || replacement !== replacementEpoch) return;
    // Resolution may have requested attach/markAi. Queue playback behind those
    // requests so the policy and badge are installed before the first sample.
    schedule(() => beginLoad(resolved, opts.startOffset, true), 0, token);
  };

  const playCurrentLoad = async (loadToken: number): Promise<void> => {
    if (options.shouldHold?.()) return;
    armWatchdog();
    try {
      await element.play();
      if (!isDetached() && loadToken === loadEpoch) options.onPlayed?.();
    } catch (error) {
      // An error event can start another diagnosis while this play promise is
      // pending. Only a newer media load (not a diagnosis) makes it obsolete.
      if (isDetached() || loadToken !== loadEpoch) return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        detach();
        options.onAutoplayRefused();
      }
      // Load errors also fire the element's error event; that starts recovery.
    }
  };

  const beginLoad = async (
    next: Source,
    startOffset: number | undefined,
    reset: boolean
  ): Promise<void> => {
    source = next;
    recovering = false;
    const loadToken = ++loadEpoch;
    playbackStarted = false;
    if (reset) resetClipElement(element, source.url);
    element.currentTime = startOffset ?? source.window?.[0] ?? 0;
    loadPrepared = true;
    options.onSource?.(source, element.currentTime);
    await playCurrentLoad(loadToken);
  };

  const makeRequests = (token: number, onWorkRequested: () => void): RecoveryRequests => {
    const current = (): boolean => !signal.aborted && token === epoch;
    const chargeRetry = (charge: BudgetKey, exhausted?: ExhaustionAction): boolean => {
      onWorkRequested();
      lastCharge = charge;
      const count = (retries.get(charge) ?? 0) + 1;
      retries.set(charge, count); // The refusing classification is counted too.
      if (count <= options.maxRetriesPerClass) return true;
      schedule(exhausted ?? (() => giveUp('Playback retry budget exhausted')), 0, token);
      return false;
    };
    return {
      play: (next, charge, opts) => {
        if (!current()) return;
        if (chargeRetry(charge, opts?.onExhausted)) {
          schedule(() => reload(next, opts), opts?.afterMs, token);
        }
      },
      poll: (charge, afterMs, probe, opts) => {
        if (!current() || !chargeRetry(charge, opts?.onExhausted)) return;
        let polls = 0;
        const episode: PollRequests = {
          play: (next, playOpts) => {
            if (current()) schedule(() => reload(next, playOpts), playOpts?.afterMs, token);
          },
          poll: delay => {
            if (!current()) return;
            schedule(
              async () => {
                if (polls >= options.maxStallPolls) {
                  schedule(
                    opts?.onPollExhausted ?? (() => giveUp('Playback poll budget exhausted')),
                    0,
                    token
                  );
                  return;
                }
                polls += 1;
                await probe(episode, signal);
              },
              delay,
              token
            );
          },
        };
        episode.poll(afterMs);
      },
      attach: next => {
        if (current())
          schedule(
            () => {
              strategy = next;
              options.onAttach?.(next);
              if (!recovering) armWatchdog();
            },
            0,
            token
          );
      },
      handOff: next => {
        if (!current()) return;
        replacementEpoch += 1;
        onWorkRequested();
        schedule(
          async () => {
            options.onHandOff?.(next);
            retries.clear();
            lastCharge = undefined;
            playbackStarted = false;
            await reload(next);
          },
          0,
          token
        );
      },
      giveUp: reason => {
        if (!current()) return;
        replacementEpoch += 1;
        onWorkRequested();
        schedule(() => giveUp(reason), 0, token);
      },
      markAi: () => {
        if (current()) schedule(() => options.onMarkAi?.(), 0, token);
      },
    };
  };

  const observe = (failure: PlaybackFailure): void => {
    if (signal.aborted || recovering) return;
    recovering = true;
    options.onRecovering?.();
    disarmWatchdog();
    epoch += 1;
    const token = epoch;
    let workRequested = false;
    const requests = makeRequests(token, () => {
      workRequested = true;
    });
    void strategy
      .recover(failure, requests, signal)
      .catch(() => {
        if (!signal.aborted && token === epoch) giveUp('Playback recovery failed unexpectedly');
      })
      .finally(() => {
        if (!signal.aborted && token === epoch && !workRequested) {
          // A policy may intentionally ignore a failure; it must not make all
          // later observations disappear. Granted retries keep the latch until reload.
          recovering = false;
          armWatchdog();
        }
      });
  };

  const playback: PlaybackRecovery = {
    detach,
    requests: makeRequests(epoch, () => {}),
    hold: disarmWatchdog,
    continue: () => {
      const continuedWhileHeld = options.shouldHold?.() ?? false;
      schedule(() => {
        loadPrepared = true;
        playbackStarted = true;
        disarmWatchdog();
        options.onSource?.(source, element.currentTime);
        options.onPlayed?.();
        if (continuedWhileHeld && !options.shouldHold?.()) void playCurrentLoad(loadEpoch);
      });
    },
    resume: () => {
      if (loadPrepared && !recovering) void playCurrentLoad(loadEpoch);
    },
    start: startOffset => {
      schedule(() => beginLoad(source, startOffset, false));
      if (options.initialLoadFailed)
        schedule(() =>
          observe({
            on: 'error',
            source,
            positionMs: element.currentTime * 1000,
            startedPlaying: playbackStarted,
          })
        );
    },
  };
  if (options.signal.aborted) {
    detach();
    return playback;
  }
  options.signal.addEventListener('abort', detach, { once: true });
  cleanups.push(
    onClipEvent(element, 'error', () => {
      observe({
        on: 'error',
        source,
        positionMs: element.currentTime * 1000,
        startedPlaying: playbackStarted,
      });
    }),
    onClipEvent(element, 'ended', () => {
      const end = source.window?.[1];
      if (end !== undefined && element.currentTime < end - 0.05) {
        observe({ on: 'endedEarly', source, positionMs: element.currentTime * 1000 });
      } else if (!recovering) {
        options.onEnded?.();
      }
    }),
    onClipEvent(element, 'waiting', () => {
      playbackStarted = false;
      armWatchdog();
    }),

    onClipEvent(element, 'progress', disarmWatchdog),
    onClipEvent(element, 'canplay', disarmWatchdog),
    onClipEvent(element, 'playing', () => {
      playbackStarted = true;
      disarmWatchdog();
    })
  );
  armWatchdog();
  return playback;
};
