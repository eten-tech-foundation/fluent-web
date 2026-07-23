# Source-Text Text-to-Speech — Review Summary

**Status:** Revised after the second engineering review round (PR #356, 2026-07-21). Draft for re-review.

**Purpose:** Reviewer orientation for source-text listening in Fluent. The full design lives in [`source-tts-suggestion.md`](source-tts-suggestion.md) (decisions **T1–T26**, §§1–15; a revision-history block near the top lists what changed in response to each review round). The project board already has an empty **“Text to Speech”** draft item (`PVTI_lADOB8vK1s4A34c5zgfByGU`); this proposal supplies its design substance. Target-side recording is future work related to [fluent-web#84](https://github.com/eten-tech-foundation/fluent-web/issues/84).

**Document location:** The proposal pair intentionally lives in **fluent-web only**, even though synthesis and audio serving are implemented in fluent-ai with fluent-api as the authenticated front door. One review surface presents the interaction and the contract that supports it; implementation later splits by repo.

## What changed in this revision (2026-07-21 review round)

- **Disk staging is gone; generation buffers live in heap RAM** under an enforced byte budget (`TTS_MAX_BUFFERED_BYTES` + 503 admission control). fluent-ai’s production container has a read-only root filesystem, so the `.wav.incomplete` staging design had no writable home. No tmpfs, no container change, no janitor.
- **Generation is lazy and sidecar-driven.** `generate` no longer synthesizes: it writes an immutable **request sidecar** to R2 (conditional PUT) and returns the `audioUrl`. The first `get-audio` spawns synthesis and streams it live; nobody pays for a clip nobody listens to, and any replica can (re)generate from the sidecar. Because the serving request is the one that spawns synthesis, there can also be no disparity between which replica generated a clip and which replica serves it.
- **One sidecar became two.** The request sidecar is the durable capability + recipe; the receipt is best-effort metadata (no text, no user ids) and is **no longer a commit marker** — R2 PUTs are atomic, so the audio object is self-certifying.
- **The serving default flips to option (b):** fluent-api proxies `get-audio`; compressed bytes answer a **302 to the public R2 custom domain**, so heavy traffic bypasses both services. fluent-ai keeps zero public ingress. Option (a) direct serving is the documented future path.
- **Instance topology is a declared deployment requirement, not a coordination design:** the platform must provide either a single fluent-ai instance or static routing of `get-audio` requests to instances (hash-on-path is the natural key), with a satisfaction ladder (single replica → LB affinity → consistent-hash-on-path → nothing). **Exactly one worker process per container is a hard requirement.** The lifespan compression poller is gone — compression is the tail of each generation task.
- **`durationMs` is dropped from the `generate` response**; duration is a property of the media (streaming first listen has none; the compressed container carries it afterward).

Retained from the first round (2026-07-16): synthesis lives in fluent-ai (not fluent-api); the Postgres cache is eliminated in favor of the content-addressed artifact store; HMAC-over-versioned-recipe identity with provider-declared non-byte-affecting fields; ffmpeg via a bundling pip package with transcode-mcp as the alternative; Gemini facts refreshed (Interactions API GA, streaming verified for ≥ 3.1 TTS models).

## What is being proposed

Add two source-side controls to each visible verse:

- **Play this verse**.
- **Play from here**, advancing verse by verse with synchronized highlight, auto-scroll, and next-verse prefetch.

A shared Stop action appears whenever audio is loading or playing. Controls are keyboard-first, touch-target sized, reusable outside drafting, and read either visible source panel: project source or selected reference Bible. At a drafting chapter boundary, playback pauses and asks before navigating.

Version 1 synthesizes with Gemini TTS inside fluent-ai. `generate` records an immutable request sidecar on R2; the first listen spawns the actual synthesis, and audio streams to the listener **while it is being generated** from an in-heap buffer. The same task then compresses the clip through ffmpeg and uploads it to R2, where subsequent listens are served via a 302 from durable storage. The frontend has an engine seam so browser-local speech or a custom fluent-ai model can replace the first engine without changing the controls. Looking ahead, the playback queue is deliberately shaped so that once target-side recordings exist, a single play action could alternate between the synthesized source verse and the recorded target verse — a fully audio-driven review pass.

## Core design

1. **Reusable UI and queue (T1–T4, T7, T16–T17).** `features/tts/` owns controls, keyboard handling, sequencing, highlight/scroll, stop, and prefetch. The backend remains one-text-in/one-clip-out. The layout reserves a mirrored target-side record control for fluent-web#84, but recording is not implemented now.

2. **One home for AI logic (T5).** fluent-ai owns the Gemini call, artifact storage, and audio production; fluent-web reaches both `generate` and `get-audio` through fluent-api’s existing authenticated AI proxy (cookie + `TTS_USE` permission → `X-API-Key`). fluent-ai acquires no public ingress. A future custom low-resource model is another provider inside fluent-ai with no contract change.

3. **Text-addressed, content-addressed (T6, T18).** The request carries exact visible `text`, a `format` (`ogg-opus` or `mp3`, chosen by the client via `canPlayType`), optional `voice`/`langCode`, and a reserved pacing slot — no project, Bible, chapter, or verse identity. Artifact identity is an HMAC (server secret) over a `v1:`-prefixed canonical recipe including `format` (an mp3 and an opus rendering of the same text are distinct artifacts); each provider declares which fields cannot affect its output bytes, and those are normalized out of the hash.

4. **Lazy heap generation with a serving waterfall (T8, T21–T22, T25).** `generate` writes the request sidecar and returns a URL — no synthesis. The first `get-audio` passes an admission gate (RAM byte budget; over budget → brief wait then `503` + `Retry-After` before any body bytes), spawns a detached generation task that buffers PCM in heap, and streams it live behind a streaming WAV header (never-backfilled `0xFFFFFFFF` sizes). On provider failure the stream **aborts as a network error, never a clean EOF** — a truncated WAV would look like a short verse — and there is no server-side retry; the client re-enters through admission. The waterfall: live heap entry → compressed R2 object (302) → request sidecar (spawn generation) → 404, which the client heals by re-calling `generate`.

5. **Compression as the task tail; two sidecars (T9, T23–T24).** After synthesis completes, the same task HEADs the target object, pipes the buffer through ffmpeg (`asyncio.subprocess`, small semaphore, default concurrency 1 — no temp file), uploads with a conditional PUT (`If-None-Match: *`), then uploads the receipt **last**. The receipt carries format/duration/sizes but no text or user identifiers, and nothing may require it: the audio object’s presence is the commit. No eviction in v1: compressed whole-Bible-scale storage on R2 is cents per month, consciously accepted — and no-eviction is also what makes a synthesized hash a spent, non-replayable capability.

6. **Serving posture (T10).** Default is **option (b)**: fluent-api fronts `get-audio` behind the session cookie (its internal fetch uses `redirect: 'manual'` and passes streams through unbuffered). Compressed bytes 302 to the capability-secured public R2 custom domain, so the proxy carries only the generate call, tiny 302s, and first-listen WAV. The divergence from team decision D10 at the artifact-bytes hop is explicitly acknowledged (§11.1); the full-proxy variant (every byte behind auth) is the documented fallback if the team rules D10 extends that far. Noted tension: future target recordings carry a user’s voice and will need authenticated serving regardless.

7. **Process topology (T26).** The generation dict is per-process state: **exactly one application process per container (`workers=1`) is a hard requirement**, pinned in deployment config. Instance topology is handed to deployment as a **declared requirement rather than a coordination design** — the proposal does not assume knowledge of fluent-ai’s current instance count or coordination facilities: **provide either a single fluent-ai instance, or static routing of `get-audio` requests to instances** (consistent hashing on the URL path is the natural key — the hash is the content identity). Browsers issue several requests per clip, so unrouted multi-instance would duplicate synthesis; every fallback rung (single replica → LB affinity → hash-on-path → nothing) remains _correct_ (sidecar self-heal + conditional PUT), so an unmet requirement costs money, never correctness. This is the named problem to solve if fluent-ai ever scales beyond one instance.

8. **Narrow rollout and view-level access (T12–T14).** `sourceTts` / `EN_FEATURE_SOURCE_TTS` only tells the frontend to hide the UI — the backend never disables the service — and a hidden frontend override supports pre-release demos (a missing Gemini key plus the override is itself a valid error-path test). `TTS_USE` aliases `project:view`: hearing follows seeing, on both routes. The v1 cost guardrails are the 20,000-character tripwire and the RAM admission cap; Gemini’s own ~655-second output cap is the effective provider ceiling.

## Gemini facts (rechecked July 14–16, 2026)

Gemini TTS models remain **Preview**, but the Interactions API surface is now **GA**. The proposed default is configurable `TTS_MODEL=gemini-3.1-flash-tts-preview`; paid-tier pricing is $1 per million text tokens and $20 per million audio tokens (≈ $0.0005 per generated second before artifact reuse). **Streaming is supported for TTS models ≥ 3.1**, which is what enables hearing the first verse while the rest synthesizes; a non-streaming provider degrades gracefully (the buffer simply fills completely before serving begins). A documented glitch — occasional text tokens in an audio response — surfaces as a failed generation whose readers abort; the client’s single retry re-enters through normal admission (there is deliberately no server-side retry). The SDK dependency is pinned as a floor (`google-genai>=1.73.1`), with implementation-time verification called out in §8.2.

## Proposed defaults needing review

1. **Serving posture:** option (b) proxy default with capability-secured public R2 for compressed bytes; explicit D10-divergence acknowledgment (§7.3, §11.1).
2. **fluent-ai environment:** `TTS_MODEL=gemini-3.1-flash-tts-preview`; `TTS_VOICE=Kore`; `TTS_MAX_TEXT_LENGTH=20000`; new `TTS_HASH_SECRET`; `TTS_MAX_BUFFERED_BYTES` (RAM budget); `TTS_FFMPEG_CONCURRENCY` (default 1); `TTS_DEFAULT_FORMAT` (`ogg-opus` proposed, for requests that omit `format`); `TTS_R2_PREFIX` (folder path within the R2 bucket, with `requests/`, `audio/`, `receipts/` beneath it); `TTS_PUBLIC_AUDIO_BASE_URL` (the public custom domain); R2 bucket/credentials.
3. **Transcode packaging:** Python pip package bundling ffmpeg (suggested) vs the shared transcode-mcp container (workable alternative).
4. **Loading/error UX:** spinner until playback starts; editor remains usable; Stop cancels local playback intent; failures use the established toast pattern; a mid-stream provider failure is audible (playback stops, one clip restart) — accepted v1 residual.

## Future roadmap (not v1)

- Mirrored target recording with **authenticated** R2-backed storage (fluent-web#84).
- Alternating source-TTS / recorded-target review queues.
- User-selectable browser-local Web Speech for cost/weak-network scenarios.
- Custom low-resource TTS provider in fluent-ai (declaring its own byte-affecting fields).
- Voice picker and synthesis-time pacing via the reserved protocol fields.
- Option (a) direct serving from fluent-ai, priced honestly as a public-ingress deployment change; signed URLs if the serving posture tightens.
- Reuse on read-only source-Bible surfaces, potentially with cross-page continuation.
- Age-based R2 lifecycle rules only if storage growth ever escapes the cents-per-month arithmetic (noting eviction reopens the capability-replay window).

## Areas where review is most valuable

1. **Is the serving posture acceptable?** The default keeps both application endpoints authenticated behind fluent-api and 302-redirects compressed bytes to a public R2 custom domain, where the HMAC-keyed file name is the capability — nobody can fetch a clip without first having been authorized to generate it, the bucket is not listable, and the worst a leaked URL exposes is machine-read scripture. This diverges from D10 one hop past the API boundary and is flagged as such (§11.1); the fallback, if the team wants every byte behind auth, is the documented full-proxy variant at the cost of audio egress through the API pod.
2. **Is the no-database, no-filesystem artifact store acceptable?** A clip exists in a generation entry’s heap buffer, on R2, or not at all — plus an immutable request sidecar recording that its generation was authorized and how to (re)do it. There is no index that could disagree with the bytes, and no lock object that could be stranded by a crash: dedup rests on conditional PUTs and in-process attachment, and the receipt is a receipt, not a commit marker (§9).
3. **Is the memory/topology posture acceptable?** Generation buffers are heap RAM under `TTS_MAX_BUFFERED_BYTES` (~31 MB worst case per clip; verse clips are far smaller), with 503 admission control rather than an OOM risk, and fluent-ai pinned to one process per container (§9.2, §10.1). The topology requirement is passed to deployment: either a single fluent-ai instance, or static routing of `get-audio` requests to instances (hash-on-path). Confirm the platform can pin `workers=1`, confirm which of those two it satisfies today, and confirm someone can provision the custom public domain.
4. **Which ffmpeg does the transcoder use?** The compression tail needs ffmpeg. Suggested: a Python pip package that bundles the ffmpeg binary, so it arrives as an ordinary dependency of fluent-ai with no hosting change. Alternative: the containerized ffmpeg service the team has discussed (klappy/transcode-mcp), which would replace the local subprocess call with a network call once that service exists (§10.2). Also confirm someone can provision the R2 bucket and credentials.
5. **Access and rollout semantics.** Hearing scripture is gated at view level (`TTS_USE` aliases `project:view`) rather than edit level, so reviewers are not locked out. The `sourceTts` feature flag only hides the frontend buttons — the backend stays live regardless — and a hidden frontend override can reveal the buttons for demos before launch. Confirm these match expectations.
6. **Names and small defaults.** The proposed fluent-ai environment variables, the `gemini-3.1-flash-tts-preview` model and `Kore` voice defaults, and the loading/error UX (spinner until playback starts, toast on failure) are all flagged as proposals, not settled facts (§5.2, §8.4).

External Gemini, R2, and transcoding sources are linked in §15 of the full proposal.
