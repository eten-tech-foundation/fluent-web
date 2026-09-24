import { recordedSourceForVerse } from '../resolver/selectTrack';
import { SourceAudioLookupError } from '../resolver/sourceAudioClient';

import type { FetchLike } from '../engines/serverTtsEngine';
import type { RecordedRecoveryOptions } from '../resolver/resolvePlayables';
import type { PlaybackFailure, RecoveryRequests, RecoveryStrategy } from '../seam/types';

export interface RecordedRecoveryStrategyOptions extends RecordedRecoveryOptions {
  fetchFn?: FetchLike;
}

/**
 * One reactive recovery path for chapter recordings. No expiry clock or retry counters.
 * UNPROVEN: DBL publishes no timecodes today; its windowed path is contract-tested only.
 */
export class RecordedRecoveryStrategy implements RecoveryStrategy {
  readonly supervision = { stallWatchdogMs: 10_000 };
  private readonly fetchFn: FetchLike;
  private accessDenied = false;

  constructor(private readonly options: RecordedRecoveryStrategyOptions) {
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  private fallBack(requests: RecoveryRequests, signal: AbortSignal): void {
    if (signal.aborted) return;
    if (this.accessDenied) {
      requests.giveUp('Recorded source access denied');
      return;
    }
    const reason = 'Recorded source unrecoverable';
    if (this.options.ttsSource === null) {
      requests.giveUp(reason);
      return;
    }
    // The lazy TTS source independently requests attach of a fresh strategy
    // before playback. Do not carry a source/policy bundle across the seam.
    requests.handOff(this.options.ttsSource, reason);
    requests.markAi();
  }

  async recover(
    failure: PlaybackFailure,
    requests: RecoveryRequests,
    signal: AbortSignal
  ): Promise<void> {
    if (signal.aborted) return;
    requests.play(
      async () => {
        try {
          // Resolve first: another verse may already have healed the chapter.
          const response = await this.options.cache.heal(
            this.options.chapter,
            failure.source.url,
            signal
          );
          signal.throwIfAborted();
          const source = recordedSourceForVerse(
            response,
            this.options.verseNumber,
            this.options.cache.supportsOpus
          );
          if (!source) throw new Error('Recording has no verse window');
          if (source.url === failure.source.url) {
            // A method-bound signature rejects HEAD even when GET is healthy.
            // Probe the unchanged URL without downloading a chapter or reading
            // Content-Type (DBL serves audio as application/octet-stream).
            const probe = await this.fetchFn(source.url, {
              method: 'GET',
              headers: { Range: 'bytes=0-0' },
              credentials: 'omit',
              signal,
            });
            // A server may ignore Range. Never retain or consume its full body.
            await probe.body?.cancel();
            signal.throwIfAborted();
            // HTTP failure still earns the bounded reload: the host responded.
            // A rejected fetch instead means this path is unreachable.
          }
          return source;
        } catch (error) {
          if (
            error instanceof SourceAudioLookupError &&
            (error.status === 401 || error.status === 403)
          ) {
            // Route authorization is terminal even when cached text clearance allows TTS.
            // Retain it for any later exhaustion callback on this recovery strategy.
            this.accessDenied = true;
          }
          this.fallBack(requests, signal);
          throw error; // L3 suppresses the superseded load, not the hand-off.
        }
      },
      'recorded',
      {
        startOffset: failure.positionMs / 1000,
        onExhausted: () => this.fallBack(requests, signal),
      }
    );
  }
}
