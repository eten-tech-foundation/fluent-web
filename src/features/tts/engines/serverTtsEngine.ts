/**
 * `ServerTtsEngine` — the server-backed `TtsEngine` (§6.1, T5), plus the
 * fetch-control-plane recovery ladder that supervises a clip's playback
 * (HEAD re-probe classification, bounded retries, stall watchdog).
 *
 * Retries live HERE, not in elements: media-element errors are opaque (no
 * HTTP status), so the engine classifies failures with a `fetch` HEAD
 * re-probe of the clip URL (§6.1). All of this stays invisible to controls.
 */

import { config } from '@/lib/config';

import { type ClipAudioElement, onClipEvent, resetClipElement } from '../lib/audioElement';
import {
  type TtsClip,
  type TtsEngine,
  type TtsFailureClass,
  type TtsFormat,
  TtsPlaybackError,
  type TtsRequest,
} from '../tts.types';

/** Minimal fetch signature so tests can inject a deterministic fake. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * ── Wire payloads for fluent-api's `generate` proxy (§7.1) ───────────────────
 *
 * snake_case ON PURPOSE, and deliberately SEPARATE from the camelCase seam
 * types in `tts.types.ts`. fluent-ai is a Python service whose field names
 * travel through fluent-api verbatim (decision D8) — the same thing
 * `features/checks/checks.types.ts` already does for greek-room.
 *
 * Keeping them separate is not pedantry: they hold different values. The
 * server's `audio_url` is a SIBLING-RELATIVE reference; `TtsClip.audioUrl` is
 * the ABSOLUTE URL derived from it below. This module is the only place the
 * two vocabularies meet, which is exactly why a future browser-local engine
 * (§13.3) can implement the same seam with no wire vocabulary at all.
 */
export interface TtsGenerateWireRequest {
  text: string;
  voice?: string;
  format?: TtsFormat;
  lang_code?: string;
}

export interface TtsGenerateWireResponse {
  audio_url: string;
}

/**
 * Proposed-default numbers (§6.1, flagged for review in the proposal). Named
 * in ONE place so retuning is a one-line change.
 */
export interface TtsRecoveryTiming {
  /** Max quiet retries per failure class per clip (CB1). */
  maxRetriesPerClass: number;
  /** Fixed backoff for mid-stream aborts (Retry-After governs 503s). */
  midStreamBackoffMs: number;
  /** Fallback delay when a 503 carries no usable Retry-After. */
  defaultRetryAfterMs: number;
  /** Stall watchdog: no progress/canplay within this window ⇒ stalled (N4). */
  stallWatchdogMs: number;
  /** Interval for the wait-for-compressed HEAD poll (N4). */
  stallPollIntervalMs: number;
  /** Defensive bound on wait-for-compressed polling (not in the proposal). */
  maxStallPolls: number;
}

export const DEFAULT_TTS_RECOVERY_TIMING: TtsRecoveryTiming = {
  maxRetriesPerClass: 2,
  midStreamBackoffMs: 1000,
  defaultRetryAfterMs: 2000,
  stallWatchdogMs: 4000,
  stallPollIntervalMs: 1000,
  maxStallPolls: 30,
};

/**
 * Opus support probe (§6.1): synchronous local call, one tiny helper so tests
 * can force both branches. `canPlayType` returns '' | 'maybe' | 'probably'.
 */
export const canBrowserPlayOpus = (): boolean => {
  const element = document.createElement('audio');
  return element.canPlayType('audio/ogg; codecs="opus"') !== '';
};

export interface ServerTtsEngineOptions {
  /** Defaults to `${config.api.url}` — the fluent-api base. */
  apiBaseUrl?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchFn?: FetchLike;
  /** Injectable Opus probe; defaults to `canBrowserPlayOpus`. */
  supportsOpus?: () => boolean;
}

/**
 * Server-backed engine: POSTs to fluent-api's `generate` proxy and resolves
 * the sibling-relative `audio_url` against the response URL (§7.1).
 */
export class ServerTtsEngine implements TtsEngine {
  private readonly apiBaseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly supportsOpus: () => boolean;

  constructor(options: ServerTtsEngineOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? config.api.url;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.supportsOpus = options.supportsOpus ?? canBrowserPlayOpus;
  }

  async synthesize(request: TtsRequest, signal?: AbortSignal): Promise<TtsClip> {
    // Seam (camelCase) → wire (snake_case). The translation lives here and
    // nowhere else; see the wire-payload note above.
    const body: TtsGenerateWireRequest = { text: request.text };
    if (request.langCode !== undefined) {
      // T18: send the language hint whenever the caller knows it.
      body.lang_code = request.langCode;
    }
    // §6.1: omit `format` by default — the server's TTS_DEFAULT_FORMAT
    // governs. Send 'mp3' only when the browser cannot play Opus. An explicit
    // caller-provided format wins (the engine never second-guesses it).
    if (request.format !== undefined) {
      body.format = request.format;
    } else if (!this.supportsOpus()) {
      body.format = 'mp3';
    }
    // T11: v1 omits `voice` — the wire slot exists and the server's configured
    // default applies. (A `pacing` slot was also reserved here; it was dropped
    // on 2026-08-11 as an unimplementable placeholder — see `tts.types.ts`.)

    const res = await this.fetchFn(`${this.apiBaseUrl}/ai/tts/generate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to generate TTS clip (HTTP ${res.status})`);
    }

    const wire = (await res.json()) as TtsGenerateWireResponse;
    // §7.1: `audio_url` is a sibling-relative reference. Resolving against the
    // RESPONSE URL (never string-concatenating a base) is what keeps the
    // serving choice server-side — the browser called fluent-api, so the
    // audio fetch goes to fluent-api. The absolute result is what makes the
    // returned `TtsClip` a different thing from the wire body.
    return { audioUrl: new URL(wire.audio_url, res.url).toString() };
  }
}

// ---------------------------------------------------------------------------
// Clip playback supervision — the §6.1 failure ladder
// ---------------------------------------------------------------------------

/** What a HEAD re-probe of the clip URL told us (§6.1). */
type ProbeOutcome =
  | { kind: 'admission'; retryAfterMs: number } // 503 — server busy, wait Retry-After
  | { kind: 'streaming' } // 200 — artifact fine, still in the streaming era
  | { kind: 'compressed' } // 302/opaqueredirect — immutable object exists
  | { kind: 'notFound' }; // 404 — URL no longer resolves; re-run generate, then reload

const parseRetryAfterMs = (res: Response, fallbackMs: number): number => {
  const header = res.headers.get('Retry-After');
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return fallbackMs;
};

const probeClipUrl = async (
  fetchFn: FetchLike,
  url: string,
  signal: AbortSignal,
  timing: TtsRecoveryTiming
): Promise<ProbeOutcome> => {
  // `redirect: 'manual'` keeps the 302 observable: followed redirects would
  // make "compressed exists" indistinguishable from a streaming-era 200.
  const res = await fetchFn(url, {
    method: 'HEAD',
    credentials: 'include',
    redirect: 'manual',
    signal,
  });
  if (res.status === 503) {
    return { kind: 'admission', retryAfterMs: parseRetryAfterMs(res, timing.defaultRetryAfterMs) };
  }
  if (res.status === 404) {
    return { kind: 'notFound' };
  }
  // Browsers surface a manual-mode redirect as an opaqueredirect (status 0);
  // test fakes and server runtimes surface the raw 3xx.
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    return { kind: 'compressed' };
  }
  return { kind: 'streaming' };
};

/** setTimeout under an AbortSignal — abort clears the timer and rejects. */
const delayUnderSignal = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

export interface ClipPlaybackSupervisionOptions {
  element: ClipAudioElement;
  /** Absolute clip URL (already resolved by `synthesize`). */
  audioUrl: string;
  /**
   * The clip's AbortSignal. Stop/navigation/queue-advance abort it, which
   * cancels every pending retry and watchdog timer immediately (CB1). This is
   * LOCAL-SAFE: aborting never issues any "cancel" call to the server — no
   * such endpoint exists; generation is detached (T21).
   */
  signal: AbortSignal;
  /** Re-runs `generate` for this clip (404 rung); resolves to a fresh absolute URL. */
  regenerate: () => Promise<string>;
  /** Fired once, on retry exhaustion. The engine renders nothing (§5.2). */
  onFailure: (error: TtsPlaybackError) => void;
  /**
   * Whether the clip may still be in the streaming era. When false (known
   * compressed), the stall watchdog never arms (§6.1 platform risk).
   */
  streamingEra?: boolean;
  fetchFn?: FetchLike;
  timing?: Partial<TtsRecoveryTiming>;
}

/**
 * Attach the §6.1 recovery ladder to a clip's element. Returns a detach
 * function (idempotent). Media errors are classified via HEAD re-probe; a
 * silent Safari-style stall is caught by the watchdog (N4) and recovered by
 * waiting for the compressed object.
 *
 * HEAD/element era skew is BENIGN — eras only advance (streaming →
 * compressed) and every probe outcome maps to a safe action (N5): 503 waits
 * and retries, 200/302 resets `src` and picks up whichever era now exists,
 * 404 regenerates. No outcome produces a wrong action, so no lock is needed —
 * do not add one.
 */
export const superviseClipPlayback = (options: ClipPlaybackSupervisionOptions): (() => void) => {
  const { element, signal, regenerate, onFailure } = options;
  const fetchFn = options.fetchFn ?? ((input: string, init?: RequestInit) => fetch(input, init));
  const timing: TtsRecoveryTiming = { ...DEFAULT_TTS_RECOVERY_TIMING, ...options.timing };

  let currentUrl = options.audioUrl;
  let compressedEra = options.streamingEra === false;
  let playbackStarted = false;
  let recovering = false;
  let detached = false;
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  const retries: Record<TtsFailureClass, number> = {
    admission: 0,
    midStream: 0,
    notFound: 0,
    stall: 0,
  };
  const unsubscribers: Array<() => void> = [];

  const detach = (): void => {
    if (detached) return;
    detached = true;
    disarmWatchdog();
    for (const unsubscribe of unsubscribers) unsubscribe();
    signal.removeEventListener('abort', detach);
  };

  const fail = (failureClass: TtsFailureClass, message: string): void => {
    detach();
    onFailure(new TtsPlaybackError(failureClass, message));
  };

  /** Bounded retries: at most `maxRetriesPerClass` PER failure class (CB1). */
  const budgetExhausted = (failureClass: TtsFailureClass): boolean => {
    retries[failureClass] += 1;
    return retries[failureClass] > timing.maxRetriesPerClass;
  };

  const disarmWatchdog = (): void => {
    if (watchdogTimer !== undefined) {
      clearTimeout(watchdogTimer);
      watchdogTimer = undefined;
    }
  };

  /** N4: only streaming-era clips that have not started playing are watched. */
  const armWatchdog = (): void => {
    disarmWatchdog();
    if (compressedEra || playbackStarted || detached || signal.aborted) return;
    watchdogTimer = setTimeout(() => {
      void handleStall();
    }, timing.stallWatchdogMs);
  };

  const reload = (): void => {
    if (detached || signal.aborted) return;
    resetClipElement(element, currentUrl);
    // `load()` leaves the element PAUSED — "play() is the only audible
    // trigger" (audioElement.ts). So recovery has to restart playback itself.
    // Without this the ladder repaired the source perfectly and left the
    // listener in silence: it classified the failure, re-authorized the clip,
    // pointed the element at the fresh URL — and never made a sound. That was
    // true of EVERY recovery class, not just the 404 rung (phase 09, found in
    // a browser once the clip-start teardown stopped masking it).
    void element.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        // The browser refused to resume without a fresh gesture. Nothing about
        // the clip is wrong, so no retry can help — surface it.
        fail('midStream', 'TTS playback was refused by the browser after recovery');
        return;
      }
      // Any other rejection means the new source failed too; the element fires
      // `error` for that and re-enters this ladder under its own retry budget.
    });
    armWatchdog();
  };

  const handleNotFound = async (): Promise<void> => {
    if (budgetExhausted('notFound')) {
      fail('notFound', 'TTS clip regenerate retries exhausted (HEAD 404)');
      return;
    }
    // §6.1/§7.2 rung 4: the clip URL stopped resolving — WHY is a backend
    // detail the frontend stays blind to. Self-heal by re-running `generate`
    // (which re-authorizes the clip) and reloading the element.
    currentUrl = await regenerate();
    reload();
  };

  const handleError = async (): Promise<void> => {
    if (detached || signal.aborted || recovering) return;
    recovering = true;
    disarmWatchdog();
    try {
      let outcome: ProbeOutcome;
      try {
        outcome = await probeClipUrl(fetchFn, currentUrl, signal, timing);
      } catch {
        if (signal.aborted) return;
        // The probe itself failed (network) — treat as a mid-stream abort.
        outcome = { kind: 'streaming' };
      }
      switch (outcome.kind) {
        case 'admission':
          if (budgetExhausted('admission')) {
            fail('admission', 'TTS admission retries exhausted (HEAD 503)');
            return;
          }
          await delayUnderSignal(outcome.retryAfterMs, signal);
          reload();
          return;
        case 'compressed':
          // The immutable object exists now — resetting src picks it up.
          compressedEra = true;
          if (budgetExhausted('midStream')) {
            fail('midStream', 'TTS mid-stream retries exhausted');
            return;
          }
          reload();
          return;
        case 'streaming':
          if (budgetExhausted('midStream')) {
            fail('midStream', 'TTS mid-stream retries exhausted');
            return;
          }
          await delayUnderSignal(timing.midStreamBackoffMs, signal);
          reload();
          return;
        case 'notFound':
          await handleNotFound();
          return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (signal.aborted || detached) return;
      fail('midStream', 'TTS recovery failed unexpectedly');
    } finally {
      recovering = false;
    }
  };

  /**
   * N4 wait-for-compressed: HEAD-poll the clip URL until it answers the 302
   * to the immutable object (which arrives naturally seconds later), then
   * reset `src` and reload. The compressed object has Content-Length/ETag/
   * Range — the strict-media-stack (Safari/iOS) happy path.
   */
  const handleStall = async (): Promise<void> => {
    if (detached || signal.aborted || recovering) return;
    recovering = true;
    try {
      if (budgetExhausted('stall')) {
        fail('stall', 'TTS stall recoveries exhausted');
        return;
      }
      for (let polls = 0; polls < timing.maxStallPolls; polls += 1) {
        let outcome: ProbeOutcome;
        try {
          outcome = await probeClipUrl(fetchFn, currentUrl, signal, timing);
        } catch {
          if (signal.aborted) return;
          await delayUnderSignal(timing.stallPollIntervalMs, signal);
          continue;
        }
        if (outcome.kind === 'compressed') {
          compressedEra = true;
          reload();
          return;
        }
        if (outcome.kind === 'notFound') {
          await handleNotFound();
          return;
        }
        const waitMs =
          outcome.kind === 'admission' ? outcome.retryAfterMs : timing.stallPollIntervalMs;
        await delayUnderSignal(waitMs, signal);
      }
      fail('stall', 'TTS wait-for-compressed poll budget exhausted');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (signal.aborted || detached) return;
      fail('stall', 'TTS stall recovery failed unexpectedly');
    } finally {
      recovering = false;
    }
  };

  if (signal.aborted) {
    detached = true;
    return detach;
  }

  signal.addEventListener('abort', detach, { once: true });
  unsubscribers.push(
    onClipEvent(element, 'error', () => {
      void handleError();
    }),
    // Progress/canplay prove the stream is alive; playing permanently ends
    // watchdog eligibility (§6.1: no watchdog once a clip is playing).
    onClipEvent(element, 'progress', disarmWatchdog),
    onClipEvent(element, 'canplay', disarmWatchdog),
    onClipEvent(element, 'playing', () => {
      playbackStarted = true;
      disarmWatchdog();
    })
  );
  armWatchdog();

  return detach;
};
