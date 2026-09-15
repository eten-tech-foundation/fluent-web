import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type FetchLike } from '../engines/serverTtsEngine';
import { type Segment } from '../seam/types';
import { RecordedRecoveryStrategy } from '../strategies/recordedRecoveryStrategy';
import {
  bsbChapter,
  emptyChapter,
  sourceChapterRequest,
  windowlessChapter,
} from '../testing/sourceAudioFixtures';

import { ChapterAudioCache } from './chapterCache';
import { resolvePlayables } from './resolvePlayables';
import { fetchChapterSourceAudio } from './sourceAudioClient';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const signal = () => new AbortController().signal;
const setup = () => {
  const fetchFn = vi.fn<FetchLike>();
  const cache = new ChapterAudioCache({
    supportsOpus: true,
    load: (chapter, abort) =>
      fetchChapterSourceAudio(chapter, abort, { fetchFn, apiBaseUrl: 'https://api.test' }),
  });
  const synthesize = vi.fn().mockResolvedValue({ audioUrl: 'https://audio.test/generated' });
  const segments = resolvePlayables(
    [1, 2].map(verseNumber => ({
      verseNumber,
      verseRef: String(verseNumber),
      text: `Source verse ${verseNumber}`,
      langCode: 'eng',
    })),
    {
      ...sourceChapterRequest,
      pageKey: 'page',
      cache,
      engine: { synthesize },
      recordedRecovery: RecordedRecoveryStrategy,
      // These are retry tests on a cleared Bible. The host reads this from the
      // chapter assignment, so it is present even when no lookup succeeds —
      // which is what lets an exhausted lookup still reach TTS.
      ttsLicenseStatus: 'allowed',
    }
  ).flatMap(playable => playable.segments);
  return { fetchFn, cache, synthesize, segments };
};
const resolve = (segment: Segment, abort = signal()) => {
  if (typeof segment.source !== 'function') throw new Error('Expected lazy source');
  return segment.source({
    signal: abort,
    run: { forceTts: false },
    requests: { attach: vi.fn(), markAi: vi.fn() },
  });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('initial source-audio lookup retries through the real client and shared chapter cache', () => {
  it('shares three attempts across concurrent verses, with 500ms then 1000ms delays and no synthesis if recovered', async () => {
    const h = setup();
    h.fetchFn
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response({}, 502))
      .mockResolvedValueOnce(response(bsbChapter()));
    const first = resolve(h.segments[0]);
    const second = resolve(h.segments[1]);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
    expect(h.synthesize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    const sources = await Promise.all([first, second]);
    expect(sources.map(source => source.url)).toEqual([
      bsbChapter().items[1].url,
      bsbChapter().items[1].url,
    ]);
    expect(h.fetchFn).toHaveBeenCalledTimes(3);
    expect(h.synthesize).not.toHaveBeenCalled();
    await h.cache.get(sourceChapterRequest, signal());
    expect(h.fetchFn).toHaveBeenCalledTimes(3);
  });

  it.each([500, 502, 503, 504])(
    'falls back only after exactly three failed HTTP %s attempts',
    async status => {
      const h = setup();
      h.fetchFn.mockImplementation(async () => response({}, status));
      const result = resolve(h.segments[0]);
      await vi.advanceTimersByTimeAsync(500);
      expect(h.fetchFn).toHaveBeenCalledTimes(2);
      expect(h.synthesize).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toHaveProperty('url', 'https://audio.test/generated');
      expect(h.fetchFn).toHaveBeenCalledTimes(3);
      expect(h.synthesize).toHaveBeenCalledOnce();
      expect(h.cache.peek(sourceChapterRequest)).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([400, 401, 403, 404, 429, 501, 505])(
    'never retries non-transient HTTP %s',
    async status => {
      const h = setup();
      h.fetchFn.mockResolvedValue(response({}, status));
      await expect(h.cache.get(sourceChapterRequest, signal())).rejects.toThrow(`HTTP ${status}`);
      expect(h.fetchFn).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([emptyChapter, windowlessChapter])(
    'does not delay a genuinely absent/unusable recording',
    async fixture => {
      const h = setup();
      h.fetchFn.mockResolvedValue(response(fixture()));
      await expect(resolve(h.segments[0])).resolves.toHaveProperty(
        'url',
        'https://audio.test/generated'
      );
      expect(h.fetchFn).toHaveBeenCalledOnce();
      expect(h.synthesize).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['invalid JSON', 'invalid schema'])('does not retry %s', async failure => {
    const h = setup();
    h.fetchFn.mockResolvedValue(
      failure === 'invalid JSON' ? new Response('{') : response({ items: [] })
    );
    await expect(h.cache.get(sourceChapterRequest, signal())).rejects.toThrow();
    expect(h.fetchFn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a transport failure while reading the response body, not a malformed body', async () => {
    const h = setup();
    const truncated = response(bsbChapter());
    vi.spyOn(truncated, 'json').mockRejectedValue(new TypeError('terminated'));
    h.fetchFn.mockResolvedValueOnce(truncated).mockResolvedValueOnce(response(bsbChapter()));
    const result = h.cache.get(sourceChapterRequest, signal());
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toHaveProperty('verseAddressable', true);
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('cancels a waiting verse promptly without retrying or generating TTS', async () => {
    const h = setup();
    h.fetchFn.mockRejectedValue(new TypeError('offline'));
    const controller = new AbortController();
    const result = resolve(h.segments[0], controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.fetchFn).toHaveBeenCalledOnce();
    expect(h.synthesize).not.toHaveBeenCalled();
  });

  it('lets another verse retain the shared retry when only one waiter cancels', async () => {
    const h = setup();
    h.fetchFn
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response(bsbChapter()));
    const controller = new AbortController();
    const first = h.cache.get(sourceChapterRequest, controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = h.cache.get(sourceChapterRequest, signal());
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    await expect(second).resolves.toHaveProperty('verseAddressable', true);
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clear cancels the shared delay and allows an immediate fresh page lookup', async () => {
    const h = setup();
    h.fetchFn
      .mockResolvedValueOnce(response({}, 502))
      .mockResolvedValueOnce(response(bsbChapter()));
    const old = h.cache.get(sourceChapterRequest, signal());
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    h.cache.clear();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await expect(h.cache.get(sourceChapterRequest, signal())).resolves.toHaveProperty(
      'verseAddressable',
      true
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not multiply existing media-recovery budgets by retrying a heal', async () => {
    const h = setup();
    h.fetchFn
      .mockResolvedValueOnce(response(bsbChapter()))
      .mockResolvedValueOnce(response({}, 502));
    await h.cache.get(sourceChapterRequest, signal());
    await expect(
      h.cache.heal(sourceChapterRequest, bsbChapter().items[1].url, signal())
    ).rejects.toThrow('HTTP 502');
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
