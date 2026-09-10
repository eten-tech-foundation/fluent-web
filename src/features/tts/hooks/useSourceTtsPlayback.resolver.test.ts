/** Host → real resolver/cache/strategies → real queue; only transport/media are faked. */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  pageKey: 'assignment-1',
  getRowElement: () => null,
  getViewport: () => null,
  ...extra,
});
const setup = (extra: Partial<UseSourceTtsPlaybackOptions> = {}) =>
  renderHook((options: UseSourceTtsPlaybackOptions) => useSourceTtsPlayback(options), {
    initialProps: props(extra),
  });
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
  load.mockResolvedValue(bsbChapter());
  synthesize.mockImplementation(async request => ({
    audioUrl: `https://tts.test/${request.text}`,
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
