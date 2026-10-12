import { describe, expect, it, vi } from 'vitest';

import { fakeResponse } from '../testing/fakeClipElement';

import { createTtsSegment } from './createTtsSegment';

import type { RecoveryRequests, RecoveryStrategy, SourceResolutionContext } from '../seam/types';
import type { TtsClip } from '../tts.types';

const context = (): SourceResolutionContext => ({
  signal: new AbortController().signal,
  run: { forceTts: false },
  requests: { attach: vi.fn(), markAi: vi.fn() },
});

describe('createTtsSegment', () => {
  it('is lazy and issues independent attach and markAi requests during resolution', async () => {
    const synthesize = vi.fn().mockResolvedValue({ audioUrl: 'opaque', servedAs: 'ogg' });
    const onServing = vi.fn();
    const segment = createTtsSegment(
      { verseRef: 'row', text: 'Source', langCode: 'eng' },
      {
        engine: { synthesize },
        playableKey: 'key',
        onServing,
      }
    );
    expect(synthesize).not.toHaveBeenCalled();
    const ctx = context();
    if (typeof segment.source !== 'function') throw new Error('Expected lazy source');
    expect(await segment.source(ctx)).toEqual({ url: 'opaque', durationIsMeasured: false });
    expect(synthesize).toHaveBeenCalledWith({ text: 'Source', langCode: 'eng' }, ctx.signal);
    expect(ctx.requests.attach).toHaveBeenCalledOnce();
    expect(ctx.requests.markAi).toHaveBeenCalledOnce();
    expect(onServing).toHaveBeenCalledWith('row', 'ogg');
  });

  it('refreshes policy state and keeps regeneration on the correct run signal', async () => {
    const synthesize = vi.fn().mockResolvedValue({ audioUrl: 'clip' });
    const segment = createTtsSegment(
      { verseRef: 'row', text: 'Source' },
      {
        engine: { synthesize },
        playableKey: 'key',
        fetchFn: vi.fn().mockResolvedValue(fakeResponse({ status: 404 })),
      }
    );
    const first = context();
    const second = context();
    if (typeof segment.source !== 'function') throw new Error('Expected lazy source');
    const source = await segment.source(first);
    await segment.source(second);
    const firstPolicy = vi.mocked(first.requests.attach).mock.calls[0][0] as RecoveryStrategy;
    expect(firstPolicy).not.toBe(vi.mocked(second.requests.attach).mock.calls[0][0]);
    const requests: RecoveryRequests = {
      play: vi.fn(),
      poll: vi.fn(),
      attach: vi.fn(),
      handOff: vi.fn(),
      giveUp: vi.fn(),
      markAi: vi.fn(),
    };
    await firstPolicy.recover(
      { on: 'error', source, positionMs: 0, startedPlaying: false },
      requests,
      first.signal
    );
    const retry = vi.mocked(requests.play).mock.calls[0][0];
    if (typeof retry !== 'function') throw new Error('Expected lazy retry');
    await retry(first);
    expect(synthesize.mock.calls.at(-1)?.[1]).toBe(first.signal);
  });

  it('suppresses a stale diagnostic when generation ignores cancellation', async () => {
    const controller = new AbortController();
    let finish!: (clip: TtsClip) => void;
    const onServing = vi.fn();
    const segment = createTtsSegment(
      { verseRef: 'row', text: 'Source' },
      {
        engine: {
          synthesize: vi.fn(
            () =>
              new Promise<TtsClip>(resolve => {
                finish = resolve;
              })
          ),
        },
        playableKey: 'key',
        onServing,
      }
    );
    if (typeof segment.source !== 'function') throw new Error('Expected lazy source');
    const pending = segment.source({ ...context(), signal: controller.signal });
    controller.abort();
    finish({ audioUrl: 'late', servedAs: 'ogg' });
    await pending;
    expect(onServing).not.toHaveBeenCalled();
  });
});
