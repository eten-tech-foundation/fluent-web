/**
 * Server-backed text synthesis. Recovery policy lives in TtsRecoveryStrategy;
 * the temporary supervision export keeps callers working during the queue migration.
 */

import { config } from '@/lib/config';

import { type ClipAudioElement } from '../lib/audioElement';
import { supervisePlayback } from '../lib/playbackRecovery';
import { TtsRecoveryStrategy } from '../strategies/ttsRecoveryStrategy';
import {
  DEFAULT_TTS_RECOVERY_TIMING,
  type TtsRecoveryTiming,
} from '../strategies/ttsRecoveryTiming';
import {
  type TtsClip,
  type TtsServedFormat,
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

export {
  DEFAULT_TTS_RECOVERY_TIMING,
  type TtsRecoveryTiming,
} from '../strategies/ttsRecoveryTiming';

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
    const audioUrl = new URL(wire.audio_url, res.url).toString();
    return { audioUrl, servedAs: servedFormatOf(audioUrl) };
  }
}

// ---------------------------------------------------------------------------
// Clip playback supervision — the §6.1 failure ladder
// ---------------------------------------------------------------------------

/**
 * Read the container off a clip URL (§7.1, amended 2026-08-20).
 *
 * `.wav` is the streaming sibling — this listen is paying for a synthesis.
 * `.ogg`/`.mp3` mean `generate` found the compressed object and named it
 * directly, so the bytes come from R2. That is the whole diagnostic, and it
 * costs nothing: the URL is already in hand.
 *
 * Parsed from the PATHNAME rather than the raw string so a query or fragment
 * cannot be mistaken for an extension.
 */
export const servedFormatOf = (audioUrl: string): TtsServedFormat | undefined => {
  let pathname: string;
  try {
    pathname = new URL(audioUrl).pathname;
  } catch {
    pathname = audioUrl;
  }
  const match = /\.(wav|ogg|mp3)$/i.exec(pathname);
  return match ? (match[1].toLowerCase() as TtsServedFormat) : undefined;
};

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

/** Temporary compatibility adapter while the queue migrates to source segments. */
export const superviseClipPlayback = (options: ClipPlaybackSupervisionOptions): (() => void) => {
  const timing = { ...DEFAULT_TTS_RECOVERY_TIMING, ...options.timing };
  return supervisePlayback({
    element: options.element,
    source: { url: options.audioUrl, durationIsMeasured: false },
    recovery: new TtsRecoveryStrategy({
      regenerate: async () => ({ url: await options.regenerate(), durationIsMeasured: false }),
      streamingEra: options.streamingEra,
      fetchFn: options.fetchFn,
      timing,
    }),
    signal: options.signal,
    maxRetriesPerClass: timing.maxRetriesPerClass,
    maxStallPolls: timing.maxStallPolls,
    onGiveUp: (reason, charge) => {
      // Preserve the legacy typed callback: unexpected generate failures were
      // midStream errors, even when the last retry charged the notFound bucket.
      const unexpected =
        reason === 'TTS recovery failed unexpectedly' ||
        reason === 'TTS stall recovery failed unexpectedly';
      const failureClass = unexpected ? 'midStream' : ((charge ?? 'midStream') as TtsFailureClass);
      options.onFailure(new TtsPlaybackError(failureClass, reason));
    },
    onAutoplayRefused: () => {
      options.onFailure(
        new TtsPlaybackError('midStream', 'TTS playback was refused by the browser after recovery')
      );
    },
  });
};
