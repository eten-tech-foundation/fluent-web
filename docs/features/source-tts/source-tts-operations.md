# Source-TTS operations: deploying it, and proving it works

**Who this is for:** whoever turns source-TTS on in a real environment. It is the deploy checklist,
the decisions still owed, and — the part nothing else gives you — **how to tell that the artifact
store is actually serving**, which is invisible by every ordinary means.

**It deliberately states no configuration values.** Those live in each service's `.env.example`,
which explains every variable next to its own trade-offs, and in
[`fluent-ai/docs/source-tts-capacity.md`](../../../../fluent-ai/docs/source-tts-capacity.md) for the
RAM/length dial. A number repeated in two places drifts.

---

## 1. Before you start: four things that are not settled

None of these block a dark deploy. All of them should be read **before the flag goes on for real**.

|                       | What is open                                                                                                                                                                                                                                      | What it costs if you skip it                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting**           | Whether fluent-ai is actually deployed in this environment. `deploy/azure/env/*.env` carries `AI_IMAGE=fluent-ai:latest`, which _suggests_ yes — but the feature-flag work exists precisely because it was not hosted. **Verify, do not assume.** | The feature cannot work at all.                                                                                                                                         |
| **Container memory**  | `TTS_MAX_BUFFERED_BYTES` defaults to a budget that was **asserted, not derived** — the real container limit is not in any repo. §8.4 wants the budget at roughly ⅔ of the container.                                                              | If the container is smaller than assumed, a busy minute is an OOM — and an OOM kills **every in-flight stream**, not one request.                                       |
| **Instance topology** | `--workers 1` is already pinned in fluent-ai's Dockerfile (do not "optimize" it away — see the comment there). Still open: a **single replica**, or static routing of `get-audio` by hash-on-path.                                                | Duplicate synthesis, so a doubled provider bill. Never a wrong artifact: the sidecar lets any instance regenerate, and the conditional PUT collapses duplicate uploads. |
| **Safari / iOS**      | Untested. §6.1 names it a platform risk: the streaming first listen is chunked with no `Content-Length`, which Safari may stall on **without firing `error`**. The stall watchdog's wait-for-compressed recovery is built for exactly this.       | Affected users get a longer first-listen spinner — or, if the watchdog is wrong, silence. §11.3 step 3 makes this the make-or-break verification target.                |

---

## 2. ⚠ The flag defaults to **ON**

`EN_FEATURE_SOURCE_TTS` unset publishes **true** wherever fluent-ai is wired, because its default is
`aiIsWired` — the same contract `repeatedWordCheck` and `aiSuggestions` already use. `.env.example`
ships the line **blank**, and blank is read as unset.

**So merging this turns TTS on in every AI-wired environment unless someone writes an explicit
`false`.** That is deliberate and approved; it is stated here because it is the opposite of what
"ship dark" usually implies, and it should be a choice rather than a discovery.

To ship dark, set it explicitly:

```bash
EN_FEATURE_SOURCE_TTS=false      # `false` / `0` / `no` / `off`; BLANK MEANS ON
```

---

## 3. Deploy checklist

- [ ] **fluent-ai is hosted** in this environment, and reachable from fluent-api as `FLUENT_AI_URL`
      with a matching `FLUENT_AI_KEY`. (Both are also what makes the flag default on.)
- [ ] **R2 bucket exists**, one per environment. The team's convention is one bucket per purpose;
      upstream's own `.env.example` already reserves `fluent-tts-{dev,qa,prod}` for this feature.
- [ ] **Bucket jurisdiction matches** `R2_JURISDICTION`. The S3 endpoint is _derived_ from the
      account id and jurisdiction, so an unpinned host fails `HeadBucket` against buckets that
      genuinely exist — a confusing failure, and the reason there is no endpoint variable.
- [ ] **A custom public domain is attached to the bucket** and set as `TTS_PUBLIC_AUDIO_BASE_URL`.
      **Not `r2.dev`** (§7.3). This is the 302 target; blank makes redirects fail cleanly rather
      than emit a broken URL.
- [ ] **The bucket is not listable**, and ideally `requests/*` is blocked at the edge. Artifact URLs
      are capability-secured (unguessable, HMAC-keyed), which only holds if the space cannot be
      enumerated (§11.2).
- [ ] **`TTS_HASH_SECRET` is set to a long random value and will stay stable.** Changing it renames
      every future artifact — old ones are orphaned, not broken. Never commit the real one.
- [ ] **Memory budget sized against the real container limit** — see the capacity doc, and the
      open item in §1.
- [ ] **`--workers 1` still pinned** in the deployed image.
- [ ] **ffmpeg is present.** Already handled: both Dockerfiles install it, because `imageio-ffmpeg`
      publishes **no musl wheel** and the bundled binary therefore does not exist on the Alpine base
      (found by running the real container, not by any test). `TTS_FFMPEG_BINARY` is the escape
      hatch if you need to supply your own build — the bundled one is GPL and large.
- [ ] **Flag decided explicitly** (§2 above).

---

## 4. Proving it works — including the part you cannot hear

Deploying dark and then forcing the flag on locally verifies most of the feature: controls appear,
audio plays, continuous mode advances. **It does not tell you whether the artifact store is
working.** A deployment that serves every clip from R2 and one that silently re-synthesizes every
single listen sound _exactly_ the same. The only difference is the bill.

Nothing in the browser reveals it on its own, and this was measured rather than assumed
(Chrome, 2026-08-20 — see `self-notes .../tools/media_redirect_visibility_check.py`):

- an `<audio>` element that follows a 302 still reports the **original** URL as `currentSrc`; the
  redirect happens inside its own fetch, below anything the app can observe;
- cross-origin resource timing hides the redirect entirely unless the bucket sends
  `Timing-Allow-Origin`, so "no redirect recorded" and "served from the bucket" look identical.

So the app says it out loud instead.

### The wash tells you

`generate` names the compressed object directly when one already exists (§7.1), so the browser can
read the container off the clip URL. While the flag is **forced on** in `/debug`, the playback
highlight is colour-coded:

| Wash                              | Meaning                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Blue** (the ordinary highlight) | This listen paid for a fresh synthesis — streaming `.wav` from the generation heap.                              |
| **Purple**                        | Served from the bucket: a compressed `.ogg` artifact.                                                            |
| **Dark purple**                   | Served from the bucket as `.mp3` (whichever `TTS_DEFAULT_FORMAT` is set to, or a browser that cannot play Opus). |

**The check, in three steps:**

1. `/debug` → force `sourceTts` **on**. (Forcing on a flag that is already on is a no-op for
   everything else, so this is safe in any environment — it is how you say "I am verifying".)
2. Play a verse. It should be **blue** — nobody had listened to it before, so it was generated now.
3. Wait a few seconds for the compression tail, then play the **same verse again**. It should be
   **purple**.

**Blue the second time means the artifact store is not serving** — every listen is being paid for.
Check `TTS_PUBLIC_AUDIO_BASE_URL`, the bucket credentials, and whether the compression tail is
failing (an encoder that cannot run leaves the clip attachable and regenerable, so playback keeps
working and only the cost goes wrong — which is exactly why this needs looking at rather than
listening for).

Set the override back to **Default (from API)** when you are done.

> **One deliberate inaccuracy.** If compression finishes _between_ `generate` and the first GET, the
> clip is reported blue while actually being served from the bucket. The error only ever runs that
> way — you can under-report a cache hit, never over-report one — so a purple wash is always true,
> and reality is never worse than the colour suggests.

### What else to look at

- **`tts generate authorized`** logs carry `sidecar_written`. `False` means this artifact had been
  authorized before.
- **`tts audio attach`** logs carry `rung` — `heap` (attached to a live generation, one bill for two
  listeners), `spawned` (this request started the synthesis), `draining`. There is deliberately **no
  log line for the 302**, so a healthy cached deployment gets _quieter_ here, not louder. Absence of
  `spawned` lines under real usage is the server-side version of a purple wash.

---

## 5. Cost posture, briefly

Synthesis is billed only when someone actually listens: `generate` writes a sidecar and spends
nothing, so UI affordances nobody uses cost nothing. Content addressing plus conditional PUT keep it
to one paid synthesis per artifact. R2 storage of compressed clips is cents per month even at
whole-Bible scale, and **R2 egress is free** — which is why the heavy bytes 302 to R2 instead of
being proxied through service pods. The conscious v1 trade is unbounded-but-tiny storage growth in
exchange for no lifecycle machinery.

This is also why §4 matters: a broken artifact store does not fail, it just quietly moves every
listen back onto the paid path.
