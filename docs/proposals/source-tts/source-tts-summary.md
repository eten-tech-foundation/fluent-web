# Source-Text Text-to-Speech — Review Summary

**Status:** Draft for product and engineering review.

**Purpose:** Reviewer orientation for source-text listening in Fluent. The full design lives in [`source-tts-suggestion.md`](source-tts-suggestion.md) (decisions **T1–T20**, §§1–15). The project board already has an empty **“Text to Speech”** draft item (`PVTI_lADOB8vK1s4A34c5zgfByGU`); this proposal supplies its design substance. Target-side recording is future work related to [fluent-web#84](https://github.com/eten-tech-foundation/fluent-web/issues/84).

**Document location:** The proposal pair intentionally lives in **fluent-web only**, even though synthesis/cache/audio endpoints will be implemented in fluent-api. One review surface presents the interaction and the contract that supports it; implementation later splits by repo.

## What is being proposed

Add two source-side controls to each visible verse:

- **Play this verse**.
- **Play from here**, advancing verse by verse with synchronized highlight, auto-scroll, and next-verse prefetch.

A shared Stop action appears whenever audio is loading or playing. Controls are keyboard-first, touch-target sized, reusable outside drafting, and read either visible source panel: project source or selected reference Bible. At a drafting chapter boundary, playback pauses and asks before navigating.

Version 1 uses Gemini TTS directly from fluent-api. Generated clips are compressed once, cached by content in Postgres, and delivered through immutable browser-cacheable audio URLs. The frontend and backend each have an abstraction seam so browser-local speech or a custom fluent-ai model can replace the first engine without changing the controls or public endpoint.

## Core decisions

1. **Reusable UI and queue (T1–T4, T7, T16–T17).** `features/tts/` owns controls, keyboard handling, sequencing, highlight/scroll, stop, and prefetch. The backend remains one-text-in/one-clip-out. The layout reserves a mirrored target-side record control for fluent-web#84, but recording is not implemented now.

2. **Two abstraction seams (T5).** fluent-web depends on `TtsEngine`; fluent-api depends on `TtsProvider`. Gemini is the v1 provider, while a future `FluentAiTtsProvider` can route low-resource languages to a custom model with zero fluent-web contract change.

3. **Text-addressed contract (T6, T11, T18).** `POST /ai/tts/synthesize` accepts exact visible `text`, requested `voice`/`format`, optional `langCode`, and a reserved pacing slot. It receives no project, Bible, chapter, or verse identity. The protocol carries future fields because **the protocol is much harder to change than the frontend presentation**; v1 exposes one configured voice and uses client-side `playbackRate`.

4. **Two-step immutable delivery (T8, T10).** POST returns a full `audioUrl`, `durationMs`, actual `format`, and content type. `<audio>` then GETs immutable compressed bytes with Range support. Same-origin cookie auth stays in v1 but is not load-bearing; full URLs preserve future R2/CDN/signed delivery without a web contract change.

5. **Postgres content cache (T9, T15).** Cache identity includes exact text, voice, model, language hint, pacing, actual format, and encoder profile. The standalone table stores compressed bytes, duration/size, and `last_accessed_at`; oldest entries are trimmed beyond `TTS_CACHE_MAX_BYTES`. Eviction is self-healing: stale GET 404 → repeat POST. This is intentionally unlike recordings, which are irreplaceable and should move toward R2.

6. **Format negotiation (T9, T20).** Prefer Opus-in-Ogg when probed native ffmpeg/libopus can produce it. If unavailable, silently return MP3 through an always-available pure-JS encoder floor such as `lamejs`; metadata declares the actual format and the cache keys it. `ffmpeg-static` is a packaging option to review. `ffmpeg.wasm` is reference/test-only, not adopted without team agreement.

7. **Narrow rollout and view-level access (T12–T14).** Add `sourceTts` / `EN_FEATURE_SOURCE_TTS`, derived safe-off unless `GOOGLE_AI_API_KEY` exists. Add `TTS_USE` as an alias of `project:view`: hearing follows seeing, and edit-level access would exclude reviewers. The only v1 cost guardrail is an env-configured 20,000-character default tripwire with a clear 400 error; rate limiting waits for usage evidence.

## Gemini facts rechecked while drafting (July 14, 2026)

Google currently labels Gemini TTS **Preview**. The full proposal records current names including `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`, and `gemini-2.5-pro-preview-tts`. The proposed v1 default is configurable `TTS_MODEL=gemini-2.5-flash-preview-tts`; published paid-tier standard pricing is currently $0.50 per million text tokens and $10 per million audio tokens (Pro: $1/$20).

The current `@google/genai` server-side call uses `ai.models.generateContent({ model, contents, config: { responseModalities: ['AUDIO'], speechConfig: ... } })`; audio arrives in `candidates[0].content.parts[0].inlineData.data` as base64 raw 24 kHz mono 16-bit PCM. fluent-api decodes PCM, then encodes and stores the negotiated compressed format. Preview names/prices stay in configuration and documentation, never the public protocol.

## Why duplicate the Google key on fluent-api

fluent-api needs `GOOGLE_AI_API_KEY` even if fluent-ai also holds a Google key. The recommended path is deliberate:

- Routing through fluent-ai would block TTS on that service being hosted.
- It adds a proxy-only hop with no Python value.
- It pushes audio through—or forces replacement of—a JSON ToolJobResponse-oriented path.
- The Postgres cache table belongs with fluent-api, which owns the database schema and drizzle migrations; tying the deliberately consumer-generic fluent-ai into that database would be an awkward coupling.
- A duplicate app-setting secret is operationally cheaper than another runtime dependency and audio transport layer.
- `TtsProvider` allows later consolidation into fluent-ai without changing fluent-web or `POST /ai/tts/synthesize`.

This is a v1 simplification, not a permanent exclusion of fluent-ai.

## Proposed defaults needing review

1. **Environment/model names:** `GOOGLE_AI_API_KEY`; `TTS_MODEL=gemini-2.5-flash-preview-tts`; `TTS_VOICE=Kore`; `TTS_MAX_TEXT_LENGTH=20000`; hosting-selected `TTS_CACHE_MAX_BYTES`; unset `EN_FEATURE_SOURCE_TTS` derives true only when the key exists.
2. **Loading/error UX:** activated play button becomes a spinner during synthesis; editor remains usable; Stop cancels local playback intent; failures use the established toast pattern and clear stale playback state.
3. **Encoder packaging:** prefer probed native ffmpeg/libopus; evaluate `ffmpeg-static`; guarantee a pure-JS MP3 floor.
4. **Cache capacity:** hosting selects `TTS_CACHE_MAX_BYTES` after checking database, backup, and deployment constraints.

## Future roadmap (not v1)

- Mirrored target recording and durable R2-backed media (fluent-web#84).
- Alternating source-TTS / recorded-target review queues.
- User-selectable browser-local Web Speech for cost/weak-network scenarios.
- Custom low-resource TTS hosted in fluent-ai.
- Voice picker and synthesis-time pacing.
- R2/CDN/signed URL delivery.
- Reuse on read-only source-Bible surfaces, potentially with cross-page continuation.
- Gemini streaming if first-audio latency later outweighs whole-clip cache simplicity.

## Areas where review is most valuable

1. Accept the duplicate-key simplification and future `TtsProvider` consolidation path.
2. Confirm view-level `TTS_USE = project:view` and the narrow `sourceTts` flag.
3. Validate native ffmpeg/Opus feasibility in the real hosting image and the pure-JS MP3 fallback choice.
4. Review the proposed env/model/voice names and loading/error UX defaults.
5. Confirm Postgres cache sizing/trim posture and the explicit distinction from durable user recordings.

External Gemini and encoding sources are linked in §15 of the full proposal.
