# Highlight Repeated Words in Verse Text — Design Options & Recommendation

**Status:** Proposal / decision-requested. Docs-only. No implementation yet.
**Type:** Follow-on to the Repeated Word Check UI (cards
[fluent-web#277](https://github.com/eten-tech-foundation/fluent-web/issues/277) /
[fluent-web#278](https://github.com/eten-tech-foundation/fluent-web/issues/278)), which
shipped the **Checks tab + panel**
([PR #320](https://github.com/eten-tech-foundation/fluent-web/pull/320),
[fluent-api #203](https://github.com/eten-tech-foundation/fluent-api/pull/203)).
**Relates to #277, #278.** The tab/panel design this layers on is
[`checks-ui-integration-suggestion.md`](checks-ui-integration-suggestion.md) (decisions
**W1–W12**).

> **Why this is a proposal PR and not just an implementation PR.** The highlight-in-verse work
> was agreed to in the #305 review, and it _looked_ like a small presentational add-on. On
> close inspection of the actual drafting editor it is **not** small: it forces a real decision
> about how editable verse text is rendered. That decision is bigger than one feature and will
> outlive it, so the team should weigh in **before** implementation rather than have an
> architecture picked unilaterally on an experimental branch.

---

## 0. The original request (what Joel/Ulf asked for)

During the Repeated Word Check proposal review (PR #305), **joelthe1 (Joel) and Ulf** asked
that, in addition to _listing_ repeated-word findings in the Checks panel, the repeated words
be **visually marked in the verse text itself** — an underline or color on the offending words
where they appear, so the translator sees the problem in place, not only in a side list.

It was agreed to, and **deliberately carved out as a separate follow-on PR** so the tab/panel
(#277/#278) could land first without being blocked on verse-rendering changes. This document is
that follow-on, brought forward for a design decision.

The concrete visual target discussed on the product side of this thread: **the only visible
change should be that the flagged (active) repeated words turn red** — no new chrome, no layout
shift, the editing experience otherwise identical.

---

## 1. TL;DR / recommendation

- Coloring words _inside the box the translator is typing into_ is the hard part. Today that
  box is a **plain `<textarea>`**, and a `<textarea>` **physically cannot** color individual
  words — its contents are one uniform color by definition (see §3).
- Every way to get colored words into an editable field means **changing how the editable verse
  is rendered** — from a trivial CSS overlay hack up to replacing the editor with a real
  text-editing engine. The options differ enormously in risk (§5).
- Fluent is **translation software for minority languages**, so unusual scripts, combining marks
  / complex shaping, and eventually right-to-left (RTL) text must be assumed. That requirement
  is what turns the cheap options from "clever hack" into "fragile in exactly the cases the
  users live in" (§4).
- **Recommendation:** treat this as an editor-foundation decision. The recommended path is
  **Option D — adopt a real text-editor engine (CodeMirror 6 preferred, ProseMirror/TipTap
  alternative), behind a feature flag** — because it is the only option that is _correct_ for
  arbitrary scripts and RTL and provides a decoration layer reusable by future checks (spell
  check, Wildebeest). Because that is a significant change, the cheaper options and the **"don't
  color anything yet"** option (Option A) are documented fully, and the team is asked to choose
  (§7).
- **Nothing in this PR ships behavior.** It is a design record + option analysis only.

---

## 2. Background — what already exists (and works)

The Repeated Word Check pipeline is already in place and is **not** what this proposal changes:

- [`useRepeatedWordsCheck.ts`](../../../src/features/checks/hooks/useRepeatedWordsCheck.ts) —
  fires the check on each auto-save, keyed on `(chapterAssignmentId, saveCounter)`.
- [`useResolvedFindings.ts`](../../../src/features/checks/hooks/useResolvedFindings.ts) — the
  pure three-layer suppression cascade that decides which findings are **active** vs.
  **inactive** (ignored / "Default Ignore"). It also assigns each finding a stable **ordinal**
  and an **occurrence key** `"{snt_id}|{repeated_word}|{ordinal}"`.
- [`ChecksPanel.tsx`](../../../src/features/checks/components/ChecksPanel.tsx) — the side list.

Each finding carries `snt_id` (verse), `repeated_word` (NFC + lowercased pair), `surf` (original
surface text), `start_position` (character offset **as Greek Room counted it**), and
`legitimate`. **The highlight feature is a pure consumer of the existing `resolved.active`
list** — it adds a _rendering/decoration layer_, no new API, no new data.

So the data problem is solved. The **rendering problem** is the entire subject of this doc.

---

## 3. The core constraint — words inside a `<textarea>` cannot be colored

The drafting page renders the target (the text the translator is writing) as a native
`<textarea>`
([`DraftingPage.tsx` target column](../../../src/features/bible/components/DraftingPage.tsx)).
A `<textarea>`:

- renders its value as **one uniform run of text** — there is no way to make the third word red
  and the rest black. HTML simply does not allow child markup inside a `<textarea>`.
- is also doing a lot of quiet work that must not be lost: **native caret**, text selection,
  **IME / dead-key composition** (essential for many target languages), spellcheck,
  autocapitalize/autocorrect, auto-resize on input
  ([`useDrafting.ts`](../../../src/features/bible/hooks/useDrafting.ts)), focus/caret restoration
  when switching verses, and Enter-to-advance.

Therefore **any** colored-word solution requires rendering the editable verse _differently_. The
question is only **how far** to go, and each step up costs risk.

> Note: the **source** column (the reference Bible) is already a styled `<p>`, so highlighting
> read-only source text would be easy — but Greek Room checks the **target** (the translator's
> own draft), so that's not where the findings live. The findings are in the editable box.

---

## 4. Why "translation software" makes this harder than a normal highlighter

Most "highlight words in a textarea" tutorials quietly assume English: fixed-width-ish Latin
text, one code unit per visible character, left-to-right. Fluent cannot assume any of that.

1. **`start_position` is a character offset from Greek Room, not a DOM offset.** Coloring the
   right glyphs requires mapping that offset onto the rendered text. If the app's idea of
   "character N" differs from Greek Room's (JS strings count **UTF-16 code units**, so
   emoji/rare CJK/some historic scripts are 2 units; combining accents and many Indic/complex
   scripts render **one visual cluster from several code points**), the highlight lands on the
   wrong glyphs. The cascade already NFC-normalizes, but position math is a separate hazard.
2. **Combining marks & complex shaping.** Devanagari, Arabic, Khmer, etc. reshape glyphs in
   context; a naive "wrap characters `start..end` in a span" can split a grapheme cluster and
   visibly break the script. (Greek Room ships a Devanagari cost-rules file — these scripts are
   real target languages here, not hypotheticals.)
3. **RTL is coming.** The assumed product intent is to eventually support right-to-left
   languages. Any overlay/mirror technique that hand-positions colored text has to get **bidi**
   right (mixed LTR/RTL runs, the Unicode bidi algorithm). Hand-rolled positioning is where this
   breaks first.
4. **Variable fonts / line-wrapping.** An overlay must match the editor's font metrics, padding,
   line-height, and wrapping **pixel-for-pixel**, per language, or the colors drift off the
   glyphs. Minority-language fonts are exactly where metrics surprise you.

**Conclusion:** the cheap techniques are cheap _because_ they assume a benign script. For this
user base they are fragile in precisely the languages the product exists to serve. This is the
crux of why the decision is being surfaced before building.

---

## 5. The options (with complexity and danger of each)

Ordered from "do nothing" to "do it properly." Each lists what it is, the real cost, and the
danger — stated honestly.

### Option A — Do **not** color words yet (keep the panel-only experience)

- **What:** ship nothing here. The Checks tab + panel + notification dot already tell the
  translator which verses/words repeat. In-text coloring is formally recorded as deferred until
  the editor foundation is decided.
- **Complexity:** none.
- **Danger:** none technically. The only cost is that Joel/Ulf's specific ask ("see it in the
  text") stays unmet for now. **This is a legitimate choice**, not a cop-out: it avoids
  committing to an editor architecture under time pressure, and the panel already delivers the
  core check value.
- **When this is right:** if the team is not ready to change the drafting editor and would
  rather not carry a hack.

### Option B — CSS overlay / "backdrop" (transparent `<textarea>` + mirrored colored div)

- **What:** keep the real `<textarea>` for input but make its **text color transparent** (caret
  still visible); behind it render a `<div>` containing the _same_ text with the active repeated
  words wrapped in red `<span>`s. Both layers are driven by the **same React state in the same
  render**, so there is _no_ temporal lag between them (addressing the "two sets of text out of
  sync while typing" worry — they update in one commit).
- **Complexity:** moderate. The hard part is not lag; it's **pixel-perfect alignment**: the
  mirror `<div>` must replicate the textarea's font, size, padding, border, line-height,
  letter-spacing, wrapping, and **auto-resize** behavior exactly, or the red drifts off the
  words. Plus the offset→span mapping from §4.
- **Danger (this is where "translation software" bites):**
  - Alignment is brittle across **fonts/scripts** — the exact scenario (unusual scripts) where
    correctness matters most is where mirrors most easily misalign.
  - **RTL and bidi** overlays are notoriously hard to keep aligned.
  - **Grapheme-cluster splitting** (§4.2) can visibly corrupt complex scripts even though the
    underlying text is fine.
  - Long-term maintenance tax: every editor style change must be mirrored in two places.
- **Verdict:** cheapest way to get red words _today_, but it degrades in exactly the target
  scripts. Acceptable only as a knowingly-temporary stopgap with a plan to replace it.

### Option C — Raw `contenteditable` (one text layer, red spans on matches)

- **What:** replace the `<textarea>` with a `contenteditable` element; render the text with red
  spans directly (one layer, no mirror, no alignment math).
- **Complexity:** high. `contenteditable` is famously painful: the DOM must be serialized back
  to plain text on every edit, and re-rendering spans **mid-edit can move the caret** unless
  selection is carefully saved/restored — which is the "messy while typing" failure mode in a
  new disguise.
- **Danger:** caret jumps; **IME/composition** breakage (dead keys, complex input) — a serious
  regression for many target languages; inconsistent spellcheck; browser-specific quirks; paste
  sanitization. This amounts to hand-building a text editor, badly.
- **Verdict:** **not recommended.** More effort than Option B for _more_ risk. Listed for
  completeness because it's the "obvious" idea that turns out worse than both neighbors.

### Option D — Adopt a real text-editor engine, decorate the ranges (RECOMMENDED)

- **What:** replace the target `<textarea>` with a purpose-built editor engine and apply the red
  as **decorations** (presentational overlays the engine positions itself — they do **not**
  mutate the document, so they can't corrupt the saved text). Candidates:
  - **CodeMirror 6** _(preferred)_ — designed for exactly "editable text + decorations,"
    excellent for large/plain text, first-class **RTL/bidi**, robust selection/IME handling,
    tree-shakeable modular packages, a clean `Decoration.mark` API for coloring ranges. Lighter
    and more line/character-oriented than a rich-document editor — a good fit since verses are
    plain text, not rich documents.
  - **ProseMirror / TipTap** — rich-document editor with a decorations API; heavier and
    document-model-oriented (overkill for plain verse text, but viable). **Note:** the existing
    `TipTapRenderer` in `features/resources` is a _hand-rolled JSON renderer_, **not** the real
    TipTap library — adopting TipTap would still be a brand-new dependency.
- **Complexity:** significant up front. The drafting input's behavior (auto-resize, focus/caret
  restore across verses, Enter-to-advance, controlled value ↔ engine state, spellcheck) must be
  ported onto the engine, a dependency added, and the whole drafting flow re-tested.
- **Danger:** the risk is **scope/effort and a temporary editing-behavior regression during the
  port**, not correctness of the coloring itself — a mature engine handles offsets, bidi, and
  grapheme clusters far better than a hand-rolled solution. Mitigated by shipping **behind a
  feature flag** (see §6) so the current `<textarea>` stays the default until the new editor is
  proven.
- **Verdict:** the **correct** long-term foundation. It's the only option that is right for
  arbitrary scripts + RTL, and its decoration layer is **reusable** for every future check
  (spell check, Wildebeest) — those will want in-text marks too. A full, correct solution is
  likely required eventually regardless, so investing here avoids building Option B twice.

### Option comparison

| Option                  | Effort            | In-text red? | Correct for odd scripts / RTL      | Editing-behavior risk         | Reusable for future checks |
| ----------------------- | ----------------- | ------------ | ---------------------------------- | ----------------------------- | -------------------------- |
| A — do nothing          | none              | no           | n/a                                | none                          | n/a                        |
| B — CSS overlay         | moderate          | yes          | **poor** (alignment/bidi/clusters) | low (native textarea kept)    | partly                     |
| C — raw contenteditable | high              | yes          | poor–medium                        | **high** (caret/IME)          | partly                     |
| D — real editor engine  | **high up front** | yes          | **good**                           | medium during port, low after | **yes**                    |

---

## 6. Cross-cutting concerns (apply to whichever option is chosen)

- **HL1 — Only active findings are colored.** Reuse `resolved.active` from
  [`useResolvedFindings`](../../../src/features/checks/hooks/useResolvedFindings.ts). Ignored /
  "Ignore Everywhere" / "Default Ignore" (`legitimate`) words render **normal** — red means
  "still flagged," mirroring the notification dot. This keeps the highlight and the panel in
  lockstep by construction (single source of truth).
- **HL2 — Refresh on the same trigger as the panel.** Decorations recompute when
  `resolved.active` changes, which is already driven by `saveCounter` + the suppression cascade.
  No new trigger.
- **HL3 — Offset mapping is a shared hazard.** Whichever option, the mapping from Greek Room's
  `start_position` (+ `repeated_word` length / `surf`) onto rendered ranges must be
  grapheme-aware and NFC-consistent with the cascade (§4). Spec this explicitly during
  implementation and unit-test it against combining-mark and surrogate-pair fixtures.
- **HL4 — Ship behind a feature flag.** This is an editor-touching change; it should default
  **off** until proven. There is an in-flight **feature-flags** proposal
  ([`fluent-api/docs/proposals/feature-flags/`](../../../../fluent-api/docs/proposals/feature-flags/feature-flags-suggestion.md));
  if that lands, use it. If not yet available, a local build-time/config flag is acceptable for
  the experiment. Either way the current `<textarea>` stays the default path.
- **HL5 — Read-only `/view` mode.** In read-only stages the verse is a `<p>`, not a textarea —
  coloring there (if wanted) is trivial and low-risk and can be delivered independently of the
  editable-field decision. Confirm whether product wants highlighting in `/view` too.

---

## 7. Decision requested

This is **not** a request to approve an implementation; it's a request for the team to pick the
direction so the eventual implementation PR isn't a surprise.

**Q1 (primary).** Which option should be pursued?

- **A** — defer in-text coloring (panel only) for now.
- **B** — CSS overlay stopgap, knowingly accepting the odd-script/RTL fragility.
- **C** — raw contenteditable _(recommended against)_.
- **D** — adopt a real editor engine (the recommendation), **CodeMirror 6** preferred.

**Q2.** If **D**, is **CodeMirror 6** acceptable as the engine, or does anyone prefer
**ProseMirror/TipTap**? (CM6 is favored here: verses are plain text, and CM6's bidi/decoration
story is strong.)

**Q3.** Feature-flag mechanism: gate behind the pending feature-flags work, or a temporary local
flag until that lands? (HL4)

**Q4.** Scope of coloring: active-only (HL1) confirmed? Any desire to also mark ignored words
differently (dimmed)? Highlight in read-only `/view` too? (HL5)

**Q5.** Sequencing/appetite: is this next now, or parked behind other priorities? (Option A is
the honest "park it" answer if appetite is low.)

---

## 8. Decisions (to be filled in from review — this is the record)

> Reviewer-confirmed decisions get an ID (**HV1…**) and a `(name, date, link)` note here, per
> the team's docs convention, and are then referenced from code comments at the edit sites at
> implementation time.

- **HV1 — Chosen option:** _pending review._
- **HV2 — Engine (if Option D):** _pending review._
- **HV3 — Flag mechanism:** _pending review._
- **HV4 — Coloring scope (active-only / ignored treatment / `/view`):** _pending review._

---

## 9. Explicitly out of scope

- One-click "drop duplicate" quick-fix (already out of scope in the panel v1).
- Feeding suppressions back to Greek Room.
- Any change to fluent-ai or the proxy contract — the highlight is a pure client-side consumer
  of findings already in hand.
- Highlighting for _other_ checks (spell check, Wildebeest) — but Option D is favored partly
  because its decoration layer would serve them later.
