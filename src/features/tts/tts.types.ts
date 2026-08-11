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

/** Reserved synthesis-time pacing slot (T11) — protocol only, no v1 UI. */
export interface TtsPacing {
  mode?: string;
}

/** What a caller asks an engine to speak. The server engine maps this onto the
 * `POST /ai/tts/generate` wire body (§7.1); a local engine would not. */
export interface TtsRequest {
  /** Exact visible text to recite (T6 — the backend knows nothing of verses). */
  text: string;
  /** Requested logical/provider voice; v1 frontend omits it (T11). */
  voice?: string;
  /** Omitted unless the browser cannot play Opus (§6.1/§7.1). */
  format?: TtsFormat;
  /** ISO 639-3 hint, sent whenever the caller knows it (T18). */
  langCode?: string;
  /** Reserved; v1 never sends a non-null value (T11). */
  pacing?: TtsPacing;
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
export interface TtsClip {
  audioUrl: string;
}

/** The frontend seam (§6.1). Buttons/queues never know the transport. */
export interface TtsEngine {
  synthesize: (request: TtsRequest, signal?: AbortSignal) => Promise<TtsClip>;
}

/**
 * One continuous-mode queue entry (§5.3). Feature-agnostic on purpose (T3):
 * the host supplies text/langCode/refs, so the queue works on any future
 * source-scripture surface — it never reads drafting state itself.
 */
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

/**
 * Typed failure surfaced when a failure class exhausts its retry budget.
 * The engine renders nothing — the caller decides (toast for a playing clip,
 * silence for a prefetch — §5.2/§6.1).
 */
export class TtsPlaybackError extends Error {
  readonly failureClass: TtsFailureClass;

  constructor(failureClass: TtsFailureClass, message: string) {
    super(message);
    this.name = 'TtsPlaybackError';
    this.failureClass = failureClass;
  }
}
