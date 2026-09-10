import { describe, expect, it, vi } from 'vitest';

import { superviseClipPlayback } from '../engines/serverTtsEngine';
import { FakeClipElement, fakeResponse } from '../testing/fakeClipElement';

import { TtsRecoveryStrategy } from './ttsRecoveryStrategy';

import type { PollRequests, RecoveryRequests, Source } from '../seam/types';

const source: Source = { url: 'https://media.test/clip.wav', durationIsMeasured: false };
const actions = (): RecoveryRequests => ({
  play: vi.fn(),
  poll: vi.fn(),
  attach: vi.fn(),
  handOff: vi.fn(),
  giveUp: vi.fn(),
  markAi: vi.fn(),
});
const error = { on: 'error' as const, source, positionMs: 0, startedPlaying: false };

// The existing engine suite continues to exercise every ladder case unchanged
// through its compatibility adapter. These cases isolate the policy/request seam.
describe('TtsRecoveryStrategy requests', () => {
  it.each(['error', 'stall'] as const)(
    'preserves the legacy %s regeneration-failure diagnostic',
    async mode => {
      vi.useFakeTimers();
      const controller = new AbortController();
      try {
        const element = new FakeClipElement();
        const onFailure = vi.fn();
        superviseClipPlayback({
          element,
          audioUrl: source.url,
          signal: controller.signal,
          regenerate: vi.fn().mockRejectedValue(new Error('generate unavailable')),
          fetchFn: vi.fn().mockResolvedValue(fakeResponse({ status: 404 })),
          onFailure,
          streamingEra: mode === 'stall',
          timing: { stallWatchdogMs: 10 },
        });
        if (mode === 'error') element.emit('error');
        await vi.advanceTimersByTimeAsync(10);
        expect(onFailure).toHaveBeenCalledOnce();
        expect(onFailure.mock.calls[0][0]).toMatchObject({
          failureClass: 'midStream',
          message:
            mode === 'stall'
              ? 'TTS stall recovery failed unexpectedly'
              : 'TTS recovery failed unexpectedly',
        });
      } finally {
        controller.abort();
        vi.useRealTimers();
      }
    }
  );

  it('requests a delayed admission retry and lets the player invoke its exhaustion action', async () => {
    const requests = actions();
    const strategy = new TtsRecoveryStrategy({
      regenerate: vi.fn(),
      fetchFn: vi
        .fn()
        .mockResolvedValue(fakeResponse({ status: 503, headers: { 'Retry-After': '3' } })),
    });
    await strategy.recover(error, requests, new AbortController().signal);

    const [next, charge, opts] = vi.mocked(requests.play).mock.calls[0];
    expect(next).toBe(source);
    expect(charge).toBe('admission');
    expect(opts?.afterMs).toBe(3000);
    expect(opts?.onExhausted).toBeTypeOf('function');
    expect(requests.giveUp).not.toHaveBeenCalled();
    vi.mocked(requests.play).mock.calls[0][2]?.onExhausted?.();
    expect(requests.giveUp).toHaveBeenCalledWith('TTS admission retries exhausted (HEAD 503)');
  });

  it('requests regeneration lazily so a denied retry spends nothing', async () => {
    const fresh: Source = { ...source, url: 'https://media.test/fresh.wav' };
    const regenerate = vi.fn().mockResolvedValue(fresh);
    const requests = actions();
    const strategy = new TtsRecoveryStrategy({
      regenerate,
      fetchFn: vi.fn().mockResolvedValue(fakeResponse({ status: 404 })),
    });
    await strategy.recover(error, requests, new AbortController().signal);
    expect(regenerate).not.toHaveBeenCalled();
    const [lazy, charge, opts] = vi.mocked(requests.play).mock.calls[0];
    expect(charge).toBe('notFound');
    opts?.onExhausted?.();
    expect(regenerate).not.toHaveBeenCalled();
    expect(typeof lazy).toBe('function');
    if (typeof lazy !== 'function') throw new Error('Expected lazy regeneration');
    await expect(lazy()).resolves.toBe(fresh);
  });

  it('requests a single charged stall episode, with each subsequent probe scheduled by the player', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 200 }))
      .mockResolvedValue(fakeResponse({ status: 302 }));
    const requests = actions();
    const strategy = new TtsRecoveryStrategy({ regenerate: vi.fn(), fetchFn });
    const signal = new AbortController().signal;
    await strategy.recover({ on: 'stall', source, positionMs: 0 }, requests, signal);
    expect(fetchFn).not.toHaveBeenCalled();
    const [charge, afterMs, probe, opts] = vi.mocked(requests.poll).mock.calls[0];
    expect([charge, afterMs]).toEqual(['stall', 0]);
    const episode: PollRequests = { play: vi.fn(), poll: vi.fn() };
    await probe(episode, signal);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(episode.poll).toHaveBeenCalledWith(1000);
    expect(episode.play).not.toHaveBeenCalled();
    await probe(episode, signal);
    expect(episode.play).toHaveBeenCalledWith(source);
    expect(requests.play).not.toHaveBeenCalled(); // no second retry charge on success
    expect(strategy.supervision.stallWatchdogMs).toBeNull();
    opts?.onPollExhausted?.();
    expect(requests.giveUp).toHaveBeenCalledWith('TTS wait-for-compressed poll budget exhausted');
  });

  it('uses the same mid-stream bucket for network failure and compressed reload', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(fakeResponse({ status: 302 }));
    const strategy = new TtsRecoveryStrategy({ regenerate: vi.fn(), fetchFn });
    const requests = actions();
    const signal = new AbortController().signal;
    await strategy.recover(error, requests, signal);
    await strategy.recover(error, requests, signal);
    expect(vi.mocked(requests.play).mock.calls.map(call => call[1])).toEqual([
      'midStream',
      'midStream',
    ]);
    expect(vi.mocked(requests.play).mock.calls[0][2]?.afterMs).toBe(1000);
    expect(vi.mocked(requests.play).mock.calls[1][2]?.afterMs).toBeUndefined();
  });

  it('does not request a heal when an in-flight probe completes after abort', async () => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>(done => {
      resolve = done;
    });
    const requests = actions();
    const strategy = new TtsRecoveryStrategy({ regenerate: vi.fn(), fetchFn: () => pending });
    const controller = new AbortController();
    const recovery = strategy.recover(error, requests, controller.signal);
    controller.abort();
    resolve(fakeResponse({ status: 302 }));
    await recovery;
    expect(requests.play).not.toHaveBeenCalled();
  });
});
