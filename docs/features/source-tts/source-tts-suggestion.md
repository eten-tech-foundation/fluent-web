# Source-Text Text-to-Speech — Proposal

> **Superseded for playback design (2026-09).** See [Audio playback design](../audio-playback/design.md) for controls, provenance, recorded-audio fallback, and the licence fence. The synthesis contract, recipe identity, and generation-heap design below remain applicable.

**Historical review context:** This proposal was revised after the third engineering review round (PR #356, kaseywright, 2026-07-28). Its playback decisions have since been superseded by the audio playback design above.

## TL;DR

- This is the detailed synthesis and artifact-store proposal. Use the [audio playback design](../audio-playback/design.md) for the current controls, recorded-source selection, provenance, and licence fence.
- `generate` writes an immutable request sidecar without buying speech; on a cache miss, `get-audio` streams a newly generated clip through the authenticated API path.
- A finished clip is compressed into recipe-addressed R2 storage, so later listens can use a cached artifact. The recipe includes byte-affecting choices such as format; admission and clip limits bound memory use.
- fluent-ai owns synthesis and storage, fluent-api fronts the routes, and the frontend supplies only text cleared for synthesis. Deployment sizing and rollout checks live in the [capacity guide](https://github.com/eten-tech-foundation/fluent-ai/blob/main/docs/features/source-tts/source-tts-capacity.md) and [operations guide](source-tts-operations.md).
- This historical proposal also records earlier review trade-offs and future engines and recording ideas; its older playback details do not override the current design.

**Reviewer shortcut:** A condensed, stands-on-its-own summary lives in [`source-tts-summary.md`](source-tts-summary.md).

**Scope:** Add source-text listening to Fluent, beginning in the drafting grid. The user-facing controls belong to fluent-web; synthesis, artifact storage, and audio delivery belong to **fluent-ai**, with fluent-api acting as the authenticated front door for both generation and audio fetches — fluent-ai itself stays an internal service. **This proposal intentionally lives in fluent-web only even though endpoints are implemented in fluent-ai and fluent-api**, so reviewers can evaluate the interaction and its supporting contract as one design.

## Revision history

**Change made during implementation (2026-08-16): the text limit and clip ceiling are one dial, sized against a corpus survey, and their current values now live in fluent-ai rather than here.**

- **`TTS_MAX_TEXT_LENGTH` and `TTS_MAX_CLIP_BYTES` are not independent, and the proposal's numbers for both were sized against too little evidence.** They are bound by `text limit × PCM bytes per character ≤ clip ceiling`: break it and an oversized text is accepted, hashed, given a sidecar, billed and synthesized for minutes before being killed mid-stream, where a consistent pair refuses it at the door for free. So raising the text limit always raises the ceiling, and raising the ceiling always costs admission slots (`slots = ⌊budget / ceiling⌋`). One dial — _how long a verse do we support_ — not three knobs.
- **The evidence is now a survey rather than an estimate.** 1,005 translations, **11,227,230 verses**, Protestant canon, excluding range-merges: median **139** characters, p99.9 **642**, and a genuine maximum of **6,504** (`1KI 12:24` carries the Septuagint's long addition as one verse in LXX-based English Bibles). §7.1's original `20000` was far above any verse; a later implementation value derived from a single translation was far below the real maximum and would have refused verses outright. The chosen point refuses **12 verses in 11.2 million**, all Septuagint mega-additions in a handful of English study Bibles.
- **§8.4 keeps the relationship; fluent-ai keeps the numbers.** The originally proposed 256 MiB ⇒ 8-slot figure stays here as the reviewed baseline, but this document no longer asserts a current slot count — the values and the full knob table (what to set to support what, and how much container RAM each level needs) live in **`fluent-ai/docs/features/source-tts/source-tts-capacity.md`**, next to the settings themselves. This is deliberate: the bytes-per-character rate was measured on one English clip, so the ceiling is expected to be tuned again, and a number that will keep changing should have exactly one home.

**Change made during implementation (2026-08-16): the admission budget gets a stall timeout, and §8.4's table gains the two lifetime bounds — plus the two admission dials, so the table is now the complete shipped set.**

- **`TTS_ADMISSION_WAIT_SECONDS` (3.0 s) and `TTS_RETRY_AFTER_SECONDS` (5 s) were shipped settings with no row.** Their _values_ were reviewed and accepted; their absence from the table was the oversight. §9.2 already described both behaviours — "briefly waits … a couple of seconds", "`503` + `Retry-After` before any header bytes" — but named neither variable, so the two dials that govern what a burst past the RAM budget _feels_ like were invisible to anyone provisioning from §8.4. The observable cost of leaving them out is a wrong-instrument fix: an operator softening 503s under load finds no knob, and reaches for `TTS_MAX_BUFFERED_BYTES`, which buys slots but does not change how long a request is willing to queue for one. Unlike the two rows below, neither is load-bearing for correctness — any sane value is correct, and they trade perceived latency against refusal rate. With these, §8.4 lists every TTS setting the service reads (`TTS_FFMPEG_CONCURRENCY` is the mirror case: tabled, and built in the compression phase).
- **`TTS_GENERATION_TIMEOUT_SECONDS` (900 s) is new; `TTS_READER_MAX_SECONDS` (900 s) was described in §7.2.1's prose but missing from the table.** §8.4's sizing argument assumes every admission slot is eventually returned, and one ending returns nothing: a provider that connects and then goes silent parks its task on a socket read — neither failing nor finishing — holding its reservation until the process dies. The resulting outage is close to unreadable (flat memory, because reservations rather than bytes are exhausted; no errors, because nothing failed; healthy health checks; service-wide `503`s that clients retry into forever and that do **not** clear when the provider recovers). The timeout is named for what it is — a **stall** timeout, not a cap on clip length, which is `TTS_MAX_CLIP_BYTES` — and sits above the provider's own 655 s output ceiling so it can only fire on a stall. Reasoning recorded in §9.2 rather than only in the table, since the premise it protects is the sizing argument's.

**Change made during implementation (2026-08-13): §7.2's waterfall reads the request sidecar before the R2 HEAD.**

- **The published order cannot be implemented, because the compressed object's key is not derivable from the hash.** Its extension comes from the recipe's `format`; `format` is one of the fields §9.1 hashes; hashing is one-way. Keeping HEAD-first would mean either a speculative HEAD per known extension on the interactive first-audio path (growing with every format ever added) or a guess at `TTS_DEFAULT_FORMAT` — and the guess is the trap: §6.1 has the frontend ask for MP3 exactly when `canPlayType` reports no Opus support, so for that population the HEAD would miss an artifact that exists and fall through to generation, **re-synthesizing and re-billing every verse on every listen, permanently and silently** (audio still plays; nothing errors; the only symptom is a provider bill that never falls). Reading the sidecar first makes the key constructible on the first try at **the same two round-trips** §7.2 already budgets, answers the 404 rung before anything expensive, and makes §9.2's "the redirect wins once the compressed object exists" structural instead of remembered. The four outcomes are unchanged; the rungs are renumbered (404 now lives in rung 2, spawn-and-attach in rung 4) and the §8.3/§9.2 cross-references follow. **One state is traded away and it depends on §9.4:** a sidecar deleted while its audio survived would 404 rather than redirect — unreachable while nothing is evicted, and a named place to revisit if eviction ever returns.

**Erratum (2026-08-13): §9.2's `weakref.finalize` target must be a `bytearray` subclass.**

- **The line as published does not run.** `weakref.finalize(buffer, release, nbytes)` requires a weak-referenceable target, and CPython does not give `bytearray` (or `list`, `dict`, `str`, …) a `__weakref__` slot — those types would pay 8 bytes per instance for a rarely-used feature. A user-defined subclass gets one by default, so the buffer is a one-line `class GenerationBuffer(bytearray)` costing a measured 32 bytes each, and must never be given `__slots__` (which suppresses `__weakref__` again). **No design consequence** — the refcount-prompt release argument, the byte counter and the admission accounting are all unchanged; this is a correction to an API call, not to the design it illustrates.

**Change made during implementation (2026-08-13): the provider seam declares its PCM format.**

- **`TtsProvider` gains a third method, `pcm_format()`.** §8.1 showed two. The streaming WAV header (§7.2.1) must be written before the first audio byte exists, so the rate/channels/bit-depth it announces cannot be read off the stream it describes; and taking them from configuration would let an operator write a header that contradicts its own samples — a valid, correct-length, cleanly-transcoding file that plays at the wrong speed and pitch, invisible to every automated check and permanent in R2 under §9.1/§9.4. The provider declares instead, and verifies each chunk against its declaration, aborting rather than storing a mismatch. §10.1's ffmpeg flags read the same declaration. Full reasoning in §8.1, including why this seam is a one-commit change to revise: both sides of it are internal to fluent-ai.

**Change forced by the provider (2026-08-13): `google-genai>=2.0.0` is required, and §8.2's call sketch is corrected against the live 2.x Interactions API.**

- **The `>=1.73.1` floor cannot work, and the way it fails is not the way §8.2 predicted.** Google retired the legacy Interactions wire schema in a May-2026 breaking change; `google-genai` 1.x still _exposes_ `interactions` streaming, so §8.2's "confirm the resolved SDK exposes it" check passes — but the server answers every 1.x request `400 invalid_request` ("legacy Interactions API schema is no longer supported"). The floor is now `>=2.0.0` (resolving 2.18.0), carried as its own dependency-bump PR because it is shared with fluent-ai's existing Generate Content tools, whose behavior was re-verified identical on both versions against the real API. **Four corrections to the call shape follow from the same surface change**, each confirmed by a live paid synthesis rather than a doc page: `speech_config` nests inside `generation_config` and is a **list** (the list is what carries multi-speaker); `response_format={"type": "audio"}` must be sent (the sketch omitted any such parameter); there is no `chunk.audio_bytes` — the stream yields SSE events discriminated on `event_type`, and audio rides `step.delta` events whose `delta.data` is **base64 text**; and a mid-stream failure can arrive **in-band** as an ordinary `error` event rather than as a raised exception. The last of these is the load-bearing one: the sketch's iterate-to-exhaustion loop would read an in-band error as a completed short clip, and §9.1's content addressing plus §10.1's first-writer-wins PUT plus §9.4's no-eviction would then make that truncated verse the permanent artifact for its hash. §8.2 is restated accordingly, and the loop's event-type branching is described as load-bearing rather than illustrative.

**Change made during implementation (2026-08-11): the text-length tripwire is enforced in fluent-ai only.**

- **`TTS_MAX_TEXT_LENGTH` lives in one service, and it is not the proxy.** Earlier revisions had fluent-api enforce the limit at the edge and fluent-ai keep a mirrored copy; §11.2 even listed "validate text length at the fluent-api proxy" as a control. Implementing it exposed the flaw: a same-named limit in two services is a drift bug waiting to happen — configure them differently and the effective limit silently becomes whichever one nobody edited. fluent-api is a passive proxy, so it now validates shape only (`text` required, non-empty) and holds no maximum; fluent-ai owns the number and answers `400 TTS_TEXT_TOO_LONG` naming it. Rejection still precedes any provider call, so an oversized body is never billed. Full rationale and the one accepted consequence (fluent-api currently flattens upstream 4xx codes to `AI_SERVICE_UNAVAILABLE`) are in the §7.1 amendment.

**Change made during implementation (2026-08-11): the wire field names are snake_case.**

- **`generate`'s request and response fields are `lang_code` and `audio_url`, not `langCode`/`audioUrl`.** Every earlier revision wrote this contract in camelCase, which contradicted the convention the codebase already follows for the only other fluent-ai contract in existence: greek-room's `repeated-words` field names (`lang_code`, `snt_id`, `job_id`) are mirrored **verbatim** by fluent-api under decision **D8**, and mirrored again by fluent-web, so snake*case already travels fluent-ai → fluent-api → browser untranslated. fluent-ai is a Python service and its wire names should read as Python names; a second, opposite convention for TTS would mean two rules for one service boundary, and it would push a translation step into the very proxy that §7.1/§12.2 forbid from touching the body (“passes the response body through unmodified”). The correction landed before any implementation merged, so nothing shipped under the old spelling. **The snake_case contract covers the HTTP payloads only.** fluent-web's internal engine-seam types (`TtsRequest`, `TtsClip`, queue items — §6.1, §5.3) stay camelCase like the rest of the frontend: they carry \_derived* values rather than wire values — `TtsClip.audioUrl` holds the already-absolutized URL, not the relative reference the server sent — and a future browser-local engine (§13.3) implements that same seam with no wire at all. Wire-facing names in §6–§12 are restated accordingly; the revision-history bullets below are left in the spelling they were written with, and the receipt sidecar (§9.3) is restated in snake_case too, being fluent-ai-authored JSON.

**Changes in response to the 2026-07-28 CodeRabbit round (CB7–CB9; CB9 accepted in part, CB7/CB8 answered on the PR):**

- **CB9 — Gemini's 8,192-token input cap named.** §7.1's tripwire paragraph now lists the input-token cap alongside the ~655-second output cap as provider-enforced ceilings below `TTS_MAX_TEXT_LENGTH`; dense non-Latin text near the character tripwire can exceed it, and such inputs fail at synthesis through the normal provider-failure path rather than at validation — no pre-admission tokenizer is added, since legitimate inputs are verse-sized and a failed generation frees its admission slot at negligible cost (§7.1).

**Changes in response to the 2026-07-28 third review round (N1–N6, all six addressed):**

- **N1 — explicit cycle-break for prompt finalization.** The done-callback gains two stated load-bearing duties: after retrieving `task.exception()` it clears `entry.task` — breaking the entry→task→traceback→frame→entry reference cycle so buffer finalization stays refcount-prompt on the failure/cancel path — and it records failures on the entry as strings/error codes, never the exception object (whose `__traceback__` would recreate the cycle). The success path is naturally acyclic because CPython clears a coroutine's frame on return (§8.3, §9.2).
- **N4 — Safari/iOS named as a platform risk for the streaming era.** The chunked, no-`Content-Length`, unknown-length WAV may stall in Safari's `<audio>` without firing `error`; v1 adds a **stall watchdog** whose recovery is **wait-for-compressed** (HEAD-poll until the 302 to the immutable object exists — seconds — then reload), degrading affected browsers to a longer first-listen spinner only. Live-encoded MP3 streaming is named as the future option if affected users materialize, with an explicit complexity/breakage warning. Rollout step 3 makes Safari/iOS the make-or-break verification target, and §12.1 gains watchdog test scope (§6.1, §11.3, §12.1).
- **N2 — concrete RAM budget named.** `TTS_MAX_BUFFERED_BYTES=256 MiB` is the proposed for-review default (⇒ 8 worst-case admission slots via slots = ⌊budget / per-clip ceiling⌋), to be dialed against fluent-ai's real container memory limit; slots are held for seconds each and a burst beyond them answers `503` + `Retry-After` by design (§8.4, §14 R2/R5).
- **N3 — first-audio latency tradeoff named.** First audio now includes 2–3 R2 round-trips (`generate`'s conditional PUT; `get-audio`'s HEAD + sidecar read) before provider stream start — the price of self-healing statelessness, small against Gemini stream start and normally hidden by prefetch (§7.2).
- **N5 — HEAD-re-probe era-skew noted as benign.** Representation eras only advance, and every probe outcome maps to a safe action (§6.1).
- **N6 — sidecar growth asymmetry noted.** `requests/` sidecars accumulate per prefetched verse, so their count outgrows the audio-object count; the byte impact is negligible (§9.4).

**Changes in response to the 2026-07-23 CodeRabbit review (CB1–CB6, all six addressed):**

- **Client retries are bounded and cancellable.** The engine seam’s quiet retries get a stated cap (2 per failure class per clip, proposed default), `Retry-After`/fixed-backoff delays, and every retry timer is scheduled under the clip’s `AbortSignal`; exhaustion surfaces the toast + idle control. Alongside this, playback is pinned to **one uniform element-owned path** (prefetch = early element + `preload="auto"` + `load()`; element errors classified by a fetch HEAD re-probe), and continuous-mode prefetch depth is explicitly capped at 1–2 verses ahead (§5.2, §5.3, §6.1).
- **`format` is optional, resolved before hashing.** The request-table contradiction with `TTS_DEFAULT_FORMAT` is resolved: fluent-ai resolves the default before hashing and sidecar creation, so “omitted” never exists past the API edge; the v1 frontend omits `format` unless `canPlayType` reports no Opus support (§6.1, §7.1, §8.4, §10.1).
- **`generate` answers with the compressed object's URL when one already exists (amended 2026-08-20).** Earlier revisions had `generate` name the streaming `.wav` sibling unconditionally, so a **fully cached verse cost the browser three round trips** — `generate`, then `get-audio` (which read the sidecar only to learn the extension, HEADed the object, and answered 302), then R2. In a mature deployment that is the _majority_ path, since every listen after the first is already compressed. `generate` now returns the absolute R2 URL directly in that case, collapsing three hops to two and skipping the sidecar read. Cost is bounded by the conditional PUT's own result: a sidecar the call **wrote** cannot have been compressed yet — nothing has listened to it — so the extra HEAD is skipped entirely and T8's "generate spends nothing" holds for every first call. The sibling-relative rule is unchanged for the streaming case, and both shapes resolve under the same `new URL(audio_url, response.url)`, so fluent-api still passes the body through untouched and no consumer changes. The residual inaccuracy is one-directional: an artifact compressed _between_ `generate` and the first GET is still named as `.wav` and answers a 302 as before, so a caller can under-report a cache hit but never over-report one — objects are immutable and never evicted (§9.4). **This also makes the served format readable by the client**, which nothing else exposes: a media element that follows a 302 keeps reporting the original URL as `currentSrc`, and cross-origin resource timing hides the redirect unless the bucket sends `Timing-Allow-Origin` (both measured in Chrome, 2026-08-20) (§7.1, §7.3, §9.2).
- **`audio_url` is a sibling-relative URL reference.** fluent-ai returns `audio/{hash}.{ext}` relative to the request URL rather than minting a URL for a host it has no config for; resolution lands on whichever front door the caller used, and the mirrored-tail route convention becomes a stated contract requirement (§7.1, §12).
- **Identity is described as recipe-addressed.** Nondeterministic providers may render one recipe differently; the conditional PUT is first-writer-wins with defined losing-stream behavior, and the PUT pair is recast as storage-level dedup (provider-call dedup is the in-process dict + T26 routing) (§9.1, §10.1, §11.2).
- **Admission-semaphore sizing is stated.** Slots = ⌊`TTS_MAX_BUFFERED_BYTES` / per-clip ceiling⌋ (worst-case byte reservation) plus a per-append ceiling abort for misbehaving providers, with a cap-boundary test added (§9.2, §12.3).
- **The summary no longer overclaims fetch authorization** — the compressed R2 URL is described as a bearer capability (creation is authorized; reads are capability-gated), matching §7.3/§11.1.

**Changes in response to the 2026-07-21 review (RC1–RC6, all six addressed):**

- **Disk staging is gone; generation buffers live in heap RAM.** fluent-ai's production container has a read-only root filesystem, so the previous `.wav.incomplete` staging design had no writable home. Synthesis now buffers PCM in process memory under an **enforced** byte budget (`TTS_MAX_BUFFERED_BYTES` + admission control, §9.2) rather than an estimated disk/tmpfs footprint. No tmpfs mount, no container change, no janitor.
- **Generation is lazy and sidecar-driven.** `generate` no longer synthesizes: it writes an immutable **request sidecar** (the full synthesis recipe) to R2 and returns the audio URL. The first `get-audio` for that hash spawns the actual generation — and because any replica can regenerate from the sidecar, cross-replica serving self-heals instead of breaking.
- **One sidecar became two.** The old JSON sidecar's roles are split: `requests/{hash}.json` is the immutable capability/recipe; `receipts/{hash}.json` is best-effort metadata only. The audio object itself is self-certifying — nothing load-bearing depends on a receipt (a required commit marker would recreate a stuck-lock trap).
- **The serving default flips to option (b): fluent-api proxies `get-audio`.** fluent-ai keeps zero public ingress; the only public surface is the static R2 bucket domain, to which post-compression requests are 302-redirected so heavy bytes bypass both services. Option (a) direct serving is now the documented future path, priced honestly as a public-ingress deployment change.
- **Instance topology becomes a declared deployment requirement, not a solved coordination design: one fluent-ai instance, or static routing of `get-audio` requests to instances (hash/path).** The proposal does not presume knowledge of fluent-ai's current instance count or coordination facilities; it hands deployment the requirement plus a satisfaction ladder, and correctness never depends on it (the sidecar self-heal guarantees that) — an unmet requirement only costs duplicate synthesis. "Exactly one worker process per container" is a hard requirement. The former lifespan compression poller is gone — compression is the tail of each generation task — but workers=1 remains required for the per-process RAM budget and in-process dedup.
- **`durationMs` is dropped from the `generate` response.** A streaming first listen genuinely has no known duration; exact duration comes free from the compressed container afterward. The receipt keeps a best-effort copy.

**Changes in response to the 2026-07-15 review (K1–K3), retained from the previous revision:**

- **TTS synthesis moved from fluent-api into fluent-ai.** fluent-api no longer calls Gemini or holds a Google key; it keeps only the authenticated proxy role it already provides for other AI tools.
- **The Postgres cache is eliminated entirely.** Generated audio is a content-addressed artifact on Cloudflare R2; no database table anywhere.
- **Artifact identity is an HMAC over a canonical versioned recipe**, with providers declaring non-byte-affecting fields — for Gemini, `lang_code` is normalized out of the hash input, so hinted and unhinted requests share one artifact and one billing event.
- **Transcoding uses ffmpeg via a Python package bundling the binary** (suggested); the team's containerized ffmpeg (klappy/transcode-mcp) is documented as a workable alternative.
- **Gemini facts refreshed (2026-07-16):** the Interactions API is now **GA**, and TTS streaming is verified available for models ≥ 3.1 including the proposed default.
- **Feature-flag semantics aligned with the repeated-word-check precedent:** the flag only hides frontend UI; the backend never disables the service.

**Related work:**

- [fluent-web#84 — Audio Recording](https://github.com/eten-tech-foundation/fluent-web/issues/84) is the existing placeholder for the target-side recording capability that should eventually mirror these source-side controls (§5.4, §13).
- fluent-mobile’s recording work (its R2 sync contract) establishes the team precedent this revision follows: audio artifacts live in Cloudflare R2, not Postgres.

The proposal decisions are numbered **T1–T26**. Decisions changed in the first review round are marked **(revised 2026-07-16)**; decisions changed or introduced by the second round's heap/lazy-generation redesign are marked **(revised 2026-07-21)** or **(new 2026-07-21)**.

---

## 1. Problem and design goals

Fluent translators often work from source scripture in a language of wider communication. Listening can reveal phrasing, rhythm, punctuation, and missed words that visual reading alone does not. A source-text TTS control should therefore be fast to reach, comfortable to repeat, useful on touch devices, and able to read either source text visible in Fluent’s drafting grid.

The target language is often low-resource and may not have a suitable hosted voice. Version 1 consequently reads **source text only**. The design still separates UI, transport, and provider concerns so a future custom target-language model can be added inside fluent-ai without rewriting fluent-web.

The governing principles are:

1. **Text, not scripture identity, is the backend resource.** The server synthesizes text and has no knowledge of projects, Bibles, books, chapters, or verses.
2. **The frontend owns playback sequencing.** Chapter and page behavior remain presentation concerns; the server stays one-text-in/one-clip-out.
3. **The protocol is much harder to change than the frontend presentation.** The first contract carries fields that future engines may need even when v1 exposes no corresponding knobs.
4. **Generated speech is a regenerable artifact, and the artifact either exists or it does not.** Content-addressed storage is the single source of truth; there is no tracking database whose state could disagree with the bytes. User recordings are irreplaceable media and require a different storage posture.
5. **The visible text is the authority.** Both source-panel texts can be spoken, and playback always uses the panel’s current text.
6. **AI integrations live in one place.** fluent-ai owns every external AI-service call; fluent-api remains an authenticated passthrough for AI tooling, per the established service split — and fluent-ai itself acquires no public ingress.
7. **Correctness never depends on request routing.** Any replica can serve or regenerate any artifact from durable state; routing choices (affinity, hashing, replica count) only bound duplicate synthesis cost, never correctness.

## 2. Scope

### 2.1 In scope

1. Two source-side playback actions per verse: **play this verse** and **play from here**.
2. Continuous verse-by-verse playback with synchronized active highlighting, auto-scroll, one-clip-ahead prefetch, stop, and an explicit chapter-boundary prompt.
3. Keyboard shortcuts acting on the active verse and touch-target-sized controls.
4. A reusable fluent-web TTS feature module with a frontend `TtsEngine` seam.
5. A `generate` endpoint in fluent-ai (reached through fluent-api’s existing authenticated AI proxy) that records an immutable **request sidecar** on R2 and returns the audio URL, and a `get-audio` endpoint (also fronted by fluent-api) that streams in-progress synthesis or redirects to the compressed artifact.
6. Content-addressed artifact identity: an HMAC over a canonical, versioned synthesis recipe, with provider-declared normalization of non-byte-affecting fields.
7. Lazy, detached, **in-heap** generation in fluent-ai under an enforced per-process RAM budget with admission control, live streaming of in-progress synthesis, and a serving waterfall backed by R2.
8. Compression as the tail of each generation task: ffmpeg transcode of the heap buffer, conditional upload of the audio object plus a best-effort receipt sidecar to Cloudflare R2.
9. A narrow `sourceTts` frontend-visibility flag, a view-level `TTS_USE` permission alias on the fluent-api proxy, one generous text-length tripwire, and loading/error UX.
10. Design seams for recording, alternating review playback, browser-local speech, and custom fluent-ai models without implementing those roadmap items now.

### 2.2 Explicitly out of scope for v1

- Target-side TTS.
- Target-side audio recording or recording storage.
- A voice picker, synthesis-time speed/pacing control, or user-facing engine preference.
- Silent navigation across chapter/page boundaries in drafting.
- Per-user quotas or rate limiting beyond the maximum-text-length tripwire.
- Any Postgres/database storage for generated audio or its metadata.
- Any local-filesystem or tmpfs staging: fluent-ai’s container filesystem is read-only, and generation is heap-buffered by design (§9.2).
- Artifact eviction or lifecycle deletion from R2 (growth is consciously accepted; §11.4).
- Adoption of a remote/shared transcoding service as a v1 dependency (documented as an alternative; §10).

---

## 3. Decisions summary

| #                            | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Short rationale                                                                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1**                       | Render **play verse**, **play from here**, and a shared stop action while audio is active. Continuous mode advances verse by verse with synchronized highlight and auto-scroll.                                                                                                                                                                                                                                                                                                                                                                                                    | Matches the two listening tasks: inspect one verse or continue reviewing from a point.                                                                                                                                                            |
| **T2**                       | Make playback keyboard-first and use touch-target-sized controls. Shortcuts operate on the active verse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Playback is repetitive and must not depend on small pointer targets.                                                                                                                                                                              |
| **T3**                       | Place reusable controls and queue logic under `features/tts/`, not inside the Bible feature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Other source-scripture surfaces should be able to adopt TTS later.                                                                                                                                                                                |
| **T4**                       | Reserve a symmetric target-side recording affordance using the same visual language and shared stop state; do not implement it in v1.                                                                                                                                                                                                                                                                                                                                                                                                                                              | Creates a coherent “listen here, record there” path aligned with fluent-web#84.                                                                                                                                                                   |
| **T5 (revised 2026-07-16)**  | Gemini TTS is called from **fluent-ai**, which owns all external AI integrations. fluent-web reaches it through fluent-api’s existing authenticated AI proxy. A frontend `TtsEngine` seam still isolates the UI from transport.                                                                                                                                                                                                                                                                                                                                                    | Review outcome: one home for AI logic; fluent-api stays a passthrough; no duplicate Google key.                                                                                                                                                   |
| **T6 (revised 2026-07-16)**  | The synthesis request is text-addressed. Artifact identity is an **HMAC (server secret) over a canonical, versioned recipe** of byte-affecting inputs; each provider declares which protocol fields do not affect bytes.                                                                                                                                                                                                                                                                                                                                                           | Keeps the backend domain-neutral, enables cross-project reuse, and prevents duplicate billing for equivalent requests.                                                                                                                            |
| **T7**                       | fluent-web owns continuous sequencing and prefetches the next verse while the current clip plays.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The client already owns highlight, scroll, stop, and boundary behavior.                                                                                                                                                                           |
| **T8 (revised 2026-07-21)**  | `generate` does not synthesize: it writes an immutable **request sidecar** to R2 and returns an `audio_url` reference resolved against the request URL (sibling-relative when fluent-ai references itself, §7.1). The first `get-audio` spawns the actual generation and streams it; once compressed, the URL answers a 302 to the immutable R2 object. The duration field is dropped from the response.                                                                                                                                                                           | Lazy generation from durable state: any replica can produce the audio, the browser still hears it immediately, and repeated `generate` calls are idempotent no-ops.                                                                               |
| **T9 (revised 2026-07-21)**  | Synthesis buffers uncompressed WAV **in heap RAM**; the same task then pipes the buffer through ffmpeg (Opus-in-Ogg preferred; MP3 per request) and conditionally uploads to R2. Nothing touches local disk.                                                                                                                                                                                                                                                                                                                                                                       | The container filesystem is read-only (RC1); the user hears audio immediately; R2 stores only compressed bytes.                                                                                                                                   |
| **T10 (revised 2026-07-21)** | Serving default is **option (b)**: fluent-api proxies `get-audio` behind the session cookie (auth present but not load-bearing); post-compression requests answer a **302 to the public R2 custom domain**, so heavy bytes bypass both services. Option (a) direct serving is a documented future path.                                                                                                                                                                                                                                                                            | fluent-ai keeps zero public ingress (RC2); the proxy burden is a generate call, a tiny 302, and first-listen WAV only.                                                                                                                            |
| **T11 (revised 2026-08-11)** | Expose no v1 synthesis knobs. Use one configured voice and client-side `playbackRate`; carry `voice` and optional `lang_code` in the protocol. The originally reserved `pacing` slot was **removed** during Phase 6 — a field with no defined values had no implementable behavior; see the amendment note in §7.1.                                                                                                                                                                                                                                                                | One artifact serves all playback speeds while the protocol remains extensible.                                                                                                                                                                    |
| **T12 (revised 2026-07-16)** | Add the narrow `sourceTts` flag backed by `EN_FEATURE_SOURCE_TTS`. The flag only tells the frontend to hide the UI; the backend never disables the service. It defaults off until explicitly enabled. A hidden frontend override shows the UI for pre-release demos.                                                                                                                                                                                                                                                                                                               | Reuses the existing feature-flag plumbing while keeping rollout dark; a missing provider key plus the override is itself a valid error-path test.                                                                                                 |
| **T13**                      | Add `TTS_USE` as an alias of `project:view`, using the existing permission-alias pattern, enforced at the fluent-api proxy. This **deliberately diverges** from the sibling `AI_TOOLS_USE → content:update` level; §11.1 records why.                                                                                                                                                                                                                                                                                                                                              | Hearing follows seeing; edit-level gating would exclude reviewers and future read-only review flows.                                                                                                                                              |
| **T14**                      | Enforce an env-configured maximum input length, proposed default 20,000 characters, returning a clear 400 error code. Defer rate limiting. Note: Gemini output caps near 655 seconds of audio, an effective provider ceiling below the tripwire.                                                                                                                                                                                                                                                                                                                                   | The cap is a generous misuse/integration tripwire, not an ordinary verse limit.                                                                                                                                                                   |
| **T15 (revised 2026-07-21)** | **No Postgres cache.** Generated clips are content-addressed artifacts: heap-buffered during synthesis, Cloudflare R2 afterward. The artifact store plus the request sidecar is the only source of truth.                                                                                                                                                                                                                                                                                                                                                                          | Eliminates a DB-ownership question and a whole class of tracking-state bugs; follows the team’s R2 direction.                                                                                                                                     |
| **T16**                      | At the last verse in drafting, pause and ask whether to continue on the next page; never navigate silently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Navigation can have commit/state side effects and needs conscious confirmation.                                                                                                                                                                   |
| **T17**                      | Make both source-panel texts listenable: the project source and the selected reference Bible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Either visible source may be the translator’s current reference, potentially in a different language.                                                                                                                                             |
| **T18 (revised 2026-07-16)** | Carry optional `lang_code` from day one and send it whenever known. The provider declares whether it affects bytes; **Gemini normalizes it out of the hash input**, so it does not fragment artifact identity.                                                                                                                                                                                                                                                                                                                                                                     | Review outcome (K1): protocol keeps the field; identity ignores fields that cannot change the audio.                                                                                                                                              |
| **T19**                      | Keep the paired suggestion and summary proposal documents in fluent-web only; implementation spans fluent-web, fluent-api, and fluent-ai.                                                                                                                                                                                                                                                                                                                                                                                                                                          | One review surface presents the user experience and the contract that supports it.                                                                                                                                                                |
| **T20 (revised 2026-07-16)** | Transcoding runs via ffmpeg in fluent-ai — suggested packaging is a Python pip package that bundles the ffmpeg binary; the team’s containerized ffmpeg (klappy/transcode-mcp) is a workable alternative.                                                                                                                                                                                                                                                                                                                                                                           | Review outcome (K3): the former probe-and-negotiate encoder ladder collapses; Python packaging effectively ships ffmpeg.                                                                                                                          |
| **T21 (revised 2026-07-21)** | **Lazy detached in-heap generation:** when `get-audio` finds a request sidecar but no artifact, it spawns an **entry-owned `asyncio` task** that buffers PCM in RAM, detached from any request lifecycle. Entry state (`generating`/`complete`/`failed`) plus an `asyncio.Condition` coordinates concurrent readers; the in-process entry dict is the dedup guard.                                                                                                                                                                                                                 | No filesystem writes in a read-only container; a client disconnect cannot cancel a generation others are listening to; a double-clicked play never bills twice on one instance.                                                                   |
| **T22 (revised 2026-07-21)** | **Heap streaming with honest failure:** readers stream the growing buffer behind a streaming WAV header (`0xFFFFFFFF` sizes, never backfilled). On generation failure the stream **aborts as a network error**, never a clean EOF, and there is no server-side auto-retry — the client re-enters through admission. URLs are extension-swapped: `/{hash}.wav` streams, then answers a **302 (not 301)** to the immutable `.ogg`.                                                                                                                                                   | A cleanly truncated WAV would be indistinguishable from a short verse; aborted streams self-exclude from every cache layer; the URL suffix tells you which representation era you are in.                                                         |
| **T23 (revised 2026-07-21)** | **Two sidecars with opposite semantics:** `requests/{hash}.json` is the immutable capability + complete synthesis recipe (conditional PUT, so repeated `generate` calls are idempotent); `receipts/{hash}.json` is **best-effort metadata only** (no text, no user identifiers). The audio object is self-certifying: nothing load-bearing may depend on the receipt.                                                                                                                                                                                                              | Any replica can regenerate from the request sidecar; a required commit marker would recreate a stuck-lock failure mode.                                                                                                                           |
| **T24 (revised 2026-07-21)** | **Compression is the tail of each generation task:** HEAD the compressed object first, pipe raw PCM through ffmpeg under a small semaphore (default 1), upload with **conditional PUT** (`If-None-Match: *`), receipt last. No poller, no staging directory, no lock objects; each instance keeps its buffer until its own readers finish.                                                                                                                                                                                                                                         | Lock-free dedup that cannot strand an artifact; nothing scans shared state across processes.                                                                                                                                                      |
| **T25 (new 2026-07-21)**     | **Enforced RAM budget + admission control:** a byte-capped generation dict (`TTS_MAX_BUFFERED_BYTES`); new generations briefly wait for an admission slot, else **503 + Retry-After before any header bytes**. Accounting = primary dict + weak-reference draining set with a finalizer-decremented byte counter; the service’s own counter is the authoritative gate.                                                                                                                                                                                                             | The RAM budget is enforced rather than estimated (RC1); attaching readers, redirects, and 404s bypass the gate; RSS is never used as a wait signal.                                                                                               |
| **T26 (new 2026-07-21)**     | **Deployment topology requirement:** the platform must provide **either a single fluent-ai instance or static routing of `get-audio` requests to instances** (consistent hashing on the URL path is the natural key — the hash _is_ the content identity). Declared as a requirement on deployment rather than solved here; a ladder of acceptable satisfactions runs single replica (v1) → LB session affinity → consistent-hash-on-path → nothing (still correct; duplicate cost bounded by instance count). **Exactly one worker process per container is a hard requirement.** | Browsers issue several requests per clip, so unrouted multi-instance duplicates synthesis; correctness never depends on routing (sidecar self-heal); workers > 1 would multiply the per-process RAM budget and split in-process dedup (RC3, RC5). |

---

## 4. End-to-end architecture

```mermaid
sequenceDiagram
  participant U as User
  participant W as fluent-web TtsEngine
  participant A as fluent-api (auth front door)
  participant I as fluent-ai (internal)
  participant G as Gemini TTS
  participant R as Cloudflare R2

  U->>W: Play verse / play from here
  W->>W: Select visible panel text + langCode
  W->>A: POST /ai/tts/generate (cookie session)
  A->>A: Authorize (TTS_USE), validate length
  A->>I: POST generate (X-API-Key)
  I->>R: conditional PUT requests/{hash}.json
  I-->>A: audio_url (no synthesis yet)
  A-->>W: audio_url
  W->>A: GET /ai/tts/audio/{hash}.wav (cookie session)
  A->>I: GET get-audio (X-API-Key, redirect not followed)
  alt generation in progress (heap dict)
    I-->>W: chunked WAV stream via A (attach as reader)
  else compressed artifact on R2
    I-->>W: 302 via A to public R2 custom domain
    W->>R: GET audio/{hash}.ogg
    R-->>W: immutable compressed audio
  else request sidecar present
    I->>I: admission check, spawn detached generation task
    I->>G: synthesize (streaming)
    G-->>I: PCM chunks appended to heap buffer
    I-->>W: chunked WAV stream via A (live)
    Note over I,R: task tail: ffmpeg pipe, conditional PUT audio/{hash}.ogg, receipt last
  else nothing exists
    I-->>W: 404 via A (client re-calls generate)
  end
```

### 4.1 Repository responsibilities

| Repo                | Implementation responsibility                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **fluent-web**      | Controls, keyboard handling, active-verse behavior, queue/sequencing, prefetch, highlight/scroll, source-panel text selection, playback rate, chapter-boundary prompt, feature gating, retry-on-503/abort in the engine seam.                                                       |
| **fluent-api**      | Authenticated front door for both endpoints: session cookie auth, `requirePermission(PERMISSIONS.TTS_USE)`, input-length validation on `generate`; pass-through of `get-audio` streams and 302s **without following redirects** (§7.3). No Google key, no audio persistence, no DB. |
| **fluent-ai**       | Everything AI and artifact: Gemini provider, HMAC recipe hashing, request/receipt sidecars, the in-heap generation dict, admission control, detached generation tasks, live heap streaming, the compression tail (ffmpeg), conditional R2 uploads, the `get-audio` waterfall.       |
| **fluent-platform** | R2 bucket/credentials and the public custom domain at deployment time; fluent-ai env additions (§8.4); pinning fluent-ai to exactly one worker process (§10.1). No new service.                                                                                                     |

The endpoint’s location does not change the document location: **the proposal pair is intentionally committed only to fluent-web** (T19). The feature is experienced and sequenced in fluent-web, while this document records the fluent-api and fluent-ai contracts reviewers must approve before implementation is split into repo-specific PRs.

---

## 5. UI and interaction model

### 5.1 Per-verse controls (T1, T2, T17)

Each visible source verse gains two accessible controls:

- **Play this verse** (`▶`) synthesizes or reuses one clip and stops at its end.
- **Play from here** (`▶▶`) starts a verse queue at the active row and continues through the chapter.
- While any clip is loading or playing, a clearly visible **Stop** action is available. Stop cancels the client queue, pauses the active audio element, clears prefetched intent, and removes the playback highlight.

The controls use normal buttons with descriptive accessible names rather than icon-only semantics. Their hit areas meet the project’s touch sizing conventions even when the visual icon remains compact. Keyboard shortcuts trigger play-verse, play-from-here, and stop against the active verse; the exact key assignments should be selected during implementation after checking existing editor shortcuts for collisions and then documented in the UI/help surface.

Controls read whichever source panel is visible:

- panel 1: the project source (`verse.text`) and project-source language code;
- panel 2: the selected reference Bible (`bibleVerseMap`) and that Bible’s own language code.

A missing panel-2 verse has no playable text, so controls are disabled or omitted for that row. Placement is an implementation detail: one control set in the source column that follows the selected panel is likely the least-wired design.

### 5.2 Loading, failure, and non-blocking behavior — proposed default for review

On a first-listen miss, synthesis begins streaming within a couple of seconds rather than waiting for the whole clip. The proposed default is:

- replace the activated play icon with a spinner until playback actually starts;
- keep target-text typing and navigation usable;
- allow Stop to cancel local playback intent even though aborting the HTTP request may not cancel billable provider work already underway;
- show synthesis/playback failures through the project’s established toast pattern, with a concise retryable message;
- return the control to its idle state after failure, without leaving a stale highlight.

Two failure shapes deserve honest documentation. When the service is at its RAM budget it answers `503` with `Retry-After` (§9.2); the engine seam retries quietly after the indicated delay rather than surfacing a toast for a transient condition. And when the provider fails **mid-stream**, the listener audibly loses the clip — the stream ends as a network error, never a silently truncated “short verse” (§7.2.1) — and the frontend restarts that clip from a fresh generation attempt. This residual UX is accepted for v1.

Neither quiet retry is unbounded. The engine seam caps retries (proposed default: **2 quiet retries per failure class per clip** — §6.1 defines the policy), schedules every retry timer under the clip’s `AbortSignal` so Stop, navigation, and queue advance cancel a _pending_ retry as immediately as they cancel playback, and on exhaustion surfaces the toast above and returns the control to idle rather than spinning further.

This is a **proposed default for review**, not an operator-settled interaction detail.

### 5.3 Continuous mode and chapter boundary (T7, T16)

Continuous playback is a frontend queue of `{ verseRef, text, langCode, audioSource }` items. While verse N plays, fluent-web requests verse N+1. Queue state should distinguish at least `playing`, `buffered`, and `synthesizing`; prefetch depth can increase later if real network conditions produce audible gaps — but it stays **capped at the next verse, at most two, ahead of the current play position, never chapter-wide fan-out**: a whole chapter of speculative requests multiplied by concurrent users invites admission-control pressure (§9.2) for audio that may never be heard, and shallow depth also respects constrained devices’ memory.

At each clip transition, fluent-web:

1. marks the verse as the playback-active row;
2. scrolls it into view when necessary;
3. starts its already-buffered clip or displays a brief loading state;
4. requests the following clip;
5. stops cleanly when text is absent or the user presses Stop.

At the final verse in drafting, playback pauses and asks **“Continue on the next page?”** Only confirmation triggers navigation. This rule is entirely frontend-owned: a future read-only source-Bible surface may choose cross-page continuation without changing the API.

### 5.4 Recording dovetail (T4)

The source-side control language should reserve a mirrored target-side recording location:

```text
Source text                         Target text
[▶ Play] [▶▶ From here]             [● Record]   (future)
                 [■ Stop]            shared active-session stop
```

Recording is not part of this implementation. The purpose is to avoid a TTS layout that later makes fluent-web#84 feel bolted on. Generated source audio and recorded target audio can share playback-state presentation and queue items while retaining different storage/lifecycle rules — and, notably, different access rules: recordings carry a user’s voice and will need authenticated serving, a tension §7.3 records explicitly.

---

## 6. fluent-web design

### 6.1 Frontend seam (T3, T5)

The control must depend on an engine interface rather than fetch or Web Speech directly:

```ts
interface TtsRequest {
  text: string;
  voice?: string;
  format?: TtsFormat; // 'ogg-opus' | 'mp3'; omitted unless the browser cannot play Opus (§7.1)
  langCode?: string;
}

interface TtsClip {
  audioUrl: string; // resolved against the response URL on receipt (§7.1); durationMs deliberately absent: duration is a property of the media (§6.2)
}

interface TtsEngine {
  synthesize(request: TtsRequest, signal?: AbortSignal): Promise<TtsClip>;
}
```

**These are seam names, not wire names.** `TtsRequest` and `TtsClip` are fluent-web-internal types, so they follow frontend camelCase; the `generate` HTTP payloads are snake_case (`lang_code`, `audio_url` — §7.1), mirroring fluent-ai's Python names verbatim exactly as fluent-api already mirrors greek-room's under decision **D8**. `ServerTtsEngine` is the single place that translates between the two, and `TtsClip.audioUrl` is not the wire value in any case: it holds the **absolute** URL after resolution, whereas the wire carries a sibling-relative reference. A future browser-local engine implements this same seam with no wire at all (§13.3).

Proposed module shape:

```text
src/features/tts/
├── components/TtsVerseControls.tsx
├── engines/serverTtsEngine.ts
├── hooks/useTtsPlaybackQueue.ts
├── tts.types.ts
└── index.ts
```

`ServerTtsEngine` calls fluent-api’s `generate` proxy. A future `WebSpeechTtsEngine` can implement the same UI-facing role even if its internal behavior is streaming/local rather than URL-returning; if that mismatch proves material, the interface can return a generic playable source rather than exposing vendor concepts to the component. The key requirement is that buttons and queue orchestration do not know whether audio is browser-local, streamed from fluent-ai, or served from R2.

**One playback path, element-owned.** Every clip — whether it is playing now or being prefetched for later — is an element-owned stream: an `<audio>` element with `src` set to the clip URL. JavaScript never transports audio bytes (no fetch-to-blob, no MSE — MSE cannot accept WAV anyway, so element streaming is the only play-while-synthesizing path). A blob-prefetch variant was considered and dropped: two different audio source paths is asking for boundary-condition bugs at exactly the seams (mid-stream failure, replay, cancellation) where uniformity matters most. Prefetch is therefore just an **early element**: create it with `preload="auto"` and call `load()`, which downloads without producing sound — `play()` is the only audible trigger. Caveat: `preload` is a browser _hint_ (data-saver modes and iOS may defer it), and the degradation is invisible — an unprefetched transition simply streams like a normal first listen. Autoplay policies are satisfied because the initial play is a real user gesture, after which programmatic `play()` calls for queue advancement are generally permitted.

**Retries live in the engine’s fetch control plane, not in elements.** Media-element errors are opaque (no HTTP status), so when an element errors the engine classifies the failure with a **`fetch` HEAD re-probe** of the clip URL: `503` → quiet retry after the server’s `Retry-After` (§9.2); `200`/`302` → the artifact is fine, reset `src` and `load()` again (mid-stream abort case, §7.2.1); `404` → the request sidecar is missing, re-run `generate` and then reload. (`generate` itself is a normal fetch and never answers `503` — admission control gates `get-audio` only.) The retry policy is bounded, with numbers flagged as proposed defaults for review: **at most 2 quiet retries per failure class per clip**; delay = `Retry-After` for `503`, a short fixed backoff for mid-stream aborts; **every retry timer is scheduled under the clip’s `AbortSignal`**, so Stop, navigation, and queue advance cancel pending retries immediately; on exhaustion a playing clip surfaces the §5.2 toast and returns its control to idle, while an exhausted prefetch stays silent — the clip simply streams normally when its turn arrives. All of this stays invisible to the controls. One inherent skew in the re-probe deserves naming: the HEAD may observe a different representation era than the element hit (the element could fail against the streaming `.wav` moments before compression finishes). That skew is benign by case analysis — eras only advance (streaming → compressed), and every probe outcome maps to a safe action: `503` waits and retries, `200`/`302` resets `src` and picks up whichever era now exists, `404` regenerates. There is no outcome where the skew produces a wrong action.

**Named platform risk — Safari/iOS versus the streaming-era WAV.** The first-listen stream is a chunked response with no `Content-Length`, no Range support, and `0xFFFFFFFF` unknown-length WAV header sizes (§7.2.1). Safari (macOS and especially iOS) is strict about `<audio>` streaming — its media stack commonly probes with Range requests and expects `Content-Length` — and may refuse or stall on such a stream, frequently **without firing an `error` event at all**. A silent stall never enters the HEAD-re-probe ladder above (it keys on element `error`), so it needs its own detector: a **stall watchdog** — if a streaming-era clip reports no `progress`/`canplay` within a timeout (proposed default a few seconds, flagged for review), the engine treats the stream as stalled. The v1 recovery is **wait-for-compressed**: poll the clip URL with HEAD until it answers the `302` to the immutable object — which arrives naturally seconds later (synthesis remainder plus the compression tail) — then reset `src` and reload. The compressed object carries `Content-Length`, a strong ETag, and Range support, all of which Safari is happy with. The degraded experience on affected browsers is therefore a longer spinner on the _first_ listen of a clip only; continuous-mode prefetch hides it entirely, and Chrome/Firefox/Edge keep the full streaming experience. If a meaningful population of users on affected browsers materializes, the named future option is a **live-encoded MP3 streaming era** (encode frames as PCM arrives and stream MP3 instead of WAV): MP3 is frame-based with no length header, endless chunked MP3 has decades of internet-radio precedent in Safari, and MP3 is already documented pipe-safe (§7.2.1). It is deliberately **not** proposed for v1: it puts ffmpeg on the interactive first-listen path, adds substantial moving-part complexity, and raises the risk of breakage — the wait-for-compressed fallback should be proven insufficient before that cost is paid. Rollout step 3 (§11.3) names Safari/iOS as the make-or-break verification target for this premise.

fluent-web **omits `format` by default**: the server’s `TTS_DEFAULT_FORMAT` (§8.4) governs, so administrators control the bulk format through configuration rather than every client restating a preference. The frontend sends `format: "mp3"` only when it _detects_ that Opus is unsupported — `HTMLAudioElement.canPlayType('audio/ogg; codecs="opus"')` is a synchronous local call, so the detection ships in v1 rather than waiting for a browser-compatibility complaint. Whether sent or defaulted, the format is resolved by fluent-ai **before hashing and sidecar creation** (§7.1), recorded in the request sidecar (§9.3), honored by the compression tail, and participates in artifact identity — an mp3 artifact is separate from an opus one (§9.1). The browser plays WAV while a clip is being generated and the compressed format once it lives on R2, transparently; the response’s `Content-Type` always declares what was actually served.

### 6.2 Playback speed and duration (T11, T22)

Playback speed is applied through `audio.playbackRate`. It is deliberately absent from artifact identity and does not trigger new synthesis. A future synthesis-time option, for cases where cadence itself must change, is a separate feature that would add its own request field at that time (§13) — the protocol does not reserve a slot for it in advance (see the §7.1 amendment note).

Duration is treated as an emergent property of the media rather than a protocol field. During a first listen the clip streams behind a WAV header with unknown-length sizes (§7.2.1), so the browser reports an indeterminate duration and the frontend renders an indeterminate timeline — honest UX, since seeking into audio that does not exist yet is impossible anyway. Once the artifact is served from R2, the Ogg/MP3 container header provides the exact duration for free, and ordinary `Content-Length` and HTTP Range behavior make scrubbing work normally. Continuous-mode sequencing is unaffected: it advances on the `ended` event, never on a duration countdown. For verse-sized clips the degraded window lasts seconds and only on the first listen.

### 6.3 Feature gate (T12, revised)

Add the camel-case wire flag `sourceTts`, backed by `EN_FEATURE_SOURCE_TTS`, to the existing feature registry and fail-closed frontend mirror. The flag follows the current four-edit discipline: fluent-api env schema, `FLAGS` registry, OpenAPI feature response, and `.env.example`, plus fluent-web’s named flag type/default.

The service-gating and override semantics reuse the existing feature-flag plumbing, with a distinct dark rollout default:

- **The backend never disables the service.** fluent-api’s proxy and fluent-ai’s endpoints stay live regardless of the flag; the flag only tells the frontend whether to render the controls.
- **A hidden frontend override** (a per-flag force-on/force-off saved in the browser from the unlinked `/debug` diagnostics page — local only, with no backend involvement) can show the controls anyway, for demos before public enablement. If the deployment lacks a Gemini key, the override surfaces the resulting provider error — which is itself a valid error-path test rather than a misconfiguration to hide.

Accepted rollout default: when `EN_FEATURE_SOURCE_TTS` is unset, publish `sourceTts: false` even when `FLUENT_AI_URL` and its API key are configured. An operator must set the flag explicitly to publish the controls. The later audio-playback work renamed these to `EN_FEATURE_SOURCE_AUDIO` and `sourceAudio` while preserving this dark-by-default behavior.

---

## 7. Service contract

### 7.1 `generate` — fluent-web → fluent-api → fluent-ai (T5, T6, T8, T11, T14, T18)

The money path stays authenticated end to end. fluent-web calls fluent-api with the session cookie; fluent-api enforces `requirePermission(PERMISSIONS.TTS_USE)` and the length tripwire, then forwards to fluent-ai’s `generate` endpoint with the existing `X-API-Key` service credential — the same shape as the other AI-tool proxies.

```json
{
  "text": "In the beginning…",
  "lang_code": "eng"
}
```

Proposed request fields:

| Field       | Requirement         | Semantics                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`      | required, non-empty | Exact visible text to recite; rejected beyond `TTS_MAX_TEXT_LENGTH`.                                                                                                                                                                                                                                                                                                        |
| `voice`     | optional            | Requested logical/provider voice; v1 frontend omits it and the configured default is used.                                                                                                                                                                                                                                                                                  |
| `format`    | optional            | Compressed format the compression tail should produce: `ogg-opus` or `mp3`. When omitted, fluent-ai resolves `TTS_DEFAULT_FORMAT` (§8.4) **before hashing and sidecar creation**, so “omitted” never exists past the API edge. The v1 frontend omits it unless `canPlayType()` reports no Opus support (§6.1); the resolved value participates in artifact identity (§9.1). |
| `lang_code` | optional            | Language hint sent whenever fluent-web knows it (ISO 639-3 codes are available for all Fluent source languages, and should be for targets). Advisory for Gemini.                                                                                                                                                                                                            |

> **Amended 2026-08-11 — the reserved `pacing` slot is removed (partial reversal of T11).**
> Earlier revisions of this table carried a sixth field, `pacing`, as an "accepted
> protocol slot for future synthesis-time pacing," with the note that v1 "should reject
> unsupported non-null values or define a no-op policy explicitly before implementation."
> Reaching that decision point during Phase 6 exposed the problem: the slot had **no
> defined values** (`{ mode?: string }`, with no enumeration anywhere in this document),
> no UI, no provider parameter, and therefore no testable behavior — so fluent-ai could
> only have guessed at what a non-null value meant, and no test could have asserted the
> guess was right. Both available policies were bad: rejecting means the proxy accepts a
> shape the service refuses, and accepting-and-ignoring means a caller is billed for
> audio that silently disregards what it asked for.
>
> It was justified by principle 3 ("the protocol is much harder to change than the
> frontend presentation"), which holds for the things that really are expensive — the
> hash recipe, the sibling-relative URL shape, field _removals_ — but not for an
> optional request field. §7.1's own `.strict()` rationale says the additive direction
> is the safe one: a new optional field is one coordinated change across three repos
> that all deploy together, with fluent-web the only client. Reserving it early bought
> nothing and cost a schema, a type, and an unanswerable question.
>
> Synthesis-time pacing remains a future direction (§13): whoever implements it adds the
> field **with real defined values** at that time, and it joins the recipe under a bumped
> version prefix if it affects output bytes. Playback speed is unaffected — it was never
> this field, and remains client-side `playbackRate` (§6.2). The rest of T11 stands: v1
> exposes no synthesis knobs, and `voice`/`lang_code` stay in the contract because both
> are real (`voice` has a configured default and is byte-affecting; `lang_code` is
> actually sent).

`format` is honored, not negotiated: the compression tail always has ffmpeg (§10), so a request for `mp3` produces an mp3 artifact — a distinct hash that does not collide with an opus artifact for the same text. An **omitted** `format` is resolved from `TTS_DEFAULT_FORMAT` at the API edge, before hashing and sidecar creation — internally there is no “unspecified format” state, and an explicit request whose value equals the default hashes to the same artifact as an omitting one (correct dedup, not a collision). Keeping the field in the protocol means a client that cannot play Opus (an older browser, a future non-web consumer) is served without any backend change, even though the v1 frontend rarely sends it in practice (§6.1).

On receiving the request, fluent-ai computes the artifact hash (§9.1) and writes the **request sidecar** `requests/{hash}.json` to R2 with a conditional PUT (`If-None-Match: *`). The sidecar is the complete synthesis recipe — exact text, voice, model, normalized `lang_code`, format, recipe version — everything needed to produce the audio with no other state (§9.3). If the sidecar already exists, the conditional PUT is a no-op, so repeated `generate` calls are idempotent. **No synthesis happens in `generate`** (T8): generation is lazy, deferred to the first `get-audio` for the hash. This makes `generate` nearly free — prefetch requests cost nothing until playback actually reaches them.

Success response:

```json
{
  "audio_url": "audio/9f2ac1d47b….wav"
}
```

`audio_url` is a **URL reference, resolved against the request URL** (`new URL(audio_url, response.url)`), not a bare id — so the serving choice in §7.3, and any later change to it, remains entirely server-side. When fluent-ai references _itself_ it returns a **sibling-relative** reference as above: `generate` and `audio/{hash}` are siblings under one route prefix, so resolution lands on whichever host the caller actually used — the browser called fluent-api, so the audio fetch goes to fluent-api (§7.3), while a future direct consumer of fluent-ai would resolve to fluent-ai with zero contract change. fluent-ai never has to know any consumer’s public base URL, and fluent-api passes the response body through untouched. **This makes the existing mirrored-tail convention a stated contract requirement:** fluent-api exposes each fluent-ai route as `/ai` + the fluent-ai tail (cf. `/ai/tools/greek-room/repeated-words` ↔ `/tools/greek-room/repeated-words`), and `generate`/`audio/{hash}` must remain siblings under one prefix on **both** services for sibling-relative resolution to hold. (Root-relative would break today — the two services mount at different roots.) URLs referencing **R2** stay absolute. **Amended 2026-08-20:** `generate` returns one directly when the compressed object already exists, instead of always naming the streaming `.wav` sibling — see the revision-history bullet. Both shapes resolve under the same `new URL(audio_url, response.url)` rule (an absolute URL resolves to itself), so no consumer changes. There is deliberately no `durationMs` field: a streaming first listen has no knowable duration, and once the compressed artifact exists its container header carries the exact value (§6.2, T22). If the artifact is compressed BETWEEN this call and the first GET, the returned `.wav` URL simply answers a redirect on that GET — the older behaviour, now the narrow residual case rather than the common one.

Validation/error outline:

- `400 TTS_TEXT_TOO_LONG` with the configured maximum when `text` exceeds the tripwire (enforced in **fluent-ai** — see the 2026-08-11 amendment below). **Nothing has been spent** when this fires: it precedes hashing, the sidecar write and any provider call;
- `400 TTS_INVALID_REQUEST` for malformed/empty input;
- `403` through existing permission middleware;
- provider failures do **not** surface here — synthesis happens under `get-audio`, whose stream aborts on failure (§7.2.1); `503` with `Retry-After` appears there when the RAM budget is exhausted (§9.2).

**`TTS_CLIP_TOO_LONG` is a distinct code, deliberately (added 2026-08-16).** Its sibling above refuses a request before any spend; this one aborts a generation whose audio has outgrown `TTS_MAX_CLIP_BYTES` **while it is being billed** (§9.2's per-append tripwire, surfacing through §7.2.1's honest-failure path). With the two limits consistently paired it should be unreachable by any accepted input, so its appearance in a log carries specific information: either the bytes-per-character rate is wrong for this deployment's script, or the provider is emitting audio nobody asked for. Collapsing the two codes into one would destroy exactly that signal — it is the alarm attached to the assumption most likely to be wrong.

> **Amended 2026-08-11 — the length tripwire is enforced in fluent-ai, not at the fluent-api proxy.**
> Earlier revisions had fluent-api enforce it (and §8.4 described fluent-ai's value as "mirrored at
> the fluent-api proxy"). Two services holding a same-named limit that must agree is a drift bug
> waiting to happen: set them differently and the effective limit silently becomes whichever one
> nobody edited. fluent-api is a passive proxy, so it now validates **shape** only (`text` required
> and non-empty) and holds no maximum at all; fluent-ai owns `TTS_MAX_TEXT_LENGTH`, and its
> `generate` answers `400 TTS_TEXT_TOO_LONG` naming the configured maximum. The cost is one internal
> hop for an oversized body, which is nil — fluent-api has already parsed it to validate shape, and
> fluent-ai rejects **before** any provider call, so nothing is billed. One consequence is recorded
> rather than designed around: fluent-api's client maps every non-2xx from fluent-ai to
> `AI_SERVICE_UNAVAILABLE`, so the distinct code does not currently reach the browser. That is
> tolerable because the only text this feature can submit is already-published source scripture
> chosen by the app — an oversized request is very nearly unreachable — and fluent-web presents any
> generate failure as one toast; relaying upstream status/code/details faithfully would mean widening
> fluent-api's shared `Result` error shape, which is a deliberate change for whoever needs it.

`TTS_MAX_TEXT_LENGTH` was originally proposed at `20000` — intentionally far above a verse, catching accidental chapter/book submission or abuse without acting as a normal product limit. **Amended 2026-08-16:** it is no longer a free-standing tripwire. It is bound to the generation heap's per-clip ceiling by `text limit × PCM bytes per character ≤ TTS_MAX_CLIP_BYTES` (§8.4, §9.2), because a text admitted here whose audio would outgrow that ceiling is not refused for free but **billed, synthesized for minutes and killed mid-stream**. The limit is therefore sized against measured verse lengths rather than chosen as a round number — a survey of 11,227,230 verses across 1,005 translations puts the median at 139 characters and the genuine maximum at 6,504 (`1KI 12:24` carries the Septuagint's long addition as one verse) — and what a given limit supports, together with its cost in admission slots, is tabulated in `fluent-ai/docs/features/source-tts/source-tts-capacity.md`. **A refusal here still costs nothing**, which is the whole point of keeping this check ahead of the expensive one. It is worth noting that Gemini enforces its own ceilings below any plausible tripwire for extreme inputs: an **8,192-token input cap** and a generated-output cap near 655 seconds of audio — which the longest real verse, at roughly 542 seconds of speech, very nearly reaches. Dense non-Latin text near the character tripwire can exceed the input-token cap; such an input fails at synthesis through the normal provider-failure path (§7.2.1) rather than at validation — acceptable because legitimate inputs are verse-sized, nowhere near either bound, and a failed generation frees its admission slot at negligible cost. Rate limiting and user quotas are deferred until usage data justifies them.

### 7.2 `get-audio` — the serving waterfall (T8, T15, T21–T23)

```http
GET /ai/tts/audio/{hash}.wav     (browser → fluent-api, session cookie)
GET /tts/audio/{hash}.wav        (fluent-api → fluent-ai, X-API-Key, redirects not followed)
```

fluent-ai resolves the hash through an ordered waterfall (**the two R2 lookups were reordered 2026-08-13 — see below; the four outcomes are unchanged**):

1. **In-heap generation entry** — a generation for this hash is in progress (or finished and still draining to its readers): attach as a reader and stream the WAV live (§7.2.1). Attaching to an existing entry bypasses admission control (§9.2).
2. **Request sidecar** (`requests/{hash}.json`) — **absent ⇒ `404`**: this hash was never authorized through `generate`, and fluent-web treats that as self-healing (call `generate`, which re-creates the sidecar, then GET again). Present, it yields the full recipe — and with it the `format` that both remaining rungs need.
3. **R2 compressed object** (`audio/{hash}.{ext}`, the extension taken from the recipe's `format` — one hash resolves to exactly one artifact, because `format` is inside the hash) — answer **`302 Found`** whose `Location` is the immutable public R2 custom-domain URL. fluent-api forwards the 302 to the browser **without following it** (§7.3), and the browser fetches the bytes directly from Cloudflare.
4. **No compressed object yet** — not generated, or a replica died before uploading it: pass admission control (§9.2), spawn a **detached generation task** (§9.2), attach as its first reader, and stream. Any replica can do this — the sidecar carries the whole recipe, which is what makes multi-replica serving self-healing rather than broken (T26).

**Why the sidecar is read before the R2 HEAD (amended 2026-08-13).** Earlier revisions checked the compressed object first. That order cannot be implemented as written: **the compressed object's key is not derivable from the hash.** Its extension comes from the recipe's `format`, `format` is one of the fields §9.1 hashes, and hashing is one-way — knowing `format` went into the hash says nothing about which value it held. (The earlier rung 2 conceded as much by writing "`.ogg` or `.mp3`".) That leaves only two ways to keep the published order, and both are worse. Speculatively HEAD-ing every known extension adds a second R2 round-trip to the interactive first-audio path and grows with each format ever added (§7.2.1 already contemplates more). Guessing `TTS_DEFAULT_FORMAT` instead is the dangerous one: §6.1 has the frontend request MP3 exactly when `canPlayType` reports no Opus support, so for that entire population the HEAD would miss a compressed object that exists, fall through to generation, and **re-synthesize and re-bill every verse on every listen, permanently** — with audio still playing, no error raised and no alert firing, visible only as a provider bill that never falls as the cache fills. Reading the sidecar first makes the key constructible on the first try, costs **the same two round-trips** the latency note below already budgets, and answers the 404 rung before anything expensive happens, so random-hash probe traffic (§11.2) costs one R2 GET. It also makes §9.2's draining rule structural rather than remembered: by the time the draining set is consulted, the compressed-object check has already answered, so "the redirect wins once the object exists" cannot be got wrong. **One state is given up, and it depends on §9.4:** a hash whose sidecar was deleted while its audio object survived would now 404 rather than redirect. Sidecars are immutable (§9.3) and nothing is ever evicted (§9.4), so that state cannot arise today — but §9.4 has already reversed once (it replaced an LRU-trimming design), and if eviction ever returns, this ordering is one of the places that must be revisited.

Serving behavior:

- **Streaming era:** `Content-Type: audio/wav`, chunked transfer without `Content-Length`, no Range support; `Cache-Control: private` with a modest max-age — a browser may replay a _completed_ stream from its local cache (the user already paid for those bytes) while shared/edge caches stay excluded from the mutable URL. Two footnotes: browsers cache large chunked media responses inconsistently, so HTTP-cache replay is opportunistic — reliable replay belongs to the frontend holding the blob (§6.1); and because caches store only _complete_ responses, an aborted failure stream (§7.2.1) self-excludes from every cache layer, a compounding reason the abort-not-EOF rule is right.
- **Compressed era:** the 302 response is tiny; the R2 object itself carries a strong `ETag`, `Accept-Ranges: bytes`, and long-lived immutable cache headers (content-addressed names never change meaning).
- The redirect is deliberately **302, not 301**: the `.wav` URL means “whatever representation era this artifact is in right now,” and a cached permanent redirect would freeze that.
- A GET can spend provider money only on hashes an authenticated `generate` authorized (rung 4 is reachable only through rung 2's sidecar), and each hash is synthesized once; there is no synthesis side effect for unknown hashes.

**Latency tradeoff, named.** R2 now sits on the interactive first-audio path, not just the compression tail: `generate` performs a conditional sidecar PUT, and a first `get-audio` performs an R2 HEAD plus a sidecar read before the provider stream can start — 2–3 R2 round-trips in total. That is the price of self-healing statelessness (any replica can serve or regenerate anything from durable state alone), and it is a small one: R2 round-trips are tens of milliseconds against a provider stream start of hundreds of milliseconds to seconds, `generate` normally runs at prefetch time off the audible path (§6.1), and in continuous mode verse N+1's entire pipeline hides behind verse N's playback. The tradeoff is visible only on a cold, unprefetched first listen — and even there it is a minor addend to synthesis latency, not a multiplier.

#### 7.2.1 Live heap streaming and honest failure (T21, T22)

A generation entry owns a growing in-RAM buffer, a state field (`generating` → `complete` or `failed`), and an `asyncio.Condition`; the writer notifies on every append and state change. Each reader is a generator that yields the bytes it has not yet sent (snapshotting lengths rather than holding views into the growing buffer — the event loop’s flush pacing is natural backpressure), then waits on the condition at end-of-buffer. On `complete` it returns cleanly. On `failed` it **raises**, which closes the HTTP connection without a terminal chunk — the browser observes a network error. This is a deliberate contract: the streamed WAV header carries `0xFFFFFFFF` (unknown-length) sizes and is **never backfilled**, so a _cleanly ended_ truncated stream would be indistinguishable from a legitimately short verse; an abort is the only honest failure signal. Aborted responses are incomplete by definition, so every cache layer self-excludes them.

There is **no server-side auto-retry**: a failure marks the entry `failed`, wakes and aborts its readers, and drops the entry. The client’s retry (prompted by the abort; §6.1) re-enters through normal admission, which respects the RAM budget and lets the frontend pace attempts. A reader max-lifetime bounds how long a slow client can pin a finished buffer.

The URL scheme is an **extension swap**: during generation `/{hash}.wav` streams; after compression the same path answers only redirects to the immutable `.ogg`/`.mp3` object. The hazardous “rug swap” class — a client splicing Range responses across two representations of one URL — is dead by construction: a redirect cannot be spliced onto cached bytes, so a Range resume against the `.wav` URL receives the 302 and refetches the compressed object whole. (A constraint worth recording: Ogg and MP3 are safe to pipe to a non-seekable output, which also matters for §10; MP4-family containers are not, which constrains future format additions.)

### 7.3 Serving and authentication — proxy default (T10, revised)

The `generate` path is always authenticated (cookie at fluent-api, `X-API-Key` to fluent-ai): it is the path that authorizes spending money. For `get-audio`, the **default is option (b): fluent-api fronts it**. The browser never talks to fluent-ai — fluent-ai keeps zero public ingress, exactly as today — and the only new public surface is the **static R2 bucket custom domain**. Session-cookie authentication comes free on the audio path (present, though not load-bearing: the HMAC URL remains the real capability).

The proxy burden is small by construction: the `generate` call (an established proxy pattern), issuing tiny 302s, and streaming **first-listen WAV only** — roughly 48 KB/s per active first listener. Every post-compression byte flows browser ↔ Cloudflare directly via the 302. Two implementation requirements make this work:

- **Do not follow the internal redirect.** Node `fetch` defaults to `redirect: 'follow'`; fluent-api’s `get-audio` pass-through must use `redirect: 'manual'` and forward fluent-ai’s 302 to the browser. Auto-following would make fluent-api silently download and re-stream the compressed object — functional, but it two-hops immutable bytes and reopens the Range-consistency hazard the redirect design eliminates.
- **Unbuffered pass-through.** fluent-api must stream fluent-ai’s chunked WAV response without buffering it; verify the server framework’s streaming proxy behavior at implementation.

**Public bucket posture.** R2 public buckets are not listable (verified against Cloudflare documentation, 2026-07-21): fetching an object requires already knowing its key, so the HMAC naming carries the entire access story. Production access should use a **custom domain**, not the managed `r2.dev` subdomain (which is rate-limited and excluded from WAF/cache/access controls); a custom domain also puts Cloudflare’s edge cache in front of the audio for free. R2 offers no per-prefix ACLs, so an optional one-rule WAF block on `requests/*` from the public side is the cheap hardening line — fluent-ai keeps reading sidecars over the credentialed S3 API. A holder of a leaked hash could fetch the request sidecar and _read_ the text, but could equally fetch the audio and _hear_ it; for scripture the sidecar adds no marginal exposure. The revisit trigger is **content sensitivity** if future work speaks non-scripture text (T6’s “speak anything” future) — and it applies to the audio objects as much as the sidecars.

**Option (a) — direct serving (documented future path).** The browser GETs fluent-ai directly and R2 handles everything compressed. Its true cost is named plainly: fluent-ai would need a **public internet ingress** (hostname, TLS, edge configuration, and locking every other endpoint to `X-API-Key`) — a larger deployment change than it first appears, which is exactly why it is no longer the suggested default. It would also trade cookie auth for “authentication is knowing the hash” alone — acceptable only while there is no eviction (a synthesized hash is effectively a one-shot capability), and to be revisited if eviction ever lands.

**Full-proxy variant (door held open).** If hosting policy ever requires that the browser never contact the bucket directly, fluent-api can proxy even the compressed bytes. That variant two-hops all audio and makes strict `If-Range` handling (honor Range requests only when they carry the current strong ETag) load-bearing. It is not proposed — merely named, so a future hosting request has a design home.

**A tension to record either way:** future target-side _recordings_ carry a real user’s voice and will require authenticated serving. The public-bucket posture above applies to regenerable TTS artifacts only; recordings must not inherit it.

One CORS note: under the proxy default, streamed audio is same-origin with the app’s API, and the R2 leg serves plain `<audio src>` playback, which is CORS-exempt; only a future Web Audio API consumer (waveforms, precise scheduling) would need CORS headers on the bucket’s responses.

---

## 8. Provider seam and Gemini implementation (in fluent-ai)

### 8.1 Provider seam (T5, revised)

fluent-ai owns a small provider-neutral Python interface:

```python
@dataclass(frozen=True)
class PcmFormat:
    sample_rate_hz: int
    channels: int
    bits_per_sample: int

@dataclass
class TtsProviderRequest:
    text: str
    voice: str
    model: str
    lang_code: str | None = None

class TtsProvider(Protocol):
    def synthesize_stream(
        self, request: TtsProviderRequest
    ) -> AsyncIterator[bytes]:
        """Yield PCM audio chunks as the provider produces them."""

    def non_byte_affecting_fields(self) -> set[str]:
        """Protocol fields this provider ignores for output bytes (§9.1)."""

    def pcm_format(self) -> PcmFormat:            # added 2026-08-13, see below
        """The PCM format those chunks are in — declared before any arrive."""
```

Buffering, hashing, and transcoding remain outside the provider. This keeps Gemini’s SDK types, model names, and streaming quirks inside one module; a future custom low-resource model is another `TtsProvider` selected by config or language routing, with no fluent-web or fluent-api change.

**`pcm_format()` is a third declaration, added during implementation (2026-08-13, amended).** Earlier revisions showed two methods. The reason for the third is a sequencing constraint in §7.2.1: a WAV stream is a 44-byte header followed by raw samples, and the header is the only thing that says what rate, channel count and bit depth those samples are in — but live streaming means the header goes out **before the first audio byte exists** (measured: first delta at 1.62 s). So the format cannot be learned from the stream it describes. Of the remaining sources, configuration is the dangerous one: an env var lets an operator write a header that contradicts the bytes, and the result is a **structurally perfect file** — valid WAV, correct length, transcodes and stores and content-addresses cleanly, every test green — that plays at the wrong speed and pitch. No automated check can see it, because the defect is in the relationship between header and samples rather than in either; only a listener notices, and by then §9.1 addressing and §9.4 no-eviction have made every clip generated under the misconfiguration permanently wrong in R2. The provider is the one component that knows the answer, so it declares — the same shape as `non_byte_affecting_fields()`, a no-argument statement about itself — and its implementation verifies every incoming chunk's mime type, rate and channel count against its own declaration, **aborting the generation** on any disagreement rather than storing the result. §10.1's compression tail reads the same declaration for its raw-PCM input flags (`-f s16le -ar 24000 -ac 1`), so the three numbers have exactly one source.

**This seam is cheap to change later, and that is why the addition is not a large decision.** Both sides of it — every `TtsProvider` implementation and every caller — are internal to fluent-ai; no wire contract, no other repository and no external consumer depends on its shape. A fourth declaration, or the removal of this one, is a single commit touching each implementation, not a contract negotiation. Interface additions here should be judged on whether they remove a class of error, not on the cost of reversing them.

### 8.2 Current Gemini API facts (verified July 14–16, 2026; call shape re-verified live 2026-08-13)

Google documents Gemini TTS models as **Preview**, while the **Interactions API surface is now GA** (it was Beta when this proposal was first drafted). Current supported TTS names include:

- `gemini-3.1-flash-tts-preview` — current Flash TTS preview; single/multi-speaker; **streaming supported**; the model in Google’s current-surface examples;
- `gemini-2.5-flash-preview-tts` / `gemini-2.5-pro-preview-tts` — older previews on the Generate Content surface Google now labels Legacy; they do not stream.

The proposed v1 default is **`TTS_MODEL=gemini-3.1-flash-tts-preview`**, flagged for review. Published paid-tier pricing at verification is $1 per million text-input tokens and $20 per million audio-output tokens (audio bills at 25 tokens per second, ≈ $0.0005 per generated second before artifact reuse). Model names and prices are configuration and documentation, never protocol constants.

**SDK surface and version — settled by implementation, 2026-08-13 (amended).** fluent-ai’s existing Gemini client uses the Generate Content surface; this design is the codebase’s first use of **Interactions streaming**. An earlier revision declared `google-genai>=1.73.1` as a **floor, not a pin**, and asked implementation to "confirm the resolved SDK actually exposes `interactions` streaming … and bump the floor if it does not". _That check is the wrong check._ 1.x **does** expose the surface and still cannot call it: Google's May-2026 breaking change retired the legacy Interactions wire schema, and the server rejects 1.x requests with `400 invalid_request` ("legacy Interactions API schema is no longer supported"). **The floor is `google-genai>=2.0.0`** (resolving 2.18.0 at implementation). Because the SDK is shared with fluent-ai's existing Generate Content tools, the bump ships as its own PR and its own gate: that wrapper's whole surface (`genai.Client`, `types.GenerateContentConfig`, `aio.models.generate_content`, structured-JSON `response_schema`) was verified to return **identical output on 1.74.0 and 2.18.0 against the real API** — the unit suite patches the SDK out entirely and proves nothing here.

**Streaming is the primary path:** TTS models from 3.1 up support `stream: true` on Interactions. Chunks are appended to the generation entry’s heap buffer as they arrive, which is what makes live streaming (§7.2.1) work; a live run measured **first audio at 1.62 s against 3.59 s for the whole clip**, in 114 uniform deltas of 1920 bytes (40 ms each, ~25 wakeups per second per generation). Shape of the detached task, **as built** — the four call-shape corrections below were forced by the 2.x surface and confirmed by live synthesis, not read off a doc page:

```python
async def generate_into(entry: GenerationEntry) -> None:
    """Detached task: synthesize into entry.buffer, then run the compression tail (S10.1)."""
    client = genai.Client()  # async surface via client.aio
    stream = await client.aio.interactions.create(
        model=settings.tts_model,
        input=entry.recipe.text,
        stream=True,
        response_format={"type": "audio"},                      # (2)
        generation_config={"speech_config": [{"voice": voice}]},  # (1) nested, and a list
    )
    audio_deltas = 0
    async for event in stream:                   # (3) SSE events, not audio chunks
        event_type = getattr(event, "event_type", None)
        if event_type == "error":                # (4) failure arrives IN-BAND
            raise ProviderError(...)             # never fall out of the loop
        if event_type != "step.delta":
            continue                             # lifecycle chatter
        entry.buffer.extend(decode_audio_delta(event.delta))  # (3) base64 -> PCM
        audio_deltas += 1
        async with entry.cond:
            entry.cond.notify_all()              # wake attached readers (S7.2.1)
    if audio_deltas == 0:
        raise ProviderError(...)                 # an empty stream is a failure, not silence
    entry.state = "complete"
    async with entry.cond:
        entry.cond.notify_all()
    await compress_and_upload(entry)             # the compression tail (S10.1)
```

**(1)** `speech_config` is not a top-level argument: Interactions separates "what I am sending" (`input`) from "how the answer is produced" (`generation_config`), and voice selection is the latter. It is a **list** because that list is what carries multi-speaker; v1 sends one entry. **(2)** `response_format={"type": "audio"}` selects the output modality and has no equivalent in the earlier sketch, which omitted the parameter entirely. **(3)** There is no `chunk.audio_bytes`. The stream yields SSE events discriminated on `event_type` — `interaction.created`, `step.start`, `step.delta`, `step.stop`, `interaction.completed` — and only `step.delta` carries payload, as **base64 text** in `delta.data` needing a decode per chunk. **(4)** A mid-stream provider failure can arrive **in-band**, as an ordinary `error` event rather than a raised exception.

**The loop's event-type branching is load-bearing, not stylistic.** An iterate-to-exhaustion loop that appends anything byte-shaped — the shape of the earlier sketch — reads an in-band `error` as a _stream that simply ended_, and therefore as a completed clip. That clip then meets §9.1's content addressing, §10.1's first-writer-wins conditional PUT and §9.4's no-eviction rule, and the truncated verse becomes the permanent artifact for its hash: one verse stops mid-word, for every user, and no retry ever repairs it. The same reasoning covers the two documented provider behaviors below — a stray text delta is caught by _type_ (`delta.type != "audio"`), a format change by mime/rate/channel comparison against the declared `pcm_format()` (§8.1), and a stream carrying zero audio deltas raises rather than storing a valid zero-length artifact. A failed generation costs one client retry; a stored truncation is forever. This is the T22 hazard reached through the provider loop instead of the response body.

An exception anywhere above propagates to the task’s **done-callback**, which flips `entry.state = "failed"` and wakes readers so their streams abort (§7.2.1). Wiring that callback is load-bearing: an unobserved task exception dies silently and would leave readers parked forever.

Two documented provider behaviors shape the implementation: the model occasionally emits text tokens into an audio response, which surfaces as a failed generation (§8.3); and generated output caps near **655 seconds of audio**, an effective per-request ceiling (see T14) — confirmed at implementation as the arithmetic of the model's 16,384-token output limit at 25 audio tokens per second.

**Non-streaming fallback:** if a configured provider or model cannot stream, nothing structural changes — the whole clip arrives as a single append and readers receive everything at completion. Streaming is an experience optimization, not a correctness requirement.

The returned audio is raw 24 kHz, mono, 16-bit PCM; readers are served the streaming WAV header (§7.2.1) followed by the buffer. Language is usually auto-detected; `lang_code` remains advisory input for Gemini and a first-class provider field because a future low-resource engine may require it.

### 8.3 Failure handling and shutdown (T21, T22, revised)

There is **no server-side in-place retry** (this supersedes the previous revision’s bounded-retry design). Two reasons: Gemini output is nondeterministic, so a second attempt’s bytes can never be spliced into streams that already delivered attempt one; and retrying inside the task would hold the RAM budget’s admission slot hostage during provider trouble. On failure the entry is marked `failed`, its readers are woken and their streams abort as network errors (§7.2.1), and the entry is dropped — the client’s retry re-enters through normal admission, so the frontend paces attempts (§6.1). If a generation fails before its first reader has received headers, that reader surfaces `502 TTS_PROVIDER_UNAVAILABLE` instead of an abort.

Task lifecycle requirements (stated explicitly because both are silent-failure footguns): asyncio holds only _weak_ references to tasks, so the generation task must be stored on its entry — which the primary dict holds strongly until upload completes — to stay alive; and the done-callback must retrieve the task exception (see §8.2). The entry-owned detached task is chosen over three rejected shapes: generating inline in the response generator (Starlette cancels it on client disconnect, resurrecting cancel-while-writing), Starlette’s `BackgroundTask` (runs only after the response completes, and is request-tied), and a bare `asyncio.shield` (still leaves task references hand-managed).

**Two further load-bearing done-callback duties, both cycle hygiene.** Storing the task on the entry creates an entry→task edge, and on failure (or cancellation) the retrieved exception’s `__traceback__` chains the coroutine frame — which holds `entry` as a local — completing a persistent entry→task→traceback→frame→entry cycle. Left intact, that cycle parks buffer finalization on the cyclic GC instead of prompt refcounting, so §9.2’s admission accounting would lag exactly when failed entries pile up (provider trouble, SIGTERM cancellation). Therefore, after retrieving `task.exception()`, the done-callback must (1) **clear `entry.task`** — asyncio holds the task only weakly and its callbacks have drained, so the task then dies by refcount and the traceback frame releases the entry — and (2) **record the failure on the entry as a string or error code, never the exception object itself**, whose `__traceback__` would recreate the cycle through the back door. The success path needs no such care: CPython clears a coroutine’s frame when it returns, so the frame→entry edge evaporates on completion and only the acyclic entry→task reference remains.

**Shutdown needs no drain logic.** A lifespan-owned registry (or task group) cancels outstanding generation tasks on SIGTERM; attached readers see abort-not-complete; and because the request sidecar survives on R2, the restarted process — or any other replica — regenerates on the next request (§7.2 rung 4).

### 8.4 Proposed environment additions — flagged for review

All TTS configuration lives in **fluent-ai** (which already holds the Google key for its other tools):

| Variable (fluent-ai)             | Proposed default/purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TTS_MODEL`                      | `gemini-3.1-flash-tts-preview`; configurable because preview names change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `TTS_VOICE`                      | `Kore`; one deployment-wide voice in v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `TTS_MAX_TEXT_LENGTH`            | Longest text this service will speak; refusal precedes any provider call, so an oversized body is never billed. Enforced **here only** — fluent-api holds no copy (amended 2026-08-11, §7.1). Originally proposed at `20000` as a pure abuse tripwire; **since bound to `TTS_MAX_CLIP_BYTES` and sized against a corpus survey** (amended 2026-08-16) — see the sizing note below.                                                                                                                                                                |
| `TTS_HASH_SECRET`                | New secret keying the artifact HMAC (§9.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `TTS_MAX_BUFFERED_BYTES`         | **256 MiB proposed as the for-review default.** Byte cap for the in-heap generation dict (§9.2); admission slots are this divided by the per-clip ceiling, so **raising it buys concurrency at no cost to verse coverage** — the first knob to reach for once the container's real memory limit is known (an open review input — R2; container memory wants roughly ×1.5 headroom over the cap). At the originally proposed ~31 MB ceiling this gave 8 worst-case slots; see the sizing note below rather than quoting a current figure.          |
| `TTS_MAX_CLIP_BYTES`             | Per-clip byte ceiling: one admission slot's worst-case reservation, and the per-append tripwire that kills a generation growing past it (§9.2). Originally an implicit ~31 MB taken from Gemini's own output cap (16,384 tokens × 1,920 B ≈ 655 s); **re-derived at implementation from a corpus survey of real verse lengths**, and expected to be tuned again. Bound to `TTS_MAX_TEXT_LENGTH` by the inequality in the sizing note below.                                                                                                       |
| `TTS_ADMISSION_WAIT_SECONDS`     | **`3.0`; added to this table 2026-08-16.** How long a request that would spawn a _new_ generation queues for an admission slot before being refused — §9.2's "a couple of seconds", made settable. Together with the row below it is the **only** dial over what a burst past the budget feels like; the budget itself buys slots, not patience. Too high holds clients on a connection that is going to fail anyway; too low refuses requests a slot was about to free. Not load-bearing for correctness — any value in a sane range is correct. |
| `TTS_RETRY_AFTER_SECONDS`        | **`5`; added to this table 2026-08-16.** The `Retry-After` value sent with an admission `503`, which the engine seam waits out before its quiet retry (§6.1) — so this number, not the client, sets the re-attempt cadence under load. Sized against measured synthesis (~1.3× realtime on a verse), i.e. roughly how long a slot is actually held. Too low turns one saturated moment into a retry storm against a service that is already refusing; too high makes a recovered service feel down.                                               |
| `TTS_GENERATION_TIMEOUT_SECONDS` | **`900`; added during implementation 2026-08-16.** Stall timeout on one detached generation task — _not_ a limit on clip length. Deliberately above the provider's own 655 s output cap (synthesis runs ~1.3× realtime), so it can only fire on a stall and can never truncate a legitimate clip. See §9.2: it is what makes the admission budget's liveness premise true.                                                                                                                                                                        |
| `TTS_READER_MAX_SECONDS`         | `900`; the reader max-lifetime §7.2.1 refers to in prose — bounds how long one slow client can pin a _finished_ buffer and the slot behind it. Same reasoning, other participant; also above 655 s so a listener consuming a maximum-length clip at realtime is never cut off.                                                                                                                                                                                                                                                                    |
| `TTS_FFMPEG_CONCURRENCY`         | `1`; semaphore bounding concurrent compression tails (§10.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `TTS_DEFAULT_FORMAT`             | Format resolved **before hashing/sidecar creation** when a request omits `format` (`ogg-opus` proposed). The v1 frontend normally omits, so this is the admin-controlled bulk format (§6.1, §7.1). Changing it later shifts which artifact omitting clients get — harmless, each format is its own artifact.                                                                                                                                                                                                                                      |
| `TTS_R2_PREFIX`                  | Key prefix inside the R2 bucket; `requests/`, `audio/`, and `receipts/` live beneath it (§9.3), keeping TTS separate from other artifact classes (future recordings).                                                                                                                                                                                                                                                                                                                                                                             |
| `TTS_PUBLIC_AUDIO_BASE_URL`      | The public R2 custom-domain base used when composing 302 `Location` headers (§7.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R2 credentials/bucket            | Standard Cloudflare R2 binding for conditional PUTs, HEAD checks, and sidecar reads over the S3 API.                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Sizing note (added 2026-08-16) — three of these settings are one dial, and the numbers live in fluent-ai.**

```
slots = ⌊ TTS_MAX_BUFFERED_BYTES / TTS_MAX_CLIP_BYTES ⌋

required:  TTS_MAX_TEXT_LENGTH × (PCM bytes per character) ≤ TTS_MAX_CLIP_BYTES
```

The inequality is the load-bearing part. Break it and an oversized text is accepted, hashed, given a sidecar, billed and synthesized for minutes before being killed mid-stream — where a consistent pair refuses it at `generate` for nothing. So the text limit cannot be raised without raising the ceiling, and the ceiling cannot be raised without spending slots. fluent-ai warns at boot if a deployment's overrides break it.

**How long a verse to support is therefore the only real choice, and it was made against a survey rather than an estimate:** 1,005 translations, 11,227,230 verses, median 139 characters, genuine maximum 6,504 (`1KI 12:24`, the Septuagint addition, in LXX-based English Bibles). The failure directions are asymmetric, which is why the limit is set generously. Too **low** is loud and cheap — the verse is refused at the door with `TTS_TEXT_TOO_LONG`, nothing is spent, and an env var fixes it. Too **high** fails silently in two ways at once: the tripwire never fires, and the budget quietly supports a fraction of the concurrency it could, until translators meet `503`s under load nobody classified as load.

**This document deliberately does not state the current values or the current slot count.** The proposed-for-review baseline above (256 MiB ⇒ 8 slots at the provider's own ~31 MB ceiling) is kept as the reviewed starting point, but the bytes-per-character rate behind the ceiling was measured on a single English clip and is expected to be re-measured, so the ceiling will move again. Current values, the full coverage curve (what text limit supports what fraction of real verses), and the container-RAM arithmetic for a target slot count all live in one place: **`fluent-ai/docs/features/source-tts/source-tts-capacity.md`**, beside `config.py` and `.env.example`. Derive a concurrency figure from the two current settings; do not quote one from here.

fluent-api needs only what it already has for AI tools (`FLUENT_AI_URL`, service API key) plus the `EN_FEATURE_SOURCE_TTS` flag entry. **No Google key is added to fluent-api** — the original draft’s duplicate-key argument is withdrawn along with the architecture that required it.

---

## 9. Content-addressed artifact store (T6, T15, T21–T23, revised)

There is no database — and no staging filesystem. An artifact exists in a generation entry’s heap buffer, exists on R2, or does not exist; alongside it, the immutable request sidecar (§9.3) records the authorization and recipe to (re)create it. The store itself is the only record, so no tracking state can ever disagree with the bytes.

### 9.1 Identity: HMAC over a canonical recipe (T6, T18)

The identity is **recipe-addressed**: the HMAC names the synthesis _recipe_, and the stored bytes are one render of that recipe. A nondeterministic provider may render the same recipe differently on different attempts — every render is an equally valid reading of the same text, and §10.1’s first-writer-wins conditional PUT selects which render becomes the durable artifact. The artifact name is an HMAC (server secret `TTS_HASH_SECRET`, SHA-256) over a canonical recipe string with an explicit version prefix:

```text
v1:{text}\x1f{voice}\x1f{model}\x1f{format}\x1f{lang_code-normalized}
```

- **Version prefix** (`v1:`): injected server-side by fluent-ai when it builds the recipe — it is not a request field and never appears in the API. Any future change to the recipe’s composition (or any server-side change that should invalidate existing artifacts wholesale) bumps the version, cleanly separating old and new artifact namespaces. Costs nothing now; saves a migration headache later.
- **Provider-declared normalization:** each provider lists the protocol fields that cannot affect its output bytes (`non_byte_affecting_fields()`, §8.1); those are blanked to `-` in the recipe before hashing. For Gemini, `lang_code` is normalized out — the hint is advisory and does not change the audio — so `en`, `eng`, and absent all resolve to the same artifact and the same single billing event. A future provider for which `lang_code` _does_ change output simply omits it from the declaration and it participates in the hash. This mechanism keeps the protocol field (T18) while the identity tracks exactly the fields that can affect the rendered output.
- **Format is in the hash.** The requested compressed format is part of what the client asked for, so an `mp3` request is a distinct artifact from an `ogg-opus` request for the same text — the two never collide, and each hash resolves to exactly one R2 object. (The in-flight WAV stream is a lifecycle stage of that one artifact, not a separate identity.)
- **HMAC, not a bare hash:** scripture text is public, so a plain content hash would be computable by anyone; the server secret is what makes “knowing the hash” meaningful as a capability on the public R2 domain (§7.3, §11.1).
- Spoken text is never trimmed, case-folded, or otherwise altered before hashing — only structurally absent optional fields normalize to a canonical placeholder.

### 9.2 Generation lifecycle: RAM budget, admission, accounting (T21, T25)

```text
R2: requests/{hash}.json    written by generate (conditional PUT; immutable capability)
        │ first get-audio: sidecar read → admission check → detached task (§7.2 rung 4)
heap: entry { state, buffer, cond, task }   PCM appended live; readers tee from the buffer
        │ task tail: HEAD check → ffmpeg pipe → conditional PUT (§10.1)
R2: audio/{hash}.ogg        immutable compressed artifact, publicly served
R2: receipts/{hash}.json    best-effort metadata, uploaded last (§9.3)
```

**Admission control (T25).** The generation dict is byte-capped by `TTS_MAX_BUFFERED_BYTES`. A request that would spawn a _new_ generation briefly waits for an admission slot (`asyncio.wait_for` on a semaphore, a couple of seconds — a short queue absorbs bursts) and otherwise receives **`503` + `Retry-After` before any header bytes** have been written, so the client can retry cleanly (§6.1). The cap gates new generations only: attaching to an existing entry, serving 302s, and 404s all bypass it. Per-clip memory is bounded by `TTS_MAX_CLIP_BYTES` (raw 24 kHz mono 16-bit PCM is ~48 KB/s), and a slot is released only when its buffer is truly released. **That ceiling was originally the provider's own — ~31 MB, i.e. Gemini's 655-second output cap — and implementation re-derived it from the product instead (2026-08-16); the current value and the slot count it implies are given in §8.4's sizing note, which supersedes any figure quoted here.** The re-derivation is worth the sentence because the provider's cap failed at _both_ of this number's jobs: as a tripwire it required eleven minutes of continuous audio for one verse before firing, so every failure it was meant to catch had already been billed in full; and as a reservation it charged 31 MB against a shared budget for clips that actually run well under a megabyte, buying a small fraction of the concurrency the same memory could support. **The semaphore is sized as a worst-case byte reservation:** slots = ⌊`TTS_MAX_BUFFERED_BYTES` / per-clip ceiling⌋, so concurrent generations cannot exceed the budget even if every clip hits the provider ceiling — a count semaphore _is_ the byte gate once each count is worth the ceiling. This is consciously conservative (verse clips run far below the ceiling); true byte-accounting admission was considered and rejected as v1 complexity. Belt-and-suspenders overflow policy: the buffer writer enforces the per-clip ceiling **per append** — a stream that exceeds the provider’s own output cap indicates a misbehaving provider, and that generation is aborted through the §7.2.1 honest-failure path and counted in monitoring. The authoritative byte counter (below) remains the accounting truth; the semaphore is the admission gate.

**Accounting.** Entries live in the primary dict until their compressed artifact is uploaded, then drop into a `WeakValueDictionary` **draining set** while remaining readers finish. `weakref.finalize(buffer, release, nbytes)` decrements the byte counter exactly when the last reference drops (CPython’s refcounting makes this prompt) — **erratum (2026-08-13): `buffer` must be a `bytearray` _subclass_**, since a plain `bytearray` cannot be the target of a weak reference at all (`TypeError`) and the line as written above does not run. The subclass exists only to carry `__weakref__` (measured: 32 bytes per buffer, inheriting every `bytearray` operation the writer, readers and compression tail use), must never be given `__slots__` — which suppresses `__weakref__` again and reinstates the same `TypeError` — and changes nothing else here. The refcount is what makes this design work at all: a buffer is held by the writer, by every live reader, and by the compression tail, in no fixed order, so no participant knows whether it is the last, and any explicit release call would either free the slot while a slow reader is still streaming or hold it after everyone has gone. Entry objects must stay out of reference cycles (entry ↔ task) or release goes lazy — and the design would otherwise create exactly such a cycle on the failure path, so the concrete cycle-break is a stated requirement: the done-callback clears `entry.task` after retrieving the exception and records failures as strings/error codes, never exception objects (§8.3). The lookup order is primary dict → draining set → R2 — with the rule that a new reader attaches to a draining entry **only if the compressed object does not exist yet**; once it does, the redirect wins (Range support, `Content-Length`, cacheability, and ~10× fewer bytes). The reader max-lifetime (§7.2.1) bounds the draining phase.

**Liveness: every slot must come back (added 2026-08-16).** The sizing argument above — and §8.4's "slots are held only for seconds each" — is not a claim about capacity but about **turnover**: 30 slots at a few seconds each is hundreds of generations a minute, while 30 slots held indefinitely is 30 generations, ever. That rests on a premise worth stating, because it is not self-evidently true: _every admission reservation is eventually released._ Most endings deliver it — the provider finishing, raising, sending an in-band error (§8.2), or breaching the per-clip ceiling all reach the done-callback and free the buffer; a client disconnecting is irrelevant because the task is detached (§8.3); SIGTERM is handled by shutdown cancellation. **One ending releases nothing: a provider that connects and then stops sending.** Such a task is neither failing nor finishing — it is parked on a socket read, with no exception to catch and no end-of-stream to observe — so its reservation is held until the process dies. The failure this produces is unusually hard to read: the budget is exhausted by _reservations_ rather than bytes, so memory graphs stay flat and low; nothing errors, so no alarm fires; health checks pass because the rest of the service is fine; and the symptom is service-wide `503` + `Retry-After` that clients quietly retry into forever, **not recovering even after the provider does**, because the recovery path is "a slot frees up" and none ever will. Only a restart clears it. `TTS_GENERATION_TIMEOUT_SECONDS` (§8.4) closes exactly this hole, and `TTS_READER_MAX_SECONDS` closes its mirror image on the reader side; both sit above the provider's 655 s output ceiling so that neither can fire on legitimate work.

**Budget authority.** The service’s own byte counter is the authoritative gate. An optional secondary tripwire may compare cgroup `memory.current` against the container limit (what the OOM killer actually sees), but process RSS must never be used as a wait-until-it-improves signal: RSS over-reports live data after spikes (fragmentation, unreturned arenas) and would throttle the service permanently.

**Dedup scope.** The dict dedups perfectly within one process — a double-clicked play or duplicate React effect attaches to the same entry and bills once. Across instances, dedup is the routing ladder (T26) plus compression-time conditional PUT (§10.1); the worst multi-instance outcome is duplicated synthesis cost, never a corrupt artifact, and a replica dying mid-generation self-heals because the request sidecar lets any other instance regenerate.

### 9.3 Two sidecars: request and receipt (T23)

Keys under `TTS_R2_PREFIX`: `requests/{hash}.json`, `audio/{hash}.ogg` (or `.mp3`), `receipts/{hash}.json`. The `requests/` prefix is isolated so the optional WAF path-block (§7.3) stays a one-rule affair.

**The request sidecar is a capability plus a recipe.** Written by authenticated `generate` with a conditional PUT (`If-None-Match: *`), it is immutable and makes repeated `generate` calls idempotent no-ops. It contains the complete synthesis input — exact text, voice, model, normalized `lang_code`, format, recipe version — so `get-audio` on any instance can regenerate the artifact with zero other state.

**The receipt is best-effort metadata only:**

```json
{
  "recipe_version": "v1",
  "model": "gemini-3.1-flash-tts-preview",
  "voice": "Kore",
  "format": "ogg-opus",
  "content_type": "audio/ogg",
  "duration_ms": 4380,
  "size_bytes": 31240,
  "created_at": "2026-07-23T18:00:00Z"
}
```

It carries **no text and no user identifiers** (it is publicly fetchable), and it is a receipt, never a ledger — written once, never updated. Crucially, the receipt is **not a commit marker**: R2 object PUTs are atomic, so the audio object’s presence is self-certifying, and both the serving waterfall (§7.2) and the compression HEAD check (§10.1) key on the audio object alone. A crash between the audio PUT and the receipt PUT is harmless — the artifact plays, and duration is recoverable client-side from the container header. The upload ordering rule stands (audio first, receipt last), but no serving or dedup logic may _require_ the receipt: a required marker would recreate exactly the stuck-lock failure mode this design eliminates.

### 9.4 No eviction (revised from LRU trimming)

v1 has **no eviction policy**. Compressed verse-sized clips are small; a whole Bible per voice/model lands in the hundreds of megabytes on R2, i.e. cents per month at R2 pricing. One growth asymmetry worth naming: request sidecars accumulate per _prefetched_ verse (every `generate` writes one), while audio objects appear only per verse actually _listened to_ — so the sidecar count outgrows the audio-object count; at roughly a kilobyte per sidecar against tens of kilobytes per compressed clip, the byte impact is negligible and the cents-per-month arithmetic is unaffected. Unbounded growth is consciously accepted and revisited only if usage proves the arithmetic wrong. (Process memory does not grow with the store: entries leave the heap once uploaded and their readers finish.) No-eviction also underpins the access posture: a synthesized hash is effectively a one-shot capability — its request sidecar can only ever be “spent” once — so a leaked URL cannot be replayed into new provider spending; introducing eviction would reopen that regeneration window and is the trigger to revisit §7.3. Generated clips remain reproducible for fractions of a cent; target recordings are irreplaceable human artifacts and must never inherit any future TTS deletion policy.

---

## 10. Compression as the generation tail, and process topology (T9, T20, T24, T26, revised)

### 10.1 Task tail, not a worker (T24)

The previous draft ran a standing poller loop scanning a staging directory. That loop is **retired**: with nothing on disk to scan, compression is simply the tail of each generation task (§8.2’s `generate_into`), running after `state` flips to `complete` while readers keep streaming from the buffer. No new process, container, queue, or startup change is asked of the fluent-ai owners.

Tail shape:

1. Acquire the ffmpeg semaphore (`TTS_FFMPEG_CONCURRENCY`, default **1**) — verse-sized encodes take well under a second, so serializing them costs little and keeps worst-case CPU/RSS flat.
2. `HEAD` the target `audio/{hash}.{ext}` — if another instance already uploaded it, skip straight to draining.
3. Transcode with ffmpeg via `asyncio.subprocess`, **piping from the heap buffer** — no temp file. Recommended: skip the 44-byte WAV header and feed raw PCM with explicit parameters (`-f s16le -ar 24000 -ac 1 -i pipe:0`), which is self-describing and immune to header quirks; this is a recommendation, not load-bearing — writing the buffer as-is with `-f wav` also works. Both target containers (Ogg, MP3) are pipe-safe streaming formats; MP4-family containers would not be (they seek back to write metadata), which is one more reason `ogg-opus`/`mp3` are the only requestable formats (§7.1). Target format comes from the request sidecar, which always carries a concrete value — `TTS_DEFAULT_FORMAT` was resolved at `generate` time for requests that omitted `format` (§7.1), so the tail never sees an unspecified format.
4. Upload the compressed object with a **conditional PUT (`If-None-Match: *`)** — concurrent duplicate generations on different instances collapse harmlessly here, **first writer wins**: the first PUT fixes the canonical artifact, and a losing instance discards its own render. A nondeterministic provider means the losing render may differ byte-wise from the winner — both are valid renders of the same recipe (§9.1); the losing instance’s live readers simply finish hearing the render they started, and every later fetch serves the stored winner. Then upload the receipt (§9.3: audio first, receipt last, nothing may require the receipt).
5. Move the entry from the primary dict to the draining set (§9.2); remaining readers finish from the buffer, new readers get the 302.

Every step is idempotent under crash/restart: a process that dies anywhere in the tail leaves either no compressed object (the next `get-audio` finds the request sidecar and regenerates — provider cost, not correctness) or a complete one (the HEAD/conditional-PUT pair makes re-runs no-ops).

**Process topology (T26).** The generation dict is per-process state, so **fluent-ai must run a single application process** — uvicorn/gunicorn `workers=1` is a hard requirement (it is also the service’s observed current shape), pinned explicitly in deployment config (§11.3).

**Instance topology is a declared deployment requirement, not a coordination design.** Browsers legitimately issue more than one request per clip — a double-tapped play, a media-element probe followed by the real fetch, a Range re-request — so without routing constraints one clip’s generation can start concurrently on more than one fluent-ai instance. This proposal does not know, and deliberately does not assume, what instance count or coordination facilities fluent-ai’s deployment has today (there may be exactly one instance, or merely an open door to more). Rather than design distributed coordination against that unknown, it hands deployment a precise requirement: **provide either (1) a single fluent-ai instance, or (2) static routing of `get-audio` requests to instances** — consistent hashing on the URL path is the natural mechanism, because the hash _is_ the content identity. In practice this is a _satisfaction ladder_, in order of what platforms tend to offer: a single replica (the assumed v1 posture, trivially compliant) → load-balancer session affinity → consistent-hash-on-path → nothing. Every rung remains **correct** — the request sidecar lets any instance regenerate and the conditional PUT collapses duplicate uploads — so an unmet requirement degrades to duplicated synthesis cost, bounded by instance count, never to a wrong artifact. If fluent-ai is ever scaled beyond one instance, satisfying this requirement is the named problem to solve at that point.

### 10.2 ffmpeg packaging (T20, revised)

- **Suggested: a Python package that bundles the ffmpeg binary.** Being in Python effectively gets ffmpeg for free — pip wheels ship platform binaries (e.g. the static-ffmpeg family), so the dependency is an ordinary `pyproject` entry with no image or hosting change. This keeps transcoding in-process-adjacent, with no network hop inside the pipeline.
- **Workable alternative: the team’s planned containerized ffmpeg** ([klappy/transcode-mcp](https://github.com/klappy/transcode-mcp/tree/main/container)), raised in review as a shared transcoding resource. If that service is provisioned and the team prefers one shared transcoder, the tail’s transcode step becomes a call to it instead of a local subprocess. The trade is a runtime dependency on an external service (latency, availability, auth) inside the artifact pipeline — reasonable once the service exists and is operated, but this proposal does not make v1 wait on it.

The pre-review draft’s format-negotiation ladder (probe native ffmpeg → `ffmpeg-static` → pure-JS MP3 floor → `ffmpeg.wasm`) is **gone**: it existed because a Node service couldn’t assume an encoder. The compression tail always has ffmpeg by construction, so both requestable formats (`ogg-opus`, `mp3`) are always encodable — the request’s `format` is honored as-is (§7.1), never renegotiated.

---

## 11. Authorization, rollout, and cost posture

### 11.1 View-level permission alias (T13)

Add a documented alias alongside `AI_TOOLS_USE` in fluent-api:

```ts
TTS_USE: 'project:view',
```

Both TTS proxy routes (`generate` and `get-audio`) use `PERMISSIONS.TTS_USE`. This names the capability at route call sites while reusing the existing RBAC row; promotion to a distinct permission later requires a new permission row/role mappings and one string-value change, not route rewrites.

The view-level alias is deliberate: anyone allowed to see source scripture should be allowed to hear it. Reusing `content:update` would exclude reviewers and undermine the planned alternating review mode.

**Acknowledged divergence from D10 (raised in review as RC6).** Team decision D10 (2026-06-11) requires new API endpoints to be authenticated. Both endpoints the _application_ calls go through fluent-api and are fully authenticated, satisfying D10 where it binds. The divergence is one hop deeper: the compressed-artifact 302 target on the public R2 domain is capability-secured (HMAC-keyed unguessable URL, §9.1) rather than session-authenticated. This proposal treats that as an acceptable, explicitly-flagged posture for source-scripture audio — the source text itself is not access-restricted at this granularity, the URL space is unenumerable, and the money path (`generate`) is authenticated — but it is a **named review decision (R1)**, not a default silently assumed. If the team rules that D10 extends to the artifact bytes, the fallback is the full-proxy variant in §7.3 (fluent-api streams the R2 body instead of redirecting), which keeps every byte behind auth at the cost of egress through the API pod.

### 11.2 Security and abuse controls

- The Google key lives only in fluent-ai and is never exposed to fluent-web or fluent-api.
- `TTS_HASH_SECRET` must be treated as a secret: it is what makes artifact URLs unguessable — the capability half of the serving posture (§7.3, §11.1).
- Validate text length in fluent-ai, before any provider call — and in exactly one service, so there is no second value to drift (amended 2026-08-11, §7.1).
- Avoid logging full source text or provider payloads at ordinary log levels.
- Return stable Fluent error codes rather than raw SDK errors.
- The public bucket must not be listable, and receipts must never contain source text or user identifiers (§9.3). Optionally add a WAF rule blocking `requests/*` on the public domain for defense-in-depth (§7.3).
- The request-sidecar conditional PUT plus the compression-tail conditional PUT are **storage-level dedup/idempotency guards** — they guarantee one durable object per identity, not one provider call. Provider-call dedup is the in-process generation dict (perfect within one instance) plus the T26 routing requirement across instances; per §9.2’s dedup-scope statement, the multi-instance worst case is duplicated synthesis _cost_, never a corrupt artifact. Treat all of these as security-adjacent invariants in review. The admission cap (T25) is the memory-exhaustion guard — a flood of distinct-hash requests degrades to `503`s, not an OOM kill.
- Monitor artifact misses, generated seconds, provider failures, buffered-bytes high-water mark and 503 admission rejections, transcode failures, and conditional-PUT conflicts.
- Defer rate limits until observed use warrants them; the 20,000-character cap and the RAM-budget gate are the v1 request guardrails beyond normal auth.

### 11.3 Rollout

1. Merge implementation dark behind `sourceTts` (frontend-hide semantics; backend always live — §6.3).
2. Provision fluent-ai’s TTS env (§8.4), the R2 bucket with its custom public domain (not `r2.dev` — §7.3), and pin fluent-ai to a single application process (`workers=1`, T26) in deployment config.
3. Confirm live heap streaming, the full waterfall (attach / 302 / lazy generation / 404), the fluent-api pass-through with `redirect: 'manual'`, and the compression tail against real browsers — with **Safari (macOS and iOS) as the make-or-break verification target**: it is the browser most likely to reject the streaming-era chunked WAV (§6.1 platform risk), so verify either that it streams or that the stall watchdog's wait-for-compressed recovery delivers an acceptable first-listen delay.
4. Demo via the hidden frontend override before public enablement; a missing Gemini key with the override on is a valid error-path check, not a blocker.
5. Enable the flag broadly once provider behavior and R2 serving are accepted.

### 11.4 Cost posture

Synthesis costs fractions of a cent per verse and is billed only when someone actually listens — `generate` writes a sidecar, not audio, so pre-generating UI affordances cost nothing (T8). Content addressing plus the conditional-PUT guards keep it to one paid synthesis per artifact per instance, and the routing ladder (T26) makes cross-instance duplication rare and bounded. R2 storage of compressed clips is cents per month even at whole-Bible scale (§9.4), and R2 egress is free — which is exactly why the heavy-bytes path 302s to R2 instead of proxying through service pods. The conscious v1 trade is unbounded-but-tiny storage growth in exchange for zero lifecycle machinery.

---

## 12. Testing

### 12.1 fluent-web

| Area        | Representative cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Controls    | Both play actions use visible panel text; missing reference verse is not playable; spinner/stop/error states; accessible labels and touch targets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Keyboard    | Shortcuts act on active verse and do not collide with typing/editor shortcuts; stop is global to active playback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Queue       | Play-one stops; play-from-here advances, highlights, scrolls, prefetches; stop clears queue; network gap state; chapter-end confirmation/no silent navigation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Engine seam | Server engine request includes known `lang_code`; sibling-relative `audio_url` resolves against the response URL (§7.1); cancellation is local-safe; element error → HEAD re-probe classification (404 → one re-`generate` + reload; 503 + `Retry-After` → quiet delayed retry; 200/302 → src reset); retries capped per failure class; Stop/AbortSignal cancels a _pending_ retry timer; exhaustion → toast + idle for a playing clip, silence for a prefetch; stall watchdog: streaming-era clip with no `progress`/`canplay` before the timeout → wait-for-compressed recovery (HEAD-poll until 302, then reload), watchdog timer cancelled by Stop/AbortSignal, no watchdog once a clip is playing or compressed (§6.1 platform risk). |
| Playback    | WAV stream plays while synthesizing; Ogg/MP3 plays from the redirect; playback rate does not resynthesize; unknown-duration stream degrades gracefully.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Flags       | `sourceTts=false` hides controls; hidden override shows them; loading/failure remains fail-closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### 12.2 fluent-api (proxy)

| Area       | Representative cases                                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route/auth | 401 unauthenticated on both routes, 403 without view permission, input validation, stable errors, 20k-default boundary.                                                                                                                                              |
| Generate   | Forwards to fluent-ai with `X-API-Key`; passes the response body through unmodified (the sibling-relative `audio_url` resolves against fluent-api’s own route because the route tails mirror — §7.1); maps fluent-ai errors to Fluent codes.                         |
| Get-audio  | Internal fetch uses `redirect: 'manual'` — a 302 from fluent-ai is relayed to the browser, never followed; streaming bodies pass through unbuffered (verified, not assumed); status/headers (`Content-Type`, `Cache-Control`, `Retry-After`) are relayed faithfully. |

### 12.3 fluent-ai

| Area             | Representative cases                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity         | HMAC recipe stability across field orderings; version prefix present; Gemini `lang_code` normalization (`en`/`eng`/absent → one hash); text never altered.                                                                                                                                                                                                                                                                         |
| Generate         | Writes request sidecar via conditional PUT; repeat `generate` is an idempotent no-op; no provider call ever made from `generate`; response carries no duration field.                                                                                                                                                                                                                                                              |
| Admission        | Concurrent `get-audio` for one hash → one entry, one provider call, second request attaches; byte cap exceeded → brief wait then `503` + `Retry-After` before any body bytes; slot released only when the buffer is freed (finalizer accounting); concurrent clips at the cap boundary never exceed `TTS_MAX_BUFFERED_BYTES` (worst-case slot sizing); a stream exceeding the per-clip ceiling aborts via the honest-failure path. |
| Waterfall        | Each rung resolves in order (heap attach → sidecar-or-404 → 302 → spawned generation); draining-set entry serves attach only while the compressed object is absent.                                                                                                                                                                                                                                                                |
| Live streaming   | Reader stream grows with the buffer via the Condition; `complete` mid-read finishes cleanly; `failed` mid-read aborts the connection (never a clean EOF); reader max-lifetime fires; FF-size WAV header never rewritten.                                                                                                                                                                                                           |
| Provider failure | Mock provider stream; mid-stream provider error → state `failed`, all readers abort, entry removed, **no server-side retry**; task done-callback logs unconsumed exceptions.                                                                                                                                                                                                                                                       |
| Compression tail | HEAD-present skips encode; ffmpeg fed by pipe from the buffer (no temp file); conditional-PUT conflict treated as success; audio-then-receipt upload order; entry moves to the draining set afterward.                                                                                                                                                                                                                             |
| Serving          | Correct Content-Type per representation; `302` (not `301`) with correct extension-swap target; strong ETag + immutable cache headers on the compressed path; `private`, short-lived caching while streaming.                                                                                                                                                                                                                       |

A provider integration smoke test should synthesize a short non-sensitive fixture against the configured preview model, verify streamed PCM arrives and the in-flight WAV stream plays, run one real transcode through the pipe, and confirm the R2 round trip (request sidecar, audio object, receipt). It should be opt-in so ordinary tests never incur provider cost.

---

## 13. Future roadmap (designed for, not built)

1. **Target-side recording dovetail (fluent-web#84):** mirrored record controls, shared playback/recording stop presentation, and durable recording storage — R2 like the mobile precedent, but behind **authenticated serving**, since recordings carry a user’s voice (§7.3 tension).
2. **Alternating review mode:** queue source TTS verse 1 → recorded target verse 1 → source TTS verse 2 → recorded target verse 2. Queue items should therefore pair a verse reference with a generic audio source, not assume every item comes from `TtsEngine`.
3. **Browser-local Web Speech option:** a future per-user `server | local` preference can trade voice consistency for zero provider cost and better behavior on weak connections. Voice availability/quality remains device-dependent.
4. **Custom low-resource engine in fluent-ai:** another `TtsProvider` behind the same endpoints, selected by config or language; it declares its own byte-affecting fields (where `lang_code` likely _does_ join the hash).
5. **Voice picker and synthesis-time pacing:** `voice` is already in the contract, so a picker only needs UI plus validation against the provider's voice list. Pacing needs a **new** optional request field, defined with real values at that point rather than reserved blind (see the §7.1 amendment note). Either joins the recipe when it affects generated bytes, under a bumped version prefix. Client `playbackRate` remains the cheap speed control.
6. **CDN in front of R2 / signed URLs:** the custom public domain (§7.3) already puts Cloudflare in front of the compressed objects, so basic CDN caching is largely in place; signed URLs become relevant if the serving posture tightens (content-sensitivity trigger in §7.3, or eviction per §9.4) or recordings share infrastructure.
7. **Read-only and source-Bible listening surfaces:** reuse `features/tts/`; those surfaces may choose continuous playback across page breaks because boundary policy is frontend-owned.
8. **Artifact lifecycle policy:** only if R2 growth ever escapes the cents-per-month arithmetic; age-based expiry via R2 lifecycle rules would be the natural tool (there is no LRU state to consult, by design) — noting that any eviction reopens the regeneration window and forces the §7.3 access-posture revisit (§9.4).
9. **Rate limiting and budget controls:** add only with usage evidence, using metrics collected from v1 rather than guessing quotas now.

---

## 14. Review checklist

The design decisions T1–T26 are the recommended path. Review input is particularly valuable on:

| #      | Item for review        | Proposed resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** | Serving/auth posture   | Option (b) proxy as default: both endpoints authenticated behind fluent-api; compressed bytes 302 to capability-secured public R2. Divergence from D10 at the artifact-bytes hop is explicitly acknowledged (§7.3, §11.1); the full-proxy variant is the documented fallback if D10 is ruled to extend that far.                                                                                                                                                                                                                                   |
| **R2** | Env/model/voice names  | fluent-ai: `TTS_MODEL=gemini-3.1-flash-tts-preview`, `TTS_VOICE=Kore`, `TTS_MAX_TEXT_LENGTH=20000`, `TTS_HASH_SECRET`, `TTS_MAX_BUFFERED_BYTES=256 MiB` with `TTS_MAX_CLIP_BYTES` (slots = ⌊budget / per-clip ceiling⌋ — 8 as originally proposed, 30 at the ceiling implemented; **derive it from the two current values rather than quoting either figure**, and dial the budget against fluent-ai's real container memory limit, §8.4), `TTS_FFMPEG_CONCURRENCY`, `TTS_DEFAULT_FORMAT`, `TTS_R2_PREFIX`, `TTS_PUBLIC_AUDIO_BASE_URL`, R2 creds. |
| **R3** | Transcode packaging    | Python pip package bundling ffmpeg (suggested) vs the shared transcode-mcp container (workable alternative) (§10.2).                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **R4** | Loading/error UX       | Spinner until playback starts, persistent Stop for local intent, non-blocking editor, established toast on failure; mid-stream provider failure surfaces as an audible stop + one clip restart (§5.2).                                                                                                                                                                                                                                                                                                                                             |
| **R5** | Cost/growth acceptance | No eviction in v1; unbounded R2 growth consciously accepted at cents/month (§9.4, §11.4). RAM is bounded by `TTS_MAX_BUFFERED_BYTES` with 503 admission control (§9.2); at the proposed 256 MiB default that is 8 worst-case slots held for seconds each, and a burst beyond them answers `503` + `Retry-After` by design rather than growing memory (§8.4).                                                                                                                                                                                       |

No PR should implement the roadmap items in §13 as part of v1. Review approval should confirm the service split, the content-addressed artifact design, the lazy heap-generation model, the serving posture, and the proposed defaults before repo-specific implementation cards/PRs are opened.

---

## 15. Verification sources

External facts in §§8 and 10 were rechecked on July 14 and July 16, 2026, with the serving/R2 facts re-verified on July 23, 2026:

- [Google Gemini TTS documentation](https://ai.google.dev/gemini-api/docs/speech-generation) — Preview model status, supported model family, streaming support for ≥ 3.1 TTS models, raw PCM characteristics, and the ~655-second output cap.
- [Google Interactions API documentation](https://ai.google.dev/gemini-api/docs) — the Interactions surface, now **GA** (re-verified 2026-07-16; it was Beta at first drafting).
- [Google Generate Content TTS documentation](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation) — the older `models.generateContent` TTS surface, now titled **Legacy**.
- [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) — current TTS token prices and the preview caveat.
- [klappy/transcode-mcp container](https://github.com/klappy/transcode-mcp/tree/main/container) — the team-referenced containerized ffmpeg alternative for transcoding (§10.2).
- [Cloudflare R2 documentation](https://developers.cloudflare.com/r2/) — object storage pricing model (free egress), lifecycle-rule capability (§9.4/§13), atomic object PUT semantics and conditional writes (`If-None-Match`) relied on in §9.3/§10.1, and public-bucket serving: custom domains recommended for production, `r2.dev` rate-limited and not production-grade, no public list operation (§7.3).
- WAV/RIFF streaming convention — `0xFFFFFFFF` chunk sizes as the established “unknown length, read to EOF” streaming-header practice tolerated by players and ffmpeg (§7.2.1).

---

_Originally prepared 2026-07-14; revised 2026-07-16 and 2026-07-23 after the first and second engineering review rounds of PR #356, with a further 2026-07-23 pass addressing the CodeRabbit review (CB1–CB6) and a 2026-07-28 pass addressing the third review round (N1–N6). Author: Joshua Lansford._
