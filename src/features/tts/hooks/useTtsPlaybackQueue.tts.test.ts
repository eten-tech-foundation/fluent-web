/**
 * Queue/controls tests (§12.1 "Queue" rows). Deterministic by construction:
 * fake engine (no Gemini/R2 credentials exist — operator ruling), fake clip
 * elements (jsdom has no media stack), fake timers where recovery timers are
 * in play. Advance is `ended`-driven ONLY (§6.2).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

import { type FetchLike, type TtsRecoveryTiming } from '../engines/serverTtsEngine';
import { createTtsSegment } from '../lib/createTtsSegment';
import { FakeClipElement, fakeResponse } from '../testing/fakeClipElement';
import { type TtsClip, type TtsEngine, type TtsQueueItem, type TtsRequest } from '../tts.types';

import {
  useTtsPlaybackQueue,
  type TtsPlaybackQueueApi,
  type UseTtsPlaybackQueueOptions,
} from './useTtsPlaybackQueue';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Small deterministic timing so fake-timer tests read clearly. */
const TIMING: TtsRecoveryTiming = {
  maxRetriesPerClass: 2,
  midStreamBackoffMs: 1000,
  defaultRetryAfterMs: 2000,
  stallWatchdogMs: 4000,
  stallPollIntervalMs: 1000,
  maxStallPolls: 5,
};

const verse = (n: number, text = `Verse ${n} text`): TtsQueueItem => ({
  verseRef: `GEN 1:${n}`,
  text,
  langCode: 'eng',
});

const clipUrlFor = (text: string): string => `https://clips.test/${encodeURIComponent(text)}.wav`;

interface Harness {
  synthesize: Mock<(request: TtsRequest, signal?: AbortSignal) => Promise<TtsClip>>;
  elements: FakeClipElement[];
  onError: Mock<(error: Error, item: TtsQueueItem) => void>;
  onScrollRequest: Mock<(verseRef: string) => void>;
  result: {
    current: Omit<TtsPlaybackQueueApi, 'playOne' | 'playFrom'> & {
      playOne: (item: TtsQueueItem) => void;
      playFrom: (items: TtsQueueItem[], startIndex: number) => void;
    };
  };
  unmount: () => void;
}

const createHarness = (
  overrides: Partial<UseTtsPlaybackQueueOptions> & {
    engine?: TtsEngine;
    fetchFn?: FetchLike;
    timing?: Partial<TtsRecoveryTiming>;
  } = {}
): Harness => {
  const synthesize = vi.fn<(request: TtsRequest, signal?: AbortSignal) => Promise<TtsClip>>(
    request => Promise.resolve({ audioUrl: clipUrlFor(request.text) })
  );
  const engine: TtsEngine = { synthesize };
  const elements: FakeClipElement[] = [];
  const createElement = (src: string): FakeClipElement => {
    const element = new FakeClipElement();
    element.src = src;
    element.preload = 'auto';
    element.load();
    elements.push(element);
    return element;
  };
  const onError = vi.fn<(error: Error, item: TtsQueueItem) => void>();
  const onScrollRequest = vi.fn<(verseRef: string) => void>();
  const options: UseTtsPlaybackQueueOptions = {
    onError,
    onAutoplayRefused: (_snapshot, segment) => onError(new Error('Gesture required'), segment),
    onScrollRequest,
    createElement,
    maxRetriesPerClass: TIMING.maxRetriesPerClass,
    maxStallPolls: TIMING.maxStallPolls,
    ...overrides,
  };
  const { result, unmount } = renderHook(() => useTtsPlaybackQueue(options));
  const segmentFor = (item: TtsQueueItem) =>
    createTtsSegment(item, {
      engine: overrides.engine ?? engine,
      playableKey: item.verseRef,
      fetchFn: overrides.fetchFn,
      timing: { ...TIMING, ...overrides.timing },
    });
  // Test-only TTS construction exercises the generic queue through its real L2 factory.
  return {
    synthesize,
    elements,
    onError,
    onScrollRequest,
    unmount,
    result: {
      get current() {
        return {
          ...result.current,
          playOne: (item: TtsQueueItem) => result.current.playOne(segmentFor(item)),
          playFrom: (items: TtsQueueItem[], index: number) =>
            result.current.playFrom(items.map(segmentFor), index),
        };
      },
    },
  };
};

/** The clip element whose src is the given item's synthesized URL. */
const elementFor = (harness: Harness, item: TtsQueueItem): FakeClipElement => {
  const element = harness.elements.find(candidate => candidate.src === clipUrlFor(item.text));
  if (!element) throw new Error(`no element created for ${item.verseRef}`);
  return element;
};

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// playOne / playFrom basics (T1, §5.3)
// ---------------------------------------------------------------------------

/**
 * Found in a browser under a ONE-SLOT ai container (phase 09, 2026-08-18):
 * continuous play spoke verse 1, moved the highlight to verse 2, and then sat
 * in silence with no toast.
 *
 * The prefetch is what breaks. `generate` never refuses on admission — it
 * writes a sidecar and costs nothing — so the prefetch PROMISE resolves and the
 * entry is marked `ready`. The refusal lands on the ELEMENT, whose `load()`
 * fetches the audio and gets `503`. Nothing was listening to that element, so
 * the entry kept saying `ready` while holding a corpse, and `advance` adopted
 * it: `play()` rejected, and — correctly, since `45d5029` — the queue stayed
 * quiet and left it to the recovery ladder. But the ladder attaches its `error`
 * listener at adoption time, and the element had already fired `error` while
 * still a prefetch. Nobody was left to heal it.
 */
describe('useTtsPlaybackQueue — a prefetched clip that never loaded (§9.2 admission)', () => {
  it('does not adopt a prefetched element whose own load failed', async () => {
    const harness = createHarness();
    const items = [verse(1), verse(2)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
    });
    await act(async () => {
      elementFor(harness, items[0]).emit('playing');
    });

    // The prefetched element for verse 2 exists, and its fetch was refused.
    const prefetched = harness.elements[1];
    expect(prefetched.src).toBe(clipUrlFor(items[1].text));
    await act(async () => {
      prefetched.emit('error');
    });
    // A real element rejects the pending play() for a source that never loaded.
    prefetched.playRejection = new DOMException('no source', 'NotSupportedError');

    await act(async () => {
      elementFor(harness, items[0]).emit('ended');
    });

    // A fresh element must be built rather than the dead one adopted.
    expect(harness.elements.length).toBe(3);
    const replacement = harness.elements[2];
    expect(replacement.src).toBe(clipUrlFor(items[1].text));
    expect(replacement.playCalls).toEqual([clipUrlFor(items[1].text)]);

    await act(async () => {
      replacement.emit('playing');
    });
    expect(harness.result.current.status).toBe('playing');
    expect(harness.result.current.activeVerseRef).toBe('GEN 1:2');
    expect(harness.onError).not.toHaveBeenCalled();
  });
});

describe('useTtsPlaybackQueue — play actions', () => {
  it('playOne synthesizes exactly the text it was given, with the langCode hint (T6, T18)', async () => {
    const harness = createHarness();
    const item = verse(1, 'In the beginning God created');

    await act(async () => {
      harness.result.current.playOne(item);
    });

    expect(harness.synthesize).toHaveBeenCalledTimes(1);
    expect(harness.synthesize.mock.calls[0][0]).toEqual({
      text: 'In the beginning God created',
      langCode: 'eng',
    });
    expect(harness.result.current.activeVerseRef).toBe('GEN 1:1');
  });

  it('an empty resolved list is a no-op stop: no synthesis, back to idle', async () => {
    const harness = createHarness();

    await act(async () => {
      harness.result.current.playFrom([], 0);
    });

    expect(harness.synthesize).not.toHaveBeenCalled();
    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
  });

  it('playOne walks loading → playing → idle (T1, §5.2)', async () => {
    const harness = createHarness();
    const item = verse(1);

    await act(async () => {
      harness.result.current.playOne(item);
    });
    expect(harness.result.current.status).toBe('loading');

    await act(async () => {
      elementFor(harness, item).emit('playing');
    });
    expect(harness.result.current.status).toBe('playing');
    expect(harness.result.current.itemStates['GEN 1:1']).toBe('playing');

    await act(async () => {
      elementFor(harness, item).emit('ended');
    });
    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
    expect(harness.result.current.itemStates).toEqual({});
  });

  it('playFrom advances on `ended` only: highlight moves, scroll is requested, buffered clip is reused (§5.3, §6.2)', async () => {
    const harness = createHarness();
    const items = [verse(1), verse(2)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
    });

    // While verse 1 plays, verse 2 was prefetched (one generate each — no more).
    expect(harness.synthesize).toHaveBeenCalledTimes(2);
    expect(harness.result.current.activeVerseRef).toBe('GEN 1:1');
    expect(harness.result.current.itemStates['GEN 1:2']).toBe('buffered');
    expect(harness.onScrollRequest.mock.calls.map(call => call[0])).toEqual(['GEN 1:1']);

    await act(async () => {
      elementFor(harness, items[0]).emit('ended');
    });

    // Advance consumed the buffered clip: NO new synthesis, NO new element.
    expect(harness.synthesize).toHaveBeenCalledTimes(2);
    expect(harness.elements).toHaveLength(2);
    expect(harness.result.current.activeVerseRef).toBe('GEN 1:2');
    expect(harness.onScrollRequest.mock.calls.map(call => call[0])).toEqual(['GEN 1:1', 'GEN 1:2']);
  });

  it('end of the supplied list goes idle — the hook never navigates', async () => {
    const harness = createHarness();
    const items = [verse(1), verse(2)];

    await act(async () => {
      harness.result.current.playFrom(items, 1);
    });
    await act(async () => {
      elementFor(harness, items[1]).emit('ended');
    });

    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
    expect(harness.result.current.itemStates).toEqual({});
  });

  it('playFrom advances through a bounded group and goes idle at its end (G3a)', async () => {
    // Pericope mode reads a bounded slice of the page and stops there.
    const harness = createHarness();
    const items = [verse(1), verse(2)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
    });
    await act(async () => {
      elementFor(harness, items[0]).emit('ended');
    });

    // It really is a multi-item run, not a playOne in disguise.
    expect(harness.result.current.activeVerseRef).toBe(items[1].verseRef);

    await act(async () => {
      elementFor(harness, items[1]).emit('ended');
    });

    expect(harness.result.current.itemStates).toEqual({});
    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
  });

  it('playFrom goes idle after a single-item list (G3a)', async () => {
    const harness = createHarness();
    const items = [verse(1)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
    });
    await act(async () => {
      elementFor(harness, items[0]).emit('ended');
    });

    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Prefetch discipline (§5.3, CB1)
// ---------------------------------------------------------------------------

describe('useTtsPlaybackQueue — prefetch cap', () => {
  it('prefetches only the configured depth ahead, even across rapid `ended` advances (CB1)', async () => {
    const harness = createHarness();
    const items = [verse(1), verse(2), verse(3), verse(4), verse(5)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
    });
    // Playing verse 1 + default depth 1 ⇒ exactly verse 2 requested.
    expect(harness.synthesize).toHaveBeenCalledTimes(2);

    for (let played = 0; played < 3; played += 1) {
      await act(async () => {
        elementFor(harness, items[played]).emit('ended');
      });
      // Invariant after each advance: requests never exceed played+1 clip
      // plus one prefetch ahead of the new play position.
      expect(harness.synthesize.mock.calls.length).toBeLessThanOrEqual(played + 3);
    }
    expect(harness.result.current.activeVerseRef).toBe('GEN 1:4');
  });

  it('prefetchDepth is clamped to the hard maximum of two (CB1)', async () => {
    const harness = createHarness({ prefetchDepth: 50 });
    const items = [verse(1), verse(2), verse(3), verse(4), verse(5)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
    });

    // Playing verse 1 + clamped depth 2 ⇒ verses 2 and 3 only, never fan-out.
    expect(harness.synthesize).toHaveBeenCalledTimes(3);
    expect(harness.result.current.itemStates['GEN 1:2']).toBe('buffered');
    expect(harness.result.current.itemStates['GEN 1:3']).toBe('buffered');
    expect(harness.result.current.itemStates['GEN 1:4']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// stop() semantics (§5.1, CB1) — fake timers
// ---------------------------------------------------------------------------

describe('useTtsPlaybackQueue — stop', () => {
  it('stop clears queue, highlight and prefetch intent, and cancels a PENDING recovery timer (CB1)', async () => {
    vi.useFakeTimers();
    const fetchFn = vi
      .fn()
      .mockResolvedValue(fakeResponse({ status: 503, headers: { 'Retry-After': '3' } }));
    const harness = createHarness({ fetchFn: fetchFn as unknown as FetchLike });
    const items = [verse(1), verse(2)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
      await vi.advanceTimersByTimeAsync(0);
    });
    const element = elementFor(harness, items[0]);
    const loadsBefore = element.loadCalls.length;

    // Element error → HEAD probe sees 503 + Retry-After ⇒ a retry timer is
    // now pending inside the recovery ladder.
    await act(async () => {
      element.emit('error');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    act(() => {
      harness.result.current.stop();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // T21/CB1: no reload, no further probe — the timer died with the signal.
    expect(element.loadCalls.length).toBe(loadsBefore);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
    expect(harness.result.current.itemStates).toEqual({});
  });

  it('stop aborts the in-flight synthesis signal', async () => {
    let capturedSignal: AbortSignal | undefined;
    const harness = createHarness({
      engine: {
        synthesize: (_request: TtsRequest, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<TtsClip>(() => {}); // never resolves
        },
      },
    });

    await act(async () => {
      harness.result.current.playOne(verse(1));
    });
    expect(harness.result.current.status).toBe('loading');

    act(() => {
      harness.result.current.stop();
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Failure, rate passthrough, indeterminate duration (§5.2, §6.2)
// ---------------------------------------------------------------------------

/**
 * A rejected `play()` — the seam that silently disabled the recovery ladder.
 *
 * Found in a real browser during phase 09 (2026-08-18) by pointing a clip at a
 * URL that 404s. The element rejects `play()` AND fires `error` for the same
 * load failure; the queue used to fail the session on the rejection, which
 * aborts `session.controller` — the signal `superviseClipPlayback`'s HEAD probe
 * runs under. An immediate rejection always beats a network round trip, so the
 * ladder was killed mid-probe and EVERY clip-start failure became a toast:
 * 404s never regenerated, and 503s never waited out their Retry-After.
 *
 * Nothing caught it because `FakeClipElement.play()` could only resolve, so
 * this branch had no coverage at all, and the engine's own ladder tests
 * exercise the supervisor in isolation with no queue to race it.
 */
describe('useTtsPlaybackQueue — a rejected play() must not outrun the ladder', () => {
  const loadFailure = (): DOMException =>
    new DOMException('Failed to load because no supported source was found.', 'NotSupportedError');
  const autoplayRefusal = (): DOMException =>
    new DOMException('play() failed because the user did not interact first.', 'NotAllowedError');

  /** A harness whose every clip element rejects `play()` with `rejection`. */
  const harnessRejectingPlay = (rejection: DOMException): Harness => {
    const elements: FakeClipElement[] = [];
    const harness = createHarness({
      createElement: (src: string) => {
        const element = new FakeClipElement();
        element.src = src;
        element.preload = 'auto';
        element.playRejection = rejection;
        element.load();
        elements.push(element);
        return element;
      },
    });
    harness.elements.length = 0;
    harness.elements.push(...elements);
    return harness;
  };

  it('a source that fails to load does NOT fail the session — the ladder owns it', async () => {
    const harness = harnessRejectingPlay(loadFailure());

    await act(async () => {
      harness.result.current.playOne(verse(1));
    });

    // No toast: `superviseClipPlayback` is still probing the URL to classify
    // it. Before the fix this fired immediately and tore the session down.
    expect(harness.onError).not.toHaveBeenCalled();
  });

  it('the session signal stays live, so the in-flight HEAD probe survives', async () => {
    // The mechanism itself: goIdle() aborts this signal, and the probe runs
    // under it. Killing it is what turned every 404 into a toast.
    const signals: Array<AbortSignal | undefined> = [];
    const harness = createHarness({
      engine: {
        synthesize: (request: TtsRequest, signal?: AbortSignal) => {
          signals.push(signal);
          return Promise.resolve({ audioUrl: clipUrlFor(request.text) });
        },
      },
      createElement: (src: string) => {
        const element = new FakeClipElement();
        element.src = src;
        element.playRejection = loadFailure();
        element.load();
        return element;
      },
    });

    await act(async () => {
      harness.result.current.playOne(verse(1));
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
  });

  it('autoplay refusal pauses and reports — no gesture is not a clip problem', async () => {
    const harness = harnessRejectingPlay(autoplayRefusal());
    const item = verse(1);

    await act(async () => {
      harness.result.current.playOne(item);
    });

    expect(harness.onError).toHaveBeenCalledTimes(1);
    expect(harness.onError.mock.calls[0][1]).toMatchObject(item);
    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
  });
});

describe('useTtsPlaybackQueue — failure and passthrough', () => {
  it('a synthesis failure surfaces exactly once and leaves no stale highlight (§5.2)', async () => {
    const harness = createHarness({
      engine: { synthesize: () => Promise.reject(new Error('HTTP 502')) },
    });
    const item = verse(1);

    await act(async () => {
      harness.result.current.playOne(item);
    });

    expect(harness.onError).toHaveBeenCalledTimes(1);
    expect(harness.onError.mock.calls[0][0].message).toBe('HTTP 502');
    expect(harness.onError.mock.calls[0][1]).toMatchObject(item);
    expect(harness.result.current.status).toBe('idle');
    expect(harness.result.current.activeVerseRef).toBeNull();
    expect(harness.result.current.itemStates).toEqual({});
  });

  it('changing playbackRate is element passthrough only — never a new generate (T11, §6.2)', async () => {
    const harness = createHarness();
    const items = [verse(1), verse(2)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
    });
    const callsAfterStart = harness.synthesize.mock.calls.length;

    act(() => {
      harness.result.current.setPlaybackRate(1.5);
    });

    expect(elementFor(harness, items[0]).playbackRate).toBe(1.5);
    expect(harness.synthesize.mock.calls.length).toBe(callsAfterStart);

    // The NEXT clip inherits the rate too, still without extra synthesis.
    await act(async () => {
      elementFor(harness, items[0]).emit('ended');
    });
    expect(elementFor(harness, items[1]).playbackRate).toBe(1.5);
    expect(harness.synthesize.mock.calls.length).toBe(callsAfterStart);
  });

  it('a clip reporting indeterminate duration still sequences via `ended` (§6.2)', async () => {
    const harness = createHarness();
    const items = [verse(1), verse(2)];

    await act(async () => {
      harness.result.current.playFrom(items, 0);
    });
    const element = elementFor(harness, items[0]);
    // Streaming-era clips report NaN/Infinity duration; advance must not care.
    (element as unknown as { duration: number }).duration = Number.NaN;

    await act(async () => {
      element.emit('ended');
    });

    expect(harness.result.current.activeVerseRef).toBe('GEN 1:2');
  });
});
