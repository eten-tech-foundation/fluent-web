import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type {
  BudgetKey,
  Playable,
  PlaybackFailure,
  PlayableKey,
  RecoveryRequests,
  RecoveryStrategy,
  Segment,
  Source,
} from './types';

/** A policy can issue actions without access to the player's element or counters. */
class ReplacementStrategy implements RecoveryStrategy {
  readonly supervision = { stallWatchdogMs: null };

  async recover(
    failure: PlaybackFailure,
    requests: RecoveryRequests,
    signal: AbortSignal
  ): Promise<void> {
    if (signal.aborted) return;
    requests.markAi();
    requests.handOff(failure.source, 'replacement selected');
  }
}

const requests = (): RecoveryRequests => ({
  play: vi.fn(),
  poll: vi.fn(),
  attach: vi.fn(),
  handOff: vi.fn(),
  giveUp: vi.fn(),
  markAi: vi.fn(),
});

describe('playback seam', () => {
  it('carries paired, open-ended and unwindowed sources through the same segment shape', async () => {
    const paired: Source = {
      url: 'https://media.test/chapter.mp3',
      window: [12, 18],
      durationMs: 6000,
      durationIsMeasured: true,
    };
    const openEnded: Source = { ...paired, window: [18], durationMs: undefined };
    const lazy = async (): Promise<Source> => ({
      url: 'https://media.test/clip.wav',
      durationIsMeasured: false,
    });
    const key: PlayableKey = JSON.stringify(['page', 'bible', 'pericope']);
    const playable: Playable = {
      key,
      segments: [paired, openEnded, lazy].map(
        (source, index): Segment => ({
          source,
          recovery: new ReplacementStrategy(),
          playableKey: key,
          verseRef: String(index + 1),
          text: 'Source text',
        })
      ),
    };

    expect(playable.segments.map(segment => segment.playableKey)).toEqual([key, key, key]);
    expect(await lazy()).toEqual({
      url: 'https://media.test/clip.wav',
      durationIsMeasured: false,
    });
    expectTypeOf<Source['window']>().toEqualTypeOf<[number, number] | [number] | undefined>();
    expectTypeOf<BudgetKey>().toEqualTypeOf<string>();
  });

  it('returns the complete failed source unchanged and can issue two independent requests', async () => {
    const source: Source = {
      url: 'https://media.test/chapter.mp3',
      window: [12, 18],
      durationIsMeasured: true,
    };
    const actions = requests();
    const strategy = new ReplacementStrategy();
    await strategy.recover(
      { on: 'error', source, positionMs: 14000, startedPlaying: true },
      actions,
      new AbortController().signal
    );

    expect(actions.markAi).toHaveBeenCalledOnce();
    expect(actions.handOff).toHaveBeenCalledWith(source, 'replacement selected');
    expect(actions.giveUp).not.toHaveBeenCalled();
  });

  it('admits all three observed failure entry points without a provider diagnosis', async () => {
    const source = async (): Promise<Source> => ({ url: 'clip', durationIsMeasured: false });
    const failures: PlaybackFailure[] = [
      { on: 'error', source, positionMs: 0, startedPlaying: false },
      { on: 'stall', source, positionMs: 0 },
      { on: 'endedEarly', source, positionMs: 1000 },
    ];
    const actions = requests();
    const controller = new AbortController();
    controller.abort();
    for (const failure of failures) {
      await new ReplacementStrategy().recover(failure, actions, controller.signal);
    }
    expect(actions.handOff).not.toHaveBeenCalled();
  });
});
