# Source-Text Text-to-Speech — Review Summary

**Status:** Revised after engineering review (PR #356, 2026-07-15). Draft for re-review.

**Purpose:** Reviewer orientation for source-text listening in Fluent. The full design lives in [`source-tts-suggestion.md`](source-tts-suggestion.md) (decisions **T1–T24**, §§1–15; a revision-history block near the top lists what changed in response to review). The project board already has an empty **“Text to Speech”** draft item (`PVTI_lADOB8vK1s4A34c5zgfByGU`); this proposal supplies its design substance. Target-side recording is future work related to [fluent-web#84](https://github.com/eten-tech-foundation/fluent-web/issues/84).

**Document location:** The proposal pair intentionally lives in **fluent-web only**, even though synthesis and audio serving are implemented in fluent-ai with fluent-api as the authenticated proxy. One review surface presents the interaction and the contract that supports it; implementation later splits by repo.

## What changed in this revision

- Synthesis moved **from fluent-api into fluent-ai**; fluent-api keeps only its established authenticated AI-proxy role, and no Google key is duplicated.
- The **Postgres cache is eliminated**. Generated audio is a content-addressed artifact: staged on fluent-ai’s filesystem while synthesizing, then transcoded and uploaded to **Cloudflare R2**. No database anywhere in the design.
- Artifact identity is an **HMAC over a versioned canonical recipe**, with providers declaring non-byte-affecting fields — Gemini normalizes `langCode` out, so hinted and unhinted requests share one artifact and one billing event.
- Transcoding uses ffmpeg in an in-process worker: a Python package bundling ffmpeg is suggested; the team’s containerized ffmpeg (klappy/transcode-mcp) is documented as a workable alternative.
- Gemini facts refreshed: the Interactions API is now **GA**, and TTS **streaming is verified available** for ≥ 3.1 models including the proposed default.

## What is being proposed

Add two source-side controls to each visible verse:

- **Play this verse**.
- **Play from here**, advancing verse by verse with synchronized highlight, auto-scroll, and next-verse prefetch.

A shared Stop action appears whenever audio is loading or playing. Controls are keyboard-first, touch-target sized, reusable outside drafting, and read either visible source panel: project source or selected reference Bible. At a drafting chapter boundary, playback pauses and asks before navigating.

Version 1 synthesizes with Gemini TTS inside fluent-ai. Audio streams to the listener **while it is being generated**; a background worker then compresses the finished clip and uploads it to R2, where subsequent listens are served from durable storage. The frontend has an engine seam so browser-local speech or a custom fluent-ai model can replace the first engine without changing the controls. Looking ahead, the playback queue is deliberately shaped so that once target-side recordings exist, a single play action could alternate between the synthesized source verse and the recorded target verse — a fully audio-driven review pass.

## Core design

1. **Reusable UI and queue (T1–T4, T7, T16–T17).** `features/tts/` owns controls, keyboard handling, sequencing, highlight/scroll, stop, and prefetch. The backend remains one-text-in/one-clip-out. The layout reserves a mirrored target-side record control for fluent-web#84, but recording is not implemented now.

2. **One home for AI logic (T5).** fluent-ai owns the Gemini call, artifact storage, and audio serving; fluent-web reaches `generate` through fluent-api’s existing authenticated AI proxy (cookie + `TTS_USE` permission → `X-API-Key`). A future custom low-resource model is another provider inside fluent-ai with no contract change.

3. **Text-addressed, content-addressed (T6, T18).** The request carries exact visible `text`, a `format` (`ogg-opus` or `mp3`, chosen by the client via `canPlayType`), optional `voice`/`langCode`, and a reserved pacing slot — no project, Bible, chapter, or verse identity. Artifact identity is an HMAC (server secret) over a `v1:`-prefixed canonical recipe including `format` (an mp3 and an opus rendering of the same text are distinct artifacts); each provider declares which fields cannot affect its output bytes, and those are normalized out of the hash.

4. **Staging waterfall with streaming (T8, T21–T22).** New synthesis writes `{hash}.wav.incomplete`, created with `O_EXCL` — a single-writer lock that is the guard against duplicate provider billing (double-clicked play). `get-audio` resolves: in-progress file (tail-follow live stream, streaming WAV header with never-backfilled `0xFFFFFFFF` sizes) → finished local `.wav` → R2 `.ogg`/`.mp3` (302 redirect) → 404, which the client heals by re-calling `generate`. Stale `.incomplete` files are detected by mtime and cleaned inline by the waterfall; provider failures get a small bounded auto-retry before the lock is released.

5. **Compression worker and sidecar receipts (T9, T23–T24).** An asyncio task started from fluent-ai’s FastAPI lifespan polls staging, transcodes via ffmpeg (`asyncio.subprocess`), uploads audio first and a JSON metadata sidecar **last** — the sidecar is the commit marker and permanent receipt (format, duration, sizes), never updated afterward. No eviction in v1: compressed whole-Bible-scale storage on R2 is cents per month, consciously accepted.

6. **Serving options (T10).** Floated as two options with (a) suggested: **(a)** unauthenticated `get-audio`/public R2 — “authentication is knowing the hash,” which the HMAC secret makes unguessable; **(b)** fluent-api proxies all audio. Noted tension: future target recordings carry a user’s voice and will need authenticated serving regardless.

7. **Narrow rollout and view-level access (T12–T14).** `sourceTts` / `EN_FEATURE_SOURCE_TTS` only tells the frontend to hide the UI — the backend never disables the service — and a hidden frontend override supports pre-release demos (a missing Gemini key plus the override is itself a valid error-path test). `TTS_USE` aliases `project:view`: hearing follows seeing. The only v1 cost guardrail is the 20,000-character tripwire; Gemini’s own ~655-second output cap is the effective provider ceiling.

## Gemini facts (rechecked July 14–16, 2026)

Gemini TTS models remain **Preview**, but the Interactions API surface is now **GA**. The proposed default is configurable `TTS_MODEL=gemini-3.1-flash-tts-preview`; paid-tier pricing is $1 per million text tokens and $20 per million audio tokens (≈ $0.0005 per generated second before artifact reuse). **Streaming is supported for TTS models ≥ 3.1**, which is what enables hearing the first verse while the rest synthesizes; a non-streaming provider degrades gracefully (the staging file still acts as lock and existence marker, and serving waits for completion). A documented glitch — occasional text tokens in an audio response — is covered by the bounded retry.

## Proposed defaults needing review

1. **Serving option:** (a) unauthenticated hash-secret serving (suggested) vs (b) full fluent-api proxy.
2. **fluent-ai environment:** `TTS_MODEL=gemini-3.1-flash-tts-preview`; `TTS_VOICE=Kore`; `TTS_MAX_TEXT_LENGTH=20000`; new `TTS_HASH_SECRET`; `TTS_STAGING_DIR`; `TTS_DEFAULT_FORMAT` (`ogg-opus` proposed, for requests that omit `format`); `TTS_R2_PREFIX` (folder path within the R2 bucket); R2 bucket/credentials.
3. **Transcode packaging:** Python pip package bundling ffmpeg (suggested) vs the shared transcode-mcp container (workable alternative).
4. **Loading/error UX:** spinner until playback starts; editor remains usable; Stop cancels local playback intent; failures use the established toast pattern.

## Future roadmap (not v1)

- Mirrored target recording with **authenticated** R2-backed storage (fluent-web#84).
- Alternating source-TTS / recorded-target review queues.
- User-selectable browser-local Web Speech for cost/weak-network scenarios.
- Custom low-resource TTS provider in fluent-ai (declaring its own byte-affecting fields).
- Voice picker and synthesis-time pacing via the reserved protocol fields.
- CDN in front of R2; signed URLs if the serving posture tightens.
- Reuse on read-only source-Bible surfaces, potentially with cross-page continuation.
- Age-based R2 lifecycle rules only if storage growth ever escapes the cents-per-month arithmetic.

## Areas where review is most valuable

1. **How should finished audio be served — publicly or proxied?** Two options are floated in §7.3. Option (a), the suggested one: audio URLs are unauthenticated, but the file name is an HMAC hash computed with a server secret, so nobody can fetch a clip without first having been authorized to generate it — "knowing the URL" is the credential, and the worst a leaked URL exposes is machine-read scripture. Option (b): fluent-api proxies every audio byte behind normal cookie auth, at the cost of pushing all audio through two services. One caution is recorded either way: future _user recordings_ carry a real person's voice and must get authenticated serving even if TTS audio does not.
2. **Is the no-database artifact store acceptable?** Instead of a Postgres cache table, a clip either exists as a file (locally while being generated, on R2 afterward) or it does not — there is no index that could disagree with the bytes. The pieces that make this safe are spelled out in §9: the hash recipe that names each clip, the rule that a provider hint like `langCode` is dropped from the hash when it cannot change the audio (so no duplicate billing), the small JSON "sidecar" uploaded last as the proof a clip is complete, and the decision to never delete anything in v1 because whole-Bible-scale storage costs cents per month.
3. **Which ffmpeg does the transcoder use?** The worker that compresses finished WAVs needs ffmpeg. Suggested: a Python pip package that bundles the ffmpeg binary, so it arrives as an ordinary dependency of fluent-ai with no hosting change. Alternative: the containerized ffmpeg service the team has discussed (klappy/transcode-mcp), which would replace the local subprocess call with a network call once that service exists (§10.2). Also confirm someone can provision the R2 bucket and credentials.
4. **Access and rollout semantics.** Hearing scripture is gated at view level (`TTS_USE` aliases `project:view`) rather than edit level, so reviewers are not locked out. The `sourceTts` feature flag only hides the frontend buttons — the backend stays live regardless — and a hidden frontend override can reveal the buttons for demos before launch. Confirm these match expectations.
5. **Names and small defaults.** The proposed fluent-ai environment variables, the `gemini-3.1-flash-tts-preview` model and `Kore` voice defaults, and the loading/error UX (spinner until playback starts, toast on failure) are all flagged as proposals, not settled facts (§5.2, §8.4).

External Gemini, R2, and transcoding sources are linked in §15 of the full proposal.
