/**
 * Single element-owned playback path (§6.1).
 *
 * Every clip — playing now or prefetched for later — is an `<audio>` element
 * with `src` set to the clip URL. JavaScript never transports audio bytes
 * (no fetch-to-blob, no MSE — MSE cannot accept WAV anyway, so element
 * streaming is the only play-while-synthesizing path). Prefetch is just an
 * EARLY element: `preload="auto"` + `load()` downloads without producing
 * sound; `play()` is the only audible trigger. Do not reintroduce a second
 * source path as an "optimization" — two paths is asking for boundary-condition
 * bugs at exactly the seams (mid-stream failure, replay, cancellation) where
 * uniformity matters most.
 *
 * `preload` is a browser HINT (data-saver modes and iOS may defer it) — an
 * unprefetched transition simply streams like a first listen; never build
 * logic that assumes prefetch succeeded.
 */

/** The subset of media/element events the TTS feature listens to. */
export type ClipAudioEventName =
  | 'ended'
  | 'loadedmetadata'
  | 'durationchange'
  | 'error'
  | 'progress'
  | 'canplay'
  | 'playing'
  | 'timeupdate'
  | 'seeking'
  | 'seeked'
  | 'ratechange'
  | 'pause'
  | 'waiting'
  | 'stalled';

/**
 * The element surface the engine and queue depend on. Structural (rather than
 * `HTMLAudioElement` directly) so tests can fabricate one — jsdom does not
 * implement media elements.
 */
export interface ClipAudioElement {
  src: string;
  preload: string;
  currentTime: number;
  /** Streaming sources may expose NaN or Infinity until completion. */
  readonly duration?: number;
  playbackRate: number;
  load: () => void;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

/** Creates the element factory used for real playback. */
export const createClipAudioElement = (src: string): ClipAudioElement => {
  const element = new Audio();
  element.preload = 'auto';
  element.src = src;
  // Downloads without producing sound — play() is the only audible trigger (§6.1).
  element.load();
  return element;
};

/**
 * Subscribe to a clip event; returns an unsubscribe function. Keeping
 * subscription in one typed helper makes teardown symmetrical everywhere
 * (missed teardown on retry/abort is the classic leak here).
 */
export const onClipEvent = (
  element: ClipAudioElement,
  event: ClipAudioEventName,
  listener: () => void
): (() => void) => {
  element.addEventListener(event, listener);
  return () => {
    element.removeEventListener(event, listener);
  };
};

/**
 * Point an existing element at (or back at) its clip URL and (re)load. Used by
 * the recovery ladder: mid-stream abort and wait-for-compressed both recover
 * by resetting `src` and calling `load()` again (§6.1) — same single path.
 */
export const resetClipElement = (element: ClipAudioElement, src: string): void => {
  element.src = src;
  element.load();
};
