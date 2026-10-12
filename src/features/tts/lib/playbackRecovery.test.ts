import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeClipElement } from '../testing/fakeClipElement';

import { supervisePlayback } from './playbackRecovery';

import type { PlaybackFailure, RecoveryRequests, RecoveryStrategy, Source } from '../seam/types';

class FakeStrategy implements RecoveryStrategy {
  readonly supervision = { stallWatchdogMs: null };
  recover = vi
    .fn<
      (failure: PlaybackFailure, requests: RecoveryRequests, signal: AbortSignal) => Promise<void>
    >()
    .mockResolvedValue(undefined);
}

const source: Source = { url: 'https://media.test/source', durationIsMeasured: false };
const setup = (strategy = new FakeStrategy()) => {
  const element = new FakeClipElement();
  element.src = source.url;
  const controller = new AbortController();
  const onGiveUp = vi.fn();
  const onMarkAi = vi.fn();
  const onAutoplayRefused = vi.fn();
  const budgets = new Map<string, number>();
  const playback = supervisePlayback({
    budgets,
    run: { forceTts: false },
    element,
    source,
    recovery: strategy,
    signal: controller.signal,
    maxRetriesPerClass: 2,
    maxStallPolls: 3,
    onGiveUp,
    onMarkAi,
    onAutoplayRefused,
  });
  return {
    element,
    controller,
    onGiveUp,
    onMarkAi,
    onAutoplayRefused,
    detach: playback.detach,
    strategy,
    budgets,
    playback,
  };
};

// This same segment controller is used by the queue, not a competing recovery loop.
describe('player recovery arbitration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('schedules initial attachment and AI marking before the first media play', async () => {
    const { element, playback, onMarkAi } = setup();
    const policy = new FakeStrategy();
    const play = vi.spyOn(element, 'play').mockImplementation(async () => {
      element.emit('error');
    });
    playback.requests.attach(policy);
    playback.requests.markAi();
    playback.start(9);
    expect(onMarkAi).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(onMarkAi.mock.invocationCallOrder[0]).toBeLessThan(play.mock.invocationCallOrder[0]);
    expect(policy.recover).toHaveBeenCalledOnce();
    expect(element.currentTime).toBe(9);
  });

  it('does not wedge supervision when a policy chooses no action', async () => {
    const { element, strategy } = setup();
    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    expect(strategy.recover).toHaveBeenCalledTimes(2);
  });

  it('honors autoplay refusal from the current load even if another error started recovery', async () => {
    const strategy = new FakeStrategy();
    strategy.recover
      .mockImplementationOnce(async (_failure, requests) => {
        requests.play(source, 'opaque');
      })
      .mockImplementation(async (_failure, requests) => {
        requests.play(source, 'opaque', { afterMs: 100 });
      });
    const { element, onAutoplayRefused, onGiveUp } = setup(strategy);
    let rejectPlay!: (error: Error) => void;
    vi.spyOn(element, 'play').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectPlay = reject;
        })
    );
    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    element.emit('error'); // changes the recovery epoch, not the media load
    rejectPlay(new DOMException('Gesture required', 'NotAllowedError'));
    await vi.advanceTimersByTimeAsync(100);
    expect(onAutoplayRefused).toHaveBeenCalledOnce();
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(element.loadCalls).toHaveLength(1);
  });

  it('ignores a stale autoplay refusal after a newer media load replaced it', async () => {
    const strategy = new FakeStrategy();
    strategy.recover.mockImplementation(async (_failure, requests) => {
      requests.play(source, 'opaque');
    });
    const { element, onAutoplayRefused, controller } = setup(strategy);
    const rejects: Array<(error: Error) => void> = [];
    vi.spyOn(element, 'play').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejects.push(reject);
        })
    );
    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    expect(element.loadCalls).toHaveLength(2);
    rejects[0](new DOMException('Old load', 'NotAllowedError'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onAutoplayRefused).not.toHaveBeenCalled();
    controller.abort();
  });

  it('increments on the refusing classification: two retries then the policy exhaustion action', async () => {
    const strategy = new FakeStrategy();
    const lazy = vi.fn().mockResolvedValue(source);
    strategy.recover.mockImplementation(async (_failure, requests) => {
      requests.play(lazy, 'opaque-bucket', { onExhausted: () => requests.giveUp('done') });
    });
    const { element, onGiveUp, budgets } = setup(strategy);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      element.emit('error');
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(budgets.get('opaque-bucket')).toBe(3);
    expect(strategy.recover).toHaveBeenCalledTimes(3);
    expect(lazy).toHaveBeenCalledTimes(2);
    expect(element.loadCalls).toHaveLength(2);
    expect(onGiveUp).toHaveBeenCalledExactlyOnceWith('done', 'opaque-bucket');
  });

  it('keeps exhaustion action-only: attachment, mark and hand-off reset the new strategy budget', async () => {
    const fallback = new FakeStrategy();
    fallback.recover.mockImplementation(async (_failure, requests) => {
      requests.play(source, 'shared-name');
    });
    const strategy = new FakeStrategy();
    strategy.recover.mockImplementation(async (_failure, requests) => {
      requests.play(source, 'shared-name', {
        onExhausted: () => {
          requests.attach(fallback);
          requests.markAi();
          requests.handOff(source, 'fallback');
        },
      });
    });
    const { element, onGiveUp, onMarkAi } = setup(strategy);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      element.emit('error');
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(onMarkAi).toHaveBeenCalledOnce();
    expect(onGiveUp).not.toHaveBeenCalled();
    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    expect(fallback.recover).toHaveBeenCalledOnce();
    expect(element.playCalls).toHaveLength(4); // two retries, hand-off, new budget retry
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('charges one retry per polling episode and no extra charge for its successful reload', async () => {
    const strategy = new FakeStrategy();
    const probe = vi.fn(async (episode: { play: (next: Source) => void }) => {
      episode.play(source);
    });
    strategy.recover.mockImplementation(async (_failure, requests) => {
      requests.poll('opaque', 0, probe, {
        onExhausted: () => requests.giveUp('episodes exhausted'),
      });
    });
    const { element, onGiveUp } = setup(strategy);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      element.emit('error');
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(probe).toHaveBeenCalledTimes(2); // third episode denied before probing
    expect(element.playCalls).toHaveLength(2);
    expect(onGiveUp).toHaveBeenCalledExactlyOnceWith('episodes exhausted', 'opaque');
  });

  it('bounds repeated probes independently, including the delay after the last unsuccessful probe', async () => {
    const strategy = new FakeStrategy();
    const probe = vi.fn(async (episode: { poll: (ms: number) => void }) => {
      episode.poll(10);
    });
    strategy.recover.mockImplementation(async (_failure, requests) => {
      requests.poll('opaque', 0, probe, {
        onPollExhausted: () => requests.giveUp('polls exhausted'),
      });
    });
    const { element, onGiveUp } = setup(strategy);
    element.emit('error');
    await vi.advanceTimersByTimeAsync(20);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(onGiveUp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledExactlyOnceWith('polls exhausted', 'opaque');
  });

  it('ignores pending delays and retained requests after detach', async () => {
    const strategy = new FakeStrategy();
    let retained!: RecoveryRequests;
    strategy.recover.mockImplementation(async (_failure, requests) => {
      retained = requests;
      requests.play(source, 'opaque', { afterMs: 100 });
    });
    const { element, detach, onGiveUp } = setup(strategy);
    element.emit('error');
    detach();
    retained.giveUp('stale');
    retained.handOff(source, 'stale');
    await vi.advanceTimersByTimeAsync(100);
    expect(element.loadCalls).toHaveLength(0);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('preserves the policy reason when a lazy recovery fails after requesting give-up', async () => {
    const strategy = new FakeStrategy();
    strategy.recover.mockImplementation(async (_failure, requests) => {
      requests.play(async () => {
        requests.giveUp('specific failure');
        throw new Error('fetch failed');
      }, 'opaque');
    });
    const { element, onGiveUp } = setup(strategy);
    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    expect(onGiveUp).toHaveBeenCalledExactlyOnceWith('specific failure', 'opaque');
  });

  it('schedules a reload rather than re-entering the media error handler inline', async () => {
    const strategy = new FakeStrategy();
    strategy.recover.mockImplementation(async (_failure, requests) => {
      requests.play(source, 'opaque');
    });
    const { element } = setup(strategy);
    element.emit('error');
    expect(element.loadCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(element.loadCalls).toHaveLength(1);
  });
});
