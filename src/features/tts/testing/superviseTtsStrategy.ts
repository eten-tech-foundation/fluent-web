/** Test wiring for the original engine ladder cases after recovery moved behind requests. */
import { supervisePlayback } from '../lib/playbackRecovery';
import { TtsRecoveryStrategy } from '../strategies/ttsRecoveryStrategy';
import {
  DEFAULT_TTS_RECOVERY_TIMING,
  type TtsRecoveryTiming,
} from '../strategies/ttsRecoveryTiming';

import type { FetchLike } from '../engines/serverTtsEngine';
import type { ClipAudioElement } from '../lib/audioElement';

export const superviseTtsStrategy = (options: {
  element: ClipAudioElement;
  audioUrl: string;
  signal: AbortSignal;
  regenerate: () => Promise<string>;
  onFailure: (error: Error) => void;
  streamingEra?: boolean;
  fetchFn?: FetchLike;
  timing?: Partial<TtsRecoveryTiming>;
}): (() => void) => {
  const timing = { ...DEFAULT_TTS_RECOVERY_TIMING, ...options.timing };
  return supervisePlayback({
    element: options.element,
    source: { url: options.audioUrl, durationIsMeasured: false },
    recovery: new TtsRecoveryStrategy({
      regenerate: async () => ({ url: await options.regenerate(), durationIsMeasured: false }),
      streamingEra: options.streamingEra,
      fetchFn: options.fetchFn,
      timing,
    }),
    signal: options.signal,
    budgets: new Map(),
    run: { forceTts: false },
    maxRetriesPerClass: timing.maxRetriesPerClass,
    maxStallPolls: timing.maxStallPolls,
    onGiveUp: reason => options.onFailure(new Error(reason)),
    onAutoplayRefused: () =>
      options.onFailure(new DOMException('Gesture required', 'NotAllowedError')),
  }).detach;
};
