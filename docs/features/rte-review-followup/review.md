# Chapter editor review follow-up

This records the scope questions in [Kasey's September 30 review of PR #508](https://github.com/eten-tech-foundation/fluent-web/pull/508#pullrequestreview-5369643713).
The reviewed head was `09eb6787753c025b288a7cbcc10ac98328764e60`. The review body remains
relevant even though its only inline thread, the IME `keyCode === 229` guard, is already resolved.

## Heading behavior

[Issue #432](https://github.com/eten-tech-foundation/fluent-web/issues/432) explains why applying a
heading format to scripture is invalid: a standalone heading owns its words and must not contain
a verse milestone. The [design merged in #475](../section-headings/design.md) therefore inserts a
heading through a dialog, stores its text in `markers.headings`, allows levels `s1` through `s4`,
and refuses conversion from a heading into Paragraph or Poetry. These decisions predate #508.
Kasey approved the unchanged core in [his final #475 review](https://github.com/eten-tech-foundation/fluent-web/pull/475#pullrequestreview-5201651999).
The older `s1`/`s2` limit and generic block-conversion wording in #397 do not describe that later design.
The H3/H4 styling and immediate-typing fixes remain in [#529 / PR #533](https://github.com/eten-tech-foundation/fluent-web/pull/533).

Enter and Shift+Enter keep a heading's text intact and move into its following verse. When that
verse already starts in `p`, the current handler reuses it. Before Poetry it inserts a `p` segment
without changing the following Poetry text or level. Two temporary spaces hold the caret; the save
path trims them. This supports typing immediately after Enter without storing heading words as scripture.
An orphan heading without a following verse cannot create body text that has no row to save into.

The reuse of an existing `p` is a deliberate exception to #397's literal request for a _new_
Paragraph. The earlier heading design did not explicitly settle that detail. It still needs a
product/spec decision if an additional empty paragraph is required. Empty spacer paragraphs do not
survive the current offset-based row contract; they have no character to anchor them to. The separate
[Insert paragraph action in #531](https://github.com/eten-tech-foundation/fluent-web/pull/531) handles
repeated insertion within verse text and does not change that storage constraint.

## Protected boundaries and clipboard

Ordinary body paragraph splits and merges remain available. Collapsed Backspace/Delete at a
chapter marker or a heading/body boundary is blocked. These exceptions protect verse identity and
the standalone-heading contract: a native merge would either remove a chapter landmark, put
scripture into a heading, or put heading words into scripture. Editing or selecting a heading's
own text remains available, including removing the title.

Copying remains available. Paste/drop is refused when it would replace an existing verse/chapter
marker or insert a new structural marker carried by HTML or Lexical clipboard data. Plain number
text and ordinary rich text are not structural markers. Rejecting a structural payload also rejects
its accompanying text; it is not a paste-as-plain-text implementation. This prevents copying a verse
from duplicating its identity in a fixed verse set. That restriction must stay explicit in QA.

When visual line rectangles are unavailable, line deletion remains conservative near a marker:
Cmd+Backspace can be refused because the handler cannot prove that the landmark is on a different
line. Ordinary character/word deletion remains available. This fallback favors verse identity;
the wrapped-line test verifies that the shortcut is allowed when real geometry separates them.

Marker protection and heading Enter are shared by Chapter and Pericope because both edit the same
verse rows. [#314](https://github.com/eten-tech-foundation/fluent-web/issues/314) also requires protected
verse numbers and undo/redo. The RTL selection fix belongs to the expanded Poetry follow-up in
[#519](https://github.com/eten-tech-foundation/fluent-web/issues/519): Firefox and a plain editable
control were compared before applying it. The [September 29 record](https://github.com/eten-tech-foundation/fluent-web/pull/508#issuecomment-5893933489)
describes that reproduction. Indic forward Delete remains in [#534](https://github.com/eten-tech-foundation/fluent-web/pull/534).

## Unsupported USFM markers

Lossless preservation of all unsupported markers is still a real gap in #397 and #314. It predates
#508 and is not supplied by the current sibling PRs. `VerseMarkers` stores paragraph offsets and
standalone headings only. `usjToPericopeVerses` keeps the words inside character markers such as
`wj` and `nd`, but loses their marker boundaries. Notes, figures and other apparatus are omitted
from the verse row. The existing converter tests demonstrate that behavior; they do not demonstrate
a lossless USFM round trip.

The API has the same limitation, verified against main at `ae052694ae9213b3bc7c52fa6ded52531cf1d070`.
Its [USJ import](https://github.com/eten-tech-foundation/fluent-api/blob/ae052694ae9213b3bc7c52fa6ded52531cf1d070/src/lib/usfm-converter.ts#L162)
extracts character text and keeps unsupported structure in the raw imported file. Its
[editable row schema](https://github.com/eten-tech-foundation/fluent-api/blob/ae052694ae9213b3bc7c52fa6ded52531cf1d070/src/db/schema.ts#L476)
and verse serializer carry paragraphs and headings, without a field for inline spans or note/figure
bodies. Keeping the raw upload does not make an edited export lossless.

Completing this requirement needs a shared API/web model, import/export changes, and editing rules
for moving or deleting text inside those structures. It cannot be repaired by copying an unknown
field through the current converter. #397 must remain open for this gap until a linked follow-up
and its scope are agreed; local marker-number tests do not close it.

## Loading and adjacent work

The reviewed translation loader awaited the source and target queries and let a failed request
reach the generic route error screen. It did not show the required message, "Refresh the page to
try again." The source Resource Bible error in [#520](https://github.com/eten-tech-foundation/fluent-web/pull/520)
is a separate request. The assignment identity fix in [#540](https://github.com/eten-tech-foundation/fluent-web/pull/540)
also does not supply that message. This is an actionable gap for #508, rather than an assumed sibling fix.

Structural formatting through `setUsj` also reset native editor history on the reviewed head.
The former design documented that limitation, but #397 explicitly requires undo/redo for all editing
actions. A fix must test scoped body formatting, heading insertion and level changes as real edits,
including text before and after the structural action, autosave, reload and both editor hosts.

The vendored CSS sync note must identify Fluent's removal of `direction: inherit` from direct
paragraph children. Restoring that declaration would override the paragraph's `dir="auto"`
direction resolution. Fluent-specific rules that can be expressed as overrides belong in
`editor-shared.css`; this removal needs a documented exception for the next upstream sync.

`ActiveVerseOutline` and `handleScrRefChange` currently both report the cursor's verse. The DOM
path follows the selection used to draw the outline, including backward selections; the editor
callback maintains its scripture reference. `trackActiveVerse` compares the reported value with a
ref before setting state or notifying the drafting surface, so repeated paint/scroll reports do
not publish another active-verse change. Moving this observation into a shared hook may make the
component's responsibility clearer, but it is not evidence of duplicate saves and is outside the
targeted fixes here.

Fresh validation and commit links belong in the PR's follow-up comment. Historical runs and this
scope record do not establish that the new changes passed, that the shared branch is complete, or
that Roslin accepted QA.
