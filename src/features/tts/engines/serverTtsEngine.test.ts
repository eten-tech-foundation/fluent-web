/**
 * Engine-seam tests (§12.1 "Engine seam" row — every case here is a review
 * commitment, CB1/N4/N5). No MSW: the engine takes an injected `fetchFn`, so
 * responses are fabricated directly, and media elements are faked because
 * jsdom does not implement them.
 */
import { describe, expect, it, vi } from 'vitest';

import { fakeResponse } from '../testing/fakeClipElement';

import { ServerTtsEngine, servedFormatOf, type TtsGenerateWireRequest } from './serverTtsEngine';

// ---------------------------------------------------------------------------
// ServerTtsEngine.synthesize
// ---------------------------------------------------------------------------

describe('ServerTtsEngine.synthesize', () => {
  const makeEngine = (fetchFn: ReturnType<typeof vi.fn>, supportsOpus = true): ServerTtsEngine =>
    new ServerTtsEngine({
      apiBaseUrl: 'https://api.test',
      fetchFn: fetchFn as unknown as (input: string, init?: RequestInit) => Promise<Response>,
      supportsOpus: () => supportsOpus,
    });

  /** The body as it actually goes over the wire — snake_case (§7.1, D8). */
  const sentBody = (fetchFn: ReturnType<typeof vi.fn>): TtsGenerateWireRequest => {
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    return JSON.parse(init.body as string) as TtsGenerateWireRequest;
  };

  it('translates the camelCase seam request into the snake_case wire body (T18, T11, §6.1/§7.1)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      fakeResponse({
        url: 'https://api.test/ai/tts/generate',
        body: { audio_url: 'audio/abc123.wav' },
      })
    );
    const engine = makeEngine(fetchFn, true);

    // Seam input is camelCase...
    await engine.synthesize({ text: 'In the beginning', langCode: 'eng' });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.test/ai/tts/generate',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    const body = sentBody(fetchFn);
    // ...and what leaves the browser is snake_case, mirroring fluent-ai's
    // Python field names verbatim (D8). A regression here would silently drop
    // the hint: `lang_code` is optional upstream, so a stray `langCode` would
    // be rejected by the `.strict()` request schema in fluent-api.
    expect(body).toEqual({ text: 'In the beginning', lang_code: 'eng' });
    expect('langCode' in body).toBe(false);
    expect('format' in body).toBe(false);
    expect('voice' in body).toBe(false);
  });

  it('sends format mp3 only when Opus is unsupported (§6.1)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      fakeResponse({
        url: 'https://api.test/ai/tts/generate',
        body: { audio_url: 'audio/abc123.wav' },
      })
    );
    const engine = makeEngine(fetchFn, false);

    await engine.synthesize({ text: 'hello' });

    expect(sentBody(fetchFn).format).toBe('mp3');
  });

  it('resolves the wire audio_url into an absolute TtsClip.audioUrl against the RESPONSE url, nested path included (§7.1)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      fakeResponse({
        // Deliberately nested prefix: resolution must land beside `generate`.
        url: 'https://api.test/some/prefix/ai/tts/generate',
        body: { audio_url: 'audio/9f2ac1d47b.wav' },
      })
    );
    const engine = makeEngine(fetchFn);

    const clip = await engine.synthesize({ text: 'hello' });

    // The seam value is DERIVED, not relayed: the wire carried a relative
    // reference, the clip carries the absolute URL.
    expect(clip.audioUrl).toBe('https://api.test/some/prefix/ai/tts/audio/9f2ac1d47b.wav');
  });

  it('throws with the HTTP status when generate fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ status: 502 }));
    const engine = makeEngine(fetchFn);

    await expect(engine.synthesize({ text: 'hello' })).rejects.toThrow('HTTP 502');
  });
});

// ---------------------------------------------------------------------------
// servedFormatOf — the verification signal (§9.2)
// ---------------------------------------------------------------------------

/**
 * `generate` names the compressed object directly when one exists (§7.1,
 * amended 2026-08-20), so the container is readable off the URL. Nothing else
 * in the browser exposes it — a media element that follows a 302 still reports
 * the ORIGINAL URL as `currentSrc`, measured in Chrome 2026-08-20.
 */
describe('servedFormatOf', () => {
  it('reads the streaming sibling as wav — this listen paid for a synthesis', () => {
    expect(servedFormatOf('https://api.test/ai/tts/audio/abc123.wav')).toBe('wav');
  });

  it('reads a compressed artifact as its container — this came from the bucket', () => {
    expect(servedFormatOf('https://tts.fluent.bible/tts/audio/abc123.ogg')).toBe('ogg');
    expect(servedFormatOf('https://tts.fluent.bible/tts/audio/abc123.mp3')).toBe('mp3');
  });

  it('ignores a query or fragment rather than reading it as the extension', () => {
    // A cache-buster is the realistic case, and `endsWith('.wav')` would miss it.
    expect(servedFormatOf('https://api.test/ai/tts/audio/abc123.wav?t=1')).toBe('wav');
    expect(servedFormatOf('https://tts.fluent.bible/tts/audio/abc.ogg#x')).toBe('ogg');
  });

  it('says nothing rather than guessing at an unrecognised container', () => {
    expect(servedFormatOf('https://api.test/ai/tts/audio/abc123.flac')).toBeUndefined();
    expect(servedFormatOf('not a url at all')).toBeUndefined();
  });
});

describe('ServerTtsEngine.synthesize — the served container', () => {
  const makeEngine = (fetchFn: ReturnType<typeof vi.fn>): ServerTtsEngine =>
    new ServerTtsEngine({
      apiBaseUrl: 'https://api.test',
      fetchFn: fetchFn as unknown as (input: string, init?: RequestInit) => Promise<Response>,
      supportsOpus: () => true,
    });

  it('reports wav for the sibling-relative streaming reference', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      fakeResponse({
        body: { audio_url: 'audio/abc123.wav' },
        url: 'https://api.test/ai/tts/generate',
      })
    );

    const clip = await makeEngine(fetchFn).synthesize({ text: 'In the beginning' });

    expect(clip.servedAs).toBe('wav');
  });

  it('reports the container when generate hands back the bucket URL directly', async () => {
    // The amended §7.1 case: already compressed, so the caller is sent to R2
    // and saves a hop. An absolute URL resolves to itself under the same
    // `new URL(audio_url, response.url)` rule, so nothing else changes.
    const fetchFn = vi.fn().mockResolvedValue(
      fakeResponse({
        body: { audio_url: 'https://tts.fluent.bible/tts/audio/abc123.ogg' },
        url: 'https://api.test/ai/tts/generate',
      })
    );

    const clip = await makeEngine(fetchFn).synthesize({ text: 'In the beginning' });

    expect(clip.audioUrl).toBe('https://tts.fluent.bible/tts/audio/abc123.ogg');
    expect(clip.servedAs).toBe('ogg');
  });
});
