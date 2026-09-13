import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeClipElement } from '../testing/fakeClipElement';

import { useTtsPlaybackQueue, type UseTtsPlaybackQueueOptions } from './useTtsPlaybackQueue';

import type {
  PlaybackFailure,
  RecoveryRequests,
  RecoveryStrategy,
  Segment,
  Source,
  SourceResolutionContext,
} from '../seam/types';

class FakeRecoveryStrategy implements RecoveryStrategy {
  readonly supervision = { stallWatchdogMs: null as number | null };
  recover = vi
    .fn<
      (failure: PlaybackFailure, requests: RecoveryRequests, signal: AbortSignal) => Promise<void>
    >()
    .mockResolvedValue(undefined);
}
const source = (name: string): Source => ({
  url: `https://media.test/${name}`,
  durationIsMeasured: false,
});
const segment = (n: number, recovery = new FakeRecoveryStrategy(), key = `key-${n}`): Segment => ({
  source: source(`original-${n}`),
  recovery,
  playableKey: key,
  verseRef: `row-${n}`,
  text: `Text ${n}`,
});
const setup = (options: Partial<UseTtsPlaybackQueueOptions> = {}) => {
  const elements: FakeClipElement[] = [];
  const onError = vi.fn();
  const onAutoplayRefused = vi.fn<NonNullable<UseTtsPlaybackQueueOptions['onAutoplayRefused']>>();
  const onRunComplete = vi.fn();
  const { result, unmount } = renderHook(() =>
    useTtsPlaybackQueue({
      onError,
      onAutoplayRefused,
      onRunComplete,
      createElement: src => {
        const element = new FakeClipElement();
        element.src = src;
        elements.push(element);
        return element;
      },
      ...options,
    })
  );
  return { result, elements, onError, onAutoplayRefused, onRunComplete, unmount };
};
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};
afterEach(() => vi.useRealTimers());

describe('segment queue — source and run lifecycle', () => {
  it('publishes a new run before lazy resolution, holding a seek until its actual landing is ready', async () => {
    const onTiming = vi.fn<NonNullable<UseTtsPlaybackQueueOptions['onTiming']>>();
    const h = setup({ prefetchDepth: 0, onTiming });
    await act(async () => h.result.current.playOne(segment(1)));
    act(() => {
      h.elements[0].currentTime = 9;
      h.elements[0].emit('timeupdate');
    });
    let resolve!: (value: Source) => void;
    const deferred = new Promise<Source>(done => {
      resolve = done;
    });
    act(() =>
      h.result.current.playFrom([{ ...segment(2), source: () => deferred }], 0, { fraction: 0.5 })
    );
    const initial = onTiming.mock.calls.at(-1)![0];
    expect(initial.items[0].verseRef).toBe('row-2');
    expect(initial.currentTime).toBe(0);
    expect(initial.pendingFraction).toBe(0.5);
    const newRunReports = onTiming.mock.calls.length - 1;
    await act(async () => resolve(source('new')));
    expect(onTiming.mock.calls.at(-1)![0].pendingFraction).toBe(0.5);
    act(() => {
      h.elements[1].duration = 10;
      h.elements[1].emit('loadedmetadata');
    });
    const landed = onTiming.mock.calls.at(-1)![0];
    expect(landed.pendingFraction).toBeUndefined();
    expect(landed.currentTime).toBe(5);
    expect(
      onTiming.mock.calls
        .slice(newRunReports)
        .every(([report]) => report.pendingFraction === 0.5 || report.currentTime === 5)
    ).toBe(true);
    act(() =>
      h.result.current.playFrom([{ ...segment(3), source: () => new Promise(() => {}) }], 0)
    );
    expect(onTiming.mock.calls.at(-1)![0]).toMatchObject({ currentTime: 0, index: 0 });
    expect(onTiming.mock.calls.at(-1)![0].items[0].verseRef).toBe('row-3');
  });

  it('resolves fractional seeks after the lazy source, while numeric resume stays seconds', async () => {
    const h = setup({ prefetchDepth: 0 });
    const item: Segment = {
      ...segment(1),
      source: async () => ({
        url: 'opaque',
        window: [40, 50],
        durationIsMeasured: true,
        durationMs: 10000,
      }),
    };
    await act(async () => h.result.current.playFrom([item], 0, { fraction: 0.5 }));
    expect(h.elements[0].currentTime).toBe(45);
    act(() => {
      h.elements[0].currentTime = 45.5;
      h.elements[0].emit('timeupdate');
    });
    expect(h.elements[0].currentTime).toBe(45.5);
    await act(async () => h.result.current.playFrom([segment(2)], 0, 0.5));
    expect(h.elements.at(-1)?.currentTime).toBe(0.5);
  });

  it('applies a fractional target when initial metadata arrives, never again on later correction', async () => {
    const h = setup({ prefetchDepth: 0 });
    await act(async () => h.result.current.playFrom([segment(1)], 0, { fraction: 0.5 }));
    const audio = h.elements[0];
    expect(audio.currentTime).toBe(0);
    act(() => {
      audio.duration = 10;
      audio.emit('loadedmetadata');
    });
    expect(audio.currentTime).toBe(5);
    act(() => {
      audio.currentTime = 6;
      audio.duration = 12;
      audio.emit('durationchange');
    });
    expect(audio.currentTime).toBe(6);
  });

  it('accepts an unknown-duration landing and reports the real streaming duration at completion', async () => {
    const onTiming = vi.fn<NonNullable<UseTtsPlaybackQueueOptions['onTiming']>>();
    const h = setup({ prefetchDepth: 0, onTiming });
    await act(async () => h.result.current.playFrom([segment(1)], 0, { fraction: 0.5 }));
    const audio = h.elements[0];
    act(() => {
      audio.emit('loadedmetadata');
      audio.emit('playing');
    });
    expect(audio.currentTime).toBe(0);
    act(() => {
      audio.currentTime = 8;
      audio.emit('ended');
    });
    expect(onTiming.mock.calls.at(-1)?.[0].measurements[0]?.durationSeconds).toBe(8);
    const count = onTiming.mock.calls.length;
    act(() => {
      audio.duration = 100;
      audio.emit('durationchange');
      audio.emit('timeupdate');
    });
    expect(onTiming).toHaveBeenCalledTimes(count);
  });

  it('reports prefetched metadata without marking it as the playing segment', async () => {
    const onTiming = vi.fn<NonNullable<UseTtsPlaybackQueueOptions['onTiming']>>();
    const h = setup({ onTiming });
    await act(async () => h.result.current.playFrom([segment(1), segment(2)], 0));
    expect(h.elements).toHaveLength(2);
    act(() => {
      h.elements[1].duration = 7;
      h.elements[1].emit('loadedmetadata');
    });
    expect(onTiming.mock.calls.at(-1)?.[0].index).toBe(0);
    expect(onTiming.mock.calls.at(-1)?.[0].measurements[1]?.durationSeconds).toBe(7);
  });

  it('copies inherited run state for L2 without choosing a source in the queue', async () => {
    const h = setup();
    const inherited = { forceTts: true };
    const resolve = vi.fn(async (context: SourceResolutionContext) => {
      expect(context.run).not.toBe(inherited);
      expect(context.run.forceTts).toBe(true);
      return source('chosen-by-resolver');
    });
    await act(async () =>
      h.result.current.playOne({ ...segment(1), source: resolve }, 2, inherited)
    );
    expect(inherited.forceTts).toBe(true);
    expect(h.elements[0].src).toBe(source('chosen-by-resolver').url);
    expect(h.elements[0].currentTime).toBe(2);
    const next = vi.fn(async (context: SourceResolutionContext) => {
      expect(context.run.forceTts).toBe(false);
      return source('fresh-run');
    });
    await act(async () => h.result.current.playOne({ ...segment(2), source: next }));
    expect(next).toHaveBeenCalledOnce();
  });

  it('reports the final AI marks synchronously before refusal and never aliases another run', async () => {
    const onRunEnd = vi.fn<NonNullable<UseTtsPlaybackQueueOptions['onRunEnd']>>();
    const refused = new FakeClipElement();
    refused.playRejection = new DOMException('gesture required', 'NotAllowedError');
    const h = setup({ createElement: () => refused, onRunEnd });
    const item: Segment = {
      ...segment(1),
      source: async context => {
        context.requests.markAi();
        return source('ai');
      },
    };
    await act(async () => h.result.current.playOne(item, 3));
    const marked = onRunEnd.mock.calls[0][0];
    expect([...marked]).toEqual(['key-1']);
    expect(onRunEnd.mock.invocationCallOrder[0]).toBeLessThan(
      h.onAutoplayRefused.mock.invocationCallOrder[0]
    );
    refused.playRejection = undefined;
    await act(async () => h.result.current.playOne(segment(2)));
    act(() => h.result.current.stop());
    expect([...onRunEnd.mock.calls[1][0]]).toEqual([]);
    expect([...marked]).toEqual(['key-1']);
    act(() => h.result.current.stop());
    expect(onRunEnd).toHaveBeenCalledTimes(2);
  });

  it('reports final AI marks on natural completion before the completion callback', async () => {
    const onRunEnd = vi.fn<NonNullable<UseTtsPlaybackQueueOptions['onRunEnd']>>();
    const h = setup({ onRunEnd });
    await act(async () =>
      h.result.current.playOne({
        ...segment(1),
        source: async context => {
          context.requests.markAi();
          return source('ai');
        },
      })
    );
    act(() => h.elements[0].emit('ended'));
    expect([...onRunEnd.mock.calls[0][0]]).toEqual(['key-1']);
    expect(onRunEnd.mock.invocationCallOrder[0]).toBeLessThan(
      h.onRunComplete.mock.invocationCallOrder[0]
    );
  });

  it('plays an opaque source without requiring text, a format, or a provider', async () => {
    const h = setup();
    const item = {
      ...segment(1),
      text: '',
      source: { ...source('opaque'), window: [12, 18] as [number, number] },
    };
    await act(async () => h.result.current.playOne(item));
    expect(h.elements[0].currentTime).toBe(12);
    expect(h.elements[0].playCalls).toEqual([source('opaque').url]);
    act(() => h.elements[0].emit('playing'));
    expect(h.result.current.status).toBe('playing');
    h.elements[0].currentTime = 18;
    act(() => h.elements[0].emit('ended'));
    expect(h.result.current.status).toBe('idle');
    expect(h.onRunComplete).toHaveBeenCalledOnce();
  });

  it('does not invent offset zero when paused before a lazy windowed source resolves', async () => {
    const h = setup();
    let finish!: (value: Source) => void;
    const item: Segment = {
      ...segment(1),
      source: () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    };
    await act(async () => h.result.current.playOne(item));
    let snapshot;
    act(() => {
      snapshot = h.result.current.pause();
    });
    expect(snapshot).toBeNull();
    expect(h.result.current.status).toBe('idle');
    await act(async () => finish({ ...source('late-window'), window: [12, 18] }));
    expect(h.elements).toHaveLength(0);
  });

  it('reports a known natural window start or explicit resume offset during initial loading', async () => {
    const h = setup();
    const item = {
      ...segment(1),
      source: { ...source('window'), window: [12, 18] as [number, number] },
    };
    let snapshot;
    act(() => {
      h.result.current.playOne(item);
      snapshot = h.result.current.pause();
    });
    expect(snapshot).toMatchObject({ currentTime: 12 });
    act(() => {
      h.result.current.playOne({ ...segment(2), source: () => new Promise(() => {}) }, 7.5);
      snapshot = h.result.current.pause();
    });
    expect(snapshot).toMatchObject({ currentTime: 7.5 });
  });

  it('uses an explicit start offset even when it is zero, and resumes at file-absolute time', async () => {
    const h = setup();
    const item = {
      ...segment(1),
      source: { ...source('window'), window: [12, 18] as [number, number] },
    };
    await act(async () => h.result.current.playOne(item, 0));
    expect(h.elements[0].currentTime).toBe(0);
    await act(async () => h.result.current.playFrom([item], 0, 14.25));
    expect(h.elements[1].currentTime).toBe(14.25);
    let snapshot;
    act(() => {
      snapshot = h.result.current.pause();
    });
    expect(snapshot).toEqual({
      playableKey: 'key-1',
      verseRef: 'row-1',
      itemIndex: 0,
      currentTime: 14.25,
      forceTts: false,
    });
    expect(h.result.current.pause()).toBeNull();
    expect(h.onRunComplete).not.toHaveBeenCalled();
  });

  it('reports the sounding playable-local index rather than the run index on pause', async () => {
    const h = setup({ prefetchDepth: 0 });
    await act(async () =>
      h.result.current.playFrom([segment(1), segment(2), segment(3, undefined, 'key-2')], 2)
    );
    h.elements[0].currentTime = 3.5;
    let snapshot;
    act(() => {
      snapshot = h.result.current.pause();
    });
    expect(snapshot).toMatchObject({
      playableKey: 'key-2',
      itemIndex: 1,
      verseRef: 'row-3',
      currentTime: 3.5,
    });
  });

  it('resolves no speculative sources until playback starts, with depth one and a hard maximum two', async () => {
    const h = setup({ prefetchDepth: 99 });
    const resolve = vi.fn(async () => source('lazy'));
    const items = [1, 2, 3, 4].map(n => ({ ...segment(n), source: resolve }));
    expect(resolve).not.toHaveBeenCalled();
    await act(async () => h.result.current.playFrom(items, 0));
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(h.elements.filter(element => element.playCalls.length > 0)).toHaveLength(1);
  });

  it('reports an initial load error that occurred between source resolution and supervision adoption', async () => {
    const strategy = new FakeRecoveryStrategy();
    strategy.recover.mockImplementation(async (_failure, requests) =>
      requests.giveUp('initial load failed')
    );
    const element = new FakeClipElement();
    element.playRejection = new DOMException('No source', 'NotSupportedError');
    const h = setup({
      createElement: () => {
        queueMicrotask(() => element.emit('error'));
        return element;
      },
    });
    await act(async () => h.result.current.playOne(segment(1, strategy)));
    expect(strategy.recover).toHaveBeenCalledOnce();
    expect(h.onError).toHaveBeenCalledOnce();
    expect(h.result.current.status).toBe('idle');
  });

  it('cancels a pending source and ignores its completion after stop', async () => {
    const h = setup();
    let signal!: AbortSignal;
    let finish!: (value: Source) => void;
    const pending: Segment = {
      ...segment(1),
      source: context => {
        signal = context.signal;
        return new Promise(resolve => {
          finish = resolve;
        });
      },
    };
    await act(async () => h.result.current.playOne(pending));
    act(() => h.result.current.stop());
    expect(signal.aborted).toBe(true);
    await act(async () => finish(source('late')));
    expect(h.elements).toHaveLength(0);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('keeps prefetched attachment and badge requests out of the predecessor, then adopts them', async () => {
    const h = setup();
    const first = new FakeRecoveryStrategy();
    const second = new FakeRecoveryStrategy();
    const items = [
      segment(1, first),
      {
        ...segment(2),
        source: async ({ requests }: SourceResolutionContext) => {
          requests.attach(second);
          requests.markAi();
          return source('second');
        },
      },
    ];
    await act(async () => h.result.current.playFrom(items, 0));
    expect(h.result.current.aiMarkedKeys.size).toBe(0);
    await act(async () => h.elements[0].emit('error'));
    expect(first.recover).toHaveBeenCalledOnce();
    expect(second.recover).not.toHaveBeenCalled();
    await act(async () => h.elements[0].emit('ended'));
    expect([...h.result.current.aiMarkedKeys]).toEqual(['key-2']);
    await act(async () => h.elements[1].emit('error'));
    expect(second.recover).toHaveBeenCalledOnce();
    await act(async () => h.result.current.playOne(segment(2)));
    expect(h.result.current.aiMarkedKeys.size).toBe(0);
  });

  it('markAi alone does not force later source selection: a mixed playable remains possible', async () => {
    const h = setup();
    const seen: boolean[] = [];
    const items = [1, 2].map(n => ({
      ...segment(n, undefined, 'mixed'),
      source: async (ctx: SourceResolutionContext) => {
        seen.push(ctx.run.forceTts);
        if (n === 1) ctx.requests.markAi();
        return source(`mixed-${n}`);
      },
    }));
    await act(async () => h.result.current.playFrom(items, 0));
    expect(seen).toEqual([false, false]);
    await act(async () => h.elements[0].emit('ended'));
    expect(h.elements[1].playCalls).toEqual([source('mixed-2').url]);
    expect([...h.result.current.aiMarkedKeys]).toEqual(['mixed']);
  });
});

describe('segment queue — autoplay refusal is a pause, never provider recovery', () => {
  it('reports the initial load offset without giveUp or prefetch', async () => {
    const element = new FakeClipElement();
    element.playRejection = new DOMException('Gesture required', 'NotAllowedError');
    const strategy = new FakeRecoveryStrategy();
    const next = vi.fn(async () => source('next'));
    const h = setup({ createElement: () => element });
    await act(async () =>
      h.result.current.playFrom([segment(1, strategy), { ...segment(2), source: next }], 0, 6.25)
    );
    expect(h.result.current.status).toBe('idle');
    expect(h.onAutoplayRefused).toHaveBeenCalledOnce();
    expect(h.onAutoplayRefused.mock.calls[0][0]).toMatchObject({ itemIndex: 0, currentTime: 6.25 });
    expect(h.onError).not.toHaveBeenCalled();
    expect(strategy.recover).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(h.result.current.pause()).toBeNull();
  });

  it('honors the initial load refusal even while an error diagnosis is pending', async () => {
    vi.useFakeTimers();
    const strategy = new FakeRecoveryStrategy();
    strategy.recover.mockImplementation(async (failure, requests) =>
      requests.play(failure.source, 'opaque', { afterMs: 100 })
    );
    const element = new FakeClipElement();
    let reject!: (reason: Error) => void;
    vi.spyOn(element, 'play').mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    const h = setup({ createElement: () => element });
    await act(async () => h.result.current.playOne(segment(1, strategy), 8));
    await flush();
    act(() => element.emit('error'));
    await act(async () => reject(new DOMException('Gesture required', 'NotAllowedError')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(h.onAutoplayRefused).toHaveBeenCalledOnce();
    expect(h.onAutoplayRefused.mock.calls[0][0].currentTime).toBe(8);
    expect(h.onError).not.toHaveBeenCalled();
    expect(element.loadCalls).toHaveLength(0);
  });

  it('ignores a refusal from a replaced run', async () => {
    const old = new FakeClipElement();
    let reject!: (reason: Error) => void;
    vi.spyOn(old, 'play').mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    const replacement = new FakeClipElement();
    let calls = 0;
    const h = setup({ createElement: () => (calls++ === 0 ? old : replacement) });
    await act(async () => h.result.current.playOne(segment(1)));
    await act(async () => h.result.current.playOne(segment(2)));
    await act(async () => reject(new DOMException('Old refusal', 'NotAllowedError')));
    expect(h.onAutoplayRefused).not.toHaveBeenCalled();
    expect(h.result.current.activeVerseRef).toBe('row-2');
  });
});

describe('segment queue — requests, budgets, fallback and cancellation', () => {
  it('refuses retry three before resolving its source thunk, then schedules giveUp and one toast', async () => {
    vi.useFakeTimers();
    const policy = new FakeRecoveryStrategy();
    const retry = vi.fn(async () => source('retry'));
    policy.recover.mockImplementation(async (_failure, requests) => requests.play(retry, 'opaque'));
    const h = setup();
    await act(async () => h.result.current.playOne(segment(1, policy)));
    await flush();
    for (let n = 0; n < 3; n += 1) {
      act(() => h.elements[0].emit('error'));
      await flush();
    }
    expect(policy.recover).toHaveBeenCalledTimes(3);
    expect(retry).toHaveBeenCalledTimes(2);
    expect(h.onError).toHaveBeenCalledOnce();
    expect(h.result.current.status).toBe('idle');
    expect(h.onRunComplete).not.toHaveBeenCalled();
  });

  it('hands off under the same run, resets budgets, and leaves ALL later playables to L2 in downgraded mode', async () => {
    vi.useFakeTimers();
    const original = new FakeRecoveryStrategy();
    const fallback = new FakeRecoveryStrategy();
    const seen: Array<[number, boolean]> = [];
    const resolve = (n: number) => async (ctx: SourceResolutionContext) => {
      seen.push([n, ctx.run.forceTts]);
      if (ctx.run.forceTts) {
        ctx.requests.attach(fallback);
        ctx.requests.markAi();
      }
      return source(`${ctx.run.forceTts ? 'alternate' : 'original'}-${n}`);
    };
    original.recover.mockImplementation(async (failure, requests) => {
      requests.play(failure.source, 'shared', {
        onExhausted: () => {
          requests.attach(fallback);
          requests.handOff(resolve(1), 'use alternate');
          requests.markAi();
        },
      });
    });
    fallback.recover.mockImplementation(async (failure, requests) =>
      requests.play(failure.source, 'shared')
    );
    const h = setup();
    const items = [1, 2, 3].map(n => ({ ...segment(n, original), source: resolve(n) }));
    await act(async () => h.result.current.playFrom(items, 0));
    await flush();
    expect(seen).toEqual([
      [1, false],
      [2, false],
    ]);
    for (let n = 0; n < 3; n += 1) {
      act(() => h.elements[0].emit('error'));
      await flush();
    }
    expect(h.result.current.activeVerseRef).toBe('row-1');
    expect(h.elements[0].src).toBe(source('alternate-1').url);
    expect(h.onError).not.toHaveBeenCalled();
    act(() => h.elements[0].emit('error'));
    await flush();
    expect(fallback.recover).toHaveBeenCalledOnce(); // new provider gets a fresh budget
    expect(h.onError).not.toHaveBeenCalled();
    act(() => h.elements[0].emit('ended'));
    await flush();
    const second = h.elements.find(element => element.src === source('alternate-2').url)!;
    expect(second.playCalls).toHaveLength(1);
    expect(h.elements[1].playCalls).toHaveLength(0); // discarded old speculative choice
    act(() => second.emit('ended'));
    await flush();
    expect(h.result.current.activeVerseRef).toBe('row-3');
    expect(seen).toContainEqual([3, true]);
    expect([...h.result.current.aiMarkedKeys]).toEqual(['key-1', 'key-2', 'key-3']);
    let snapshot;
    act(() => {
      snapshot = h.result.current.pause();
    });
    expect(snapshot).toMatchObject({ playableKey: 'key-3', itemIndex: 0, forceTts: true });
    await act(async () => h.result.current.playOne(items[2]));
    await flush();
    expect(seen.at(-1)).toEqual([3, false]); // fresh run gives the original source another chance
    expect(h.result.current.aiMarkedKeys.size).toBe(0);
  });

  it('aborts pending prefetch on hand-off and cannot adopt its late old source', async () => {
    const original = new FakeRecoveryStrategy();
    original.recover.mockImplementation(async (_failure, requests) =>
      requests.handOff(source('alternate'), 'replace')
    );
    let finish!: (value: Source) => void;
    let speculativeSignal!: AbortSignal;
    const next: Segment = {
      ...segment(2),
      source: async ctx => {
        if (ctx.run.forceTts) return source('new-next');
        speculativeSignal = ctx.signal;
        return new Promise(resolve => {
          finish = resolve;
        });
      },
    };
    const h = setup();
    await act(async () => h.result.current.playFrom([segment(1, original), next], 0));
    await act(async () => h.elements[0].emit('error'));
    expect(speculativeSignal.aborted).toBe(true);
    await act(async () => finish(source('stale')));
    await act(async () => h.elements[0].emit('ended'));
    expect(h.elements.some(element => element.src === source('stale').url)).toBe(false);
    expect(h.elements[1].playCalls).toEqual([source('new-next').url]);
  });

  it('detaches retries and retained requests on advance and unmount', async () => {
    vi.useFakeTimers();
    const strategy = new FakeRecoveryStrategy();
    let retained!: RecoveryRequests;
    strategy.recover.mockImplementation(async (failure, requests) => {
      retained = requests;
      requests.play(failure.source, 'opaque', { afterMs: 100 });
    });
    const h = setup();
    await act(async () => h.result.current.playFrom([segment(1, strategy), segment(2)], 0));
    await flush();
    act(() => h.elements[0].emit('error'));
    act(() => h.elements[0].emit('ended'));
    await flush();
    retained.giveUp('stale');
    h.unmount();
    await vi.advanceTimersByTimeAsync(200);
    expect(h.elements[0].playCalls).toHaveLength(1);
    expect(h.onError).not.toHaveBeenCalled();
  });
});
