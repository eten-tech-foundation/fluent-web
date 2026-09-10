import { type ClipAudioElement, onClipEvent, resetClipElement } from './audioElement';

import type {
  BudgetKey,
  ExhaustionAction,
  PlaybackFailure,
  PlaybackOptions,
  PollRequests,
  RecoveryRequests,
  RecoveryStrategy,
  Segment,
  Source,
} from '../seam/types';

/** Transitional player adapter; the queue will own this machinery when it consumes segments. */
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
}

/** Player-owned arbitration: policy receives neither the media element nor budget results. */
export const supervisePlayback = (options: PlaybackRecoveryOptions): (() => void) => {
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
  let lastCharge: BudgetKey | undefined;
  const retries = new Map<BudgetKey, number>();
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
    if (timeout === null || playbackStarted || signal.aborted) return;
    watchdog = setTimeout(() => {
      if (watchdog !== undefined) timers.delete(watchdog);
      watchdog = undefined;
      observe({ on: 'stall', source, positionMs: element.currentTime * 1000 });
    }, timeout);
    timers.add(watchdog);
  };

  const reload = async (next: Segment['source'], opts: PlaybackOptions = {}): Promise<void> => {
    const token = epoch;
    const resolved = typeof next === 'function' ? await next() : next;
    if (isDetached() || token !== epoch) return;
    source = resolved;
    recovering = false;
    const loadToken = ++loadEpoch;
    resetClipElement(element, source.url);
    element.currentTime = opts.startOffset ?? source.window?.[0] ?? 0;
    armWatchdog();
    try {
      await element.play();
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
            },
            0,
            token
          );
      },
      handOff: next => {
        if (!current()) return;
        onWorkRequested();
        schedule(
          async () => {
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

  if (options.signal.aborted) {
    detach();
    return detach;
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
    onClipEvent(element, 'progress', disarmWatchdog),
    onClipEvent(element, 'canplay', disarmWatchdog),
    onClipEvent(element, 'playing', () => {
      playbackStarted = true;
      disarmWatchdog();
    })
  );
  armWatchdog();
  return detach;
};
