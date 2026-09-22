# Audio playback design

Fluent's audio controls let a translator hear the source text or resource they are reading. A playable may use a recorded source, synthesized speech, or both. This document describes the shared playback design, the drafting controls delivered for source and reference Bibles, and the decisions that guide later resource controls. The [source-TTS proposal](../source-tts/source-tts-suggestion.md) retains the synthesis contract and artifact-store detail; this design governs playback, provenance, visibility, and the licence fence.

## 1. The problem

A recorded Bible is commonly one chapter file with verse timestamps. A generated reading is a sequence of text-addressed clips whose durations are unknown on the first listen. Verse, pericope, chapter, note, question, and article controls should behave consistently despite those different media shapes. The player therefore works with logical segments and leaves provider selection to a resolver.

## 2. Three layers

| Layer             | Responsibility                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Player            | Elements, runs, queue, bar, exclusivity, timers, retry budgets, and recovery scheduling. |
| Resource resolver | Selects a source for each segment and decides what a failure means for that source.      |
| Synthesis engine  | Converts text to a clip; it has no Bible or verse identity.                              |

The synthesis request stays text-addressed. The licence check occurs before the UI offers synthesis; no Bible identifier is added to `generate`. This keeps the existing strict synthesis contract and permits other text readers to use it.

### 2.1 Recovery crosses the resolver/player boundary as requests

The player reports an error, stall, or early end together with the failing source and position. The resolver's strategy can request a reload, a delayed retry, a poll, a new strategy, a handoff, an AI-provenance mark, or a terminal failure. The player schedules those requests, enforces one retry ceiling, and owns the audio element. These are requests, not facts for the player to interpret by provider. A request that exceeds the budget is refused by the player.

The strategy belongs to the segment because a playable may mix sources. A replacement carries the complete source descriptor, including its verse window; changing a URL without changing its window could play the wrong text. A handoff replaces the current segment within the same run. Only terminal failure idles that run. Autoplay refusal is handled by the player as a pause awaiting a user gesture, without trying another provider.

Both DBL and Aquifer recordings use the same reactive recovery policy. On failure, the resolver compares the dead URL with its chapter entry and re-resolves before retrying: a changed URL is played, an unchanged URL merits a bounded retry, and an unavailable source falls through to allowed TTS. This also handles a transient network failure for a provider whose URL is otherwise stable. Chapter requests are shared across verses so one failure does not mint many signed URLs for the same file. An initial transient chapter-lookup failure gets three attempts in all, with 500 ms and 1,000 ms delays; missing recordings and other permanent failures do not retry.

### 2.2 Recorded-source selection

For source playback, an explicitly selected audio resource takes priority. If none is selected, the source text's own provider identity is used. Reference playback uses the reference's exact selection. An unusable recording falls back only to TTS that the text licence permits. Names and abbreviations are not searched for a different edition: the source heard must correspond to the selected identity. Existing mobile routes retain their separate contract.

The current reference picker supports recorded playback from Aquifer only. Native YouVersion recordings are deferred; a YouVersion reference with whole-edition TTS clearance can use synthesized speech, while one without clearance remains silent. The existing source-audio routes retain their DBL/Aquifer recording bridge for other consumers. These feature paths do not replace that bridge or complete a unified provider-catalogue lookup for source and reference Bibles; that broader lookup remains future work.

The provider response must contain verse-addressable timestamps for verse playback. A chapter file without usable windows remains useful to other consumers, but cannot silently masquerade as a verse source. Within a DBL response, timestamps must belong to the chosen audio track; within Aquifer's codec choices, prefer playable WebM/Opus and otherwise use MP3. The recording and its timestamps are selected together. DBL's timecode-bearing path remains based on contract-shaped fixtures because the surveyed DBL audio Bibles did not publish timecodes; Aquifer has supplied real verse windows.

## 3. Playables, segments, and identity

A **playable** is an ordered list of logical segments and a caller-supplied `playableKey`. Each segment resolves to a whole source descriptor: URL, optional recorded-file window, optional measured duration, and recovery strategy. Recorded verses may share one chapter file while having different windows. A first-listen TTS segment may have no duration until it ends. Arbitration is per segment, so recorded and synthetic verses can coexist in a playable.

The key includes page, source or reference Bible identity, and content identity. It owns the idle badge state, impossible-state reason, pause record, and Restart state. A **run** is one active traversal; it may move through several playables and has no separate key. Switching the source Bible changes idle keys and also pauses any live run through the shared registry. Changing the page clears page-lifetime records.

If a recorded timestamp has a start but no end, the next timestamped verse's start supplies the end. The last timestamped verse may play from its start to the file's natural end. Missing starts make that segment uncuttable and trigger allowed TTS; an unknown duration alone does not. The player never uses response fields that the providers do not populate as a substitute for a real window.

## 4. Chunking

Every verse is a logical boundary for position and highlighting. Adjacent windows of the same file play as one physical stretch when the windows meet, so recorded narration does not click or pause between verses. A change of source, gap, overlap, or synthetic clip creates a physical boundary.

| Surface                             | Playable shape                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Source verse                        | One segment and a compact control.                                                           |
| Source pericope                     | Ordered verse segments under one player and scrub bar.                                       |
| Source chapter                      | Ordered verse segments under one chapter player and scrub bar.                               |
| Translation Note                    | Reference phrase then body when synthesized; recorded resource audio may arrive as one file. |
| Translation Question                | Question and answer are separate one-segment playables.                                      |
| Translation Word or Open Study Note | One recorded file or structured TTS chunks.                                                  |

The chapter player is delivered with the drafting view as one chapter-sized playable, not as eager whole-chapter synthesis. Chad's review of that control is still requested. Resource controls are later work. For resource audio, provenance may determine the segment count, and a recorded-to-TTS handoff may change it during playback. The player and bar cannot assume a stable count. TTS article chunks follow source structure, such as paragraphs, with normalized whitespace. Their text changes the recipe hash when boundaries change; an extra chunker-version field would invalidate unaffected artifacts.

## 5. Progress and seeking

The bar needs a monotonic coordinate across the playable before all media exists. It allocates each segment a span from text length, or uses recorded durations when available. A later measurement moves the dot within its fixed span; it does not resize other spans. Within a first-listen segment, a cold seconds-per-character estimate moves the dot. Measured segments in that chunk calibrate subsequent estimates. A correction is animated and the dot never passes the segment boundary. A recovery that restarts a segment genuinely moves the dot backward and is shown honestly.

Dragging the bar selects a position and leaves playback paused, even when it was playing. It does not synthesize audio. The next explicit Play seeks by setting the element's `currentTime`. A first-listen stream may clamp to the selected verse's start; compressed and recorded files may seek within the verse. The bar reflects the actual landing. Recorded window ends use a scheduled halt because periodic `timeupdate` events are too coarse to prevent spill into the next verse; an open-ended last window ends with the file.

Elapsed time uses measured completed segments and local media time. After a forward seek past ungenerated clips, missing earlier durations are estimated and the elapsed label is visually quieter and accessible as estimated. Total-time presentation remains a review question; the player does not infer a total by synthesizing all clips.

## 6. When synthesis spends money

`generate` writes an immutable request sidecar and returns a URL; the first `get-audio` performs synthesis. The request is idempotent, so an optional pass that obtains URLs does not make audio. Verse and pericope playback share the same verse artifacts. A pericope Play synthesizes its verses lazily as the run reaches them, with one-verse-ahead prefetch and a two-verse ceiling. The card's phrase “one generation call per pericope” expresses the shared, pericope-level listening experience; the implementation uses individually addressable verse requests because a bulk call would only write sidecars and eager generation would delay first sound and spend on unheard verses.

Scrubbing alone does not start synthesis. Pressing Play after a seek may spend, and a recorded failure may spend when it falls back to permitted TTS. Stopping a client read cannot cancel an upstream generation task that has already begun.

## 7. Provenance badge

The sparkle means the playable contains AI-generated audio. It has a static input when the selected Bible is already known to lack recorded audio and a dynamic input when resolution or recovery chooses TTS. The displayed badge is either input. A resolve-path mark arrives before sound; a fallback mark arrives when recorded audio hands off, so AI sound is not played under an unbadged control. The dynamic mark lasts through the current run and remains visible while idle as the last heard provenance. It resets when a new run begins on that playable, allowing a later successful recording to be shown honestly. A paused downgraded run also stores `forceTts` so resuming does not jump between timelines.

There is no eager availability sweep or availability cache. Recorded coverage varies by chapter, and the true answer can require live provider calls. The chapter resolver shares calls as playback advances; the badge corrects itself when the actual source is known.

## 8. Controls and availability

One icon vocabulary applies to the drafting and later resource surfaces: outlined circular Play, Pause while sounding, Restart when a run or saved position exists, a loader in the primary position while loading, and a sparkle for AI sound. Restart clears the saved position and starts a live run at zero; on a paused playable it clears the position and remains idle. A never-started playable has Restart disabled.

Offline and structurally impossible audio keep their primary controls visible and focusable with `aria-disabled`. A press explains the reason in a toast, and a Radix tooltip exposes it on hover or focus. Restart remains natively disabled in those states. Offline follows the browser's connectivity signal so its own online event can wake the control; it does not hide the control after a failed fetch. The impossible state currently reuses `li:play-off`; Chad is asked whether it needs a distinct glyph. A transient recorded failure is an error and recovery case, not proof that audio can never exist.

## 9. Playback, pauses, and exclusivity

The primary control pauses and Play resumes. The pause record holds `{ itemIndex, currentTime, forceTts }` per `playableKey` for the current page lifetime, with no retained audio element. Displacement by another playable, Hide Audio, a source-Bible change, or `Alt+S` pauses and saves position. Restart and natural completion clear it. A pause at the initial zero position has no record. `currentTime` is the media element's time, including the absolute time of a recorded chapter window.

A shared React Context registry allows one sound at a time across the integrated audio surfaces. Starters claim sound and pause existing claimants. The native FIA step player does not yet join this list. A later resource/FIA change needs to register it to prevent concurrent sound with the shared player. Idle controls read saved state from the registry; a sounding control reads live position and boundaries from the player. The same registry operation silences registered claimants when Hide Audio changes, the source Bible changes, or the app-wide Pause shortcut fires.

Play-from-here is a run across the visible verse or pericope playables to page end. In pericope mode it uses each full visible player and bar, with the current or saved position before the caret. Its range is not saved across a pause; pressing the shortcut again recreates it. In chapter mode it addresses the single chapter player from the caret or current saved position. Pausing belongs to the playable currently sounding.

## 10. Visibility

The `sourceAudio` feature gate covers recorded audio and TTS together because recorded playback's recovery path can require TTS. An unset `EN_FEATURE_SOURCE_AUDIO` follows whether fluent-ai is wired; an explicit flag value takes precedence, including the `/debug` override. **Explicit-on without fluent-ai is unsupported:** controls may appear but their TTS fallback cannot work. A Bible with a disallowed text licence can still have recorded-only playback; that is distinct from publishing the whole feature without a TTS service.

Next, the per-device Hide Audio setting hides controls, silences playback, and unregisters shortcuts immediately. The setting is in `localStorage`, independent of the server's full-replacement user-settings endpoint. Every future audio surface must honor the same setting. Finally, offline disables controls that remain visible. The Hide Audio switch itself is absent when the feature gate is off.

## 11. Highlighting and keyboard controls

Drafting playback publishes segment identity and position. The drafting surface chooses to show a pericope rail, card wash, verse cue, and off-screen-only auto-scroll without stealing editor focus. Later resource surfaces subscribe to playback state for their controls but need no drafting highlight. A separate debug-only serving tint shows whether TTS came from streaming or a compressed artifact and is not a translator-facing provenance cue.

| Shortcut      | Visible action                                                                     |
| ------------- | ---------------------------------------------------------------------------------- |
| `Alt+P`       | Primary control for the caret's visible verse, full pericope, or chapter player.   |
| `Alt+Shift+P` | Play from the current or saved position through the visible playables to page end. |
| `Alt+S`       | The sounding surface's primary action, currently Pause.                            |
| `Alt+R`       | Restart the sounding playable, or the caret's visible playable when silent.        |

Bindings use `event.code` so macOS Option combinations do not type characters into the editor. A shortcut follows its visible button's behavior. The primary and Restart controls advertise their keys through focusable Radix tooltips and `aria-keyshortcuts`; the Hide Audio switch carries the complete shortcut list, including Play from here. Hiding audio unregisters them. Chapter mode has a visible, reachable chapter player and all four shortcuts address that player; source verse highlighting and scrolling use the chapter's source pane, which scrolls independently of the target editor.

## 12. Licence and attribution

TTS clearance belongs to the exact provider-qualified text Bible, whether used as source or reference. `allowed`, `forbidden`, and `unknown` distinguish clearance, a reviewed refusal, and an unreviewed edition. `allowed` covers the entire provider edition; partial or uncertain clearance remains barred rather than granting passage-level exceptions. A missing provider identity or licence record is unknown and bars TTS without creating a row. The selected audio resource is a separate identity; selecting a recording does not confer synthesis rights. Rights decisions are curated, not inferred from free-text copyright or a broad “Open Access” label. Current records are populated by seeds or manual work; automated licence import and classification are deferred. This fence makes the UI honor a notice and keeps an operational record; it is not a DRM boundary around text that a screen reader can already speak.

The first playback of a recording with a nonblank notice holds sound behind an acknowledgment for the exact text identity, recording identity, and notice. A changed notice or recording can be acknowledged separately. While the dialog is open, playback remains silent and stable; accepting it continues the intended playback without reopening it. A pericope Info button makes the current recording notice reachable afterward, and Settings exposes acknowledged recordings. A blank, stale, or missing recording notice creates no dialog or Info control. TTS, including a fallback after a recording fails, creates no recording-notice dialog. Chad's mockups did not include this acknowledgment, Info button, or Settings access, so their presentation remains for his review.

Resource text and audio carry their own attribution. A later resource player must keep the actual source's notice reachable even if its text is off screen. Generated audio from CC BY-SA resource prose raises a separate rights question: whether the rendering is an adaptation being shared and who may declare the resulting audio's licence. Joel and the lab need to settle that declaration. No generated-audio download is part of this web delivery.

## 13. Caching and storage

Generated clips are immutable recipe-addressed artifacts in Cloudflare R2. The canonical recipe has slots for the server recipe version, text, voice, model, format, and language code. Gemini declares `lang_code` non-byte-affecting, so it is normalized to the absent placeholder before HMAC hashing; a provider whose audio depends on language can retain it in the hash. Identical requests share artifacts across projects; an Opus and MP3 rendering have separate keys. Replays of Translation Notes, Questions, Words, and Study Notes use the same stored recipe rather than synthesize again, and verse and pericope Play reuse the same verse clips. Concurrent requests attach to an in-process generation when possible; conditional upload prevents duplicate stored objects. Two instances may still each pay for a simultaneous generation, a bounded deployment cost rather than a wrong artifact.

R2 and EU-jurisdiction buckets are **assumed here from the audio requirements and existing service configuration**. Deployment must bind the bucket, endpoint jurisdiction, public custom domain, and memory budget consistently. Recorded DBL and Aquifer files stay at their providers; they are not copied to the generated-audio store. The resolver holds a chapter response only for page lifetime, resolves lazily, and re-resolves on failure rather than trusting a URL suffix or pre-checking expiry. A dead URL invalidates the held chapter entry once, allowing nearby verses to share the new response. Direct browser streaming is chosen for first sound and seeking, with the bounded refresh cost borne by the client.

## 14. Failure and recovery

The player owns retries and scheduling; the segment's strategy interprets provenance. Recorded failures cause reactive chapter re-resolution and at most two media retries after the initial attempt (three attempts total) before allowed TTS takes over. DBL's signed media URLs are probed by ranged GET, because HEAD can return 403 even for a playable URL. TTS admission back-pressure honors `Retry-After`; a missing artifact can be regenerated, while a stall may wait for a compressed artifact. Neither strategy branches on URL extension as a measure of seekability, and neither reads an expiry clock.

An uncuttable recorded verse or an exhausted recorded source falls back to permitted TTS for that segment. Once a run downgrades, later segments in that run stay TTS; a pause preserves this through `forceTts`, and Restart gives recording a fresh chance. If TTS fails, or a recording fails where TTS is barred, the run ends with a reason shown to the translator. Skipping silently through failing segments would compound the problem. Recovery can move the bar backward or change a resource playable's segment count, and the UI reflects the new position. Autoplay refusal instead pauses for a user gesture and preserves position.

## 15. Surfaces and delivery boundary

The drafting delivery includes source and reference Bible audio in verse, pericope, and chapter modes, the shared player and badge, recorded notices, and Hide Audio. The chapter control is one sticky, chapter-sized player with a scrub bar, verse cues, and source-only scrolling. It resolves segments lazily; it does not synthesize a whole chapter at entry. This is the chapter-view choice to show Chad in review.

Translation Notes, Questions, Words, and Open Study Notes use the same resolver/player design in later work. Notes use an expanded-entry bar; questions and answers have independent compact controls and saved positions; article playback uses a sticky title bar and reads prose rather than structural cross-references. Recorded FIA guide and key-term audio still uses its native player outside the shared registry; a later resource/FIA change needs to register that player for app-wide exclusivity. Whether those FIA collections receive redesigned resource controls remains a product-scope question. Audio-only source Bibles are not ruled out by the segment model.

## 16. Open questions for review

- **Chad:** Should the primary action pause as built, or should any surface stop and reset? This also governs `Alt+S` and the reading that starting a Translation Question's answer preserves the question's position and Restart state.
- **Chad:** Do the recorded-notice acknowledgment, Info button, and Settings access fit the desired UI? Should the impossible-audio state have a glyph distinct from offline `li:play-off`? Is chapter view correctly represented by one chapter-sized playable?
- **Chad:** What total-time display should the grouped player use while durations remain unknown? Where should translator-facing shortcut documentation live, and should the Settings row include an accordion? Do the pericope highlight, auto-scroll, and scroll convention read clearly?
- **Chad:** Card [#424](https://github.com/eten-tech-foundation/fluent-web/issues/424) describes reference Bibles as DBL-only with no TTS fallback. This delivery intentionally permits Aquifer reference recordings and TTS for references whose exact text edition has whole-edition clearance. Is that policy acceptable?
- **Later resource review:** Who sets long-article chunk boundaries, and do the FIA guide and key-term collections receive the new control treatment? Tablet ownership and touch discovery also need a product choice.
- **Joel and the lab:** Confirm the share-alike rights posture for generated readings of CC BY-SA resource text and who is authorized to declare the audio licence. This question does not gate the current streaming-only drafting controls.
