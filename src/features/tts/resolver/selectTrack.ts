import { mapWindows } from './mapWindows';

import type { ChapterSourceAudio, SourceAudioTimestamp } from './sourceAudioClient';
import type { Source } from '../seam/types';

export interface RecordingProvenance {
  recordingKey: string;
  trackId?: string;
  provider: ChapterSourceAudio['provider'];
  bookCode: string;
  chapter: number;
}
// L3 transports Source objects without interpreting this L2-owned provenance.
const recordingSources = new WeakMap<Source, RecordingProvenance>();
export const recordingProvenance = (source: Source) => recordingSources.get(source);

export interface SelectedTrack {
  item: ChapterSourceAudio['items'][number];
  timestamps: readonly SourceAudioTimestamp[];
}

/** Pure chapter-wide choice: do not choose a different recording for each verse. */
export const selectTrack = (
  response: ChapterSourceAudio,
  supportsOpus: boolean
): SelectedTrack | undefined => {
  const { items } = response;
  const timestamps = response.verseTimestamps ?? [];
  if (!items.length) return undefined;
  if (response.provider === 'dbl') {
    // UNPROVEN: DBL ships no timecodes today (355/355 measured). Keep the tagged path
    // identical to Aquifer after selection; never borrow timestamps from another recording.
    const candidates = items.filter(
      item =>
        item.dblAudioBibleId !== undefined &&
        timestamps.some(stamp => stamp.dblAudioBibleId === item.dblAudioBibleId)
    );
    const item = candidates.length === 1 ? candidates[0] : items[0];
    return {
      item,
      timestamps:
        item.dblAudioBibleId === undefined
          ? []
          : timestamps.filter(stamp => stamp.dblAudioBibleId === item.dblAudioBibleId),
    };
  }
  const item =
    (supportsOpus ? items.find(item => item.format === 'webm') : undefined) ??
    items.find(item => item.format === 'mp3');
  // No known-playable codec means TTS, not a speculative load of an unsupported format.
  return item ? { item, timestamps } : undefined;
};

/** A complete replacement Source: a re-minted URL never inherits an old recording's window. */
export const recordedSourceForVerse = (
  response: ChapterSourceAudio,
  verse: number,
  supportsOpus: boolean
): Source | undefined => {
  if (!response.verseAddressable) return undefined;
  const track = selectTrack(response, supportsOpus);
  if (!track) return undefined;
  const window = mapWindows(track.timestamps).get(verse);
  if (!window) return undefined;
  const source: Source = {
    url: track.item.url,
    window,
    durationMs: window[1] === undefined ? undefined : (window[1] - window[0]) * 1000,
    durationIsMeasured: window[1] !== undefined,
  };
  if (track.item.recordingKey)
    recordingSources.set(source, {
      recordingKey: track.item.recordingKey,
      trackId: track.item.trackId,
      provider: response.provider,
      bookCode: response.bookCode,
      chapter: response.chapter,
    });
  return source;
};
