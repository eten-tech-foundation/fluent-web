import type { SourceAudioTimestamp } from './sourceAudioClient';
import type { Source } from '../seam/types';

/** Close windows using only the selected track's timestamps, never file-length metadata. */
export const mapWindows = (
  timestamps: readonly SourceAudioTimestamp[]
): ReadonlyMap<number, NonNullable<Source['window']>> => {
  const ordered = [...timestamps].sort((a, b) => a.verse - b.verse);
  const windows = new Map<number, NonNullable<Source['window']>>();
  for (const [index, stamp] of ordered.entries()) {
    const start = stamp.startSeconds;
    if (start === undefined || !Number.isFinite(start) || start < 0) continue;
    const next = ordered.at(index + 1);
    const end = stamp.endSeconds ?? next?.startSeconds;
    if (end !== undefined && Number.isFinite(end) && end > start) {
      windows.set(stamp.verse, [start, end]);
    } else if (stamp.endSeconds === undefined && !next) {
      // Only the last timestamped verse may run open-ended to the element's ended event.
      windows.set(stamp.verse, [start]);
    }
    // A missing next start cannot close this verse; never jump across an uncuttable entry.
  }
  return windows;
};
