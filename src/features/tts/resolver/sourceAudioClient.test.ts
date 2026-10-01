import { describe, expect, it, vi } from 'vitest';

import { bsbChapter, emptyChapter, sourceChapterRequest } from '../testing/sourceAudioFixtures';

import { fetchChapterSourceAudio, sourceAudioResponseSchema } from './sourceAudioClient';

const signal = () => new AbortController().signal;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchChapterSourceAudio', () => {
  it('uses the authenticated project route, encoded query and cancellation signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(bsbChapter()));
    const abort = signal();
    const result = await fetchChapterSourceAudio(
      {
        ...sourceChapterRequest,
        languageCode: 'eng & more',
      },
      abort,
      { apiBaseUrl: 'https://api.test', fetchFn }
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.test/projects/1/playback-audio/JHN/3?bibleId=2&languageCode=eng+%26+more',
      { method: 'GET', credentials: 'include', signal: abort }
    );
    expect(result).toEqual(bsbChapter());
    expect(result.verseTimestamps).toHaveLength(36);
  });

  it('parses empty labelled chapters and every actual licence enum value', async () => {
    for (const ttsLicenseStatus of ['allowed', 'forbidden', 'unknown']) {
      const fetchFn = vi.fn().mockResolvedValue(response({ ...emptyChapter(), ttsLicenseStatus }));
      expect(
        await fetchChapterSourceAudio(sourceChapterRequest, signal(), { fetchFn })
      ).toMatchObject({ items: [], verseAddressable: false, ttsLicenseStatus });
    }
  });

  it('requires the response label but permits missing timestamps and additive fields', () => {
    const chapter = bsbChapter();
    expect(
      sourceAudioResponseSchema.safeParse({ ...chapter, verseAddressable: undefined }).success
    ).toBe(false);
    expect(
      sourceAudioResponseSchema.parse({ ...chapter, verseTimestamps: undefined, futureField: true })
    ).not.toHaveProperty('futureField');
  });

  it('parses optional starts, ends and the three dead wire fields without inference', () => {
    const chapter = bsbChapter();
    const parsed = sourceAudioResponseSchema.parse({
      ...chapter,
      items: [{ ...chapter.items[0], scope: 'verse', durationSeconds: 999, expiresAt: 0 }],
      verseTimestamps: [{ verse: 1 }, { verse: 2, startSeconds: 5 }],
    });
    expect(parsed.items[0]).toMatchObject({ scope: 'verse', durationSeconds: 999, expiresAt: 0 });
    expect(parsed.verseTimestamps).toEqual([{ verse: 1 }, { verse: 2, startSeconds: 5 }]);
  });

  it.each([401, 403, 404, 502])(
    'does not turn HTTP %s into a cached empty response',
    async status => {
      const fetchFn = vi.fn().mockResolvedValue(response({}, status));
      await expect(
        fetchChapterSourceAudio(sourceChapterRequest, signal(), { fetchFn })
      ).rejects.toThrow(`HTTP ${status}`);
    }
  );

  it('rejects malformed successful responses', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(response({ ...bsbChapter(), items: [{ url: 'bad' }] }));
    await expect(
      fetchChapterSourceAudio(sourceChapterRequest, signal(), { fetchFn })
    ).rejects.toThrow();
  });

  it('does not fetch after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchFn = vi.fn();
    await expect(
      fetchChapterSourceAudio(sourceChapterRequest, controller.signal, { fetchFn })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
