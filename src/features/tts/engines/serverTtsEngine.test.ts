/**
 * Engine-seam tests (§12.1 "Engine seam" row — every case here is a review
 * commitment, CB1/N4/N5). No MSW: the engine takes an injected `fetchFn`, so
 * responses are fabricated directly, and media elements are faked because
 * jsdom does not implement them.
 */
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { FakeClipElement, fakeResponse } from '../testing/fakeClipElement';

import {
  ServerTtsEngine,
  servedFormatOf,
  superviseClipPlayback,
  type TtsGenerateWireRequest,
  type TtsRecoveryTiming,
} from './serverTtsEngine';

/** Small deterministic timing so fake-timer tests read clearly. */
const TIMING: TtsRecoveryTiming = {
  maxRetriesPerClass: 2,
  midStreamBackoffMs: 1000,
  defaultRetryAfterMs: 2000,
  stallWatchdogMs: 4000,
  stallPollIntervalMs: 1000,
  maxStallPolls: 5,
};

const CLIP_URL = 'https://api.test/ai/tts/audio/abc123.wav';

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
// superviseClipPlayback — HEAD re-probe ladder (§6.1)
// ---------------------------------------------------------------------------

describe('superviseClipPlayback — element error ladder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  interface SuperviseSetup {
    element: FakeClipElement;
    fetchFn: ReturnType<typeof vi.fn>;
    regenerate: Mock<() => Promise<string>>;
    onFailure: Mock<(error: unknown) => void>;
    controller: AbortController;
    detach: () => void;
  }

  const setup = (
    fetchFn: ReturnType<typeof vi.fn>,
    overrides: Partial<{ regenerate: Mock<() => Promise<string>>; streamingEra: boolean }> = {}
  ): SuperviseSetup => {
    const element = new FakeClipElement();
    element.src = CLIP_URL;
    const regenerate =
      overrides.regenerate ?? vi.fn<() => Promise<string>>().mockResolvedValue(CLIP_URL);
    const onFailure = vi.fn<(error: unknown) => void>();
    const controller = new AbortController();
    const detach = superviseClipPlayback({
      element,
      audioUrl: CLIP_URL,
      signal: controller.signal,
      regenerate,
      onFailure,
      // Error-ladder tests are not about the watchdog; a playing clip has no
      // watchdog (§6.1), which `streamingEra: false` models here.
      streamingEra: overrides.streamingEra ?? false,
      fetchFn: fetchFn as unknown as (input: string, init?: RequestInit) => Promise<Response>,
      timing: TIMING,
    });
    return { element, fetchFn, regenerate, onFailure, controller, detach };
  };

  it('classifies via HEAD with redirect manual and credentials', async () => {
    const { element, fetchFn } = setup(vi.fn().mockResolvedValue(fakeResponse({ status: 200 })));
    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchFn).toHaveBeenCalledWith(
      CLIP_URL,
      expect.objectContaining({ method: 'HEAD', redirect: 'manual', credentials: 'include' })
    );
  });

  it('404 → one re-generate + reload with the fresh URL (§6.1)', async () => {
    const freshUrl = 'https://api.test/ai/tts/audio/abc123.wav?fresh';
    const regenerate = vi.fn<() => Promise<string>>().mockResolvedValue(freshUrl);
    const { element } = setup(vi.fn().mockResolvedValue(fakeResponse({ status: 404 })), {
      regenerate,
    });

    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(element.loadCalls).toEqual([freshUrl]);
    // ...and RESUMES. `load()` leaves the element paused, so a ladder that
    // only re-pointed the source repaired everything except the sound (found
    // in a browser, phase 09 — the clip healed and then sat there silent).
    expect(element.playCalls).toEqual([freshUrl]);
  });

  it('every recovery class restarts playback, not just the 404 rung', async () => {
    // Mid-stream abort: probe says 200, so the clip is still streaming and the
    // element is reset to the SAME url. That reset must play, for the same
    // reason — this is the common path all classes route through.
    const { element } = setup(vi.fn().mockResolvedValue(fakeResponse({ status: 200 })));

    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000); // midStreamBackoffMs

    expect(element.loadCalls).toEqual([CLIP_URL]);
    expect(element.playCalls).toEqual([CLIP_URL]);
  });

  it('503 + Retry-After → quiet retry after the server delay, not before (§6.1)', async () => {
    const { element } = setup(
      vi.fn().mockResolvedValue(fakeResponse({ status: 503, headers: { 'Retry-After': '3' } }))
    );

    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    expect(element.loadCalls).toEqual([]); // still waiting

    await vi.advanceTimersByTimeAsync(3000);
    expect(element.loadCalls).toEqual([CLIP_URL]);
  });

  it('200 (mid-stream abort) → src reset after a short fixed backoff (§6.1)', async () => {
    const { element } = setup(vi.fn().mockResolvedValue(fakeResponse({ status: 200 })));

    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);
    expect(element.loadCalls).toEqual([]);

    await vi.advanceTimersByTimeAsync(TIMING.midStreamBackoffMs);
    expect(element.loadCalls).toEqual([CLIP_URL]);
  });

  it('302/opaqueredirect (compressed exists) → immediate src reset (§6.1, N5)', async () => {
    const { element } = setup(
      vi.fn().mockResolvedValue(fakeResponse({ status: 0, type: 'opaqueredirect' }))
    );

    element.emit('error');
    await vi.advanceTimersByTimeAsync(0);

    expect(element.loadCalls).toEqual([CLIP_URL]);
  });

  it('retries are capped per failure class; the third failure surfaces the typed error (CB1)', async () => {
    const { element, onFailure } = setup(vi.fn().mockResolvedValue(fakeResponse({ status: 200 })));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      element.emit('error');
      await vi.advanceTimersByTimeAsync(TIMING.midStreamBackoffMs);
    }

    // Two quiet reloads, then the typed failure — and no further recovery.
    expect(element.loadCalls).toEqual([CLIP_URL, CLIP_URL]);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toMatchObject({
      name: 'TtsPlaybackError',
      failureClass: 'midStream',
    });
  });

  it('AbortSignal cancels a PENDING retry timer — no further fetch or reload (CB1)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(fakeResponse({ status: 503, headers: { 'Retry-After': '3' } }));
    const { element, controller } = setup(fetchFn);

    element.emit('error');
    await vi.advanceTimersByTimeAsync(0); // probe done; retry timer pending
    expect(fetchFn).toHaveBeenCalledTimes(1);

    controller.abort();
    await vi.advanceTimersByTimeAsync(10000);

    // T21: cancellation is LOCAL-safe — no reload, no retry fetch, and never
    // any "cancel" call to the server (no such endpoint exists).
    expect(element.loadCalls).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// superviseClipPlayback — stall watchdog (N4, §6.1 platform risk)
// ---------------------------------------------------------------------------

describe('superviseClipPlayback — stall watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setupStreaming = (
    fetchFn: ReturnType<typeof vi.fn>
  ): {
    element: FakeClipElement;
    controller: AbortController;
    onFailure: Mock<(error: unknown) => void>;
  } => {
    const element = new FakeClipElement();
    element.src = CLIP_URL;
    const controller = new AbortController();
    const onFailure = vi.fn<(error: unknown) => void>();
    superviseClipPlayback({
      element,
      audioUrl: CLIP_URL,
      signal: controller.signal,
      regenerate: vi.fn<() => Promise<string>>().mockResolvedValue(CLIP_URL),
      onFailure,
      streamingEra: true,
      fetchFn: fetchFn as unknown as (input: string, init?: RequestInit) => Promise<Response>,
      timing: TIMING,
    });
    return { element, controller, onFailure };
  };

  it('no progress/canplay before the timeout → HEAD-poll until 302, then reload (wait-for-compressed)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 200 })) // still streaming
      .mockResolvedValue(fakeResponse({ status: 0, type: 'opaqueredirect' })); // compressed
    const { element } = setupStreaming(fetchFn);

    await vi.advanceTimersByTimeAsync(TIMING.stallWatchdogMs); // watchdog fires; first poll = 200
    expect(element.loadCalls).toEqual([]);

    await vi.advanceTimersByTimeAsync(TIMING.stallPollIntervalMs); // second poll = 302
    expect(element.loadCalls).toEqual([CLIP_URL]);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Compressed era: the watchdog must NOT re-arm after the recovery reload.
    await vi.advanceTimersByTimeAsync(TIMING.stallWatchdogMs * 3);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('no watchdog once the clip reports progress/playing (§6.1)', async () => {
    const fetchFn = vi.fn();
    const { element } = setupStreaming(fetchFn);

    element.emit('progress');
    await vi.advanceTimersByTimeAsync(TIMING.stallWatchdogMs * 3);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('watchdog timer is cancelled by the AbortSignal (CB1/N4)', async () => {
    const fetchFn = vi.fn();
    const { controller } = setupStreaming(fetchFn);

    controller.abort();
    await vi.advanceTimersByTimeAsync(TIMING.stallWatchdogMs * 3);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('watchdog 404 poll routes through the notFound rung (re-generate + reload)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ status: 404 }));
    const element = new FakeClipElement();
    element.src = CLIP_URL;
    const freshUrl = 'https://api.test/ai/tts/audio/abc123.wav?fresh';
    const regenerate = vi.fn<() => Promise<string>>().mockResolvedValue(freshUrl);
    const controller = new AbortController();
    superviseClipPlayback({
      element,
      audioUrl: CLIP_URL,
      signal: controller.signal,
      regenerate,
      onFailure: vi.fn<(error: unknown) => void>(),
      streamingEra: true,
      fetchFn: fetchFn as unknown as (input: string, init?: RequestInit) => Promise<Response>,
      timing: TIMING,
    });

    await vi.advanceTimersByTimeAsync(TIMING.stallWatchdogMs);

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(element.loadCalls).toEqual([freshUrl]);
  });

  it('exhausted wait-for-compressed polling surfaces the typed stall failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ status: 200 })); // never compresses
    const { onFailure } = setupStreaming(fetchFn);

    await vi.advanceTimersByTimeAsync(
      TIMING.stallWatchdogMs + TIMING.stallPollIntervalMs * (TIMING.maxStallPolls + 1)
    );

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toMatchObject({
      name: 'TtsPlaybackError',
      failureClass: 'stall',
    });
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
