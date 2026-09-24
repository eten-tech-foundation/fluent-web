import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordedRecoveryStrategy } from '../strategies/recordedRecoveryStrategy';
import {
  bsbChapter,
  sourceChapterRequest,
  windowlessChapter,
} from '../testing/sourceAudioFixtures';

import { ChapterAudioCache } from './chapterCache';
import { ProviderFactsAccess, providerFactsOptions, type ProviderFacts } from './providerFacts';
import { resolvePlayables, type SourceResolverContext } from './resolvePlayables';
import { recordingProvenance } from './selectTrack';

import type { Segment, SourceResolutionContext } from '../seam/types';

const factsRow = (
  key = 'aq-1',
  status: ProviderFacts['ttsLicenseStatus'] = 'allowed',
  notice: string | null = 'Recording notice'
): ProviderFacts => ({
  bibleKey: key,
  provider: 'aquifer',
  externalId: key.slice(3),
  id: 1,
  ttsLicenseStatus: status,
  licenseNotice: notice,
});
const resolution = (): SourceResolutionContext => ({
  signal: new AbortController().signal,
  run: { forceTts: false },
  requests: { attach: vi.fn(), markAi: vi.fn() },
});
const resolve = (segment: Segment, context = resolution()) => {
  if (typeof segment.source !== 'function') throw new Error('Expected lazy source');
  return segment.source(context);
};
const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const facts = new ProviderFactsAccess(client, 1);
  const synthesize = vi.fn().mockResolvedValue({ audioUrl: 'https://tts.test/voice.wav' });
  const load = vi.fn().mockResolvedValue({
    ...bsbChapter(),
    items: bsbChapter().items.map(item => ({
      ...item,
      recordingKey: 'aq-20',
      licenseNotice: 'STALE MEDIA NOTICE',
    })),
  });
  const ctx: SourceResolverContext = {
    ...sourceChapterRequest,
    role: 'referenceBible',
    textBibleKey: 'aq-1',
    selectedRecordingKey: null,
    pageKey: 'page',
    facts,
    engine: { synthesize },
    cache: new ChapterAudioCache({ load, supportsOpus: true }),
    recordedRecovery: RecordedRecoveryStrategy,
    ttsLicenseStatus: 'allowed',
  };
  const rows = [1, 2].map(verseNumber => ({
    verseNumber,
    verseRef: String(verseNumber),
    text: `Actual text ${verseNumber}`,
    langCode: 'eng',
  }));
  const put = (row: ProviderFacts) =>
    client.setQueryData(providerFactsOptions(1, row.bibleKey).queryKey, row);
  return { client, facts, ctx, rows, synthesize, load, put };
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('provider facts authority', () => {
  it('uses project and exact provider identity; missing and failed reads never create records', async () => {
    const { facts, client } = setup();
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...factsRow(),
          id: null,
          ttsLicenseStatus: 'unknown',
          licenseNotice: null,
        })
      )
    );
    vi.stubGlobal('fetch', fetch);
    expect(facts.status('aq-1')).toBe('unknown');
    await facts.ensure('aq-1');
    expect(facts.read('aq-1')).toMatchObject({
      state: 'ready',
      facts: { id: null, ttsLicenseStatus: 'unknown' },
    });
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('method', 'POST');
    expect(new ProviderFactsAccess(client, 2).status('aq-1')).toBe('unknown');
    fetch.mockResolvedValue(new Response('', { status: 503 }));
    await facts.ensure('yv-1');
    expect(facts.read('yv-1')).toEqual({ state: 'error' });
  });

  it('refreshes stale permission and notices independently; edited, blank and error replace old authority', async () => {
    vi.useFakeTimers();
    const { facts, put } = setup();
    put(factsRow());
    put(factsRow('aq-20', 'unknown', 'Old recording'));
    expect(facts.status('aq-1')).toBe('allowed');
    vi.advanceTimersByTime(60_001);
    expect(facts.status('aq-1')).toBe('unknown');
    expect(facts.read('aq-20')).toEqual({ state: 'loading' });
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(factsRow('aq-20', 'unknown', ''))));
    vi.stubGlobal('fetch', fetch);
    await facts.ensure('aq-20');
    expect(facts.read('aq-20')).toMatchObject({ state: 'ready', facts: { licenseNotice: '' } });
    expect(facts.status('aq-1')).toBe('unknown');
    vi.advanceTimersByTime(60_001);
    fetch.mockResolvedValue(new Response('', { status: 500 }));
    await facts.ensure('aq-20');
    expect(facts.read('aq-20')).toEqual({ state: 'error' });
  });

  it('starts an exact recording while a policy request is unresolved and retains actual provenance', async () => {
    const { ctx, rows, synthesize } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    const source = await resolve(resolvePlayables(rows, ctx)[0].segments[0]);
    expect(source.window).toBeDefined();
    expect(recordingProvenance(source)).toMatchObject({ recordingKey: 'aq-20', chapter: 3 });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'forbidden'] as const)(
    'bars %s text even when recording/bootstrap metadata says allowed',
    async status => {
      const { ctx, rows, put, load, synthesize } = setup();
      put(factsRow('aq-1', status));
      load.mockResolvedValue(windowlessChapter());
      await expect(resolve(resolvePlayables(rows, ctx)[0].segments[0])).rejects.toThrow(
        'licence fence'
      );
      expect(synthesize).not.toHaveBeenCalled();
    }
  );

  it('a media outage cannot erase successful text permission', async () => {
    const { ctx, rows, put, load, synthesize } = setup();
    put(factsRow());
    load.mockRejectedValue(new Error('provider unavailable'));
    await resolve(resolvePlayables(rows, ctx)[0].segments[0]);
    expect(synthesize).toHaveBeenCalledWith(
      { text: 'Actual text 1', langCode: 'eng' },
      expect.any(AbortSignal)
    );
  });

  it('rechecks captured allowed work after invalidation and forbids obsolete selection synthesis', async () => {
    const { ctx, rows, put, load, synthesize } = setup();
    put(factsRow());
    let finish!: (value: ReturnType<typeof windowlessChapter>) => void;
    load.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const pending = resolve(resolvePlayables(rows, ctx)[0].segments[0]);
    await Promise.resolve();
    await Promise.resolve();
    put(factsRow('aq-1', 'forbidden'));
    finish(windowlessChapter());
    await expect(pending).rejects.toThrow('licence fence');
    expect(synthesize).not.toHaveBeenCalled();
    put(factsRow());
    await expect(
      resolve(resolvePlayables(rows, { ...ctx, isCurrent: () => false })[0].segments[0])
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('resolves each chapter in one full group and never collides equal verse numbers', async () => {
    const { ctx, load, put } = setup();
    put(factsRow());
    load.mockImplementation(async chapter => ({
      ...bsbChapter(),
      chapter: chapter.chapter,
      items: bsbChapter().items.map(item => ({
        ...item,
        url: `https://media.test/${chapter.chapter}.${item.format}`,
        recordingKey: 'aq-1',
      })),
    }));
    const rows = [
      { chapterNumber: 3, verseNumber: 1, verseRef: '3:1', text: 'chapter three' },
      { chapterNumber: 4, verseNumber: 1, verseRef: '4:1', text: 'chapter four' },
    ];
    const [group] = resolvePlayables(rows, { ...ctx, pericopeId: 'boundary' });
    expect(group.segments.map(row => row.verseRef)).toEqual(['3:1', '4:1']);
    const first = await resolve(group.segments[0]);
    const next = await resolve(group.segments[1]);
    expect(first.url).not.toBe(next.url);
    expect(load.mock.calls.map(call => call[0].chapter)).toEqual([3, 4]);
    expect(
      resolvePlayables(rows, { ...ctx, pericopeId: 'boundary', selectedRecordingKey: 'aq-20' })[0]
        .key
    ).not.toBe(group.key);
    expect(
      resolvePlayables(
        rows.map(row => ({ ...row, text: null })),
        { ...ctx, pericopeId: 'boundary' }
      )[0].key
    ).toBe(group.key);
  });
});
