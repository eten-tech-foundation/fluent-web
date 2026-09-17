import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';

import { fetchYouVersionBibles, fetchYouVersionChapterText } from './useYouVersion';

describe('useYouVersion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('routes fetchYouVersionBibles through fluent-api proxy with credentials and no client API key header', async () => {
    const mockBibles = [
      {
        id: 1,
        abbreviation: 'NIV',
        localized_abbreviation: 'NIV',
        title: 'New International Version',
        localized_title: 'New International Version',
        language_tag: 'eng',
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockBibles), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const bibles = await fetchYouVersionBibles('eng');

    expect(bibles).toEqual(mockBibles);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(`${config.api.url}/youversion/bibles?language_tag=eng`);
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
    });
    // Crucial check: client does NOT pass x-yvp-app-key or any API key header
    const headers = (init?.headers as Record<string, string> | undefined) ?? {};
    expect(headers['x-yvp-app-key']).toBeUndefined();
    expect(headers['api-key']).toBeUndefined();
  });

  it('returns empty array when fetchYouVersionBibles receives non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 })
    );

    const bibles = await fetchYouVersionBibles('eng');
    expect(bibles).toEqual([]);
  });

  it('routes fetchYouVersionChapterText through fluent-api batch endpoint with credentials', async () => {
    const mockChapterText = {
      bibleId: 1,
      bookId: 'GEN',
      chapterId: 1,
      verses: [{ verseNumber: 1, passageId: 'GEN.1.1', content: 'In the beginning...' }],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockChapterText), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const data = await fetchYouVersionChapterText(1, 'GEN', 1);

    expect(data).toEqual(mockChapterText);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(`${config.api.url}/youversion/bibles/1/chapters/1/text?bookId=GEN`);
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
    });
  });

  it('rejects when fetchYouVersionChapterText receives a 5xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Upstream Failure' }), { status: 502 })
    );

    await expect(fetchYouVersionChapterText(1, 'GEN', 1)).rejects.toThrow(
      'YouVersion chapter text request failed with status 502'
    );
  });

  it('returns empty verses fallback object when fetchYouVersionChapterText receives a 4xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 })
    );

    const data = await fetchYouVersionChapterText(1, 'GEN', 1);
    expect(data).toEqual({
      bibleId: 1,
      bookId: 'GEN',
      chapterId: 1,
      verses: [],
    });
  });
});
