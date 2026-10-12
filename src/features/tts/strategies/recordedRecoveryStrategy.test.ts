import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { supervisePlayback } from '../lib/playbackRecovery';
import { ChapterAudioCache } from '../resolver/chapterCache';
import { recordedSourceForVerse } from '../resolver/selectTrack';
import { SourceAudioLookupError } from '../resolver/sourceAudioClient';
import { FakeClipElement, fakeResponse } from '../testing/fakeClipElement';
import {
  bsbChapter,
  sourceChapterRequest,
  unprovenDblChapter,
  windowlessChapter,
} from '../testing/sourceAudioFixtures';

import { RecordedRecoveryStrategy } from './recordedRecoveryStrategy';

import type { ChapterSourceAudio } from '../resolver/sourceAudioClient';
import type { RecoveryStrategy, SourceThunk } from '../seam/types';

const flush = () => vi.advanceTimersByTimeAsync(0);
afterEach(() => vi.useRealTimers());
const setup = async (initial = bsbChapter(), barred = false) => {
  vi.useFakeTimers();
  const load = vi.fn().mockResolvedValue(initial);
  const cache = new ChapterAudioCache({ load, supportsOpus: true });
  const controller = new AbortController();
  await cache.get(sourceChapterRequest, controller.signal);
  const source = recordedSourceForVerse(initial, 1, true)!;
  const element = new FakeClipElement();
  element.src = source.url;
  const fallback: RecoveryStrategy = {
    supervision: { stallWatchdogMs: null },
    recover: vi.fn<RecoveryStrategy['recover']>(async (_failure, requests) =>
      requests.giveUp('TTS failed')
    ),
  };
  const ttsSource = vi.fn<SourceThunk>(async context => {
    context.requests.attach(fallback);
    context.requests.markAi();
    return { url: 'https://example.test/tts.wav', durationIsMeasured: false };
  });
  const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ status: 206 }));
  const recovery = new RecordedRecoveryStrategy({
    chapter: sourceChapterRequest,
    cache,
    verseNumber: 1,
    ttsSource: barred ? null : ttsSource,
    fetchFn,
  });
  const budgets = new Map<string, number>();
  const onGiveUp = vi.fn();
  const onHandOff = vi.fn();
  const onMarkAi = vi.fn();
  const onSource = vi.fn();
  const onAttach = vi.fn();
  const onAutoplayRefused = vi.fn();
  const playback = supervisePlayback({
    element,
    source,
    recovery,
    budgets,
    run: { forceTts: false },
    signal: controller.signal,
    maxRetriesPerClass: 2,
    maxStallPolls: 30,
    onGiveUp,
    onHandOff,
    onMarkAi,
    onSource,
    onAttach,
    onAutoplayRefused,
  });
  playback.start();
  await flush();
  element.emit('playing');
  return {
    element,
    source,
    load,
    cache,
    controller,
    ttsSource,
    fetchFn,
    recovery,
    budgets,
    onGiveUp,
    onHandOff,
    onMarkAi,
    onSource,
    onAttach,
    onAutoplayRefused,
    fallback,
    playback,
  };
};
const fail = async (h: Awaited<ReturnType<typeof setup>>, time = 7.25) => {
  h.element.currentTime = time;
  h.element.emit('error');
  await flush();
};

const replacement = (): ChapterSourceAudio => {
  const response = bsbChapter();
  response.items = response.items.map(item => ({ ...item, url: `${item.url}?replacement` }));
  response.verseTimestamps![0] = { verse: 1, startSeconds: 6, endSeconds: 13 };
  return response;
};

describe('RecordedRecoveryStrategy under player arbitration', () => {
  it('re-resolves before retrying and replaces the entire source, preserving a file-absolute offset', async () => {
    const h = await setup();
    h.load.mockResolvedValue(replacement());
    await fail(h);
    expect(h.load).toHaveBeenCalledTimes(2);
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(h.element.currentTime).toBe(7.25);
    expect(h.onSource).toHaveBeenLastCalledWith(
      {
        url: replacement().items[1].url,
        window: [6, 13],
        durationMs: 7000,
        durationIsMeasured: true,
      },
      7.25
    );
    expect(h.onHandOff).not.toHaveBeenCalled();
  });

  it('allows exactly two retries of an unchanged recording and refuses the third heal before I/O', async () => {
    const h = await setup();
    await fail(h);
    await fail(h);
    expect(h.element.loadCalls).toEqual([h.source.url, h.source.url]);
    expect(h.load).toHaveBeenCalledTimes(3); // Initial resolution plus two heals.
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
    await fail(h);
    expect(h.load).toHaveBeenCalledTimes(3);
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
    expect(h.onHandOff).toHaveBeenCalledOnce();
    expect(h.onMarkAi).toHaveBeenCalled();
    expect(h.onAttach).toHaveBeenCalledWith(h.fallback);
    expect(h.budgets.size).toBe(0);
    expect(h.element.currentTime).toBe(0); // TTS restarts the failed verse, not the chapter offset.
    expect(h.element.src).toBe('https://example.test/tts.wav');
    expect(h.onGiveUp).not.toHaveBeenCalled();
    await fail(h);
    expect(h.fallback.recover).toHaveBeenCalledOnce();
    expect(h.onGiveUp).toHaveBeenCalledWith('TTS failed', undefined);
  });

  it.each([401, 403])('route %s is terminal without TTS, AI marking or handoff', async status => {
    const h = await setup();
    h.load.mockRejectedValue(new SourceAudioLookupError('Denied', false, undefined, status));
    await fail(h);
    expect(h.onGiveUp).toHaveBeenCalledWith('Recorded source access denied', 'recorded');
    expect(h.ttsSource).not.toHaveBeenCalled();
    expect(h.onHandOff).not.toHaveBeenCalled();
    expect(h.onMarkAi).not.toHaveBeenCalled();
    expect(h.element.loadCalls).toEqual([]);
    // A delayed exhaustion callback must not revive the formerly available fallback.
    const requests = {
      play: vi.fn(),
      attach: vi.fn(),
      markAi: vi.fn(),
      handOff: vi.fn(),
      giveUp: vi.fn(),
      poll: vi.fn(),
    };
    await h.recovery.recover(
      { on: 'stall', source: h.source, positionMs: 0 },
      requests,
      new AbortController().signal
    );
    const options = requests.play.mock.calls[0][2] as { onExhausted: () => void };
    options.onExhausted();
    expect(requests.handOff).not.toHaveBeenCalled();
    expect(requests.markAi).not.toHaveBeenCalled();
    expect(requests.giveUp).toHaveBeenCalledWith('Recorded source access denied');
  });

  it.each(['resolve', 'probe', 'window'] as const)(
    'hands off on an unrecoverable %s without loading a stale source',
    async failure => {
      const h = await setup();
      if (failure === 'resolve') h.load.mockRejectedValue(new TypeError('Network down'));
      if (failure === 'probe') h.fetchFn.mockRejectedValue(new TypeError('Network down'));
      if (failure === 'window') h.load.mockResolvedValue(windowlessChapter());
      await fail(h);
      expect(h.onHandOff).toHaveBeenCalledOnce();
      expect(h.onAttach).toHaveBeenCalledWith(h.fallback);
      expect(h.onMarkAi).toHaveBeenCalled();
      expect(h.element.loadCalls).toEqual(['https://example.test/tts.wav']);
      expect(h.onGiveUp).not.toHaveBeenCalled();
    }
  );

  it('uses ranged GET, never the method-bound HEAD 403, and never reads Content-Type', async () => {
    // UNPROVEN: DBL ships no timecodes today; this fixture follows its contract.
    const h = await setup(unprovenDblChapter());
    const headers = {
      get: vi.fn(() => {
        throw new Error('Do not read Content-Type');
      }),
    };
    const cancel = vi.fn().mockResolvedValue(undefined);
    h.fetchFn.mockImplementation(async (_url: string, init: RequestInit) =>
      init.method === 'HEAD'
        ? fakeResponse({ status: 403 })
        : { ...fakeResponse({ status: 206 }), headers, body: { cancel } }
    );
    await fail(h, 12.5);
    expect(h.fetchFn).toHaveBeenCalledWith(h.source.url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      credentials: 'omit',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(headers.get).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(h.onHandOff).not.toHaveBeenCalled();
    expect(h.element.currentTime).toBe(12.5);
  });

  it.each([403, 404, 500])(
    'a reachable HTTP %s still earns bounded reloads, not an unbounded probe loop',
    async status => {
      const h = await setup();
      h.fetchFn.mockResolvedValue(fakeResponse({ status }));
      await fail(h);
      expect(h.element.loadCalls).toEqual([h.source.url]);
      expect(h.onHandOff).not.toHaveBeenCalled();
    }
  );

  it('two failed verses ride one chapter heal, reselecting their own windows', async () => {
    const h = await setup();
    h.load.mockResolvedValue(replacement());
    await fail(h);
    const requests = {
      play: vi.fn(),
      attach: vi.fn(),
      markAi: vi.fn(),
      handOff: vi.fn(),
      giveUp: vi.fn(),
      poll: vi.fn(),
    };
    const other = new RecordedRecoveryStrategy({
      chapter: sourceChapterRequest,
      cache: h.cache,
      verseNumber: 2,
      ttsSource: h.ttsSource,
      fetchFn: h.fetchFn,
    });
    await other.recover(
      { on: 'stall', source: h.source, positionMs: 15_000 },
      requests,
      h.controller.signal
    );
    const thunk = requests.play.mock.calls[0][0] as SourceThunk;
    const result = await thunk({ signal: h.controller.signal, run: { forceTts: false }, requests });
    expect(result).toEqual(recordedSourceForVerse(replacement(), 2, true));
    expect(h.load).toHaveBeenCalledTimes(2);
  });

  it.each(['network', 'budget'])(
    'barred fallback gives up with a reason and no AI mark on %s exhaustion',
    async failure => {
      const h = await setup(bsbChapter(), true);
      if (failure === 'network') h.load.mockRejectedValue(new Error('offline'));
      else {
        await fail(h);
        await fail(h);
      }
      await fail(h);
      expect(h.onGiveUp).toHaveBeenCalledWith('Recorded source unrecoverable', 'recorded');
      expect(h.onHandOff).not.toHaveBeenCalled();
      expect(h.onMarkAi).not.toHaveBeenCalled();
      expect(h.ttsSource).not.toHaveBeenCalled();
    }
  );

  it('aborting a pending heal neither retries nor hands off', async () => {
    const h = await setup();
    let finish!: (value: ChapterSourceAudio) => void;
    h.load.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await fail(h);
    h.controller.abort();
    finish(replacement());
    await flush();
    expect(h.element.loadCalls).toEqual([]);
    expect(h.onHandOff).not.toHaveBeenCalled();
    expect(h.onGiveUp).not.toHaveBeenCalled();
  });

  it('records stalls after playback begins, while autoplay refusal never enters recovery', async () => {
    const h = await setup();
    h.element.emit('stalled'); // Fetching can stall while buffered audio keeps playing.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.load).toHaveBeenCalledOnce();
    h.element.emit('waiting');
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(h.load).toHaveBeenCalledTimes(2);
    h.element.playRejection = new DOMException('gesture required', 'NotAllowedError');
    await fail(h);
    expect(h.onAutoplayRefused).toHaveBeenCalledOnce();
    expect(h.onHandOff).not.toHaveBeenCalled();
  });

  it('has no expiry clock, player, timer or retry counter in the policy module', () => {
    const module = readFileSync('src/features/tts/strategies/recordedRecoveryStrategy.ts', 'utf8');
    expect(module).not.toMatch(
      /Date\.now|expiresAt|setTimeout|setInterval|HTMLAudioElement|new Audio|retryCount/
    );
  });
});
