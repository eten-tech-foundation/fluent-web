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
  /** Passed back to source selection on resume, cleared with the record. */
  readonly forceTts: boolean;
}

/** Structural input: the registry does not depend on the player that reports it. */
export interface PauseRecordInput extends PauseRecord {
  readonly playableKey: string;
}

export const writeRecord = (
  store: Pick<PlaybackRegistry, 'setRecord' | 'clearRecord'>,
  { playableKey, ...record }: PauseRecordInput
): void => {
  // Paused at the beginning and never started are indistinguishable. Remove
  // any older position too, including its inherited downgrade instruction.
  if (record.itemIndex === 0 && record.currentTime === 0) store.clearRecord(playableKey);
  else store.setRecord(playableKey, record);
};
