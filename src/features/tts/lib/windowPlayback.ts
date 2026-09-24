import { type ClipAudioElement, onClipEvent } from './audioElement';

import type { Source } from '../seam/types';

/** Compare whole, opaque media descriptors; an open-ended slice ends a stretch. */
export const areAdjacentSources = (current: Source, next: Source): boolean =>
  current.url === next.url &&
  current.window?.length === 2 &&
  next.window?.length === 2 &&
  current.window[1] === next.window[0];

/**
 * Player-owned window clock. Interior boundaries and final halts use this same
 * scheduler, never the coarse timeupdate event. Media time is rechecked after
 * timer delays, buffering and seeks; elapsed wall time alone cannot end a verse.
 */
export const watchPlaybackWindow = (
  element: ClipAudioElement,
  onBoundary: () => void
): {
  setSource: (source: Source, continuing?: boolean) => void;
  suspend: () => void;
  detach: () => void;
} => {
  let end: number | undefined;
  let playing = false;
  let seeking = false;
  let detached = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const arm = (): void => {
    clear();
    if (detached || !playing || seeking || end === undefined || element.playbackRate <= 0) return;
    const remaining = end - element.currentTime;
    timer = setTimeout(
      () => {
        timer = undefined;
        if (detached || !playing || seeking || end === undefined) return;
        if (element.currentTime >= end) {
          playing = false;
          onBoundary();
        } else {
          arm();
        }
      },
      Math.max(1, (remaining / element.playbackRate) * 1000)
    );
  };
  const suspend = (): void => {
    playing = false;
    clear();
  };
  const cleanups = [
    onClipEvent(element, 'playing', () => {
      playing = true;
      arm();
    }),
    onClipEvent(element, 'seeking', () => {
      seeking = true;
      clear();
    }),
    onClipEvent(element, 'seeked', () => {
      seeking = false;
      arm();
    }),
    onClipEvent(element, 'ratechange', arm),
    // `stalled` means fetching stalled; buffered samples may still be sounding.
    // Only `waiting` says playback ran out of data. Never disarm a halt on stalled.
    ...(['pause', 'waiting', 'error', 'ended'] as const).map(event =>
      onClipEvent(element, event, suspend)
    ),
  ];
  return {
    setSource: (source, continuing = false) => {
      end = source.window?.[1];
      playing = continuing;
      seeking = false;
      arm();
    },
    suspend,
    detach: () => {
      detached = true;
      clear();
      for (const cleanup of cleanups) cleanup();
    },
  };
};
