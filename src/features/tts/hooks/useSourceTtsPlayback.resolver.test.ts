/** Host → real resolver/cache/strategies → real queue; only transport/media are faked. */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackRegistryProvider } from '../registry/PlaybackRegistryProvider';
import { usePlaybackRegistry } from '../registry/usePlaybackRegistry';
import { fetchChapterSourceAudio } from '../resolver/sourceAudioClient';
import { FakeClipElement } from '../testing/fakeClipElement';
import {
  bsbChapter,
  sourceChapterRequest,
  windowlessChapter,
} from '../testing/sourceAudioFixtures';

import { useSourceTtsPlayback, type UseSourceTtsPlaybackOptions } from './useSourceTtsPlayback';

import type * as audioModule from '../lib/audioElement';
import type * as clientModule from '../resolver/sourceAudioClient';
import type { TtsEngine } from '../tts.types';
import type * as queueModule from './useTtsPlaybackQueue';

const elements: FakeClipElement[] = [];
let queue: queueModule.TtsPlaybackQueueApi;
let registry: ReturnType<typeof usePlaybackRegistry>;
let playRejection: unknown;
const toastError = vi.fn<(...args: unknown[]) => void>();
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, text: string) => text }),
}));
vi.mock('../resolver/sourceAudioClient', async importOriginal => ({
  ...(await importOriginal<typeof clientModule>()),
  fetchChapterSourceAudio: vi.fn(),
}));
vi.mock('../lib/audioElement', async importOriginal => ({
  ...(await importOriginal<typeof audioModule>()),
  createClipAudioElement: (src: string) => {
    const element = new FakeClipElement();
    element.src = src;
    element.playRejection = playRejection;
    elements.push(element);
    return element;
  },
}));
vi.mock('./useTtsPlaybackQueue', async importOriginal => {
  const actual = await importOriginal<typeof queueModule>();
  return {
    ...actual,
    useTtsPlaybackQueue: (options: queueModule.UseTtsPlaybackQueueOptions) => {
      queue = actual.useTtsPlaybackQueue(options);
      return queue;
    },
  };
});
const load = vi.mocked(fetchChapterSourceAudio);
const synthesize = vi.fn<TtsEngine['synthesize']>();
const engine: TtsEngine = { synthesize };
const rows = [1, 2, 3].map(verseNumber => ({
  verseNumber,
  // Deliberately opaque: the host must pass verseNumber, not parse this label.
  verseRef: `row-${verseNumber}`,
  text: `Source verse ${verseNumber}`,
  langCode: 'eng',
}));
const props = (extra: Partial<UseSourceTtsPlaybackOptions> = {}): UseSourceTtsPlaybackOptions => ({
  engine,
  rows,
  sourceChapter: sourceChapterRequest,
  // The drafting surface reads this from the chapter assignment; a cleared
  // Bible is the ordinary case these tests exercise.
  sourceLicence: { status: 'allowed', notice: 'Test Bible. Public domain.' },
  referenceBibleId: 'aq-test',
  pageKey: 'assignment-1',
  getRowElement: () => null,
  getViewport: () => null,
  ...extra,
});
const setup = (extra: Partial<UseSourceTtsPlaybackOptions> = {}) =>
  renderHook(
    (options: UseSourceTtsPlaybackOptions) => {
      registry = usePlaybackRegistry();
      return useSourceTtsPlayback(options);
    },
    {
      initialProps: props(extra),
      wrapper: PlaybackRegistryProvider,
    }
  );
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
};
const start = async (action: () => void) => {
  act(action);
  await settle();
};
const boundary = async (element: FakeClipElement, seconds: number) => {
  await act(async () => {
    element.currentTime = seconds;
    element.emit('seeked');
    await vi.advanceTimersByTimeAsync(1);
  });
  await settle();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  elements.length = 0;
  playRejection = undefined;
  load.mockResolvedValue(bsbChapter());
  synthesize.mockImplementation(async request => ({
    audioUrl: `https://tts.test/${request.text}`,
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useSourceTtsPlayback — pause records and Restart', () => {
  it('does not construct reference playback without a selection identity', async () => {
    const { result } = setup({ sourceChapter: null, referenceBibleId: null });
    expect(result.current.verseKey('row-1')).toBeNull();
    expect(result.current.groupKey(['row-1', 'row-2'])).toBeNull();
    await start(() => result.current.playVerse('row-1'));
    expect(elements).toHaveLength(0);
    expect(synthesize).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('primary pauses and resumes a verse at its file-absolute offset on a new element', async () => {
    const { result } = setup();
    const key = result.current.verseKey('row-2')!;
    await start(() => result.current.playVerse('row-2'));
    const first = elements[0];
    first.currentTime = 13;
    act(() => result.current.playVerse('row-2'));
    expect(result.current.status).toBe('idle');
    expect(first.paused).toBe(true);
    expect(registry.getRecord(key)).toMatchObject({
      itemIndex: 0,
      currentTime: 13,
      forceTts: false,
    });
    expect(registry.isLive(key)).toBe(false);
    expect(registry.canRestart(key)).toBe(true);
    await start(() => result.current.playVerse('row-2'));
    expect(elements[1]).not.toBe(first);
    expect(elements[1].currentTime).toBe(13);
    expect(registry.isLive(key)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('pauses a pericope on a later segment and resumes that segment, not the first', async () => {
    const { result } = setup();
    const refs = ['row-1', 'row-2'];
    const key = result.current.groupKey(refs)!;
    await start(() => result.current.playGroup(refs));
    act(() => elements[0].emit('playing'));
    await boundary(elements[0], bsbChapter().verseTimestamps![0].endSeconds!);
    elements[0].currentTime = 13;
    act(() => result.current.pause());
    expect(registry.getRecord(key)).toMatchObject({
      itemIndex: 1,
      verseRef: 'row-2',
      currentTime: 13,
    });
    await start(() => result.current.playGroup(refs));
    expect(result.current.activeVerseRef).toBe('row-2');
    expect(elements.at(-1)?.currentTime).toBe(13);
    act(() => elements.at(-1)!.emit('playing'));
    await boundary(elements.at(-1)!, bsbChapter().verseTimestamps![1].endSeconds!);
    expect(registry.getRecord(key)).toBeNull();
    expect(registry.canRestart(key)).toBe(false);
  });

  it('records a range on the sounding verse and does not retain range continuation', async () => {
    const { result } = setup();
    await start(() => result.current.playFromVerse('row-1'));
    act(() => elements[0].emit('playing'));
    await boundary(elements[0], bsbChapter().verseTimestamps![0].endSeconds!);
    const key = result.current.verseKey('row-2')!;
    expect(registry.isLive(key)).toBe(true);
    elements[0].currentTime = 13;
    act(() => result.current.pause());
    expect(registry.getRecord(key)).toMatchObject({ itemIndex: 0, currentTime: 13 });
    expect(registry.getRecord(result.current.verseKey('row-1')!)).toBeNull();
    await start(() => result.current.playVerse('row-2'));
    const resumed = elements.at(-1)!;
    act(() => resumed.emit('playing'));
    await boundary(resumed, bsbChapter().verseTimestamps![1].endSeconds!);
    expect(result.current.status).toBe('idle');
    expect(registry.getRecord(key)).toBeNull();
  });

  it('a fake second claimant pauses the host and release does not retain an idle host', async () => {
    const { result } = setup();
    const key = result.current.verseKey('row-1')!;
    await start(() => result.current.playVerse('row-1'));
    elements[0].currentTime = 7;
    const otherPause = vi.fn();
    act(() => {
      registry.claim(otherPause);
    });
    expect(result.current.status).toBe('idle');
    expect(registry.getRecord(key)?.currentTime).toBe(7);
    await start(() => result.current.playVerse('row-1'));
    expect(otherPause).toHaveBeenCalledTimes(1);
    act(() => result.current.pause());
    const pauses = elements.at(-1)!.pauseCalls;
    act(() => registry.silenceAll());
    expect(elements.at(-1)!.pauseCalls).toBe(pauses);
    expect(registry.getRecord(key)?.currentTime).toBe(7);
  });

  it('two real hosts displace each other and share pause/Restart for the same playable', async () => {
    const { result } = renderHook(
      () => {
        registry = usePlaybackRegistry();
        return { a: useSourceTtsPlayback(props()), b: useSourceTtsPlayback(props()) };
      },
      { wrapper: PlaybackRegistryProvider }
    );
    await start(() => result.current.a.playVerse('row-1'));
    elements[0].currentTime = 8;
    await start(() => result.current.b.playVerse('row-2'));
    expect(result.current.a.status).toBe('idle');
    expect(elements[0].paused).toBe(true);
    expect(registry.getRecord(result.current.a.verseKey('row-1')!)?.currentTime).toBe(8);
    // The other rendering of row 2 pauses its actual owner, not an idle local queue.
    act(() => result.current.a.playVerse('row-2'));
    expect(result.current.b.status).toBe('idle');
    await start(() => result.current.b.playVerse('row-2'));
    await start(() => result.current.a.restartVerse('row-2'));
    expect(result.current.b.status).toBe('idle');
    expect(result.current.a.activeVerseRef).toBe('row-2');
    expect(registry.getRecord(result.current.a.verseKey('row-2')!)).toBeNull();
    expect(elements.at(-1)?.currentTime).toBe(bsbChapter().verseTimestamps![1].startSeconds);
  });

  it('resumes a downgraded run directly on TTS and Restart gives recordings a fresh chance', async () => {
    const { result } = setup();
    const refs = ['row-1', 'row-2'];
    const key = result.current.groupKey(refs)!;
    await start(() => result.current.playGroup(refs));
    load.mockRejectedValueOnce(new Error('recording unavailable'));
    act(() => elements[0].emit('error'));
    await settle();
    elements[0].currentTime = 2.5;
    act(() => result.current.pause());
    expect(registry.getRecord(key)?.forceTts).toBe(true);
    expect(registry.getLastDynamicAi(key)).toBe(true);
    const before = elements.length;
    await start(() => result.current.playGroup(refs));
    expect(elements[before].src).toContain('tts.test');
    expect(elements[before].currentTime).toBe(2.5);
    expect(load).toHaveBeenCalledTimes(2);
    await start(() => result.current.restartGroup(refs));
    expect(registry.getRecord(key)).toBeNull();
    const recorded = [...elements]
      .reverse()
      .find(element => !element.paused && !element.src.includes('tts.test'))!;
    expect(recorded.currentTime).toBe(bsbChapter().verseTimestamps![0].startSeconds);
    expect(registry.getLastDynamicAi(key)).toBe(false);
    expect(queue.aiMarkedKeys.size).toBe(0);
    expect(registry.isLive(key)).toBe(true);
  });

  it('Restart while paused clears position/forceTts without starting or clearing the last badge', async () => {
    load.mockResolvedValue(windowlessChapter());
    const { result } = setup();
    const key = result.current.verseKey('row-1')!;
    await start(() => result.current.playVerse('row-1'));
    elements[0].currentTime = 2;
    act(() => result.current.pause());
    const count = elements.length;
    act(() => result.current.restartVerse('row-1'));
    expect(registry.getRecord(key)).toBeNull();
    expect(registry.canRestart(key)).toBe(false);
    expect(registry.getLastDynamicAi(key)).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(elements).toHaveLength(count);
  });

  it('Stop remains a separate reset action, not a pause alias', async () => {
    const { result } = setup();
    const key = result.current.verseKey('row-1')!;
    await start(() => result.current.playVerse('row-1'));
    elements[0].currentTime = 8;
    act(() => result.current.pause());
    await start(() => result.current.playVerse('row-1'));
    act(() => result.current.stop());
    expect(registry.getRecord(key)).toBeNull();
    expect(registry.canRestart(key)).toBe(false);
    await start(() => result.current.playVerse('row-1'));
    expect(elements.at(-1)?.currentTime).toBe(bsbChapter().verseTimestamps![0].startSeconds);
  });

  it('autoplay refusal saves the position, releases its claim, and resumes on the next click', async () => {
    const { result } = setup();
    const key = result.current.verseKey('row-2')!;
    playRejection = new DOMException('gesture required', 'NotAllowedError');
    await start(() => result.current.playVerse('row-2'));
    const offset = bsbChapter().verseTimestamps![1].startSeconds;
    expect(result.current.status).toBe('idle');
    expect(registry.getRecord(key)?.currentTime).toBe(offset);
    expect(registry.isLive(key)).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(synthesize).not.toHaveBeenCalled();
    playRejection = undefined;
    await start(() => result.current.playVerse('row-2'));
    expect(elements.at(-1)?.currentTime).toBe(offset);
    expect(registry.isLive(key)).toBe(true);
  });

  it('persists the AI badge when a TTS resume is refused before React renders its mark', async () => {
    const { result } = setup();
    const key = result.current.verseKey('row-1')!;
    act(() =>
      registry.setRecord(key, {
        itemIndex: 0,
        verseRef: 'row-1',
        currentTime: 2,
        forceTts: true,
      })
    );
    playRejection = new DOMException('gesture required', 'NotAllowedError');
    await start(() => result.current.playVerse('row-1'));
    expect(registry.getRecord(key)?.forceTts).toBe(true);
    expect(registry.getLastDynamicAi(key)).toBe(true);
  });

  it('natural TTS completion clears the record but preserves the dynamic badge', async () => {
    load.mockResolvedValue(windowlessChapter());
    const { result } = setup();
    const key = result.current.verseKey('row-1')!;
    await start(() => result.current.playVerse('row-1'));
    elements[0].currentTime = 2;
    act(() => result.current.pause());
    await start(() => result.current.playVerse('row-1'));
    act(() => elements.at(-1)!.emit('ended'));
    await settle();
    expect(registry.getRecord(key)).toBeNull();
    expect(registry.getLastDynamicAi(key)).toBe(true);
    expect(registry.isLive(key)).toBe(false);
  });

  it('uses only cheap static knowledge on rebuild, never an eager availability request', async () => {
    load.mockResolvedValue(windowlessChapter());
    const { result, rerender } = setup();
    const key = result.current.verseKey('row-2')!;
    expect(registry.getStaticAi(key)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    await start(() => result.current.playVerse('row-1'));
    act(() => result.current.pause());
    rerender(props({ rows: [...rows] }));
    expect(registry.getStaticAi(key)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    rerender(props({ sourceChapter: null }));
    expect(registry.getStaticAi(result.current.verseKey('row-2')!)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('persists dynamic marks for every heard verse in a range and clears a completed verse record', async () => {
    load.mockResolvedValue(windowlessChapter());
    const { result } = setup();
    const firstKey = result.current.verseKey('row-1')!;
    act(() =>
      registry.setRecord(firstKey, {
        itemIndex: 0,
        verseRef: 'row-1',
        currentTime: 3,
        forceTts: true,
      })
    );
    await start(() => result.current.playFromVerse('row-1'));
    act(() => elements[0].emit('ended'));
    await settle();
    expect(result.current.activeVerseRef).toBe('row-2');
    expect(registry.getRecord(firstKey)).toBeNull();
    const sounding = elements.find(element => !element.paused && element.playCalls.length > 0)!;
    sounding.currentTime = 2;
    act(() => result.current.pause());
    expect(registry.getLastDynamicAi(firstKey)).toBe(true);
    expect(registry.getLastDynamicAi(result.current.verseKey('row-2')!)).toBe(true);
    expect(registry.getLastDynamicAi(result.current.verseKey('row-3')!)).toBe(false);
  });

  it('unknown pending position creates no record; page change drops all old data before late results', async () => {
    let resolve!: (chapter: clientModule.ChapterSourceAudio) => void;
    load.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const { result, rerender } = setup();
    const key = result.current.verseKey('row-1')!;
    await start(() => result.current.playVerse('row-1'));
    act(() => result.current.pause());
    expect(registry.getRecord(key)).toBeNull();
    act(() => registry.setLastDynamicAi(key, true));
    rerender(props({ pageKey: 'next-page' }));
    resolve(bsbChapter());
    await settle();
    expect(registry.getLastDynamicAi(key)).toBe(false);
    expect(registry.getRecord(key)).toBeNull();
    expect(registry.isLive(key)).toBe(false);
    expect(elements).toHaveLength(0);
  });

  it('unmount stops without a record and cannot clear a later claimant', async () => {
    const { result, unmount } = setup();
    const key = result.current.verseKey('row-1')!;
    await start(() => result.current.playVerse('row-1'));
    elements[0].currentTime = 8;
    unmount();
    expect(elements[0].paused).toBe(true);
    expect(registry.getRecord(key)).toBeNull();
    const otherPause = vi.fn();
    registry.claim(otherPause);
    registry.setLive('other');
    registry.silenceAll();
    expect(otherPause).toHaveBeenCalledTimes(1);
    expect(registry.isLive('other')).toBe(true);
    expect(registry.getRecord(key)).toBeNull();
  });
});

describe('useSourceTtsPlayback — recorded drafting integration', () => {
  it('does no I/O before play and plays the explicit verse window without TTS', async () => {
    const { result } = setup();
    expect(load).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    await start(() => result.current.playVerse('row-2'));
    expect(load).toHaveBeenCalledWith(sourceChapterRequest, expect.any(AbortSignal));
    const window = bsbChapter().verseTimestamps![1];
    const element = elements[0];
    act(() => element.emit('playing'));
    expect(element.currentTime).toBe(window.startSeconds);
    expect(bsbChapter().items.map(item => item.url)).toContain(element.src);
    expect(synthesize).not.toHaveBeenCalled();
    expect(queue.aiMarkedKeys.size).toBe(0);
    await boundary(element, window.endSeconds!);
    expect(result.current.status).toBe('idle');
    expect(element.paused).toBe(true);
  });

  it('plays a bounded pericope as one uninterrupted media stretch', async () => {
    const { result } = setup();
    await start(() => result.current.playGroup(['row-2', 'row-1']));
    const element = elements[0];
    act(() => element.emit('playing'));
    const plays = element.playCalls.length;
    const loads = element.loadCalls.length;
    const pauses = element.pauseCalls;
    expect(result.current.activeVerseRef).toBe('row-1');
    await boundary(element, bsbChapter().verseTimestamps![0].endSeconds!);
    expect(result.current.activeVerseRef).toBe('row-2');
    expect(element.playCalls.length).toBe(plays);
    expect(element.loadCalls.length).toBe(loads);
    expect(element.pauseCalls).toBe(pauses);
    expect(load).toHaveBeenCalledTimes(1);
    expect(synthesize).not.toHaveBeenCalled();
    await boundary(element, bsbChapter().verseTimestamps![1].endSeconds!);
    expect(result.current.status).toBe('idle');
  });

  it('shares one chapter response between verse and pericope runs and clears it on page change', async () => {
    const { result, rerender } = setup();
    await start(() => result.current.playVerse('row-1'));
    act(() => result.current.stop());
    rerender(props()); // A fresh input object on the same page must not lose the cache.
    await start(() => result.current.playGroup(['row-1', 'row-2']));
    expect(load).toHaveBeenCalledTimes(1);
    rerender(props({ pageKey: 'assignment-2' }));
    expect(result.current.status).toBe('idle');
    await start(() => result.current.playVerse('row-1'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rebuilds source identity when the project Bible changes on the same page', async () => {
    const { result, rerender } = setup();
    await start(() => result.current.playVerse('row-1'));
    let before: queueModule.PauseSnapshot | null = null;
    act(() => {
      before = queue.pause();
    });
    const changed = { ...sourceChapterRequest, bibleId: 99, languageCode: 'hin' };
    rerender(props({ sourceChapter: changed }));
    await start(() => result.current.playVerse('row-1'));
    expect(load).toHaveBeenLastCalledWith(changed, expect.any(AbortSignal));
    let after: queueModule.PauseSnapshot | null = null;
    act(() => {
      after = queue.pause();
    });
    expect(after!.playableKey).not.toBe(before!.playableKey);
  });

  it('uses TTS for a windowless chapter and marks the sounding playable', async () => {
    load.mockResolvedValue(windowlessChapter());
    const { result } = setup();
    await start(() => result.current.playVerse('row-2'));
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Source verse 2', langCode: 'eng' }),
      expect.any(AbortSignal)
    );
    expect(queue.aiMarkedKeys.size).toBe(1);
    expect(elements[0].currentTime).toBe(0);
  });

  it('uses real recorded recovery to hand off and keep the remaining run on TTS', async () => {
    const { result } = setup();
    await start(() => result.current.playGroup(['row-1', 'row-2', 'row-3']));
    load.mockRejectedValue(new Error('recording lookup unavailable'));
    const element = elements[0];
    element.currentTime = 5;
    act(() => element.emit('error'));
    await settle();
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Source verse 1' }),
      expect.any(AbortSignal)
    );
    expect(queue.aiMarkedKeys.size).toBe(1);
    expect(result.current.activeVerseRef).toBe('row-1');
    expect(element.currentTime).toBe(0); // Never carry a chapter offset into a TTS clip.
    act(() => element.emit('ended'));
    await settle();
    expect(result.current.activeVerseRef).toBe('row-2');
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Source verse 2' }),
      expect.any(AbortSignal)
    );
    expect(load).toHaveBeenCalledTimes(2); // Initial resolve + one failed heal, no later verse retries.
    expect(toastError).not.toHaveBeenCalled();
  });

  it('preserves reference text/language without borrowing the project recording or cache', async () => {
    const { result, rerender } = setup();
    await start(() => result.current.playVerse('row-1'));
    act(() => result.current.stop());
    rerender(
      props({
        sourceChapter: null,
        rows: [{ verseRef: 'row-1', verseNumber: 1, text: 'Reference text', langCode: 'hin' }],
      })
    );
    await start(() => result.current.playVerse('row-1'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Reference text', langCode: 'hin' }),
      expect.any(AbortSignal)
    );
    expect(queue.aiMarkedKeys.size).toBe(1);
  });

  it('omits an empty reference language code rather than sending an invalid TTS request', async () => {
    const { result } = setup({
      sourceChapter: null,
      rows: [{ verseRef: 'row-1', verseNumber: 1, text: 'Reference text', langCode: '' }],
    });
    await start(() => result.current.playVerse('row-1'));
    expect(synthesize).toHaveBeenCalledWith(
      { text: 'Reference text', langCode: undefined },
      expect.any(AbortSignal)
    );
  });

  it('cancels a pending chapter lookup on unmount without generating TTS', async () => {
    let signal: AbortSignal | undefined;
    load.mockImplementation((_chapter, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => {});
    });
    const { result, unmount } = setup();
    await start(() => result.current.playVerse('row-1'));
    unmount();
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(synthesize).not.toHaveBeenCalled();
  });
});
