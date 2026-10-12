import { DEFAULT_TTS_RECOVERY_TIMING, type TtsRecoveryTiming } from './ttsRecoveryTiming';

import type { FetchLike } from '../engines/serverTtsEngine';
import type {
  PlaybackFailure,
  RecoveryRequests,
  RecoveryStrategy,
  Segment,
  SupervisionPolicy,
  Source,
} from '../seam/types';

/** Media errors carry no status; this provider classifies them on its control plane. */
type ProbeOutcome =
  | { kind: 'admission'; retryAfterMs: number }
  | { kind: 'streaming' }
  | { kind: 'compressed' }
  | { kind: 'notFound' };

const parseRetryAfterMs = (res: Response, fallbackMs: number): number => {
  const header = res.headers.get('Retry-After');
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return fallbackMs;
};

/** Provider configuration contains no player, timer or retry counter. */
export interface TtsRecoveryStrategyOptions {
  regenerate: () => Promise<Source>;
  streamingEra?: boolean;
  fetchFn?: FetchLike;
  timing?: Partial<TtsRecoveryTiming>;
}

/** The TTS control-plane ladder; the player arbitrates every requested retry and poll. */
export class TtsRecoveryStrategy implements RecoveryStrategy {
  private compressedEra: boolean;
  private readonly fetchFn: FetchLike;
  private readonly timing: TtsRecoveryTiming;

  constructor(private readonly options: TtsRecoveryStrategyOptions) {
    this.compressedEra = options.streamingEra === false;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.timing = { ...DEFAULT_TTS_RECOVERY_TIMING, ...options.timing };
  }

  get supervision(): SupervisionPolicy {
    return { stallWatchdogMs: this.compressedEra ? null : this.timing.stallWatchdogMs };
  }

  private async probe(url: string, signal: AbortSignal): Promise<ProbeOutcome> {
    const res = await this.fetchFn(url, {
      method: 'HEAD',
      credentials: 'include',
      redirect: 'manual',
      signal,
    });
    if (res.status === 503) {
      return {
        kind: 'admission',
        retryAfterMs: parseRetryAfterMs(res, this.timing.defaultRetryAfterMs),
      };
    }
    if (res.status === 404) return { kind: 'notFound' };
    // Manual redirects are opaque in browsers, raw 3xx in injected test fetches.
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      return { kind: 'compressed' };
    }
    return { kind: 'streaming' };
  }

  private regenerate(
    requests: RecoveryRequests,
    signal: AbortSignal,
    failureReason = 'TTS recovery failed unexpectedly'
  ): void {
    // Resolve lazily: an exhausted retry must not issue another generate call.
    requests.play(
      async () => {
        try {
          return await this.options.regenerate();
        } catch (error) {
          if (!signal.aborted) requests.giveUp(failureReason);
          throw error;
        }
      },
      'notFound',
      {
        onExhausted: () => requests.giveUp('TTS clip regenerate retries exhausted (HEAD 404)'),
      }
    );
  }

  async recover(
    failure: PlaybackFailure,
    requests: RecoveryRequests,
    signal: AbortSignal
  ): Promise<void> {
    // Read afresh after asynchronous work; readonly does not mean immutable here.
    const isAborted = (): boolean => signal.aborted;
    if (isAborted()) return;
    const source = failure.source;
    if (isAborted()) return;
    if (failure.on === 'stall') {
      this.recoverStall(source.url, source, requests);
      return;
    }
    let outcome: ProbeOutcome;
    try {
      outcome = await this.probe(source.url, signal);
    } catch {
      if (isAborted()) return;
      outcome = { kind: 'streaming' };
    }
    if (isAborted()) return;
    switch (outcome.kind) {
      case 'admission':
        requests.play(source, 'admission', {
          afterMs: outcome.retryAfterMs,
          onExhausted: () => requests.giveUp('TTS admission retries exhausted (HEAD 503)'),
        });
        break;
      case 'compressed':
        this.compressedEra = true;
        requests.play(source, 'midStream', {
          onExhausted: () => requests.giveUp('TTS mid-stream retries exhausted'),
        });
        break;
      case 'streaming':
        requests.play(source, 'midStream', {
          afterMs: this.timing.midStreamBackoffMs,
          onExhausted: () => requests.giveUp('TTS mid-stream retries exhausted'),
        });
        break;
      case 'notFound':
        this.regenerate(requests, signal);
        break;
    }
  }

  private recoverStall(url: string, source: Segment['source'], requests: RecoveryRequests): void {
    requests.poll(
      'stall',
      0,
      async (episode, signal) => {
        let outcome: ProbeOutcome;
        try {
          outcome = await this.probe(url, signal);
        } catch {
          if (!signal.aborted) episode.poll(this.timing.stallPollIntervalMs);
          return;
        }
        if (signal.aborted) return;
        if (outcome.kind === 'compressed') {
          this.compressedEra = true;
          episode.play(source);
        } else if (outcome.kind === 'notFound') {
          this.regenerate(requests, signal, 'TTS stall recovery failed unexpectedly');
        } else {
          episode.poll(
            outcome.kind === 'admission' ? outcome.retryAfterMs : this.timing.stallPollIntervalMs
          );
        }
      },
      {
        onExhausted: () => requests.giveUp('TTS stall recoveries exhausted'),
        onPollExhausted: () => requests.giveUp('TTS wait-for-compressed poll budget exhausted'),
      }
    );
  }
}
