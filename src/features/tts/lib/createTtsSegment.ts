/** TTS-only source construction used by the host and the source-audio resolver. */
import { TtsRecoveryStrategy } from '../strategies/ttsRecoveryStrategy';

import type { FetchLike } from '../engines/serverTtsEngine';
import type { Segment, Source, SourceThunk } from '../seam/types';
import type { TtsRecoveryTiming } from '../strategies/ttsRecoveryTiming';
import type { TtsEngine, TtsQueueItem, TtsServedFormat } from '../tts.types';

export interface CreateTtsSegmentOptions {
  engine: TtsEngine;
  beforeSynthesize?: (signal?: AbortSignal) => Promise<void>;
  playableKey: string;
  onServing?: (verseRef: string, servedAs: TtsServedFormat) => void;
  fetchFn?: FetchLike;
  timing?: Partial<TtsRecoveryTiming>;
}

export const createTtsSegment = (
  item: TtsQueueItem,
  options: CreateTtsSegmentOptions
): Segment & { source: SourceThunk } => {
  const generate = async (signal?: AbortSignal): Promise<Source> => {
    if (options.beforeSynthesize) await options.beforeSynthesize(signal);
    signal?.throwIfAborted();
    const clip = await options.engine.synthesize(
      { text: item.text, langCode: item.langCode },
      signal
    );
    if (!signal?.aborted && clip.servedAs !== undefined)
      options.onServing?.(item.verseRef, clip.servedAs);
    return { url: clip.audioUrl, durationIsMeasured: false };
  };
  const strategy = (signal?: AbortSignal): TtsRecoveryStrategy =>
    new TtsRecoveryStrategy({
      regenerate: () => generate(signal),
      fetchFn: options.fetchFn,
      timing: options.timing,
    });
  return {
    ...item,
    playableKey: options.playableKey,
    recovery: strategy(),
    source: async ({ signal, requests }) => {
      // Policy state belongs to this resolution/run, never to the memoized row.
      requests.attach(strategy(signal));
      const source = await generate(signal);
      requests.markAi();
      return source;
    },
  };
};
