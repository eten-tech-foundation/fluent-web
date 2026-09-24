/** Host → real resolver/cache/registry → real queue, with the licence fence in place. */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@/lib/services/logger';

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

const elements: FakeClipElement[] = [];
let registry: ReturnType<typeof usePlaybackRegistry>;
const toastError = vi.fn<(...args: unknown[]) => void>();
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
vi.mock('react-i18next', () => {
  // Production i18n keeps t stable; a new function on every render hides
  // missing effect dependencies when a chapter response arrives.
  const t = (_key: string, text: string) => text;
  return { useTranslation: () => ({ t }) };
});
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

const load = vi.mocked(fetchChapterSourceAudio);
const synthesize = vi.fn<TtsEngine['synthesize']>();
const engine: TtsEngine = { synthesize };
const rows = [1, 2, 3].map(verseNumber => ({
  verseNumber,
  verseRef: `row-${verseNumber}`,
  text: `Source verse ${verseNumber}`,
  langCode: 'eng',
}));
const barred = (
  status: 'forbidden' | 'unknown' = 'forbidden'
): clientModule.ChapterSourceAudio => ({
  ...windowlessChapter(),
  ttsLicenseStatus: status,
});
const props = (extra: Partial<UseSourceTtsPlaybackOptions> = {}): UseSourceTtsPlaybackOptions => ({
  engine,
  rows,
  sourceChapter: sourceChapterRequest,
  sourceLicence: { status: 'forbidden', notice: null },
  referenceBibleId: null,
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
    { initialProps: props(extra), wrapper: PlaybackRegistryProvider }
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
const reasonOf = (result: { current: { verseKey: (ref: string) => string | null } }, ref: string) =>
  registry.getSnapshot(result.current.verseKey(ref)!).impossibleReason;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  elements.length = 0;
  load.mockResolvedValue(barred());
  synthesize.mockImplementation(async request => ({
    audioUrl: `https://tts.test/${request.text}`,
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the licence fence in the drafting host', () => {
  it('never synthesizes a barred Bible, and says why instead of failing silently', async () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const { result } = setup();
    await start(() => result.current.playVerse('row-1'));
    expect(synthesize).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Text-to-speech is not permitted for this Bible.');
    // Sticky, so the control reads as impossible from here on rather than
    // offering a press that can only fail again.
    expect(reasonOf(result, 'row-1')).toBe('Text-to-speech is not permitted for this Bible.');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('distinguishes "we decided no" from "nobody looked" in the reason, not in the behaviour', async () => {
    load.mockResolvedValue(barred('unknown'));
    const { result } = setup({ sourceLicence: { status: 'unknown', notice: null } });
    await start(() => result.current.playVerse('row-1'));
    expect(synthesize).not.toHaveBeenCalled();
    expect(reasonOf(result, 'row-1')).toBe('Text-to-speech has not been cleared for this Bible.');
  });

  it('latches every verse of a barred windowless chapter once its recordings are known', async () => {
    const { result } = setup();
    // Nothing is claimed before the chapter answers: the verse may yet be recorded.
    expect(reasonOf(result, 'row-2')).toBeNull();
    await start(() => result.current.playVerse('row-1'));
    for (const row of rows) {
      expect(reasonOf(result, row.verseRef)).toBe(
        'Text-to-speech is not permitted for this Bible.'
      );
    }
  });

  it('never badges a barred windowless verse as AI, before or after another press', async () => {
    const { result } = setup();
    await start(() => result.current.playVerse('row-1'));
    await start(() => result.current.playVerse('row-2'));
    for (const row of rows) {
      const state = registry.getSnapshot(result.current.verseKey(row.verseRef)!);
      expect(state.staticAi).toBe(false);
      expect(state.lastDynamicAi).toBe(false);
    }
    expect(result.current.groupView(rows.map(row => row.verseRef)).staticAi).toBe(false);
  });

  it('plays the recording on a barred Bible and never reaches for a voice when it fails', async () => {
    load.mockResolvedValue({ ...bsbChapter(), ttsLicenseStatus: 'forbidden' });
    const { result } = setup();
    await start(() => result.current.playVerse('row-1'));
    expect(elements).toHaveLength(1);
    expect(synthesize).not.toHaveBeenCalled();
    load.mockRejectedValue(new Error('recording lookup unavailable'));
    await act(async () => {
      elements[0].emit('error');
      await settle();
    });
    expect(synthesize).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      'Recorded audio failed, and text-to-speech is not permitted for this Bible.'
    );
    // The recording exists and may play next time, so nothing is latched.
    expect(reasonOf(result, 'row-1')).toBeNull();
  });

  it('keeps a cleared Bible speaking, and says nothing about licences', async () => {
    load.mockResolvedValue(windowlessChapter());
    const { result } = setup({ sourceLicence: { status: 'allowed', notice: 'Public domain.' } });
    await start(() => result.current.playVerse('row-1'));
    expect(synthesize).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
    expect(reasonOf(result, 'row-1')).toBeNull();
  });

  it('records one line per barred chapter per page, not one per verse or per press', async () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const { result, rerender } = setup();
    await start(() => result.current.playVerse('row-1'));
    await start(() => result.current.playVerse('row-2'));
    act(() => rerender(props()));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Source text-to-speech barred by the licence fence', {
      fluentBibleId: bsbChapter().bible.fluentBibleId,
      bookCode: 'JHN',
      chapter: 3,
      ttsLicenseStatus: 'forbidden',
      verseAddressable: false,
    });

    // A second chapter on the same page is a second fact an operator needs.
    const nextChapter = { ...sourceChapterRequest, chapter: 4 };
    load.mockResolvedValue({ ...barred(), chapter: 4 });
    act(() => rerender(props({ sourceChapter: nextChapter })));
    await start(() => result.current.playVerse('row-1'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('refuses synthesis when no licence reached the page at all', async () => {
    load.mockRejectedValue(new Error('source audio unavailable'));
    const { result } = setup({ sourceLicence: undefined });
    await start(() => result.current.playVerse('row-1'));
    expect(synthesize).not.toHaveBeenCalled();
    // Transient rather than a fact about the Bible: say so, latch nothing.
    expect(toastError).toHaveBeenCalledWith(
      "This Bible's audio licence could not be confirmed. Please try again."
    );
    expect(reasonOf(result, 'row-1')).toBeNull();
  });

  it('keeps a cleared Bible speaking when the recording lookup is unreachable', async () => {
    load.mockRejectedValue(new Error('source audio unavailable'));
    const { result } = setup({ sourceLicence: { status: 'allowed', notice: null } });
    await start(() => result.current.playVerse('row-1'));
    // The licence came with the assignment, so an unreachable provider costs
    // the recording, not the voice.
    expect(synthesize).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });
});
