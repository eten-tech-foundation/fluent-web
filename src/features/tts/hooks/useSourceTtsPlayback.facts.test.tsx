import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlaybackRegistryProvider } from '../registry/PlaybackRegistryProvider';
import { usePlaybackRegistry } from '../registry/usePlaybackRegistry';
import {
  ProviderFactsAccess,
  providerFactsOptions,
  type ProviderFacts,
} from '../resolver/providerFacts';
import { fetchChapterSourceAudio, SourceAudioLookupError } from '../resolver/sourceAudioClient';
import { FakeClipElement } from '../testing/fakeClipElement';
import {
  bsbChapter,
  sourceChapterRequest,
  unprovenDblChapter,
  windowlessChapter,
} from '../testing/sourceAudioFixtures';

import { useSourceTtsPlayback, type UseSourceTtsPlaybackOptions } from './useSourceTtsPlayback';

import type * as AudioModule from '../lib/audioElement';
import type * as ClientModule from '../resolver/sourceAudioClient';

const elements: FakeClipElement[] = [];
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, text: string) => text }),
}));
vi.mock('../resolver/sourceAudioClient', async original => ({
  ...(await original<typeof ClientModule>()),
  fetchChapterSourceAudio: vi.fn(),
}));
vi.mock('../lib/audioElement', async original => ({
  ...(await original<typeof AudioModule>()),
  createClipAudioElement: (src: string) => {
    const element = new FakeClipElement();
    element.src = src;
    elements.push(element);
    return element;
  },
}));
const row = (
  key: string,
  status: ProviderFacts['ttsLicenseStatus'] = 'allowed',
  notice: string | null = null
): ProviderFacts => ({
  bibleKey: key,
  id: 1,
  provider: 'aquifer',
  externalId: key.slice(3),
  ttsLicenseStatus: status,
  licenseNotice: notice,
});
const recorded = (key = 'aq-20') => ({
  ...bsbChapter(),
  items: bsbChapter().items.map(item => ({
    ...item,
    recordingKey: key,
    licenseNotice: 'STALE MEDIA NOTICE',
  })),
});
const settle = async () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
const setup = (extra: Partial<UseSourceTtsPlaybackOptions> = {}) => {
  elements.length = 0;
  vi.mocked(fetchChapterSourceAudio).mockResolvedValue(recorded());
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const facts = new ProviderFactsAccess(client, 1);
  const put = (facts: ProviderFacts) =>
    client.setQueryData(providerFactsOptions(1, facts.bibleKey).queryKey, facts);
  put(row('aq-1'));
  put(row('aq-20', 'unknown', 'Fresh recording notice'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const key = decodeURIComponent(url.split('/').at(-1)!);
      return new Response(
        JSON.stringify(
          client.getQueryData(providerFactsOptions(1, key).queryKey) ??
            row(key, 'unknown', 'Fresh recording notice')
        )
      );
    })
  );
  const synthesize = vi.fn().mockResolvedValue({ audioUrl: 'https://tts.test/voice.wav' });
  const initial: UseSourceTtsPlaybackOptions = {
    engine: { synthesize },
    facts,
    sourceChapter: {
      ...sourceChapterRequest,
      role: 'projectSource',
      textBibleKey: 'aq-1',
      selectedRecordingKey: 'aq-20',
    },
    referenceBibleId: null,
    pageKey: 'page',
    getRowElement: () => null,
    getViewport: () => null,
    rows: [
      {
        verseNumber: 1,
        verseRef: '1',
        chapterNumber: 3,
        text: 'Chapter three text',
        langCode: 'eng',
      },
    ],
    ...extra,
  };
  let registry!: ReturnType<typeof usePlaybackRegistry>;
  const hook = renderHook(
    (props: UseSourceTtsPlaybackOptions) => {
      registry = usePlaybackRegistry();
      return useSourceTtsPlayback(props);
    },
    { initialProps: initial, wrapper: PlaybackRegistryProvider }
  );
  return { ...hook, client, facts, put, synthesize, initial, registry: () => registry };
};
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('shared playback authority and sounding metadata', () => {
  it('keeps actual recorded notice fresh independently of cached media; edited/blank/error never reuse the media notice', async () => {
    const h = setup();
    act(() => h.result.current.playVerse('1'));
    await settle();
    act(() => elements.at(-1)!.emit('playing'));
    await settle();
    expect(h.result.current.recording).toMatchObject({
      recordingKey: 'aq-20',
      notice: 'Fresh recording notice',
    });
    act(() => h.put(row('aq-20', 'unknown', 'Edited')));
    await settle();
    expect(h.result.current.recording?.notice).toBe('Edited');
    act(() => h.put(row('aq-20', 'unknown', '')));
    await settle();
    expect(h.result.current.recording?.notice).toBe('');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }))
    );
    await act(async () => {
      await h.client.refetchQueries({ queryKey: providerFactsOptions(1, 'aq-20').queryKey });
    });
    expect(h.result.current.recording?.notice).toBeNull();
    expect(h.result.current.status).toBe('playing');
    expect(h.facts.status('aq-1')).toBe('allowed');
    expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1);
  });

  it('recorded recovery reports the replacement audio resource, never the primary track notice', async () => {
    const h = setup();
    act(() => h.result.current.playVerse('1'));
    await settle();
    act(() => elements[0].emit('playing'));
    await settle();
    vi.mocked(fetchChapterSourceAudio).mockResolvedValue({
      ...recorded('aq-21'),
      items: recorded('aq-21').items.map(item => ({ ...item, url: `${item.url}?replacement` })),
    });
    act(() => elements[0].emit('error'));
    await settle();
    act(() => elements.at(-1)!.emit('playing'));
    await settle();
    expect(h.result.current.recording?.recordingKey).toBe('aq-21');
  });

  it('keeps direct and recovered linked DBL notices on the actual audio item identity', async () => {
    const h = setup();
    const linked = unprovenDblChapter();
    linked.bible.name = 'Text Bible label';
    linked.items[0].recordingKey = 'dbl-plain-audio';
    linked.items[1].recordingKey = 'dbl-drama-audio';
    h.put(row('dbl-drama-audio', 'unknown', 'Drama recording notice'));
    h.put(row('dbl-plain-audio', 'unknown', 'Plain recording notice'));
    vi.mocked(fetchChapterSourceAudio).mockResolvedValue(linked);

    act(() => h.result.current.playVerse('1'));
    await settle();
    act(() => elements[0].emit('playing'));
    await settle();
    expect(h.result.current.recording).toMatchObject({
      recordingKey: 'dbl-drama-audio',
      recordingName: 'dbl-drama-audio',
      notice: 'Drama recording notice',
    });

    const healed = setup();
    healed.put(row('dbl-plain-audio', 'unknown', 'Plain recording notice'));
    vi.mocked(fetchChapterSourceAudio).mockResolvedValue({
      ...linked,
      items: linked.items.map(item => ({ ...item, url: `${item.url}?healed` })),
      verseTimestamps: [{ verse: 1, startSeconds: 1, endSeconds: 3, dblAudioBibleId: 'plain' }],
    });
    act(() => healed.result.current.playVerse('1'));
    await settle();
    act(() => elements.at(-1)!.emit('playing'));
    await settle();
    expect(healed.result.current.recording).toMatchObject({
      recordingKey: 'dbl-plain-audio',
      recordingName: 'dbl-plain-audio',
      notice: 'Plain recording notice',
    });
  });

  it.each([401, 403])(
    'recorded recovery route %s cannot synthesize with fresh allowed facts',
    async status => {
      const h = setup();
      act(() => h.result.current.playVerse('1'));
      await settle();
      act(() => elements[0].emit('playing'));
      await settle();
      expect(h.facts.status('aq-1')).toBe('allowed');
      vi.mocked(fetchChapterSourceAudio).mockRejectedValue(
        new SourceAudioLookupError('Denied', false, undefined, status)
      );
      act(() => elements[0].emit('error'));
      await settle();
      expect(h.facts.status('aq-1')).toBe('allowed');
      expect(h.synthesize).not.toHaveBeenCalled();
      expect(elements).toHaveLength(1);
      expect(h.result.current.status).not.toBe('playing');
    }
  );

  it('a permission edit cancels pending synthesis and clears its resume state', async () => {
    const h = setup();
    let signal: AbortSignal | undefined;
    h.synthesize.mockImplementation((_request, nextSignal) => {
      signal = nextSignal;
      return new Promise(() => {});
    });
    vi.mocked(fetchChapterSourceAudio).mockResolvedValue(windowlessChapter());
    act(() => h.result.current.playVerse('1'));
    await settle();
    expect(signal?.aborted).toBe(false);
    act(() => h.put(row('aq-1', 'forbidden')));
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(h.result.current.status).toBe('idle');
    expect(h.registry().getRecord(h.result.current.verseKey('1')!)).toBeNull();
  });

  it('mapping changes under one local source ID stop the old run and invalidate its resume identity', async () => {
    const h = setup();
    act(() => h.result.current.playVerse('1'));
    await settle();
    act(() => elements[0].emit('playing'));
    elements[0].currentTime = 4;
    act(() => h.result.current.pause());
    const oldKey = h.result.current.verseKey('1')!;
    expect(h.registry().getRecord(oldKey)).not.toBeNull();
    h.rerender({
      ...h.initial,
      sourceChapter: { ...h.initial.sourceChapter!, selectedRecordingKey: 'aq-21' },
    });
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.verseKey('1')).not.toBe(oldKey);
    expect(h.registry().getRecord(oldKey)).toBeNull();
  });

  it('mapping changes invalidate a scrub-only position that never started media', () => {
    const h = setup();
    const refs = ['1'];
    const oldKey = h.result.current.groupKey(refs)!;
    act(() => h.result.current.seekGroup(refs, '1', 0.5));
    expect(h.registry().getRecord(oldKey)?.pendingFraction).toBe(0.5);
    expect(elements).toHaveLength(0);
    h.rerender({
      ...h.initial,
      sourceChapter: { ...h.initial.sourceChapter!, selectedRecordingKey: 'aq-21' },
    });
    expect(h.registry().getRecord(oldKey)).toBeNull();
  });

  it('cross-chapter groups preserve both same-number verses through pause, resume and seek', async () => {
    const h = setup({
      rows: [
        { chapterNumber: 3, verseNumber: 1, verseRef: '1', text: 'chapter three', langCode: 'eng' },
        {
          chapterNumber: 4,
          verseNumber: 1,
          verseRef: '4:1',
          text: 'chapter four',
          langCode: 'eng',
        },
      ],
    });
    const refs = ['1', '4:1'];
    act(() => h.result.current.playGroup(refs));
    await settle();
    act(() => elements[0].emit('playing'));
    const key = h.result.current.groupKey(refs)!;
    expect(h.result.current.groupView(refs).segments.map(item => item.verseRef)).toEqual(refs);
    const startedElements = elements.length;
    act(() => h.result.current.seekGroup(refs, '4:1', 0.5));
    expect(elements).toHaveLength(startedElements);
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.groupView(refs)).toMatchObject({
      currentIndex: 1,
      pendingFraction: 0.5,
    });
    act(() => h.result.current.playGroup(refs));
    await settle();
    act(() => elements.at(-1)!.emit('playing'));
    expect(h.result.current.activeVerseRef).toBe('4:1');
    expect(vi.mocked(fetchChapterSourceAudio).mock.calls.some(call => call[0].chapter === 4)).toBe(
      true
    );
    act(() => h.result.current.pause());
    expect(h.registry().getRecord(key)?.verseRef).toBe('4:1');
    act(() => h.result.current.playGroup(refs));
    await settle();
    expect(h.result.current.activeVerseRef).toBe('4:1');
    expect(h.result.current.groupKey(refs)).toBe(key);
  });

  it.each([{ loading: true }, { unavailable: true }])(
    'does not shrink a cross-chapter group around unresolved context %j',
    extra => {
      const h = setup({
        rows: [
          { chapterNumber: 3, verseNumber: 1, verseRef: '1', text: 'chapter three' },
          { chapterNumber: 4, verseNumber: 1, verseRef: '4:1', text: null, ...extra },
        ],
      });
      expect(h.result.current.groupKey(['1', '4:1'])).toBeNull();
      act(() => h.result.current.playGroup(['1', '4:1']));
      expect(h.result.current.status).toBe('idle');
      expect(h.synthesize).not.toHaveBeenCalled();
    }
  );

  it('initial and fallback TTS carry no recorded notice', async () => {
    const h = setup();
    vi.mocked(fetchChapterSourceAudio).mockResolvedValue(windowlessChapter());
    act(() => h.result.current.playVerse('1'));
    await settle();
    act(() => elements[0].emit('playing'));
    expect(h.result.current.recording).toBeUndefined();
  });
});

it('staleness and an in-flight refresh do not masquerade as an observed policy downgrade', async () => {
  vi.useFakeTimers();
  const h = setup();
  act(() => h.result.current.playVerse('1'));
  await settle();
  act(() => elements[0].emit('playing'));
  await settle();
  vi.setSystemTime(Date.now() + 60_001);
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    )
  );
  act(() => {
    void h.facts.ensure('aq-1');
  });
  await settle();
  expect(h.facts.status('aq-1')).toBe('unknown');
  expect(h.result.current.status).toBe('playing');
  finish(new Response(JSON.stringify(row('aq-1'))));
  await settle();
  expect(h.result.current.status).toBe('playing');
  expect(h.facts.status('aq-1')).toBe('allowed');
});

it('new synthesis waits for initial facts and the first allowed result does not cancel its run', async () => {
  const h = setup();
  await settle();
  act(() => h.client.removeQueries({ queryKey: providerFactsOptions(1, 'aq-1').queryKey }));
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    )
  );
  vi.mocked(fetchChapterSourceAudio).mockResolvedValue(windowlessChapter());
  act(() => h.result.current.playVerse('1'));
  await settle();
  expect(h.synthesize).not.toHaveBeenCalled();
  finish(new Response(JSON.stringify(row('aq-1'))));
  await settle();
  expect(h.synthesize).toHaveBeenCalledOnce();
  expect(h.result.current.status).not.toBe('idle');
});
