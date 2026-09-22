import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChapterAudioCache } from '../resolver/chapterCache';
import { resolvePlayables } from '../resolver/resolvePlayables';
import { RecordedRecoveryStrategy } from '../strategies/recordedRecoveryStrategy';
import { FakeClipElement, fakeResponse } from '../testing/fakeClipElement';
import { bsbChapter, sourceChapterRequest } from '../testing/sourceAudioFixtures';

import { useTtsPlaybackQueue } from './useTtsPlaybackQueue';

import type { RecoveryStrategy, Segment, Source, SourceThunk } from '../seam/types';

const policy = (): RecoveryStrategy => ({
  supervision: { stallWatchdogMs: null },
  recover: vi.fn(async () => {}),
});
const slice = (
  n: number,
  window: Source['window'] = [n * 10, (n + 1) * 10],
  url = 'chapter'
): Segment => ({
  source: { url, window, durationIsMeasured: true },
  recovery: policy(),
  verseRef: String(n),
  playableKey: 'pericope',
  text: `Verse ${n}`,
});
const setup = (prefetchDepth = 1) => {
  vi.useFakeTimers();
  const elements: FakeClipElement[] = [];
  const onScrollRequest = vi.fn();
  const onRunComplete = vi.fn();
  const onError = vi.fn();
  const h = renderHook(() =>
    useTtsPlaybackQueue({
      prefetchDepth,
      onScrollRequest,
      onRunComplete,
      onError,
      createElement: src => {
        const element = new FakeClipElement();
        element.src = src;
        elements.push(element);
        return element;
      },
    })
  );
  return { ...h, elements, onScrollRequest, onRunComplete, onError };
};
const tick = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const playing = (element: FakeClipElement) => act(() => element.emit('playing'));
const boundary = async (element: FakeClipElement, time: number, ms = 10_000) => {
  element.currentTime = time;
  await tick(ms);
};
afterEach(() => vi.useRealTimers());

describe('windowed segment queue', () => {
  it('keeps an idle hold through loading and does not physically play until released', async () => {
    const h = setup();
    expect(h.result.current.hold()).toBe(false);
    await act(async () => h.result.current.playOne(slice(1)));
    const active = h.elements[0];

    expect(active.playCalls).toEqual([]);
    expect(h.result.current.status).toBe('loading');
    act(() => h.result.current.resumeHeld());
    expect(active.playCalls).toEqual(['chapter']);
  });

  it('holds a sounding run in place and resumes the same media after dismissal', async () => {
    const h = setup();
    await act(async () => h.result.current.playFrom([slice(1), slice(2)], 0));
    const active = h.elements[0];
    playing(active);
    active.currentTime = 15;

    expect(h.result.current.hold()).toBe(true);
    expect(active.paused).toBe(true);
    expect(h.result.current.status).toBe('playing');
    active.currentTime = 20;
    await tick(10_000);
    expect(h.result.current.activeVerseRef).toBe('1');

    act(() => h.result.current.resumeHeld());
    expect(active.paused).toBe(false);
    expect(active.playCalls).toEqual(['chapter', 'chapter']);
    playing(active);
    await boundary(active, 20);
    expect(h.result.current.activeVerseRef).toBe('2');
  });

  it('keeps resume rejection under the active segment recovery strategy', async () => {
    const h = setup();
    const item = slice(1);
    await act(async () => h.result.current.playOne(item));
    const active = h.elements[0];
    playing(active);
    expect(h.result.current.hold()).toBe(true);
    active.playRejection = new DOMException('Media failed', 'NotSupportedError');

    act(() => h.result.current.resumeHeld());
    await act(async () => active.emit('error'));
    await tick();

    expect(item.recovery.recover).toHaveBeenCalledOnce();
    expect(h.onError).not.toHaveBeenCalled();
    expect(h.result.current.status).toBe('loading');
  });

  it('keeps a recovery replacement held until the existing hold is released', async () => {
    const h = setup();
    const item = slice(1);
    item.recovery.recover = vi.fn<RecoveryStrategy['recover']>(async (_failure, requests) => {
      requests.play({ url: 'healed', window: [10, 20], durationIsMeasured: true }, 'replacement');
    });
    await act(async () => h.result.current.playOne(item));
    const active = h.elements[0];
    playing(active);
    expect(h.result.current.hold()).toBe(true);

    act(() => active.emit('error'));
    await tick();
    expect(active.src).toBe('healed');
    expect(active.playCalls).toEqual(['chapter']);

    act(() => h.result.current.resumeHeld());
    expect(active.playCalls).toEqual(['chapter', 'healed']);
  });

  it('cancels an armed stall watchdog while held and rearms it once on release', async () => {
    const h = setup();
    const stallPolicy: RecoveryStrategy = {
      supervision: { stallWatchdogMs: 10_000 },
      recover: vi.fn(async () => {}),
    };
    const item = { ...slice(1), recovery: stallPolicy };
    await act(async () => h.result.current.playOne(item));
    const active = h.elements[0];
    playing(active);
    act(() => active.emit('waiting'));
    expect(vi.getTimerCount()).toBe(1);

    expect(h.result.current.hold()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await tick(20_000);
    expect(stallPolicy.recover).not.toHaveBeenCalled();

    act(() => h.result.current.resumeHeld());
    expect(active.playCalls).toEqual(['chapter', 'chapter']);
    expect(vi.getTimerCount()).toBe(1);
    await tick(9_999);
    expect(stallPolicy.recover).not.toHaveBeenCalled();
    await tick(1);
    expect(stallPolicy.recover).toHaveBeenCalledExactlyOnceWith(
      { on: 'stall', source: item.source, positionMs: active.currentTime * 1000 },
      expect.anything(),
      expect.any(AbortSignal)
    );
  });

  it('plays five adjacent verses as one physical stretch and halts only at its last end', async () => {
    const h = setup();
    await act(async () =>
      h.result.current.playFrom(
        [1, 2, 3, 4, 5].map(n => slice(n)),
        0
      )
    );
    const active = h.elements[0];
    expect(active.currentTime).toBe(10);
    playing(active);
    for (let n = 1; n < 5; n++) {
      await boundary(active, (n + 1) * 10);
      expect(h.result.current.activeVerseRef).toBe(String(n + 1));
      expect(h.result.current.itemStates[String(n + 1)]).toBe('playing');
      expect(h.result.current.itemStates[String(n)]).toBeUndefined();
      expect(active.currentTime).toBe((n + 1) * 10);
      expect(active.pauseCalls).toBe(0);
      expect(active.playCalls).toEqual(['chapter']);
      expect(active.loadCalls).toEqual([]);
    }
    expect(h.elements.slice(1).every(element => element.playCalls.length === 0)).toBe(true);
    await boundary(active, 60);
    expect(active.paused).toBe(true);
    expect(h.result.current.status).toBe('idle');
    expect(h.onRunComplete).toHaveBeenCalledOnce();
    expect(h.onScrollRequest.mock.calls.flat()).toEqual(['1', '2', '3', '4', '5']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['gap', [21, 30], 'chapter'],
    ['overlap', [19, 30], 'chapter'],
    ['different URL', [20, 30], 'other'],
    ['open end', [20], 'chapter'],
    ['windowless', undefined, 'clip'],
  ] as const)('breaks physically at a %s boundary', async (_name, window, url) => {
    const h = setup();
    const next = slice(2, window ? ([...window] as Source['window']) : undefined, url);
    // Passing undefined to slice uses its default; make this case explicitly windowless.
    if (!window) next.source = { url, durationIsMeasured: false };
    await act(async () => h.result.current.playFrom([slice(1), next], 0));
    playing(h.elements[0]);
    await boundary(h.elements[0], 20);
    expect(h.elements[0].paused).toBe(true);
    expect(h.elements[1].playCalls).toEqual([url]);
    expect(h.elements[1].currentTime).toBe(window?.[0] ?? 0);
    expect(h.result.current.activeVerseRef).toBe('2');
  });

  it('halts immediately when the next lazy source is not ready, then starts it after resolution', async () => {
    const h = setup();
    let resolve!: (source: Source) => void;
    const next = {
      ...slice(2),
      source: () =>
        new Promise<Source>(done => {
          resolve = done;
        }),
    };
    await act(async () => h.result.current.playFrom([slice(1), next], 0));
    playing(h.elements[0]);
    await boundary(h.elements[0], 20);
    expect(h.elements[0].paused).toBe(true);
    expect(h.result.current.status).toBe('loading');
    await act(async () => resolve({ url: 'chapter', window: [20, 30], durationIsMeasured: true }));
    expect(h.elements[1].playCalls).toEqual(['chapter']);
  });

  it('open-ended final verse remains recorded and completes only at ended', async () => {
    const h = setup();
    await act(async () => h.result.current.playOne(slice(1, [10])));
    playing(h.elements[0]);
    await boundary(h.elements[0], 100, 90_000);
    expect(h.result.current.status).toBe('playing');
    expect(h.result.current.aiMarkedKeys.size).toBe(0);
    act(() => h.elements[0].emit('ended'));
    expect(h.onRunComplete).toHaveBeenCalledOnce();
  });

  it('a natural file ending is a physical break even when descriptors look adjacent', async () => {
    const h = setup();
    await act(async () => h.result.current.playFrom([slice(1), slice(2)], 0));
    playing(h.elements[0]);
    h.elements[0].currentTime = 20;
    act(() => h.elements[0].emit('ended'));
    await tick();
    expect(h.elements[0].paused).toBe(true);
    expect(h.elements[1].playCalls).toEqual(['chapter']);
    expect(h.result.current.activeVerseRef).toBe('2');
  });

  it('keeps an adopted lazy policy resolution signal live until its continuous segment ends', async () => {
    const h = setup();
    let signal!: AbortSignal;
    const second: Segment = {
      ...slice(2),
      source: async context => {
        signal = context.signal;
        return { url: 'chapter', window: [20, 30], durationIsMeasured: true };
      },
    };
    await act(async () => h.result.current.playFrom([slice(1), second, slice(3)], 0));
    playing(h.elements[0]);
    await boundary(h.elements[0], 20);
    expect(signal.aborted).toBe(false);
    await boundary(h.elements[0], 30);
    expect(signal.aborted).toBe(true);
  });

  it('an early file ending enters recovery rather than silently skipping an unfinished verse', async () => {
    const h = setup();
    const item = slice(1);
    await act(async () => h.result.current.playFrom([item, slice(2)], 0));
    playing(h.elements[0]);
    h.elements[0].currentTime = 12;
    act(() => h.elements[0].emit('ended'));
    await tick();
    expect(item.recovery.recover).toHaveBeenCalledWith(
      {
        on: 'endedEarly',
        source: item.source,
        positionMs: 12_000,
      },
      expect.anything(),
      expect.any(AbortSignal)
    );
    expect(h.result.current.activeVerseRef).toBe('1');
    expect(h.onRunComplete).not.toHaveBeenCalled();
  });

  it('the sounding slice owns failure policy and the playable-local pause index after a continuous boundary', async () => {
    const h = setup();
    const second = slice(2);
    await act(async () => h.result.current.playFrom([slice(1), second], 0));
    playing(h.elements[0]);
    await boundary(h.elements[0], 20);
    h.elements[0].currentTime = 22.5;
    act(() => h.elements[0].emit('error'));
    await tick();
    expect(second.recovery.recover).toHaveBeenCalledWith(
      expect.objectContaining({
        source: second.source,
        positionMs: 22_500,
      }),
      expect.anything(),
      expect.any(AbortSignal)
    );
    let snapshot;
    act(() => {
      snapshot = h.result.current.pause();
    });
    expect(snapshot).toMatchObject({ itemIndex: 1, verseRef: '2', currentTime: 22.5 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['stop', 'unmount', 'new run'] as const)(
    'cancels window timers on %s and ignores old media events',
    async action => {
      const h = setup();
      await act(async () => h.result.current.playFrom([slice(1), slice(2)], 0));
      const old = h.elements[0];
      playing(old);
      if (action === 'unmount') h.unmount();
      else if (action === 'stop') act(() => h.result.current.stop());
      else await act(async () => h.result.current.playOne(slice(7)));
      old.currentTime = 20;
      act(() => {
        old.emit('ended');
        old.emit('playing');
        old.emit('ratechange');
      });
      await tick(60_000);
      expect(h.onRunComplete).not.toHaveBeenCalled();
      expect(h.onScrollRequest.mock.calls.flat()).not.toContain('2');
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('a healed source invalidates the old window schedule and speculative neighbours, even at the same URL', async () => {
    const h = setup();
    let healed = false;
    const first = slice(1);
    first.recovery.recover = vi.fn<RecoveryStrategy['recover']>(async (_failure, requests) => {
      healed = true;
      requests.play({ url: 'chapter', window: [10, 25], durationIsMeasured: true }, 'opaque', {
        startOffset: 15,
      });
    });
    const next = vi.fn<SourceThunk>(async () => ({
      url: 'chapter',
      window: healed ? [25, 40] : [20, 30],
      durationIsMeasured: true,
    }));
    await act(async () => h.result.current.playFrom([first, { ...slice(2), source: next }], 0));
    const active = h.elements[0];
    playing(active);
    active.currentTime = 15;
    act(() => active.emit('error'));
    await tick();
    playing(active);
    await boundary(active, 20, 5000);
    expect(h.result.current.activeVerseRef).toBe('1');
    await boundary(active, 25, 5000);
    expect(h.result.current.activeVerseRef).toBe('2');
    expect(next).toHaveBeenCalledTimes(2);
    expect(active.playCalls).toHaveLength(2); // Initial play and retry, not verse 2.
    expect(h.elements[1].playCalls).toEqual([]);
  });

  it('five-verse resolver run hands off at verse 3, keeps highlighting 3/4/5, and retries recordings on a new run', async () => {
    const h = setup();
    const response = bsbChapter();
    response.verseTimestamps = [1, 2, 3, 4, 5].map(verse => ({
      verse,
      startSeconds: verse * 10,
      endSeconds: (verse + 1) * 10,
    }));
    const load = vi.fn().mockResolvedValue(response);
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    const synthesize = vi.fn(async ({ text }: { text: string }) => ({
      audioUrl: `https://example.test/${text}.wav`,
    }));
    // Network injection changes no production policy; the real class still owns recovery.
    class Recorded extends RecordedRecoveryStrategy {
      constructor(options: ConstructorParameters<typeof RecordedRecoveryStrategy>[0]) {
        super({ ...options, fetchFn: vi.fn().mockResolvedValue(fakeResponse({ status: 206 })) });
      }
    }
    const [playable] = resolvePlayables(
      [1, 2, 3, 4, 5].map(verseNumber => ({
        verseNumber,
        verseRef: String(verseNumber),
        text: `verse${verseNumber}`,
        langCode: 'eng',
      })),
      {
        ...sourceChapterRequest,
        pageKey: 'page',
        pericopeId: 'section',
        cache,
        engine: { synthesize },
        recordedRecovery: Recorded,
        ttsLicenseStatus: 'allowed',
      }
    );
    await act(async () => h.result.current.playFrom(playable.segments, 0));
    const active = h.elements[0];
    playing(active);
    await boundary(active, 20);
    await boundary(active, 30);
    expect(h.result.current.activeVerseRef).toBe('3');
    for (let i = 0; i < 3; i++) {
      active.currentTime = 32;
      act(() => active.emit('error'));
      await tick();
      playing(active);
    }
    expect(h.result.current.activeVerseRef).toBe('3');
    expect(active.src).toBe('https://example.test/verse3.wav');
    expect(active.currentTime).toBe(0);
    expect(h.result.current.aiMarkedKeys.has(playable.key)).toBe(true);
    await boundary(active, 40); // Old recorded endpoint must not advance TTS.
    expect(h.result.current.activeVerseRef).toBe('3');
    act(() => active.emit('ended'));
    await tick();
    expect(h.result.current.activeVerseRef).toBe('4');
    const fourth = h.elements.find(e => e.src.endsWith('verse4.wav') && e.playCalls.length)!;
    expect(fourth).toBeDefined();
    act(() => fourth.emit('ended'));
    await tick();
    expect(h.result.current.activeVerseRef).toBe('5');
    const fifth = h.elements.find(e => e.src.endsWith('verse5.wav') && e.playCalls.length)!;
    act(() => fifth.emit('ended'));
    await tick();
    expect(h.onScrollRequest.mock.calls.flat()).toEqual(['1', '2', '3', '4', '5']);
    expect(h.onRunComplete).toHaveBeenCalledOnce();
    expect(h.onError).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(3);
    expect(synthesize.mock.calls.map(([request]) => request.text)).toEqual([
      'verse3',
      'verse4',
      'verse5',
    ]);
    await act(async () => h.result.current.playOne(playable.segments[2]));
    expect(h.elements.at(-1)?.src).toBe(response.items[1].url);
    expect(h.result.current.aiMarkedKeys.size).toBe(0);
  });
});
