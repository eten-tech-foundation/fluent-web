/**
 * Host-composition tests for `useSourceTtsPlayback` (§12.1 "Queue" row).
 *
 * The queue itself is exhaustively covered by `useTtsPlaybackQueue.test.ts`,
 * so it is mocked here and this file asserts the host responsibilities:
 * document-order start index, conditional scroll, page/flag lifetime guards,
 * and the failure toast.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTtsSegment } from '../lib/createTtsSegment';
import { PlaybackRegistryProvider } from '../registry/PlaybackRegistryProvider';
import { type Segment } from '../seam/types';
import { sourceChapterRequest } from '../testing/sourceAudioFixtures';
import { type TtsEngine, type TtsQueueItem } from '../tts.types';

import { useSourceTtsPlayback, type UseSourceTtsPlaybackOptions } from './useSourceTtsPlayback';
import { type PauseSnapshot, type UseTtsPlaybackQueueOptions } from './useTtsPlaybackQueue';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string, options?: Record<string, unknown>) =>
      defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? '')),
  }),
}));

// Captured queue wiring, so tests can fire the queue's callbacks by hand.
let queueOptions: UseTtsPlaybackQueueOptions;
const playOne = vi.fn();
const playFrom = vi.fn();
const stop = vi.fn();
const pause = vi.fn<() => PauseSnapshot | null>(() => null);
const hold = vi.fn(() => false);
const resumeHeld = vi.fn();
let itemStates: Record<string, string> = {};
let status = 'idle';
let activeVerseRef: string | null = null;

vi.mock('./useTtsPlaybackQueue', () => ({
  useTtsPlaybackQueue: (options: UseTtsPlaybackQueueOptions) => {
    queueOptions = options;
    return {
      status,
      activeVerseRef,
      itemStates,
      playOne,
      playFrom,
      stop,
      pause,
      hold,
      resumeHeld,
      aiMarkedKeys: new Set(),
    };
  },
}));

const engine: TtsEngine = { synthesize: vi.fn() };

// The queue stubs are module-level (the mock factory is hoisted), so they must
// be reset per test or one test's play call leaks into the next assertion.
beforeEach(() => {
  vi.clearAllMocks();
  pause.mockReturnValue(null);
  itemStates = {};
  status = 'idle';
  activeVerseRef = null;
});

/** Row 2 is a reference-panel hole, so the queue is v1, v3, v4 (§5.1). */
const rows = [
  { verseRef: 'GEN 1:1', verseNumber: 1, text: 'one', langCode: 'eng' },
  { verseRef: 'GEN 1:2', verseNumber: 2, text: null },
  { verseRef: 'GEN 1:3', verseNumber: 3, text: 'three', langCode: 'eng' },
  { verseRef: 'GEN 1:4', verseNumber: 4, text: 'four', langCode: 'eng' },
];

const rect = (top: number, bottom: number) => ({ getBoundingClientRect: () => ({ top, bottom }) });

const setup = (overrides: Partial<UseSourceTtsPlaybackOptions> = {}) => {
  const scrollIntoView = vi.fn();
  const focus = vi.fn();
  const options: UseSourceTtsPlaybackOptions = {
    engine,
    rows,
    sourceChapter: {
      projectId: 1,
      bibleId: 2,
      bookCode: 'JHN',
      chapter: 3,
      languageCode: 'eng',
      role: 'referenceBible',
      textBibleKey: 'aq-20',
    },
    sourceLicence: { status: 'allowed' },
    referenceBibleId: 'aq-test',
    // Every row sits far below the viewport unless a test says otherwise.
    getRowElement: () => ({ ...rect(900, 960), scrollIntoView, focus }),
    getViewport: () => rect(0, 500),
    ...overrides,
  };
  const { result, rerender } = renderHook(
    (props: UseSourceTtsPlaybackOptions) => useSourceTtsPlayback(props),
    {
      initialProps: options,
      wrapper: PlaybackRegistryProvider,
    }
  );
  return { result, rerender, scrollIntoView, focus, options };
};

describe('useSourceTtsPlayback — play actions', () => {
  it('plays one verse without arming the queue (T1)', () => {
    const { result } = setup();

    act(() => result.current.playVerse('GEN 1:3'));

    expect(playOne).toHaveBeenCalledWith(
      expect.objectContaining({ verseRef: 'GEN 1:3', text: 'three' })
    );
    expect(playFrom).not.toHaveBeenCalled();
  });

  it('starts play-from-here at the index in the FILTERED list, not the row position', () => {
    const { result } = setup();

    act(() => result.current.playFromVerse('GEN 1:3'));

    const [items, index] = playFrom.mock.calls.at(-1) as [TtsQueueItem[], number];
    expect(items.map(item => item.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3', 'GEN 1:4']);
    // Row 3 on screen is queue index 1 — a rendered-row count would say 2.
    expect(index).toBe(1);
  });

  it('play-from-here continues a saved verse position ahead of a stale caret', () => {
    const { result } = setup();
    act(() => result.current.playVerse('GEN 1:3'));
    pause.mockReturnValue({
      playableKey: result.current.verseKey('GEN 1:3')!,
      itemIndex: 0,
      verseRef: 'GEN 1:3',
      currentTime: 6.5,
      forceTts: false,
    });
    act(() => result.current.pause());
    playFrom.mockClear();

    act(() => result.current.playFromVerse('GEN 1:1'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(1);
    expect(playFrom.mock.calls[0]?.[2]).toBe(6.5);
  });

  it('ignores play requests for an unplayable row (§5.1)', () => {
    const { result } = setup();

    act(() => result.current.playVerse('GEN 1:2'));
    act(() => result.current.playFromVerse('GEN 1:2'));

    expect(playOne).not.toHaveBeenCalled();
    expect(playFrom).not.toHaveBeenCalled();
  });

  it('reports playability and per-row loading from the queue', () => {
    itemStates = { 'GEN 1:3': 'synthesizing' };
    const { result } = setup();

    expect(result.current.isRowPlayable('GEN 1:1')).toBe(true);
    expect(result.current.isRowPlayable('GEN 1:2')).toBe(false);
    expect(result.current.isRowLoading('GEN 1:3')).toBe(true);
    expect(result.current.isRowLoading('GEN 1:1')).toBe(false);
  });

  it('delegates stop to the queue', () => {
    const { result } = setup();

    act(() => result.current.stop());

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// G3a — pericope mode plays a bounded group and stops at its end
// ---------------------------------------------------------------------------

describe('useSourceTtsPlayback — playGroup (G3a)', () => {
  it('passively scrubs without starting media and preserves only same-group fallback', () => {
    const { result } = setup();
    act(() => result.current.playGroup(['GEN 1:1']));
    pause.mockReturnValue({
      playableKey: result.current.groupKey(['GEN 1:1'])!,
      itemIndex: 0,
      verseRef: 'GEN 1:1',
      currentTime: 2,
      forceTts: true,
    });
    act(() => result.current.seekGroup(['GEN 1:3', 'GEN 1:4'], 'GEN 1:3', 0.5));
    expect(playFrom).not.toHaveBeenCalled();
    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:4']));
    expect(playFrom.mock.calls.at(-1)?.[2]).toEqual({ fraction: 0.5 });
    expect(playFrom.mock.calls.at(-1)?.[3]).toEqual({ forceTts: false });
    pause.mockReturnValue({
      playableKey: result.current.groupKey(['GEN 1:3', 'GEN 1:4'])!,
      itemIndex: 0,
      verseRef: 'GEN 1:3',
      currentTime: 2,
      forceTts: true,
    });
    act(() => result.current.seekGroup(['GEN 1:3', 'GEN 1:4'], 'GEN 1:4', 0.5));
    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:4']));
    expect(playFrom.mock.calls.at(-1)?.[3]).toEqual({ forceTts: true });
  });

  it('latest idle scrub wins and starts only on explicit Play', () => {
    const { result } = setup();
    act(() => result.current.seekGroup(['GEN 1:4', 'GEN 1:2', 'GEN 1:3'], 'GEN 1:4', 0.5));
    act(() => result.current.seekGroup(['GEN 1:4', 'GEN 1:2', 'GEN 1:3'], 'GEN 1:3', 0.25));
    expect(playFrom).not.toHaveBeenCalled();
    expect(playOne).not.toHaveBeenCalled();
    expect(result.current.groupView(['GEN 1:3', 'GEN 1:4'])).toMatchObject({
      currentIndex: 0,
      pendingFraction: 0.25,
    });
    act(() => result.current.playGroup(['GEN 1:4', 'GEN 1:2', 'GEN 1:3']));
    expect(playFrom).toHaveBeenCalledOnce();
    const [segments, index, start] = playFrom.mock.calls[0] as [Segment[], number, unknown];
    expect(segments.map(segment => segment.verseRef)).toEqual(['GEN 1:3', 'GEN 1:4']);
    expect(index).toBe(0);
    expect(start).toEqual({ fraction: 0.25 });
    act(() => result.current.seekGroup(['GEN 1:3'], 'GEN 1:4', 0.5));
    expect(playFrom).toHaveBeenCalledOnce();
  });

  it('a live scrub pauses once and remains paused until explicit Play', () => {
    const { result } = setup();
    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:4']));
    pause.mockReturnValue({
      playableKey: result.current.groupKey(['GEN 1:3', 'GEN 1:4'])!,
      itemIndex: 0,
      verseRef: 'GEN 1:3',
      currentTime: 7,
      forceTts: true,
    });
    act(() => result.current.seekGroup(['GEN 1:3', 'GEN 1:4'], 'GEN 1:4', 0.75));
    expect(pause).toHaveBeenCalledOnce();
    expect(playFrom).toHaveBeenCalledOnce();
    expect(result.current.groupView(['GEN 1:3', 'GEN 1:4'])).toMatchObject({
      currentIndex: 1,
      pendingFraction: 0.75,
    });
    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:4']));
    expect(playFrom.mock.calls.at(-1)?.[1]).toBe(1);
    expect(playFrom.mock.calls.at(-1)?.[2]).toEqual({ fraction: 0.75 });
    expect(playFrom.mock.calls.at(-1)?.[3]).toEqual({ forceTts: true });
  });

  it('scrubbing another group silences the current group without inheriting its fallback', () => {
    const { result } = setup();
    act(() => result.current.playGroup(['GEN 1:1']));
    pause.mockReturnValue({
      playableKey: result.current.groupKey(['GEN 1:1'])!,
      itemIndex: 0,
      verseRef: 'GEN 1:1',
      currentTime: 3,
      forceTts: true,
    });
    act(() => result.current.seekGroup(['GEN 1:3', 'GEN 1:4'], 'GEN 1:4', 0.4));
    expect(pause).toHaveBeenCalledOnce();
    expect(playFrom).not.toHaveBeenCalled();
    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:4']));
    expect(playFrom.mock.calls.at(-1)?.[2]).toEqual({ fraction: 0.4 });
    expect(playFrom.mock.calls.at(-1)?.[3]).toEqual({ forceTts: false });
  });

  it('scrubbing another group preserves the displaced group resume record', () => {
    const { result } = setup();
    act(() => result.current.playGroup(['GEN 1:1']));
    pause.mockReturnValue({
      playableKey: result.current.groupKey(['GEN 1:1'])!,
      itemIndex: 0,
      verseRef: 'GEN 1:1',
      currentTime: 7,
      forceTts: true,
    });
    act(() => result.current.seekGroup(['GEN 1:3'], 'GEN 1:3', 0.4));
    playOne.mockClear();

    act(() => result.current.playGroup(['GEN 1:1']));

    expect(playOne).toHaveBeenCalledOnce();
    expect(playOne.mock.calls[0]?.[1]).toBe(7);
    expect(playOne.mock.calls[0]?.[2]).toEqual({ forceTts: true });
  });

  it('preserves a later-group fraction through loading pause and continuous resume', () => {
    const { result } = setup();
    const later = ['GEN 1:4'];
    act(() => result.current.seekGroup(later, 'GEN 1:4', 0.55));
    act(() => result.current.playFromGroups([['GEN 1:1'], later], 'GEN 1:1'));
    pause.mockReturnValue({
      playableKey: result.current.groupKey(later)!,
      itemIndex: 0,
      verseRef: 'GEN 1:4',
      currentTime: 0,
      pendingFraction: 0.55,
      forceTts: false,
    });
    act(() => result.current.pause());
    playFrom.mockClear();

    act(() => result.current.playFromGroups([['GEN 1:1'], later], 'GEN 1:1'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(1);
    expect(playFrom.mock.calls[0]?.[2]).toEqual({ fraction: 0.55 });
  });

  it('preserves an ordinary later-group logical start through loading continuous play', () => {
    const { result } = setup();
    const later = ['GEN 1:4'];
    act(() => result.current.playGroup(later));
    pause.mockReturnValue({
      playableKey: result.current.groupKey(later)!,
      itemIndex: 0,
      verseRef: 'GEN 1:4',
      currentTime: 0,
      pendingFraction: 0,
      forceTts: false,
    });
    playFrom.mockClear();

    act(() => result.current.playFromGroups([['GEN 1:1'], later], 'GEN 1:1'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(1);
    expect(playFrom.mock.calls[0]?.[2]).toEqual({ fraction: 0 });
  });

  it('continues from a resolved later group saved at zero', () => {
    const { result } = setup();
    const later = ['GEN 1:4'];
    act(() => result.current.playGroup(later));
    pause.mockReturnValue({
      playableKey: result.current.groupKey(later)!,
      itemIndex: 0,
      verseRef: 'GEN 1:4',
      currentTime: 0,
      forceTts: false,
    });
    playFrom.mockClear();

    act(() => result.current.playFromGroups([['GEN 1:1'], later], 'GEN 1:1'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(1);
    expect(playFrom.mock.calls[0]?.[2]).toBe(0);
  });

  it('continues from a resolved live verse at zero ahead of a stale caret', () => {
    const { result } = setup();
    act(() => result.current.playVerse('GEN 1:3'));
    pause.mockReturnValue({
      playableKey: result.current.verseKey('GEN 1:3')!,
      itemIndex: 0,
      verseRef: 'GEN 1:3',
      currentTime: 0,
      forceTts: false,
    });
    playFrom.mockClear();

    act(() => result.current.playFromVerse('GEN 1:1'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(1);
    expect(playFrom.mock.calls[0]?.[2]).toBe(0);
  });

  it('Alt+P-style group Play honors a scrub even when the caret is elsewhere', () => {
    const { result } = setup();
    const refs = ['GEN 1:3', 'GEN 1:4'];
    act(() => result.current.seekGroup(refs, 'GEN 1:4', 0.7));
    act(() => result.current.playGroupAtVerse(refs, 'GEN 1:3'));
    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(1);
    expect(playFrom.mock.calls[0]?.[2]).toEqual({ fraction: 0.7 });
  });

  it('uses one resolver key for a pericope, distinct verse keys for a play-from-here run', () => {
    const { result } = setup({ sourceChapter: sourceChapterRequest, pageKey: 'chapter-1' });
    act(() => result.current.playGroup(['GEN 1:4', 'GEN 1:3']));
    const [group] = playFrom.mock.calls.at(-1) as [Segment[], number];
    expect(group).toHaveLength(2);
    expect(group[0].playableKey).toBe(group[1].playableKey);
    act(() => result.current.playFromVerse('GEN 1:3'));
    const [run] = playFrom.mock.calls.at(-1) as [Segment[], number];
    expect(new Set(run.map(segment => segment.playableKey)).size).toBe(run.length);
    expect(run[1].playableKey).not.toBe(group[0].playableKey);
  });

  it('plays ONLY the group, in document order', () => {
    const { result } = setup();

    // Given out of order and including the unplayable row, exactly as a
    // pericope card would hand over its verses.
    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:2', 'GEN 1:1']));

    const [items, index] = playFrom.mock.calls.at(-1) as [TtsQueueItem[], number];
    // Order comes from the page's list, not the caller's array; the hole is gone.
    expect(items.map(item => item.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3']);
    expect(index).toBe(0);
  });

  it('plays a bounded group even when it ends at the last row of the page', () => {
    const { result } = setup();

    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:4']));

    const [items, index] = playFrom.mock.calls.at(-1) as [TtsQueueItem[], number];
    expect(items.map(item => item.verseRef)).toEqual(['GEN 1:3', 'GEN 1:4']);
    expect(index).toBe(0);
  });

  it('ignores a group with nothing playable in it (§5.1)', () => {
    const { result } = setup();

    act(() => result.current.playGroup(['GEN 1:2']));

    expect(playFrom).not.toHaveBeenCalled();
    expect(playOne).not.toHaveBeenCalled();
  });

  it("playFromGroup runs to the END of the page, starting at the group's first playable row", () => {
    const { result } = setup();

    // The group opens on the reference-panel hole, so "first row" and "first
    // PLAYABLE row" are different answers.
    act(() => result.current.playFromGroup(['GEN 1:2', 'GEN 1:3']));

    const [items, index] = playFrom.mock.calls.at(-1) as [TtsQueueItem[], number];
    // The whole page, not the group — this action is the continuous one.
    expect(items.map(item => item.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3', 'GEN 1:4']);
    expect(index).toBe(1);
  });

  it('playFromGroup ignores a group with nothing playable in it (§5.1)', () => {
    const { result } = setup();

    act(() => result.current.playFromGroup(['GEN 1:2']));

    expect(playFrom).not.toHaveBeenCalled();
  });

  it('continuous Play resumes a scrubbed later group instead of rewinding to the caret', () => {
    const { result } = setup();
    act(() => result.current.seekGroup(['GEN 1:4'], 'GEN 1:4', 0.6));
    expect(playFrom).not.toHaveBeenCalled();

    act(() => result.current.playFromGroups([['GEN 1:1', 'GEN 1:3'], ['GEN 1:4']], 'GEN 1:1'));

    const [segments, index, start] = playFrom.mock.calls[0] as [Segment[], number, unknown];
    expect(segments.map(segment => segment.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3', 'GEN 1:4']);
    expect(index).toBe(2);
    expect(start).toEqual({ fraction: 0.6 });
  });

  it('continuous Play resumes a visible scrub when the caret is outside every group', () => {
    const { result } = setup();
    act(() => result.current.seekGroup(['GEN 1:3', 'GEN 1:4'], 'GEN 1:4', 0.8));

    act(() => result.current.playFromGroups([['GEN 1:1'], ['GEN 1:3', 'GEN 1:4']], 'GEN 9:9'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(2);
    expect(playFrom.mock.calls[0]?.[2]).toEqual({ fraction: 0.8 });
  });

  it('continuous Play uses the target record when the preferred key is outside its groups', () => {
    const { result } = setup();
    act(() => result.current.seekGroup(['GEN 1:4'], 'GEN 1:4', 0.65));
    act(() => result.current.seekGroup(['GEN 1:3'], 'GEN 1:3', 0.2));

    act(() => result.current.playFromGroups([['GEN 1:1'], ['GEN 1:4']], 'GEN 1:4'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(1);
    expect(playFrom.mock.calls[0]?.[2]).toEqual({ fraction: 0.65 });
  });

  it('restores each selection identity preferred scrub after A to B to A switching', () => {
    const { result, rerender, options } = setup();
    const aLater = ['GEN 1:4'];
    act(() => result.current.seekGroup(aLater, 'GEN 1:4', 0.6));
    const bOptions: UseSourceTtsPlaybackOptions = {
      ...options,
      sourceChapter: {
        ...options.sourceChapter!,
        role: 'projectSource',
        bibleId: 99,
        textBibleKey: 'aq-1',
      },
      referenceBibleId: null,
    };
    act(() => rerender(bOptions));
    act(() => result.current.seekGroup(['GEN 1:3'], 'GEN 1:3', 0.2));
    act(() => rerender(options));

    act(() => result.current.playFromGroups([['GEN 1:1'], aLater], 'GEN 1:1'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(1);
    expect(playFrom.mock.calls[0]?.[2]).toEqual({ fraction: 0.6 });
  });

  it('restores each selection identity preferred verse after sounding A to B to A switching', () => {
    const { result, rerender, options } = setup();
    act(() => result.current.playVerse('GEN 1:4'));
    pause.mockReturnValue({
      playableKey: result.current.verseKey('GEN 1:4')!,
      itemIndex: 0,
      verseRef: 'GEN 1:4',
      currentTime: 5,
      forceTts: false,
    });
    act(() => result.current.pause());
    const bOptions: UseSourceTtsPlaybackOptions = {
      ...options,
      sourceChapter: {
        ...options.sourceChapter!,
        role: 'projectSource',
        bibleId: 99,
        textBibleKey: 'aq-1',
      },
      referenceBibleId: null,
    };
    act(() => rerender(bOptions));
    act(() => result.current.playVerse('GEN 1:3'));
    pause.mockReturnValue({
      playableKey: result.current.verseKey('GEN 1:3')!,
      itemIndex: 0,
      verseRef: 'GEN 1:3',
      currentTime: 2,
      forceTts: false,
    });
    act(() => result.current.pause());
    act(() => rerender(options));
    playFrom.mockClear();

    act(() => result.current.playFromVerse('GEN 1:1'));

    expect(playFrom).toHaveBeenCalledOnce();
    expect(playFrom.mock.calls[0]?.[1]).toBe(2);
    expect(playFrom.mock.calls[0]?.[2]).toBe(5);
  });

  it('continuous Play preserves the live group position and then keeps following groups', () => {
    const { result } = setup();
    act(() => result.current.playGroup(['GEN 1:3']));
    pause.mockReturnValue({
      playableKey: result.current.groupKey(['GEN 1:3'])!,
      itemIndex: 0,
      verseRef: 'GEN 1:3',
      currentTime: 4.5,
      forceTts: false,
    });
    playFrom.mockClear();

    act(() => result.current.playFromGroups([['GEN 1:1'], ['GEN 1:3'], ['GEN 1:4']], 'GEN 1:1'));

    const [segments, index, start] = playFrom.mock.calls[0] as [Segment[], number, unknown];
    expect(segments.map(segment => segment.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3', 'GEN 1:4']);
    expect(index).toBe(1);
    expect(start).toBe(4.5);
  });

  it('isGroupSpeaking follows the playing row, so both layouts light up from one source', () => {
    activeVerseRef = 'GEN 1:3';
    const { result } = setup();

    expect(result.current.isGroupSpeaking(['GEN 1:1', 'GEN 1:3'])).toBe(true);
    expect(result.current.isGroupSpeaking(['GEN 1:4'])).toBe(false);
  });

  it('isGroupSpeaking is false for every group while idle', () => {
    const { result } = setup();

    expect(result.current.isGroupSpeaking(['GEN 1:1', 'GEN 1:3'])).toBe(false);
  });
});

describe('useSourceTtsPlayback — auto-scroll (§5.3 step 2)', () => {
  it('scrolls the active row when it is off-screen, without touching focus', () => {
    const { scrollIntoView, focus } = setup();

    act(() => queueOptions.onScrollRequest?.('GEN 1:3'));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it('leaves the viewport alone when the row is already visible', () => {
    const scrollIntoView = vi.fn();
    setup({ getRowElement: () => ({ ...rect(100, 160), scrollIntoView }) });

    act(() => queueOptions.onScrollRequest?.('GEN 1:3'));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('useSourceTtsPlayback — leaving the page mid-playback (§5.2)', () => {
  /**
   * The drafting route swaps chapters WITHOUT unmounting (no `remountDeps`),
   * so these rerender one host with a new page key rather than mounting a
   * second one — which is the shape the live bug had.
   */
  const pageProps = (
    pageKey: string,
    overrides: Partial<UseSourceTtsPlaybackOptions> = {}
  ): UseSourceTtsPlaybackOptions => ({
    engine,
    rows,
    sourceChapter: {
      projectId: 1,
      bibleId: 2,
      bookCode: 'JHN',
      chapter: 3,
      languageCode: 'eng',
      role: 'referenceBible',
      textBibleKey: 'aq-20',
    },
    sourceLicence: { status: 'allowed' },
    referenceBibleId: 'aq-test',
    getRowElement: () => ({ ...rect(900, 960), scrollIntoView: vi.fn(), focus: vi.fn() }),
    getViewport: () => rect(0, 500),
    pageKey,
    ...overrides,
  });

  const renderPage = (pageKey: string, overrides: Partial<UseSourceTtsPlaybackOptions> = {}) =>
    renderHook((options: UseSourceTtsPlaybackOptions) => useSourceTtsPlayback(options), {
      initialProps: pageProps(pageKey, overrides),
      wrapper: PlaybackRegistryProvider,
    });

  it('stops the queue when the page changes underneath it', () => {
    const { rerender, result } = renderPage('chapter-2');
    act(() => result.current.playFromVerse('GEN 1:1'));
    expect(stop).not.toHaveBeenCalled();

    // Back to the previous chapter: same component, new data.
    act(() => rerender(pageProps('chapter-1')));

    expect(stop).toHaveBeenCalledTimes(1);
    // Changing pages never starts the new page's audio.
    expect(playFrom).toHaveBeenCalledTimes(1);
  });

  it('keeps playing across a re-render of the same page', () => {
    const { rerender } = renderPage('chapter-2');

    act(() => rerender(pageProps('chapter-2')));

    expect(stop).not.toHaveBeenCalled();
  });

  it('keeps playing when only the rows change (panel switch)', () => {
    const { rerender } = renderPage('chapter-2');

    act(() =>
      rerender(
        pageProps('chapter-2', {
          rows: [{ verseRef: 'GEN 1:1', verseNumber: 1, text: 'otra', langCode: 'spa' }],
        })
      )
    );

    expect(stop).not.toHaveBeenCalled();
  });
});

describe('useSourceTtsPlayback — failure surfacing (§5.2)', () => {
  it('turns a playback failure into a toast that names the verse', () => {
    setup();

    act(() =>
      queueOptions.onError?.(
        new Error('boom'),
        createTtsSegment({ verseRef: 'GEN 1:3', text: 'three' }, { engine, playableKey: 'v3' })
      )
    );

    expect(toastError).toHaveBeenCalledWith(
      'Could not play audio for verse GEN 1:3. Please try again.'
    );
  });
});

/**
 * The flag gate (2026-08-20).
 *
 * The surface owns the feature flag, but it cannot act on it by skipping the
 * call — React forbids a conditional hook — so the flag arrives as `enabled`
 * and this hook has to honour it itself. Two things follow, and the second is
 * the one a user would actually meet: turning the feature off while somebody
 * is listening takes their controls and shortcuts away, so playback that kept
 * running would have nothing left to stop it.
 */
describe('useSourceTtsPlayback — the enabled gate', () => {
  const setupGated = (enabled: boolean, extra: Partial<UseSourceTtsPlaybackOptions> = {}) =>
    renderHook(
      ({ isEnabled }: { isEnabled: boolean }) =>
        useSourceTtsPlayback({
          engine,
          rows,
          sourceChapter: {
            projectId: 1,
            bibleId: 2,
            bookCode: 'JHN',
            chapter: 3,
            languageCode: 'eng',
            role: 'referenceBible',
            textBibleKey: 'aq-20',
          },
          sourceLicence: { status: 'allowed' },
          referenceBibleId: 'aq-test',
          getRowElement: () => ({ ...rect(900, 960), scrollIntoView: vi.fn(), focus: vi.fn() }),
          getViewport: () => rect(0, 500),
          enabled: isEnabled,
          ...extra,
        }),
      { initialProps: { isEnabled: enabled }, wrapper: PlaybackRegistryProvider }
    );

  it('stops playback when the feature is turned off mid-listen', () => {
    const { result, rerender } = setupGated(true);
    act(() => result.current.playFromVerse('GEN 1:1'));
    expect(playFrom).toHaveBeenCalled();

    // The operator pulls the flag. Controls and shortcuts vanish with it.
    rerender({ isEnabled: false });

    expect(stop).toHaveBeenCalled();
  });
});
