import type { PlaybackRegistry } from './PlaybackRegistryStore';

/** Page-lifetime data only; no element, source URL, or run is retained. */
export interface PauseRecord {
  readonly itemIndex: number;
  /**
   * Keep content position alongside the playable-local index. Drafting has one
   * segment per verse; resource fallback can change segment counts and must use
   * content position rather than assuming that the old index still identifies it.
   */
  readonly verseRef: string;
  /** Element time verbatim: file-absolute for recordings, clip-local for TTS. */
  readonly currentTime: number;
  /**
   * A passive scrub is retained as a ratio until explicit Play resolves the
   * segment's recording window or TTS duration. It deliberately does not
   * manufacture an absolute time from an estimate.
   */
  readonly pendingFraction?: number;
  /** Passed back to source selection on resume, cleared with the record. */
  readonly forceTts: boolean;
}

/** Structural input: the registry does not depend on the player that reports it. */
export interface PauseRecordInput extends PauseRecord {
  readonly playableKey: string;
}

export const writeRecord = (
  store: Pick<PlaybackRegistry, 'setRecord'>,
  { playableKey, ...record }: PauseRecordInput
): void => {
  // Record presence is the resume-intent invariant. A resolved element paused
  // or refused at zero is still an explicit position; reset/completion and
  // identity or policy cleanup own deletion.
  store.setRecord(playableKey, record);
};
