/**
 * Document-order queue construction for "play from here" (§5.1, §5.3, T1).
 *
 * Feature-agnostic (T3): the host describes its rows in the order they are
 * READ ON SCREEN and this module turns them into the queue's items. Keeping
 * the ordering decision here — rather than inside the queue hook — is what
 * lets a different source surface (a review page, a pericope-paged view)
 * reuse the same sequencing without inheriting drafting's grid assumptions.
 */

import { type TtsQueueItem } from '../tts.types';

/**
 * A row as the host knows it, before playability is decided. `text` is
 * nullable on purpose: panel 2 legitimately has no verse for some rows
 * (§5.1), and callers should be able to hand those straight through.
 */
export interface TtsRowDraft {
  verseRef: string;
  text?: string | null;
  /** Sent when known (T18); omitted rather than guessed. */
  langCode?: string;
  /**
   * Which panel the text came from (T17). Recorded on the item so provenance
   * travels with the clip rather than being re-derived from UI state.
   */
  audioSource?: string;
}

/** A row is playable only if it has non-whitespace text (§5.1). */
export const isPlayableRow = (row: TtsRowDraft): boolean =>
  typeof row.text === 'string' && row.text.trim() !== '';

/**
 * Build the queue in document order, dropping unplayable rows.
 *
 * Text playability belongs here, not in the universal player (a recorded source
 * need not have text). A gap in the reference text is not a reason to stop
 * reading the verses that are there; the missing row has no controls of its own.
 */
export const buildTtsQueueItems = (rows: readonly TtsRowDraft[]): TtsQueueItem[] =>
  rows.filter(isPlayableRow).map(row => ({
    verseRef: row.verseRef,
    text: (row.text ?? '').trim(),
    ...(row.langCode !== undefined && row.langCode !== '' ? { langCode: row.langCode } : {}),
    ...(row.audioSource !== undefined && row.audioSource !== ''
      ? { audioSource: row.audioSource }
      : {}),
  }));

/**
 * Index of `verseRef` within an already-built queue, or `-1`.
 *
 * "Play from here" needs the index in the FILTERED list, which is not the
 * row's position in the grid whenever an earlier row was unplayable — so
 * hosts must resolve the start index through the built items, never by
 * counting rendered rows.
 */
export const findTtsQueueIndex = (items: readonly TtsQueueItem[], verseRef: string): number =>
  items.findIndex(item => item.verseRef === verseRef);
