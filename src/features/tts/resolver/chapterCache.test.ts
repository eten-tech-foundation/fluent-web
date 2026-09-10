import { afterEach, describe, expect, it, vi } from 'vitest';

import { bsbChapter, sourceChapterRequest } from '../testing/sourceAudioFixtures';

import { CHAPTER_AUDIO_BACKSTOP_MS, ChapterAudioCache, chapterAudioKey } from './chapterCache';

import type { ChapterSourceAudio } from './sourceAudioClient';

const signal = () => new AbortController().signal;
const deferred = () => {
  let resolve!: (value: ChapterSourceAudio) => void;
  const promise = new Promise<ChapterSourceAudio>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
const replaced = () => {
  const chapter = bsbChapter();
  chapter.items = chapter.items.map(item => ({ ...item, url: `${item.url}?replacement` }));
  return chapter;
};

afterEach(() => vi.useRealTimers());

describe('ChapterAudioCache', () => {
  it('deduplicates simultaneous and sequential verse resolution to one chapter response', async () => {
    const load = vi.fn().mockResolvedValue(bsbChapter());
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    const [a, b] = await Promise.all([
      cache.get(sourceChapterRequest, signal()),
      cache.get(sourceChapterRequest, signal()),
    ]);
    expect(a).toBe(b);
    expect(await cache.get(sourceChapterRequest, signal())).toBe(a);
    expect(load).toHaveBeenCalledOnce();
  });

  it('keys all request identities, never verse number or text', () => {
    const base = chapterAudioKey(sourceChapterRequest);
    for (const changes of [
      { projectId: 3 },
      { bibleId: 4 },
      { bookCode: 'GEN' },
      { chapter: 4 },
      { languageCode: 'hin' },
    ])
      expect(chapterAudioKey({ ...sourceChapterRequest, ...changes })).not.toBe(base);
    expect(chapterAudioKey({ ...sourceChapterRequest })).toBe(base);
  });

  it('heals one dead URL once, dedupes concurrent failures, and lets later verses ride along', async () => {
    const first = bsbChapter();
    const fresh = replaced();
    const load = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(fresh);
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    await cache.get(sourceChapterRequest, signal());
    const dead = first.items[1].url;
    const [a, b, c] = await Promise.all([
      cache.heal(sourceChapterRequest, dead, signal()),
      cache.heal(sourceChapterRequest, dead, signal()),
      cache.get(sourceChapterRequest, signal()),
    ]);
    expect(a).toBe(fresh);
    expect(b).toBe(fresh);
    expect(c).toBe(fresh);
    expect(await cache.heal(sourceChapterRequest, dead, signal())).toBe(fresh);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refetches reactively even when the server returns the same URL', async () => {
    const chapter = bsbChapter();
    const load = vi.fn().mockResolvedValue(chapter);
    const cache = new ChapterAudioCache({ load, supportsOpus: false });
    await cache.get(sourceChapterRequest, signal());
    expect(await cache.heal(sourceChapterRequest, chapter.items[0].url, signal())).toBe(chapter);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('uses only the age backstop, ignoring published expiry zero', async () => {
    vi.useFakeTimers();
    const chapter = bsbChapter();
    chapter.items.forEach(item => {
      item.expiresAt = 0;
    });
    const load = vi.fn().mockResolvedValue(chapter);
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    await cache.get(sourceChapterRequest, signal());
    vi.advanceTimersByTime(CHAPTER_AUDIO_BACKSTOP_MS - 1);
    await cache.get(sourceChapterRequest, signal());
    expect(load).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await cache.get(sourceChapterRequest, signal());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache errors, including a failed heal', async () => {
    const first = bsbChapter();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('heal'))
      .mockResolvedValue(first);
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    await expect(cache.get(sourceChapterRequest, signal())).rejects.toThrow('network');
    await cache.get(sourceChapterRequest, signal());
    await expect(cache.heal(sourceChapterRequest, first.items[1].url, signal())).rejects.toThrow(
      'heal'
    );
    await cache.get(sourceChapterRequest, signal());
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('cancels one waiter without aborting another verse sharing the fetch', async () => {
    const pending = deferred();
    const load = vi.fn((_chapter, _signal: AbortSignal) => pending.promise);
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    const controller = new AbortController();
    const a = cache.get(sourceChapterRequest, controller.signal);
    const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    const b = cache.get(sourceChapterRequest, signal());
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(load.mock.calls[0][1].aborted).toBe(false);
    pending.resolve(bsbChapter());
    await expect(b).resolves.toMatchObject({ verseAddressable: true });
    expect(load).toHaveBeenCalledOnce();
  });

  it('aborts the underlying fetch after the last waiter leaves and allows a new run immediately', async () => {
    const pending = deferred();
    const load = vi
      .fn((_chapter, _signal: AbortSignal) => pending.promise)
      .mockImplementationOnce((_chapter, _signal) => pending.promise)
      .mockResolvedValueOnce(replaced());
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    const controller = new AbortController();
    const old = cache.get(sourceChapterRequest, controller.signal);
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(load.mock.calls[0][1].aborted).toBe(true);
    const fresh = await cache.get(sourceChapterRequest, signal());
    pending.resolve(bsbChapter()); // A loader that ignores abort must not overwrite the new entry.
    await Promise.resolve();
    expect(await cache.get(sourceChapterRequest, signal())).toBe(fresh);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('clear aborts waiters and prevents stale page completions from repopulating the cache', async () => {
    const pending = deferred();
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(replaced());
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    const old = cache.get(sourceChapterRequest, signal());
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    cache.clear();
    await rejected;
    const fresh = await cache.get(sourceChapterRequest, signal());
    pending.resolve(bsbChapter());
    await Promise.resolve();
    expect(await cache.get(sourceChapterRequest, signal())).toBe(fresh);
    cache.clear();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does no request for an already-aborted caller', () => {
    const load = vi.fn();
    const cache = new ChapterAudioCache({ load, supportsOpus: true });
    const controller = new AbortController();
    controller.abort();
    expect(() => cache.get(sourceChapterRequest, controller.signal)).toThrow();
    expect(() => cache.heal(sourceChapterRequest, 'dead', controller.signal)).toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});
