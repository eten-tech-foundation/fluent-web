/**
 * Source-Text TTS — the engine seam and its supporting types.
 *
 * Shapes are exactly the proposal's §6.1 (T3/T5): the UI depends on
 * `TtsEngine`, never on fetch or a vendor. A future `WebSpeechTtsEngine`
 * (local, streaming) implements the same role without UI changes.
 *
 * These are SEAM types, not wire types, and they are camelCase like the rest
 * of the frontend. The `generate` HTTP payloads are snake_case (`lang_code`,
 * `audio_url` — §7.1, mirroring fluent-ai's Python names verbatim per decision
 * D8) and are declared in `engines/serverTtsEngine.ts`, the single module that
 * translates between the two. That split is what lets a wire-less local engine
 * satisfy this same seam.
 */

/**
 * Compressed formats the compression tail can produce (§7.1). Omitted on the
 * wire unless the browser cannot play Opus — the server's `TTS_DEFAULT_FORMAT`
 * governs the default (§6.1).
 */
export type TtsFormat = 'ogg-opus' | 'mp3';

/** What a caller asks an engine to speak. The server engine maps this onto the
 * `POST /ai/tts/generate` wire body (§7.1); a local engine would not.
 *
 * There is deliberately no `pacing` field. T11 originally reserved one for a
 * future synthesis-time cadence option; it was removed on 2026-08-11, before
 * any of this shipped, because it had no defined values, no UI, no provider
 * parameter and no testable behavior — it could only be guessed at. Adding an
 * optional field later is the cheap additive direction (the same reasoning that
 * makes fluent-api's request schema `.strict()` safe), so reserving it early
 * bought nothing. Playback speed stays `audio.playbackRate` (§6.2). */
export interface TtsRequest {
  /** Exact visible text to recite (T6 — the backend knows nothing of verses). */
  text: string;
  /** Requested logical/provider voice; v1 frontend omits it (T11). */
  voice?: string;
  /** Omitted unless the browser cannot play Opus (§6.1/§7.1). */
  format?: TtsFormat;
  /** ISO 639-3 hint, sent whenever the caller knows it (T18). */
  langCode?: string;
}

/**
 * A playable clip reference.
 *
 * `audioUrl` is ABSOLUTE by the time it reaches a caller: the engine resolves
 * the server's sibling-relative `audio_url` against the response URL on
 * receipt (§7.1), so the serving choice stays server-side. It is therefore a
 * DERIVED value, not the wire value — which is why this type is not the shape
 * of the response body.
 *
 * `durationMs` is deliberately absent (T8/§6.2): a streaming first listen has
 * no knowable duration, and once compressed the container header carries the
 * exact value for free. Do not "fix" it back in.
 */
/**
 * The container the clip is actually being served as, read off `audioUrl`.
 *
 * Distinct from {@link TtsFormat}, which is what a caller REQUESTS: `wav` is
 * never requestable — it is the streaming era's container, meaning this listen
 * paid for a fresh synthesis — while `ogg`/`mp3` mean the compressed artifact
 * already existed and the URL points at R2.
 *
 * Available only because `generate` names the compressed object directly when
 * one exists (§7.1, amended 2026-08-20). Nothing else in the browser exposes
 * it: a media element that follows a 302 still reports the ORIGINAL URL as
 * `currentSrc`, and cross-origin resource timing hides the redirect entirely
 * unless the bucket sends `Timing-Allow-Origin` — both measured in Chrome on
 * 2026-08-20.
 *
 * One-directional inaccuracy, by design: an artifact compressed BETWEEN
 * `generate` and the first GET still reads `wav`, so this can under-report a
 * cache hit and never over-report one. Reality is better than reported, which
 * is the safe direction for the thing it is used to check.
 */
export type TtsServedFormat = 'wav' | 'ogg' | 'mp3';

export interface TtsClip {
  audioUrl: string;
  /** Absent when the URL names no container this build recognises. */
  servedAs?: TtsServedFormat;
}

/** The frontend seam (§6.1). Buttons/queues never know the transport. */
export interface TtsEngine {
  synthesize: (request: TtsRequest, signal?: AbortSignal) => Promise<TtsClip>;
}

/** Source text supplied by a host to the TTS resolver, not a player queue entry. */
export interface TtsQueueItem {
  /** Host-meaningful row identity (highlight/scroll target); opaque here. */
  verseRef: string;
  /** Exact visible text to recite (T6). Empty ⇒ the row is not playable. */
  text: string;
  /** ISO 639-3 hint when the host knows it (T18). */
  langCode?: string;
  /** Which source the text came from (panel 1 project source / panel 2 Bible). */
  audioSource?: string;
}

/**
 * Failure classes for the engine's fetch-control-plane recovery ladder (§6.1).
 * Retries are bounded PER CLASS per clip (CB1).
 */
export type TtsFailureClass =
  | 'admission' // HEAD saw 503 — server busy; wait Retry-After, quiet retry
  | 'midStream' // HEAD saw 200/302 — artifact fine, element hit a mid-stream abort; reset src
  | 'notFound' // HEAD saw 404 — the clip URL no longer resolves (why is a backend detail); re-run generate, then reload
  | 'stall'; // streaming-era clip made no progress — wait-for-compressed recovery (N4)
