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
