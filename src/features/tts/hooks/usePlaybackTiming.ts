import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type PlaybackTimingReport,
  type SegmentTiming,
  type TimingItem,
} from '../lib/playbackTiming';

export interface TimedSegment extends TimingItem {
  readonly timing?: SegmentTiming;
}

const timingKey = (item: TimingItem) => JSON.stringify([item.playableKey, item.verseRef]);

/** Page-local measurements survive pause, but never carry a player or a source. */
export function usePlaybackTiming(pageKey: string | undefined) {
  const saved = useRef(new Map<string, SegmentTiming>());
  const [report, setReport] = useState<PlaybackTimingReport | null>(null);
  const onTiming = useCallback((next: PlaybackTimingReport) => {
    next.items.forEach((item, index) => {
      const measurement = next.measurements[index];
      if (measurement === null) saved.current.delete(timingKey(item));
      else if (measurement !== undefined) saved.current.set(timingKey(item), measurement);
    });
    setReport(next);
  }, []);
  useEffect(() => {
    saved.current.clear();
    setReport(null);
  }, [pageKey]);
  const timingFor = useCallback((item: TimingItem) => saved.current.get(timingKey(item)), []);
  return { onTiming, report, timingFor };
}
